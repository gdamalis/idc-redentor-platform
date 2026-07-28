import type { ClientSession, ObjectId } from "mongodb";
import { getAdminDb } from "@src/service/database.service";
import { normalizeEmail } from "@src/lib/auth/email";
import type { Locale } from "@src/i18n/config";
import { ensureAuthIndexes, isDuplicateKeyError } from "./user.service";
import { inviteSchema } from "./types";
import type { Invite } from "./types";

const INVITES_COLLECTION = "invites";

export interface CreateInviteInput {
  readonly email: string;
  readonly roleIds: readonly string[];
  readonly locale: Locale;
  readonly invitedByUserId: string;
}

/**
 * No invite TTL is specified anywhere in the ICR-127/ICR-128 spec or docs —
 * only the ACCEPT-side filter (`expiresAt: { $gt: new Date() }`, throughout
 * this file) existed before `createInvite`, never a WRITE side that computes
 * one. 7 days is a conventional default for an admin invite link; revisit if
 * product wants something shorter/longer.
 */
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates OR REFRESHES a pending invite for `email` in a single atomic
 * upsert (ICR-128 P1 fix — compounded with the swallowed-delivery-failure
 * bug on `inviteUserAction`: a transient Resend failure plus this function's
 * old insert-then-conflict behavior could permanently lock an address out of
 * an invite-only product, with no in-product recovery — see
 * `docs/architecture/admin-rbac.md`).
 *
 * **Upsert-refresh, not insert-then-catch (replaces the CP6/CP7 design).**
 * The filter `{ email, status: "pending" }` matches ANY still-`"pending"`
 * invite for this address — whether it's live or has quietly passed its
 * `expiresAt` (nothing in this codebase ever transitions a pending invite to
 * another status on natural expiry) — and refreshes it in place: new
 * `roleIds`/`locale`/`expiresAt`/`invitedByUserId`, same `_id`. When no
 * pending invite exists yet, the same call inserts a fresh one via
 * `$setOnInsert`. One atomic `findOneAndUpdate`, so there is no read-then-
 * write race, and `createInvite` no longer HAS a failure branch — re-inviting
 * an address, whether its invite is live or long expired, always refreshes
 * and re-sends. That's what an administrator means by "invite again."
 *
 * `refreshed` distinguishes the two outcomes for the caller
 * (`inviteUserAction` surfaces different copy for "sent" vs. "re-sent") via
 * `lastErrorObject.updatedExisting` — the atomic, race-free signal
 * `includeResultMetadata: true` returns from the same operation, not a
 * `createdAt` timestamp comparison (which would be racy at the millisecond
 * boundary).
 *
 * **The partial unique index is still the ONLY uniqueness guard** —
 * `ensureAuthIndexes()`'s `{ email: 1 }` index with
 * `partialFilterExpression: { status: "pending" }` (`user.service.ts`). It
 * still guarantees at most one pending invite per address, and now also
 * backstops the upsert itself: MongoDB's server-side upsert retry (4.2+)
 * already resolves the common race — two concurrent upserts for a brand-new
 * address both missing the `{ email, status: "pending" }` match and both
 * attempting an insert — by re-running the query predicate against whichever
 * insert won. The single client-side retry below exists only for the
 * pathological case where that internal retry budget is exhausted: by the
 * time we get here, SOME doc matching `{ email, status: "pending" }` exists,
 * so the retry is guaranteed to take the update branch, not the insert
 * branch — it can never surface a user-facing `conflict` again.
 *
 * Deliberately does NOT check whether the email already belongs to an active
 * `AdminUser` — no such lookup exists yet, adding one is out of this
 * ticket's scope, and re-inviting an existing user is harmless (see
 * `inviteUserAction`, which has no administrability-invariant check to run
 * here either: inviting can only ever ADD a prospective grantee, never
 * reduce administrability).
 *
 * `session` is REQUIRED, not optional — this only ever runs inside
 * `withAdminTransaction`, and the upsert must join the caller's transaction
 * (Global Constraints, transaction rules).
 */
export async function createInvite(
  input: CreateInviteInput,
  session: ClientSession,
): Promise<{ ok: true; inviteId: string; refreshed: boolean }> {
  await ensureAuthIndexes();
  const email = normalizeEmail(input.email);

  const attemptUpsert = () => {
    const now = new Date();
    return getAdminDb()
      .collection(INVITES_COLLECTION)
      .findOneAndUpdate(
        { email, status: "pending" },
        {
          $set: {
            roleIds: [...input.roleIds],
            locale: input.locale,
            expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS),
            invitedByUserId: input.invitedByUserId,
          },
          $setOnInsert: { email, status: "pending", createdAt: now },
        },
        { upsert: true, returnDocument: "after", includeResultMetadata: true, session },
      );
  };

  let result;
  try {
    result = await attemptUpsert();
  } catch (error) {
    // Race backstop (see doc comment above) — retry once, by which point the
    // winning insert is visible and this retry's filter matches it as an
    // update, never another insert.
    if (!isDuplicateKeyError(error)) throw error;
    result = await attemptUpsert();
  }

  const doc = result.value;
  if (!doc) throw new Error("createInvite: upsert returned no document");
  return {
    ok: true,
    inviteId: doc._id.toHexString(),
    refreshed: result.lastErrorObject?.updatedExisting === true,
  };
}

