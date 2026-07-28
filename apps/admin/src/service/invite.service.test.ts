import { describe, it, expect, vi, beforeEach } from "vitest";

const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const updateOne = vi.fn();
const insertOne = vi.fn();
const createIndex = vi.fn();

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({
      findOne,
      findOneAndUpdate,
      updateOne,
      insertOne,
      createIndex,
    }),
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

describe("findAcceptedInviteByEmail", () => {
  it("queries by normalized email AND status: accepted, and returns the parsed invite", async () => {
    const { findAcceptedInviteByEmail } = await import("./invite.service");
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "x" },
      email: "foo@bar.com",
      roleIds: ["r1"],
      locale: "en-US",
      status: "accepted",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
      acceptedAt: now,
    });

    const invite = await findAcceptedInviteByEmail("  Foo@Bar.COM ");

    expect(findOne).toHaveBeenCalledTimes(1);
    const query = findOne.mock.calls[0]?.[0];
    expect(query).toEqual({ email: "foo@bar.com", status: "accepted" });
    expect(invite?.status).toBe("accepted");
  });

  it("returns null when no invite doc matches the email at all", async () => {
    const { findAcceptedInviteByEmail } = await import("./invite.service");
    findOne.mockResolvedValueOnce(null);

    const invite = await findAcceptedInviteByEmail("nobody@bar.com");

    expect(invite).toBeNull();
  });

  it("filters out an older revoked invite for the same email so it never shadows a newer accepted one (Codex round-5 P1)", async () => {
    // The bug this guards against: an unqualified findOne({email}) can match
    // WHICHEVER doc Mongo happens to return first when multiple invite docs
    // share an email (e.g. an original invite revoked, then a re-invite
    // accepted). Querying status: "accepted" in the filter itself means the
    // mock only ever resolves the doc a real Mongo query with that filter
    // would return — the revoked doc is never a candidate.
    const { findAcceptedInviteByEmail } = await import("./invite.service");
    const now = new Date();
    findOne.mockResolvedValueOnce({
      _id: { toHexString: () => "y" },
      email: "reinvited@bar.com",
      roleIds: ["r1"],
      locale: "es-AR",
      status: "accepted",
      expiresAt: new Date(now.getTime() + 1000),
      createdAt: now,
      acceptedAt: now,
    });

    const invite = await findAcceptedInviteByEmail("reinvited@bar.com");

    const query = findOne.mock.calls[0]?.[0];
    expect(query).toEqual({ email: "reinvited@bar.com", status: "accepted" });
    expect(invite?.status).toBe("accepted");
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

describe("createInvite", () => {
  const session = { id: "session" } as unknown as import("mongodb").ClientSession;

  it("upserts a normalized, pending invite via a single atomic findOneAndUpdate, and computes expiresAt", async () => {
    const { createInvite } = await import("./invite.service");
    findOneAndUpdate.mockResolvedValueOnce({
      ok: 1,
      value: { _id: { toHexString: () => "inv1" } },
      lastErrorObject: { updatedExisting: false, upserted: { toHexString: () => "inv1" } },
    });

    const before = Date.now();
    const result = await createInvite(
      {
        email: "  Ana@IDCR.org ",
        roleIds: ["r1", "r2"],
        locale: "es-AR",
        invitedByUserId: "admin1",
      },
      session,
    );
    const after = Date.now();

    expect(result).toEqual({ ok: true, inviteId: "inv1", refreshed: false });
    expect(findOne).not.toHaveBeenCalled(); // no pre-check — the atomic upsert is the only guard
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);

    const [filter, update, options] = findOneAndUpdate.mock.calls[0] ?? [];
    expect(filter).toEqual({ email: "ana@idcr.org", status: "pending" });
    expect(update.$set.roleIds).toEqual(["r1", "r2"]);
    expect(update.$set.locale).toBe("es-AR");
    expect(update.$set.invitedByUserId).toBe("admin1");
    expect(update.$setOnInsert).toEqual({
      email: "ana@idcr.org",
      status: "pending",
      createdAt: expect.any(Date),
    });
    const expiryMs =
      update.$set.expiresAt.getTime() - update.$setOnInsert.createdAt.getTime();
    expect(expiryMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(update.$set.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expiryMs - 1000);
    expect(update.$set.expiresAt.getTime()).toBeLessThanOrEqual(after + expiryMs + 1000);
    expect(options).toEqual({
      upsert: true,
      returnDocument: "after",
      includeResultMetadata: true,
      session,
    });
  });

  // The exact regression the bot found: a pending invite whose expiresAt has
  // quietly passed used to still collide with the partial unique index on
  // re-invite (E11000 -> conflict), permanently locking that address out.
  // The filter here is `{ email, status: "pending" }` — no expiresAt clause —
  // so it matches the expired-but-still-pending doc exactly like a live one
  // and refreshes it, never returning conflict.
  it("refreshes an address whose pending invite has EXPIRED, returning ok:true with refreshed:true", async () => {
    const { createInvite } = await import("./invite.service");
    findOneAndUpdate.mockResolvedValueOnce({
      ok: 1,
      value: { _id: { toHexString: () => "inv-expired" } },
      lastErrorObject: { updatedExisting: true },
    });

    const result = await createInvite(
      { email: "expired@idcr.org", roleIds: ["r1"], locale: "es-AR", invitedByUserId: "admin1" },
      session,
    );

    expect(result).toEqual({ ok: true, inviteId: "inv-expired", refreshed: true });
  });

  it("refreshes an address with a LIVE pending invite, returning the same inviteId with refreshed:true", async () => {
    const { createInvite } = await import("./invite.service");
    findOneAndUpdate.mockResolvedValueOnce({
      ok: 1,
      value: { _id: { toHexString: () => "inv-live" } },
      lastErrorObject: { updatedExisting: true },
    });

    const result = await createInvite(
      { email: "live@idcr.org", roleIds: ["r2"], locale: "en-US", invitedByUserId: "admin1" },
      session,
    );

    expect(result).toEqual({ ok: true, inviteId: "inv-live", refreshed: true });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1); // one atomic op — no duplicate document created
  });

  // Race backstop: two concurrent createInvite calls for a brand-new address
  // can both miss the { email, status: "pending" } match and both attempt an
  // insert; the partial unique index refuses the loser's insert (E11000).
  // MongoDB's own server-side upsert retry (4.2+) normally absorbs this, but
  // createInvite retries once itself as a belt-and-suspenders backstop —
  // by the retry, the winner's doc exists, so this always resolves to an
  // update, never a second insert, and conflict is never surfaced.
  it("retries once and succeeds when the upsert races a concurrent insert (E11000 backstop)", async () => {
    const { createInvite } = await import("./invite.service");
    const duplicateKeyError = Object.assign(new Error("duplicate"), { code: 11000 });
    findOneAndUpdate.mockRejectedValueOnce(duplicateKeyError);
    findOneAndUpdate.mockResolvedValueOnce({
      ok: 1,
      value: { _id: { toHexString: () => "inv-race" } },
      lastErrorObject: { updatedExisting: true },
    });

    const result = await createInvite(
      { email: "race@idcr.org", roleIds: ["r1"], locale: "es-AR", invitedByUserId: "admin1" },
      session,
    );

    expect(result).toEqual({ ok: true, inviteId: "inv-race", refreshed: true });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("re-throws a non-duplicate-key upsert error rather than retrying or misreporting it as a conflict", async () => {
    const { createInvite } = await import("./invite.service");
    findOneAndUpdate.mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      createInvite(
        { email: "ana@idcr.org", roleIds: ["r1"], locale: "es-AR", invitedByUserId: "admin1" },
        session,
      ),
    ).rejects.toThrow("connection reset");
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
