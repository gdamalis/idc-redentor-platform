import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";

const createIndex = vi.fn().mockResolvedValue("ok");
const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const insertOne = vi.fn();
const deleteOne = vi.fn();
const find = vi.fn();
const collection = vi.fn(() => ({
  createIndex,
  updateOne,
  insertOne,
  deleteOne,
  find,
}));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({ collection }),
  withAdminTransaction: (fn: (s: unknown) => Promise<unknown>) =>
    fn({ id: "session" }),
}));

// `role.service.ts` reuses `user.service.ts`'s `isDuplicateKeyError` rather
// than a second copy — mock the real implementation here (same E11000 check)
// so `createRole`'s conflict-mapping test exercises real logic.
vi.mock("@src/service/user.service", () => ({
  isDuplicateKeyError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000,
}));

async function loadService() {
  vi.resetModules();
  return import("./role.service");
}

const session = { id: "session" } as unknown as ClientSession;

beforeEach(() => vi.clearAllMocks());

describe("seedSystemRoles", () => {
  it("upserts exactly three system roles", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    expect(updateOne).toHaveBeenCalledTimes(3);
  });

  it("seeds Leader with exactly the 9 agreed keys", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    const leader = updateOne.mock.calls.find(
      ([filter]) => filter.key === "leader",
    );
    expect(leader?.[1].$setOnInsert.permissions.sort()).toEqual([
      "activities:read",
      "activities:write",
      "calendar:print",
      "calendar:read",
      "families:read",
      "families:write",
      "people:pii",
      "people:read",
      "people:write",
    ]);
  });

  it("seeds Admin with all 15 keys", async () => {
    const { seedSystemRoles } = await loadService();
    const { PERMISSION_KEYS } = await import("@src/lib/rbac/permissions");
    await seedSystemRoles();
    const admin = updateOne.mock.calls.find(
      ([filter]) => filter.key === "admin",
    );
    expect(admin?.[1].$setOnInsert.permissions).toHaveLength(
      PERMISSION_KEYS.length,
    );
  });

  it("is NON-DESTRUCTIVE: permissions go in $setOnInsert, never $set", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    for (const [, update] of updateOne.mock.calls) {
      expect(update.$setOnInsert).toHaveProperty("permissions");
      expect(update.$set ?? {}).not.toHaveProperty("permissions");
      expect(update.$set ?? {}).not.toHaveProperty("name");
    }
  });

  it("upserts by the stable key, never by name", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    for (const [filter, , options] of updateOne.mock.calls) {
      expect(Object.keys(filter)).toEqual(["key"]);
      expect(options).toMatchObject({ upsert: true });
    }
  });
});

describe("createRole", () => {
  it("inserts a non-system role joined to the caller's session", async () => {
    const { createRole } = await loadService();
    insertOne.mockResolvedValueOnce({ insertedId: { toHexString: () => "r-new" } });

    const result = await createRole(
      { name: "Custom", description: "A custom role", permissions: ["people:read"] },
      session,
    );

    expect(result).toEqual({ ok: true, roleId: "r-new" });
    const [doc, options] = insertOne.mock.calls[0] ?? [];
    expect(doc).toMatchObject({
      name: "Custom",
      description: "A custom role",
      permissions: ["people:read"],
      isSystem: false,
    });
    expect(doc).not.toHaveProperty("key");
    expect(options).toEqual({ session });
  });

  it("maps a duplicate-name error to reason: conflict, without throwing", async () => {
    const { createRole } = await loadService();
    insertOne.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));

    const result = await createRole(
      { name: "Leader", permissions: [] },
      session,
    );

    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("re-throws a non-duplicate-key error", async () => {
    const { createRole } = await loadService();
    insertOne.mockRejectedValueOnce(new Error("mongo down"));

    await expect(
      createRole({ name: "X", permissions: [] }, session),
    ).rejects.toThrow("mongo down");
  });

  // Same root cause as updateRole's description regression above: the
  // create-role form's description input isn't `required`, so a role created
  // without one arrives here with `input.description` `undefined`. Writing
  // that straight into `insertOne` would serialize to BSON `null` and break
  // every later `roleSchema.parse()` read of the new role.
  it("never inserts an undefined or null description — omits the field entirely when absent", async () => {
    const { createRole } = await loadService();
    insertOne.mockResolvedValueOnce({ insertedId: { toHexString: () => "r-new" } });

    await createRole({ name: "No description", permissions: [] }, session);

    const [doc] = insertOne.mock.calls[0] ?? [];
    expect(doc).not.toHaveProperty("description");
  });
});

