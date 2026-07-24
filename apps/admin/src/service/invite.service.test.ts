import { describe, it, expect, vi, beforeEach } from "vitest";

const findOne = vi.fn();
const updateOne = vi.fn();
const createIndex = vi.fn();

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({ findOne, updateOne, createIndex }),
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe("findPendingInvite", () => {
  it("queries by normalized email, pending status, and unexpired expiresAt", async () => {
    const { findPendingInvite } = await import("./invite.service");
    findOne.mockResolvedValueOnce(null);

    const before = Date.now();
    const result = await findPendingInvite("  Foo@Bar.COM ");
    const after = Date.now();

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledTimes(1);
    const query = findOne.mock.calls[0]?.[0];
    expect(query.email).toBe("foo@bar.com");
    expect(query.status).toBe("pending");
    expect(query.expiresAt.$gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(query.expiresAt.$gt.getTime()).toBeLessThanOrEqual(after);
  });

  it("returns the parsed invite when a doc matches", async () => {
    const { findPendingInvite } = await import("./invite.service");
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      email: "foo@bar.com",
      roleIds: ["r1"],
      locale: "en-US",
      status: "pending",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
    });

    const invite = await findPendingInvite("foo@bar.com");
    expect(invite?.email).toBe("foo@bar.com");
    expect(invite?.locale).toBe("en-US");
  });
});

describe("acceptInvite", () => {
  it("sets status to accepted and stamps acceptedAt", async () => {
    const { acceptInvite } = await import("./invite.service");
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const fakeId = { toHexString: () => "x" } as unknown as import(
      "mongodb"
    ).ObjectId;

    await acceptInvite(fakeId);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: fakeId });
    expect(update.$set.status).toBe("accepted");
    expect(update.$set.acceptedAt).toBeInstanceOf(Date);
  });
});
