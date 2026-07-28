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
 * Creates a new pending invite. **Plan correction (found during ICR-128
 * CP6):** ICR-127 shipped invite ACCEPTANCE only (`claimPendingInvite` /
 * `revertInviteClaim` below) — there was no invite CREATION path anywhere in
 * `apps/admin` (confirmed: `sendInviteEmail` had zero callers). This is that
 * missing write path, added here because Task 6's `inviteUserAction` needs
 * it — mirrors the Task 5 Step 0 correction for `createRole`/`listUsers`.
 *
 * **Uniqueness rule (CP7, index-only — settled after two rounds of review):**
 * at most one pending invite per address, enforced by a single source of
 * truth — `ensureAuthIndexes()`'s partial unique index on `{ email: 1 }`
 * (`user.service.ts`, `partialFilterExpression: { status: "pending" }`).
 * `createInvite` attempts the insert directly and maps the resulting E11000
 * to `{ ok: false, reason: "conflict" }` via `isDuplicateKeyError`, exactly
 * `createRole`'s pattern for its unique `name` index — one duplicate-
 * detection idiom, not two, across this PR.
 *
 * An earlier version of this function paired the index with a `findOne`
 * pre-check for a clean non-exception result in the common case. That was
 * deliberately removed: the pre-check used a DIFFERENT predicate than the
 * index (`expiresAt: { $gt: new Date() }`, vs. the index's bare
 * `status: "pending"`), so the two guards could disagree — a pre-check that
 * isn't authoritative doesn't fix anything the index doesn't already fix, it
 * just adds a non-atomic read that can't be trusted, and manufactures a
 * confusing "passes the pre-check, then collides on insert" path. Deleting
 * it removes the contradiction, not just the code.
 *
 * **Known gap (not fixed here — out of this ticket's scope):** the partial
 * index keys off `status: "pending"` alone, with no `expiresAt` condition.
 * Nothing in this codebase ever transitions a `pending` invite to another
 * status on natural expiry (`expiresAt` is only ever a query filter
 * elsewhere, e.g. `findPendingInvite`, never written), so a genuinely
 * expired-but-still-`"pending"` invite permanently blocks re-inviting that
 * address until the doc is manually cleared — and there is no revoke path or
 * pending-invites list UI yet to do that. Flagged in `tasks/todo.md` for a
 * follow-up; the real fix is either an `expiresAt` clause in the partial
 * filter or upsert-and-refresh semantics, which is a scope decision.
 *
 * Deliberately does NOT check whether the email already belongs to an active
 * `AdminUser` — no such lookup exists yet, adding one is out of this
 * ticket's scope, and re-inviting an existing user is harmless (see
 * `inviteUserAction`, which has no administrability-invariant check to run
 * here either: inviting can only ever ADD a prospective grantee, never
 * reduce administrability).
 *
 * `session` is REQUIRED, not optional — this only ever runs inside
 * `withAdminTransaction`, and the insert must join the caller's transaction
 * (Global Constraints, transaction rules).
 */
export async function createInvite(
  input: CreateInviteInput,
  session: ClientSession,
): Promise<{ ok: true; inviteId: string } | { ok: false; reason: "conflict" }> {
  await ensureAuthIndexes();
  const email = normalizeEmail(input.email);
  const now = new Date();
  const doc: Omit<Invite, "_id"> = {
    email,
    roleIds: [...input.roleIds],
    locale: input.locale,
    status: "pending",
    expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS),
    createdAt: now,
    invitedByUserId: input.invitedByUserId,
  };

  try {
    const result = await getAdminDb()
      .collection(INVITES_COLLECTION)
      .insertOne(doc, { session });
    return { ok: true, inviteId: result.insertedId.toHexString() };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { ok: false, reason: "conflict" };
    throw error;
  }
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
