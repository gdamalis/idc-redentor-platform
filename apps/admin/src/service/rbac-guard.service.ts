import type { ClientSession } from "mongodb";
import { getAdminDb } from "@src/service/database.service";

const GUARD_COLLECTION = "rbacGuard";
const ADMINISTRABILITY_GUARD_ID = "administrability";

/** A string `_id` (not the usual `ObjectId`) — there is exactly one
 * well-known document in this collection, never looked up by anything else. */
interface RbacGuardDocument {
  _id: string;
  rev: number;
  updatedAt: Date;
}

/**
 * Serializes every administrability-affecting mutation. MongoDB transactions are
 * SNAPSHOT isolated, not serializable: two transactions writing DIFFERENT user or
 * role documents never conflict, so both could commit and leave zero administrable
 * users (write skew — see `docs/architecture/admin-rbac.md`'s transaction section).
 * Bumping one shared document forces a write conflict between any two such
 * transactions, which the driver retries — and the retry re-reads the committed
 * state, where the invariant correctly fails.
 *
 * `fn` in `withAdminTransaction` may be retried by the driver (same rule this
 * relies on to close the race), so this must stay idempotent — which a bare
 * `$inc`/`$set` upsert already is: replaying it just bumps `rev` again.
 *
 * Call this FIRST inside the transaction, before reading `roles`/`users` to
 * build the post-state snapshot — the earlier the contended write happens, the
 * earlier a losing concurrent transaction discovers it must retry.
 */
export async function touchAdministrabilityGuard(session: ClientSession): Promise<void> {
  await getAdminDb()
    .collection<RbacGuardDocument>(GUARD_COLLECTION)
    .updateOne(
      { _id: ADMINISTRABILITY_GUARD_ID },
      { $inc: { rev: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, session },
    );
}