export async function findPendingInvite(email: string): Promise<Invite | null> {
  await ensureAuthIndexes();
  const doc = await getAdminDb()
    .collection(INVITES_COLLECTION)
    .findOne({
      email: normalizeEmail(email),
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

  return doc ? inviteSchema.parse(doc) : null;
}

/**
 * Looks up an ACCEPTED invite by normalized email (Codex round-5 P1 fix) —
 * used by `resolveOrProvision` to distinguish a PROVABLE `no-invite` (no
 * `accepted` invite exists for this email) from an ambiguous
 * `provisioning-conflict` (an `accepted` invite whose owning `User` isn't
 * visible yet — either a concurrent same-uid winner still mid-provision, or
 * an earlier acceptance).
 *
 * The round-4 version of this lookup (`findInviteByEmail`) queried by email
 * ALONE, in any status, then branched on the returned doc's `status`. That
 * was unsound: `{email, status}` is not a unique key, so an email with
 * historical invite records — e.g. an original invite that was `revoked`,
 * followed by a re-invite that was `accepted` — can have MULTIPLE docs for
 * the same email, and an unqualified `findOne({email})` returns whichever
 * one Mongo happens to match first, not necessarily the newest. If that
 * happened to be the older `revoked` doc, the "provable negative" wasn't
 * actually provable, and a legitimately re-invited (and already-provisioned)
 * user could be wrongly classified `no-invite` and dead-ended at
 * `/no-access`. Querying `status: "accepted"` directly closes that gap: it
 * finds the accepted doc whenever one exists, regardless of how many other
 * (revoked/expired) docs also match this email.
 */
export async function findAcceptedInviteByEmail(email: string): Promise<Invite | null> {
  await ensureAuthIndexes();
  const doc = await getAdminDb()
    .collection(INVITES_COLLECTION)
    .findOne({ email: normalizeEmail(email), status: "accepted" });

  return doc ? inviteSchema.parse(doc) : null;
}

// A successfully claimed invite always carries `acceptedAt` — the `$set`
// below just stamped it on this exact document — so this narrows the shared
// `Invite` type's optional `acceptedAt` to required for callers (namely
// `revertInviteClaim`'s guarded predicate) that need a concrete Date.
export interface ClaimedInvite extends Invite {
  acceptedAt: Date;
}

/**
 * Atomically claims a pending, unexpired invite for `email` in a single
 * `findOneAndUpdate` (Codex round-2 P1 fix). The previous flow — a separate
 * `findPendingInvite` read followed by an `acceptInvite({_id})` write — left
 * a TOCTOU window: an invite revoked or expired between the two steps still
 * provisioned a user, and the `_id`-only accept re-accepted a no-longer-
 * eligible invite. Here the filter (pending + unexpired + normalized email)
 * and the `$set` run as ONE atomic Mongo operation, so a concurrent
 * revoke/expiry either wins (this call returns `null`) or loses (already
 * claimed) — never both. Returns the claimed invite (now
 * `status: "accepted"`) or `null` when no still-pending, unexpired invite
 * matched.
 */
export async function claimPendingInvite(
  email: string,
): Promise<ClaimedInvite | null> {
  await ensureAuthIndexes();
  const doc = await getAdminDb()
    .collection(INVITES_COLLECTION)
    .findOneAndUpdate(
      {
        email: normalizeEmail(email),
        status: "pending",
        expiresAt: { $gt: new Date() },
      },
      { $set: { status: "accepted", acceptedAt: new Date() } },
      { returnDocument: "after" },
    );

  if (!doc) return null;
  const invite = inviteSchema.parse(doc);
  // Non-null: see the `ClaimedInvite` comment above.
  return { ...invite, acceptedAt: invite.acceptedAt! };
}

/**
 * Reverts a claim made by `claimPendingInvite` back to `"pending"` (clearing
 * `acceptedAt`) — but ONLY if the invite is still in the exact state that
 * claim left it in (Codex round-3 P2 fix). The update is guarded by
 * `status: "accepted"` AND the claim's own `acceptedAt`, not `_id` alone: an
 * `_id`-only update would blindly overwrite whatever the invite's CURRENT
 * status is, so a newer transition that happened between the claim and this
 * revert — e.g. an admin concurrently revoking the invite — would get
 * clobbered back to `"pending"`, making a revoked invite usable again. A
 * mismatched filter (status no longer `"accepted"`, or a different
 * `acceptedAt` from a since-superseded claim) simply matches zero documents
 * — a safe no-op — rather than a blind revert.
 *
 * Used by `resolveOrProvision` when the user-creation step that was
 * supposed to follow a successful claim fails for a reason OTHER than the
 * duplicate-key race `createUserFromInvite` already recovers from internally
 * — otherwise the invite would be stuck `"accepted"` with no corresponding
 * `AdminUser`, permanently unusable.
 */
export async function revertInviteClaim(
  id: ObjectId,
  acceptedAt: Date,
): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(INVITES_COLLECTION)
    .updateOne(
      { _id: id, status: "accepted", acceptedAt },
      { $set: { status: "pending" }, $unset: { acceptedAt: "" } },
    );
}
