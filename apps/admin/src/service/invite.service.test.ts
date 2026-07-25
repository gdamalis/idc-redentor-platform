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
    expect(invite?.acceptedAt).toBeInstanceOf(Date);
  });

  it("returns null when no still-pending, unexpired invite matched (already claimed/revoked/expired)", async () => {
    const { claimPendingInvite } = await import("./invite.service");
    findOneAndUpdate.mockResolvedValueOnce(null);

    const result = await claimPendingInvite("foo@bar.com");

    expect(result).toBeNull();
  });
});

describe("revertInviteClaim", () => {
  it("issues a guarded update: sets pending/unsets acceptedAt ONLY when status is still accepted with the claim's own acceptedAt", async () => {
    const { revertInviteClaim } = await import("./invite.service");
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    const fakeId = { toHexString: () => "x" } as unknown as import(
      "mongodb"
    ).ObjectId;
    const claimedAt = new Date("2026-01-01T00:00:00.000Z");

    await revertInviteClaim(fakeId, claimedAt);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({
      _id: fakeId,
      status: "accepted",
      acceptedAt: claimedAt,
    });
    expect(update.$set.status).toBe("pending");
    expect(update.$unset).toEqual({ acceptedAt: "" });
  });

  it("does not revert (matchedCount 0, no-op) an invite whose status moved to revoked since the claim (Codex round-3 P2)", async () => {
    const { revertInviteClaim } = await import("./invite.service");
    const fakeId = { toHexString: () => "x" } as unknown as import(
      "mongodb"
    ).ObjectId;
    const claimedAt = new Date("2026-01-01T00:00:00.000Z");

    // Simulates real Mongo conditional-update semantics: the guarded filter
    // (status: "accepted" + this claim's acceptedAt) no longer matches a
    // document an admin has since revoked — so the update matches nothing.
    const revokedDoc = { _id: fakeId, status: "revoked" };
    interface RevertFilter {
      _id: unknown;
      status: string;
      acceptedAt: Date;
    }
    updateOne.mockImplementationOnce((filter: RevertFilter) => {
      const matches =
        filter._id === revokedDoc._id && filter.status === revokedDoc.status;
      return Promise.resolve({ matchedCount: matches ? 1 : 0 });
    });

    await revertInviteClaim(fakeId, claimedAt);

    const [filter] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({
      _id: fakeId,
      status: "accepted",
      acceptedAt: claimedAt,
    });
    await expect(updateOne.mock.results[0]?.value).resolves.toEqual({
      matchedCount: 0,
    });
  });
});
