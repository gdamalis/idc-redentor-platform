import { getAdminDb } from "./database.service";

const THROTTLE_COLLECTION = "password_reset_throttle";

/**
 * Cooldown window, in seconds. A second `requestPasswordReset` call for the
 * same normalized email inside this window is silently throttled — no
 * Admin-SDK reset link generated, no Resend email sent — while the Server
 * Action still returns `{ ok: true }` (enumeration-safe). Contains the
 * public reset form's blast radius: repeated calls can no longer email-bomb
 * one inbox or burn through the Admin SDK's reset-link quota.
 */
export const RESET_THROTTLE_COOLDOWN_SECONDS = 60;

interface MongoDuplicateKeyError {
  code?: number;
}

function isDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as MongoDuplicateKeyError).code === 11000
  );
}

/**
 * Memoized module-level promise (mirrors `user.service.ts#ensureAuthIndexes`):
 * a unique index on `email` is what makes a claim attempt during the
 * cooldown fail with E11000, and a TTL index on `createdAt` self-expires
 * each record after the cooldown — a record's mere PRESENCE is the "still
 * cooling down" signal, so there's no manual time-math or cleanup job.
 */
let indexesPromise: Promise<void> | null = null;

function ensureResetThrottleIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const collection = getAdminDb().collection(THROTTLE_COLLECTION);
    await Promise.all([
      collection.createIndex({ email: 1 }, { unique: true }),
      collection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: RESET_THROTTLE_COOLDOWN_SECONDS },
      ),
    ]);
  })();

  return indexesPromise;
}

/**
 * Tries to "claim" a password-reset send for `email` (already normalized by
 * the caller). Returns `true` when allowed — atomically recording the claim
 * so an immediate repeat is throttled — or `false` when a live claim already
 * exists within the cooldown window (a concurrent duplicate-key error on the
 * unique `email` index).
 */
export async function tryAcquireResetThrottle(email: string): Promise<boolean> {
  await ensureResetThrottleIndexes();

  try {
    await getAdminDb().collection(THROTTLE_COLLECTION).insertOne({
      email,
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}
