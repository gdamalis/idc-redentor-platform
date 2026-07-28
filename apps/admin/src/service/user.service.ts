import { ObjectId } from "mongodb";
import type { ClientSession } from "mongodb";
import { getAdminDb } from "@src/service/database.service";
import type { Locale } from "@src/i18n/config";
import { adminUserSchema } from "./types";
import type { AdminUser } from "./types";

const USERS_COLLECTION = "users";
const INVITES_COLLECTION = "invites";

interface MongoDuplicateKeyError {
  code?: number;
}

/** Exported so `role.service.ts` reuses this rather than writing a second copy. */
export function isDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as MongoDuplicateKeyError).code === 11000
  );
}

/**
 * Memoized module-level promise (R12): idempotent `createIndex` calls for
 * both `users` and `invites`, shared across the user + invite services so
 * neither creates its own half of the auth indexes. Called lazily from every
 * read/write entrypoint in both services (never at import time).
 */
let indexesPromise: Promise<void> | null = null;

export function ensureAuthIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const db = getAdminDb();
    const users = db.collection(USERS_COLLECTION);
    const invites = db.collection(INVITES_COLLECTION);

    await Promise.all([
      users.createIndex({ firebaseUid: 1 }, { unique: true }),
      users.createIndex({ email: 1 }, { unique: true }),
      invites.createIndex({ email: 1, status: 1 }),
      invites.createIndex({ expiresAt: 1 }),
    ]);
  })();

  return indexesPromise;
}

export async function findUserByFirebaseUid(
  firebaseUid: string,
): Promise<AdminUser | null> {
  await ensureAuthIndexes();
  const doc = await getAdminDb()
    .collection(USERS_COLLECTION)
    .findOne({ firebaseUid });

  return doc ? adminUserSchema.parse(doc) : null;
}

export interface CreateUserFromInviteParams {
  firebaseUid: string;
  email: string;
  roleIds: string[];
  preferredLocale: Locale;
}

export async function createUserFromInvite(
  params: CreateUserFromInviteParams,
): Promise<AdminUser> {
  await ensureAuthIndexes();
  const now = new Date();
  const doc: Omit<AdminUser, "_id"> = {
    firebaseUid: params.firebaseUid,
    email: params.email,
    roleIds: params.roleIds,
    preferredLocale: params.preferredLocale,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await getAdminDb()
      .collection(USERS_COLLECTION)
      .insertOne(doc);
    return { ...doc, _id: result.insertedId } as AdminUser;
  } catch (error) {
    // Concurrent first sign-in: another request already created this user
    // (unique index on firebaseUid). Re-read and return it — idempotent.
    if (isDuplicateKeyError(error)) {
      const existing = await findUserByFirebaseUid(params.firebaseUid);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function updatePreferredLocale(
  firebaseUid: string,
  locale: Locale,
): Promise<boolean> {
  await ensureAuthIndexes();
  const result = await getAdminDb()
    .collection(USERS_COLLECTION)
    .updateOne(
      { firebaseUid },
      { $set: { preferredLocale: locale, updatedAt: new Date() } },
    );

  return (result.matchedCount ?? 0) > 0;
}

/**
 * ALL users, not just active — `retainsAdministrability` filters by status
 * itself, so it needs disabled users in the snapshot too (a disabled admin
 * must not count toward administrability).
 */
export async function listUsers(session?: ClientSession): Promise<AdminUser[]> {
  await ensureAuthIndexes();
  const docs = await getAdminDb()
    .collection(USERS_COLLECTION)
    .find({}, { session })
    .toArray();

  return docs.map((doc) => adminUserSchema.parse(doc));
}

// The three mutators below all take `userId` as a hex string and convert
// with `new ObjectId(userId)` internally — matching how
// `AdminStateSnapshot.users[].id` is produced (`_id.toHexString()`) in
// `(app)/users/actions.ts` (Task 6 Step 4). `session` is required, not
// optional: every caller runs these inside `withAdminTransaction`, after
// asserting the administrability invariant against the proposed post-state.

export async function updateUserRoles(
  userId: string,
  roleIds: readonly string[],
  session: ClientSession,
): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(USERS_COLLECTION)
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { roleIds: [...roleIds], updatedAt: new Date() } },
      { session },
    );
}

export async function updateUserStatus(
  userId: string,
  status: "active" | "disabled",
  session: ClientSession,
): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(USERS_COLLECTION)
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { status, updatedAt: new Date() } },
      { session },
    );
}

export async function deleteUser(userId: string, session: ClientSession): Promise<void> {
  await ensureAuthIndexes();
  await getAdminDb()
    .collection(USERS_COLLECTION)
    .deleteOne({ _id: new ObjectId(userId) }, { session });
}
