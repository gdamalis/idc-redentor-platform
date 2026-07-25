import { describe, it, expect, vi, beforeEach } from "vitest";

const insertOne = vi.fn();
const createIndex = vi.fn();

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({ insertOne, createIndex }),
  }),
}));

beforeEach(() => vi.clearAllMocks());

/**
 * `ensureResetThrottleIndexes()` memoizes on a module-level promise — re-import
 * fresh per test so memoization doesn't leak mock call-counts between tests
 * (mirrors `user.service.test.ts`'s `loadService()`).
 */
async function loadService() {
  vi.resetModules();
  return import("./reset-throttle.service");
}

describe("tryAcquireResetThrottle", () => {
  it("allows the first request for an email and records the claim", async () => {
    const { tryAcquireResetThrottle } = await loadService();
    insertOne.mockResolvedValueOnce({ insertedId: "x" });

    const allowed = await tryAcquireResetThrottle("user@bar.com");

    expect(allowed).toBe(true);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@bar.com" }),
    );
  });

  it("throttles an immediate second request for the same email (E11000)", async () => {
    const { tryAcquireResetThrottle } = await loadService();
    const duplicateKeyError = Object.assign(new Error("duplicate"), {
      code: 11000,
    });
    insertOne.mockRejectedValueOnce(duplicateKeyError);

    const allowed = await tryAcquireResetThrottle("user@bar.com");

    expect(allowed).toBe(false);
  });

  it("rethrows a non-duplicate-key error instead of silently throttling", async () => {
    const { tryAcquireResetThrottle } = await loadService();
    insertOne.mockRejectedValueOnce(new Error("network blip"));

    await expect(tryAcquireResetThrottle("user@bar.com")).rejects.toThrow(
      "network blip",
    );
  });

  it("creates a unique email index and a self-expiring TTL index on createdAt", async () => {
    const { tryAcquireResetThrottle } = await loadService();
    insertOne.mockResolvedValueOnce({ insertedId: "x" });

    await tryAcquireResetThrottle("user@bar.com");

    expect(createIndex).toHaveBeenCalledWith({ email: 1 }, { unique: true });
    expect(createIndex).toHaveBeenCalledWith(
      { createdAt: 1 },
      { expireAfterSeconds: 60 },
    );
  });

  it("memoizes so a second call does not re-create the indexes", async () => {
    const { tryAcquireResetThrottle } = await loadService();
    insertOne.mockResolvedValue({ insertedId: "x" });

    await tryAcquireResetThrottle("a@bar.com");
    await tryAcquireResetThrottle("b@bar.com");

    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});
