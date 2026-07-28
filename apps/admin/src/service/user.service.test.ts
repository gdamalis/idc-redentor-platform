import { describe, it, expect, vi, beforeEach } from "vitest";

const findOne = vi.fn();
const insertOne = vi.fn();
const updateOne = vi.fn();
const deleteOne = vi.fn();
const createIndex = vi.fn();
const toArray = vi.fn();
const find = vi.fn(() => ({ toArray }));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({
      findOne,
      insertOne,
      updateOne,
      deleteOne,
      createIndex,
      find,
    }),
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

describe("listUsers", () => {
  it("returns every parsed user, including disabled ones", async () => {
    const { listUsers } = await loadService();
    const now = new Date();
    toArray.mockResolvedValueOnce([
      {
        _id: { toHexString: () => "u1" },
        firebaseUid: "uid1",
        email: "a@b.com",
        roleIds: ["r1"],
        preferredLocale: "es-AR",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: { toHexString: () => "u2" },
        firebaseUid: "uid2",
        email: "c@d.com",
        roleIds: ["r1"],
        preferredLocale: "es-AR",
        status: "disabled",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const users = await listUsers();

    expect(users.map((u) => u.status)).toEqual(["active", "disabled"]);
    expect(find).toHaveBeenCalledWith({}, { session: undefined });
  });

  it("forwards the caller's session", async () => {
    const { listUsers } = await loadService();
    toArray.mockResolvedValueOnce([]);
    const session = { id: "session" } as unknown as import("mongodb").ClientSession;

    await listUsers(session);

    expect(find).toHaveBeenCalledWith({}, { session });
  });
});

describe("updateUserRoles", () => {
  it("$sets roleIds (spread into a plain array) and forwards the session", async () => {
    const { updateUserRoles } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const session = { id: "session" } as unknown as import("mongodb").ClientSession;

    await updateUserRoles("507f1f77bcf86cd799439011", ["r1", "r2"], session);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0] ?? [];
    expect(filter._id.toHexString()).toBe("507f1f77bcf86cd799439011");
    expect(update.$set.roleIds).toEqual(["r1", "r2"]);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ session });
  });
});

describe("updateUserStatus", () => {
  it("$sets status and forwards the session", async () => {
    const { updateUserStatus } = await loadService();
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const session = { id: "session" } as unknown as import("mongodb").ClientSession;

    await updateUserStatus("507f1f77bcf86cd799439011", "disabled", session);

    const [filter, update, options] = updateOne.mock.calls[0] ?? [];
    expect(filter._id.toHexString()).toBe("507f1f77bcf86cd799439011");
    expect(update.$set.status).toBe("disabled");
    expect(options).toEqual({ session });
  });
});

describe("deleteUser", () => {
  it("deletes by _id and forwards the session", async () => {
    const { deleteUser } = await loadService();
    deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    const session = { id: "session" } as unknown as import("mongodb").ClientSession;

    await deleteUser("507f1f77bcf86cd799439011", session);

    expect(deleteOne).toHaveBeenCalledTimes(1);
    const [filter, options] = deleteOne.mock.calls[0] ?? [];
    expect(filter._id.toHexString()).toBe("507f1f77bcf86cd799439011");
    expect(options).toEqual({ session });
  });
});

describe("isDuplicateKeyError", () => {
  it("recognizes a Mongo E11000 error", async () => {
    const { isDuplicateKeyError } = await loadService();
    expect(isDuplicateKeyError(Object.assign(new Error("dup"), { code: 11000 }))).toBe(true);
  });

  it("rejects a non-duplicate-key error and non-error values", async () => {
    const { isDuplicateKeyError } = await loadService();
    expect(isDuplicateKeyError(new Error("other"))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError("nope")).toBe(false);
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
    // Partial unique index (ICR-128 CP7): at most one PENDING invite per
    // address, enforced at the DB layer as the backstop `createInvite` relies
    // on for its E11000 mapping — the pre-check alone can't close the race.
    expect(createIndex).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true, partialFilterExpression: { status: "pending" } },
    );
  });

  it("memoizes so a second call does not re-create the indexes", async () => {
    const { ensureAuthIndexes } = await loadService();
    await ensureAuthIndexes();
    await ensureAuthIndexes();

    expect(createIndex).toHaveBeenCalledTimes(5);
  });
});
