import { ObjectId } from "mongodb";
import type { ClientSession, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import {
  CONTENT_PERMISSION_KEYS,
  exitCodeForGrant,
  grantContentPermissions,
  parseGrantArgs,
  type GrantContentPermissionsDeps,
} from "./grant-content-permissions";

const LEGACY_15_KEYS = [
  "people:read",
  "people:write",
  "people:delete",
  "people:pii",
  "families:read",
  "families:write",
  "activities:read",
  "activities:write",
  "activities:delete",
  "calendar:read",
  "calendar:print",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
];

interface StoredRoleDoc {
  _id: ObjectId;
  key?: "admin" | "leader" | "member";
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory role store starting from EXISTING persisted role documents (not a
 * fresh insert), exercising real `$addToSet` semantics on `{ key: "admin" }`.
 */
function createStatefulRoleHarness(initialRoles: StoredRoleDoc[]) {
  const store = initialRoles.map((doc) => ({
    ...doc,
    permissions: [...doc.permissions],
  }));
  const auditEntries: unknown[] = [];
  const abortTransaction = vi.fn().mockResolvedValue(undefined);
  const fakeSession = { abortTransaction } as unknown as ClientSession;

  const findOne = vi.fn(async (filter: { key?: string }) => {
    const match = store.find((r) => r.key === filter.key);
    return match ? { ...match, permissions: [...match.permissions] } : null;
  });

  const updateOne = vi.fn(
    async (
      filter: { key?: string },
      update: {
        $addToSet?: { permissions?: { $each?: string[] } };
        $set?: { updatedAt?: Date };
      },
    ) => {
      const match = store.find((r) => r.key === filter.key);
      if (!match) return { matchedCount: 0, modifiedCount: 0 };

      let modified = false;
      for (const key of update.$addToSet?.permissions?.$each ?? []) {
        if (!match.permissions.includes(key)) {
          match.permissions.push(key);
          modified = true;
        }
      }
      if (modified && update.$set?.updatedAt) {
        match.updatedAt = update.$set.updatedAt;
      }
      return { matchedCount: 1, modifiedCount: modified ? 1 : 0 };
    },
  );

  const appendAuditEntry = vi.fn(
    async (entry: unknown, session: ClientSession) => {
      expect(session).toBe(fakeSession);
      auditEntries.push(entry);
    },
  );

  const db = {
    databaseName: "ministry-admin-staging",
    collection: (name: string) => {
      expect(name).toBe("roles");
      return { findOne, updateOne };
    },
  } as unknown as Db;

  const deps: GrantContentPermissionsDeps = {
    getAdminDb: () => db,
    ensureRbacIndexes: vi.fn().mockResolvedValue(undefined),
    withAdminTransaction: async (fn) => fn(fakeSession),
    appendAuditEntry,
  };

  return { store, auditEntries, findOne, updateOne, abortTransaction, deps };
}

describe("parseGrantArgs & exitCodeForGrant", () => {
  it("parses valid flags and rejects unknown arguments or invalid emails", () => {
    expect(parseGrantArgs([])).toEqual({
      ok: true,
      args: { yes: false, dryRun: false },
    });
    expect(
      parseGrantArgs(["--yes", "--dry-run", "--actor", "ops@church.org"]),
    ).toEqual({
      ok: true,
      args: { yes: true, dryRun: true, actorEmail: "ops@church.org" },
    });
    expect(parseGrantArgs(["--bogus"]).ok).toBe(false);
    expect(parseGrantArgs(["--actor"]).ok).toBe(false);
    expect(parseGrantArgs(["--actor", "not-an-email"]).ok).toBe(false);

    expect(
      exitCodeForGrant({
        ok: true,
        dryRun: false,
        databaseName: "ministry-admin-staging",
        roleId: "r1",
        modified: true,
        addedKeys: [...CONTENT_PERMISSION_KEYS],
      }),
    ).toBe(0);
    expect(
      exitCodeForGrant({ ok: false, reason: "write-failed", message: "err" }),
    ).toBe(1);
    expect(
      exitCodeForGrant({ ok: false, reason: "db-guard", message: "bad db" }),
    ).toBe(2);
  });
});

describe("grantContentPermissions (AC3)", () => {
  it("adds all 5 keys to the stored Admin role only, and is idempotent with 0 audit entries on re-run", async () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const adminId = new ObjectId();
    const leaderId = new ObjectId();
    const customId = new ObjectId();

    const harness = createStatefulRoleHarness([
      {
        _id: adminId,
        key: "admin",
        name: "Admin",
        permissions: [...LEGACY_15_KEYS],
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: leaderId,
        key: "leader",
        name: "Leader",
        permissions: ["people:read", "people:write"],
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: customId,
        name: "Custom Editor",
        permissions: ["calendar:read"],
        isSystem: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // First run against existing Admin role document
    const first = await grantContentPermissions(
      { yes: true, dryRun: false, actorEmail: "gabriel@church.org" },
      harness.deps,
    );

    expect(first).toEqual({
      ok: true,
      dryRun: false,
      databaseName: "ministry-admin-staging",
      roleId: adminId.toHexString(),
      modified: true,
      addedKeys: [...CONTENT_PERMISSION_KEYS],
    });

    const adminAfterFirst = harness.store.find((r) => r.key === "admin")!;
    expect(adminAfterFirst.permissions).toHaveLength(20);
    for (const key of CONTENT_PERMISSION_KEYS) {
      expect(adminAfterFirst.permissions).toContain(key);
    }

    // Leader and custom roles gained ZERO keys
    expect(harness.store.find((r) => r.key === "leader")?.permissions).toEqual([
      "people:read",
      "people:write",
    ]);
    expect(harness.store.find((r) => r._id === customId)?.permissions).toEqual([
      "calendar:read",
    ]);

    // Exactly 1 rbacAudit role.update entry written
    expect(harness.auditEntries).toHaveLength(1);
    expect(harness.auditEntries[0]).toMatchObject({
      actorEmail: "gabriel@church.org",
      action: "role.update",
      targetId: adminId.toHexString(),
      before: { permissions: LEGACY_15_KEYS },
    });

    // Second run — idempotent no-op, writes nothing and appends 0 new audit entries
    const second = await grantContentPermissions(
      { yes: true, dryRun: false, actorEmail: "gabriel@church.org" },
      harness.deps,
    );

    expect(second).toEqual({
      ok: true,
      dryRun: false,
      databaseName: "ministry-admin-staging",
      roleId: adminId.toHexString(),
      modified: false,
      addedKeys: [],
    });
    expect(harness.updateOne).toHaveBeenCalledTimes(1);
    expect(harness.auditEntries).toHaveLength(1);
  });

  it("supports --dry-run without modifying the role or writing audit entries", async () => {
    const now = new Date();
    const adminId = new ObjectId();
    const harness = createStatefulRoleHarness([
      {
        _id: adminId,
        key: "admin",
        name: "Admin",
        permissions: [...LEGACY_15_KEYS],
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await grantContentPermissions(
      { yes: false, dryRun: true },
      harness.deps,
    );

    expect(result).toEqual({
      ok: true,
      dryRun: true,
      databaseName: "ministry-admin-staging",
      roleId: adminId.toHexString(),
      wouldAddKeys: [...CONTENT_PERMISSION_KEYS],
    });
    expect(harness.updateOne).not.toHaveBeenCalled();
    expect(harness.auditEntries).toHaveLength(0);
    expect(harness.abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses when the stored admin role is missing or DB guard throws", async () => {
    const emptyHarness = createStatefulRoleHarness([]);
    const missing = await grantContentPermissions(
      { yes: true, dryRun: false },
      emptyHarness.deps,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("admin-role-not-found");

    const badDb = await grantContentPermissions(
      { yes: true, dryRun: false },
      {
        ...emptyHarness.deps,
        getAdminDb: () => {
          throw new Error('Refusing database "test"');
        },
      },
    );
    expect(badDb.ok).toBe(false);
    if (!badDb.ok) expect(badDb.reason).toBe("db-guard");
  });
});
