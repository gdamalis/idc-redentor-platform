import { beforeEach, describe, expect, it, vi } from "vitest";

const createIndex = vi.fn().mockResolvedValue("ok");
const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const find = vi.fn();
const collection = vi.fn(() => ({ createIndex, updateOne, find }));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({ collection }),
  withAdminTransaction: (fn: (s: unknown) => Promise<unknown>) =>
    fn({ id: "session" }),
}));

async function loadService() {
  vi.resetModules();
  return import("./role.service");
}

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
