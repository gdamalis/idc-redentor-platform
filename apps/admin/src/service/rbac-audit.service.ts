import { getAdminDb } from "@src/service/database.service";
import type { ClientSession } from "mongodb";
import type { RbacAuditEntry } from "./types";

const RBAC_AUDIT_COLLECTION = "rbacAudit";

/**
 * Memoized module-level promise (mirrors `user.service.ts`'s
 * `ensureAuthIndexes` / `role.service.ts`'s `ensureRbacIndexes`): idempotent
 * `createIndex` calls, called lazily from every entrypoint in this service
 * (never at import time).
 */
let indexesPromise: Promise<void> | null = null;

export function ensureRbacAuditIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const rbacAudit = getAdminDb().collection(RBAC_AUDIT_COLLECTION);

    await Promise.all([
      rbacAudit.createIndex({ at: -1 }),
      rbacAudit.createIndex({ targetId: 1, at: -1 }),
    ]);
  })();

  return indexesPromise;
}

/**
 * Append-only. `session` is REQUIRED, not optional — the audit write must
 * join the caller's Mongo transaction, otherwise the log can drift from what
 * was actually committed (Global Constraints, transaction rules). `at` is
 * always set server-side, never taken from caller input.
 */
export async function appendAuditEntry(
  entry: Omit<RbacAuditEntry, "_id" | "at">,
  session: ClientSession,
): Promise<void> {
  await ensureRbacAuditIndexes();
  await getAdminDb()
    .collection(RBAC_AUDIT_COLLECTION)
    .insertOne({ ...entry, at: new Date() }, { session });
}
