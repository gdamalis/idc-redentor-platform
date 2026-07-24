import { describe, it, expect, vi, beforeEach } from "vitest";

const findOne = vi.fn();
const insertOne = vi.fn();
const updateOne = vi.fn();
const createIndex = vi.fn();

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({ findOne, insertOne, updateOne, createIndex }),
  }),
}));

beforeEach(() => vi.clearAllMocks());

/**
 * `ensureAuthIndexes()` memoizes on a module-level promise (R12) — re-import
 * fresh per test so that memoization doesn't leak the mock call-counts
 * between tests (mirrors `database.service.test.ts`'s `loadService()`).
 */
async function loadService() {
  vi.resetModules();
  return import("./user.service");
}

describe("findUserByFirebaseUid", () => {
  it("returns null when no doc matches", async () => {
    const { findUserByFirebaseUid } = await loadService();
    findOne.mockResolvedValueOnce(null);

    expect(await findUserByFirebaseUid("uid1")).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ firebaseUid: "uid1" });
  });

  it("returns the parsed user when a doc matches", async () => {
    const { findUserByFirebaseUid } = await loadService();
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      firebaseUid: "uid1",
      email: "a@b.com",
      roleIds: ["r1"],
      preferredLocale: "es-AR",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const user = await findUserByFirebaseUid("uid1");
    expect(user?.firebaseUid).toBe("uid1");
  });
});

describe("createUserFromInvite", () => {
  it("writes an active user seeded with roleIds + preferredLocale", async () => {
    const { createUserFromInvite } = await loadService();
    insertOne.mockResolvedValueOnce({ insertedId: "x" });

    const user = await createUserFromInvite({
      firebaseUid: "uid1",
      email: "a@b.com",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    });

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseUid: "uid1",
        roleIds: ["r1"],
        preferredLocale: "en-US",
        status: "active",
      }),
    );
    expect(user.preferredLocale).toBe("en-US");
  });

  it("re-reads and returns the existing user on a concurrent duplicate-key error (E11000)", async () => {
    const { createUserFromInvite } = await loadService();
    const now = new Date();
    const duplicateKeyError = Object.assign(new Error("duplicate"), {
      code: 11000,
    });
    insertOne.mockRejectedValueOnce(duplicateKeyError);
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      firebaseUid: "uid1",
      email: "a@b.com",
      roleIds: ["r1"],
      preferredLocale: "en-US",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const user = await createUserFromInvite({
      firebaseUid: "uid1",
      email: "a@b.com",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    });

    expect(user.firebaseUid).toBe("uid1");
    expect(findOne).toHaveBeenCalledWith({ firebaseUid: "uid1" });
  });
});

describe("updatePreferredLocale", () => {
  it("returns true when a doc is modified", async () => {
    const { updatePreferredLocale } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });

    expect(await updatePreferredLocale("uid1", "es-AR")).toBe(true);
  });

  it("returns false when no doc matches", async () => {
    const { updatePreferredLocale } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 0 });

    expect(await updatePreferredLocale("uid-missing", "es-AR")).toBe(false);
  });
});

describe("ensureAuthIndexes", () => {
  it("creates the unique users indexes and the invites indexes", async () => {
    const { ensureAuthIndexes } = await loadService();
    await ensureAuthIndexes();

    expect(createIndex).toHaveBeenCalledWith(
      { firebaseUid: 1 },
      { unique: true },
    );
    expect(createIndex).toHaveBeenCalledWith({ email: 1 }, { unique: true });
    expect(createIndex).toHaveBeenCalledWith({ email: 1, status: 1 });
    expect(createIndex).toHaveBeenCalledWith({ expiresAt: 1 });
  });

  it("memoizes so a second call does not re-create the indexes", async () => {
    const { ensureAuthIndexes } = await loadService();
    await ensureAuthIndexes();
    await ensureAuthIndexes();

    expect(createIndex).toHaveBeenCalledTimes(4);
  });
});
