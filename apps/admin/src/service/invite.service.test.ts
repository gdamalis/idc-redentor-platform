import { describe, it, expect, vi, beforeEach } from "vitest";

const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const updateOne = vi.fn();
const createIndex = vi.fn();

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({ findOne, findOneAndUpdate, updateOne, createIndex }),
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

  it("defaults a legacy/seeded invite doc with no locale to es-AR instead of throwing (edge case 18)", async () => {
    const { findPendingInvite } = await import("./invite.service");
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      email: "legacy@bar.com",
      roleIds: ["r1"],
      // locale intentionally omitted — legacy/seeded invite doc.
      status: "pending",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
    });

    const invite = await findPendingInvite("legacy@bar.com");
    expect(invite?.locale).toBe("es-AR");
  });

  it("defaults an invite doc with an invalid locale to es-AR instead of throwing", async () => {
    const { findPendingInvite } = await import("./invite.service");
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      email: "bad-locale@bar.com",
      roleIds: ["r1"],
      locale: "fr-FR",
      status: "pending",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
    });

    const invite = await findPendingInvite("bad-locale@bar.com");
    expect(invite?.locale).toBe("es-AR");
  });
});

describe("claimPendingInvite", () => {
  it("atomically claims via a single findOneAndUpdate with the pending+unexpired+normalized-email filter", async () => {
    const { claimPendingInvite } = await import("./invite.service");
    const now = new Date();
    findOneAndUpdate.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      email: "foo@bar.com",
      roleIds: ["r1"],
      locale: "en-US",
      status: "accepted",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
      acceptedAt: now,
    });

    const before = Date.now();
    const invite = await claimPendingInvite("  Foo@Bar.COM ");
    const after = Date.now();

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] ?? [];
    expect(filter.email).toBe("foo@bar.com");
    expect(filter.status).toBe("pending");
    expect(filter.expiresAt.$gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(filter.expiresAt.$gt.getTime()).toBeLessThanOrEqual(after);
    expect(update.$set.status).toBe("accepted");
    expect(update.$set.acceptedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: "after" });
    expect(invite?.email).toBe("foo@bar.com");
  });

  it("returns null when no still-pending, unexpired invite matched (already claimed/revoked/expired)", async () => {
    const { claimPendingInvite } = await import("./invite.service");
    findOneAndUpdate.mockResolvedValueOnce(null);

    const result = await claimPendingInvite("foo@bar.com");

    expect(result).toBeNull();
  });
});

describe("revertInviteClaim", () => {
  it("sets status back to pending and unsets acceptedAt", async () => {
    const { revertInviteClaim } = await import("./invite.service");
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const fakeId = { toHexString: () => "x" } as unknown as import(
      "mongodb"
    ).ObjectId;

    await revertInviteClaim(fakeId);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: fakeId });
    expect(update.$set.status).toBe("pending");
    expect(update.$unset).toEqual({ acceptedAt: "" });
  });
});
