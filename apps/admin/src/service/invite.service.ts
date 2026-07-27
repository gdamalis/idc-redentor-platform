import type { ObjectId } from "mongodb";
import { getAdminDb } from "@src/service/database.service";
import { normalizeEmail } from "@src/lib/auth/email";
import { ensureAuthIndexes } from "./user.service";
import { inviteSchema } from "./types";
import type { Invite } from "./types";

const INVITES_COLLECTION = "invites";

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
 * Looks up an invite by normalized email in ANY status (Codex round-4 P1
 * fix) — used by `resolveOrProvision` to distinguish a PROVABLE `no-invite`
 * (no invite doc at all, or one that's revoked/expired) from an ambiguous
 * `provisioning-conflict` (an `accepted` invite whose owning `User` isn't
 * visible yet — either a concurrent same-uid winner still mid-provision, or
 * an earlier acceptance). Unlike `findPendingInvite`, this deliberately does
 * NOT filter by `status`/`expiresAt` — the caller needs to see an `accepted`
 * invite precisely to avoid concluding `no-invite` on it.
 */
export async function findInviteByEmail(email: string): Promise<Invite | null> {
  await ensureAuthIndexes();
  const doc = await getAdminDb()
    .collection(INVITES_COLLECTION)
    .findOne({ email: normalizeEmail(email) });

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
