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
export async function claimPendingInvite(email: string): Promise<Invite | null> {
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

  return doc ? inviteSchema.parse(doc) : null;
}

/**
 * Reverts a claim made by `claimPendingInvite` back to `"pending"` (clearing
 * `acceptedAt`). Used by `resolveOrProvision` when the user-creation step
 * that was supposed to follow a successful claim fails for a reason OTHER
 * than the duplicate-key race `createUserFromInvite` already recovers from
 * internally — otherwise the invite would be stuck `"accepted"` with no
 * corresponding `AdminUser`, permanently unusable.
 */
export async function revertInviteClaim(id: ObjectId): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(INVITES_COLLECTION)
    .updateOne(
      { _id: id },
      { $set: { status: "pending" }, $unset: { acceptedAt: "" } },
    );
}