describe("updateRole", () => {
  it("$sets name/description/permissions joined to the session, and never touches key or isSystem", async () => {
    const { updateRole } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });

    const result = await updateRole(
      {
        roleId: "507f1f77bcf86cd799439011",
        name: "Renamed",
        description: "New description",
        permissions: ["people:read", "people:write"],
      },
      session,
    );

    expect(result).toEqual({ ok: true });
    const [filter, update, options] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: expect.anything() });
    expect(update.$set).toMatchObject({
      name: "Renamed",
      description: "New description",
      permissions: ["people:read", "people:write"],
    });
    expect(update.$set).not.toHaveProperty("key");
    expect(update.$set).not.toHaveProperty("isSystem");
    expect(options).toEqual({ session });
  });

  // Defense-in-depth for this service function's own contract: whatever the
  // caller's shape, `input.description` arriving `undefined` must never
  // reach the driver as a literal `undefined` `$set` value. (The permission
  // matrix form round-trips the role's current description via a hidden
  // input — see permission-matrix.test.tsx — but this function must not
  // *depend* on every caller doing that.) The mongodb driver's default
  // `ignoreUndefined: false` serializes an `undefined` `$set` value to BSON
  // `null`, and `roleSchema`'s `description: z.string().optional()` rejects
  // `null` — every later `listRoles()`/`findRolesByIds()` would then throw,
  // a persisted, self-inflicted lockout for anyone holding that role.
  it("never $sets an undefined or null description — $unsets it instead when absent from input", async () => {
    const { updateRole } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });

    await updateRole(
      {
        roleId: "507f1f77bcf86cd799439011",
        name: "Leader",
        permissions: ["people:read", "people:write"],
      },
      session,
    );

    const [, update] = updateOne.mock.calls[0] ?? [];
    expect(update.$set).not.toHaveProperty("description");
    expect(update.$unset).toEqual({ description: "" });
    // Belt and suspenders: `null` must never appear anywhere in the payload —
    // confirms the driver never sees the `undefined`-serializes-to-`null` shape.
    expect(JSON.stringify(update)).not.toContain("null");
  });

  it("$sets name/permissions (never key/isSystem) regardless of the description branch", async () => {
    const { updateRole } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });

    await updateRole(
      { roleId: "507f1f77bcf86cd799439011", name: "Leader", permissions: [] },
      session,
    );

    const [, update] = updateOne.mock.calls[0] ?? [];
    expect(update.$set).toMatchObject({ name: "Leader", permissions: [] });
    expect(update.$set).not.toHaveProperty("key");
    expect(update.$set).not.toHaveProperty("isSystem");
  });

  // Symmetric with createRole's identical test — renaming a role onto a name
  // another role already holds must be a refusal, not a throw escaping the
  // `ActionResult`-never-throws contract every other mutation path keeps.
  it("maps a duplicate-name error to reason: conflict, without throwing", async () => {
    const { updateRole } = await loadService();
    updateOne.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));

    const result = await updateRole(
      {
        roleId: "507f1f77bcf86cd799439011",
        name: "Leader",
        permissions: ["people:read"],
      },
      session,
    );

    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("re-throws a non-duplicate-key error", async () => {
    const { updateRole } = await loadService();
    updateOne.mockRejectedValueOnce(new Error("mongo down"));

    await expect(
      updateRole(
        { roleId: "507f1f77bcf86cd799439011", name: "X", permissions: [] },
        session,
      ),
    ).rejects.toThrow("mongo down");
  });
});

describe("deleteRole", () => {
  it("deletes by id, joined to the session", async () => {
    const { deleteRole } = await loadService();
    deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    await deleteRole("507f1f77bcf86cd799439011", session);

    const [filter, options] = deleteOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: expect.anything() });
    expect(options).toEqual({ session });
  });
});

describe("ensureRbacIndexes", () => {
  it("creates the partial-unique key index and the name index", async () => {
    const { ensureRbacIndexes } = await loadService();
    await ensureRbacIndexes();
    expect(createIndex).toHaveBeenCalledWith(
      { key: 1 },
      { unique: true, partialFilterExpression: { key: { $exists: true } } },
    );
    expect(createIndex).toHaveBeenCalledWith({ name: 1 }, { unique: true });
  });

  it("is memoized across calls", async () => {
    const { ensureRbacIndexes } = await loadService();
    await ensureRbacIndexes();
    const after = createIndex.mock.calls.length;
    await ensureRbacIndexes();
    expect(createIndex.mock.calls.length).toBe(after);
  });
});
