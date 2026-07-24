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

export async function acceptInvite(id: ObjectId): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(INVITES_COLLECTION)
    .updateOne(
      { _id: id },
      { $set: { status: "accepted", acceptedAt: new Date() } },
    );
}
