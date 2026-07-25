import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DecodedIdToken } from "firebase-admin/auth";

const findUserByFirebaseUid = vi.fn();
const createUserFromInvite = vi.fn();
const claimPendingInvite = vi.fn();
const revertInviteClaim = vi.fn();

vi.mock("@src/service/user.service", () => ({
  findUserByFirebaseUid,
  createUserFromInvite,
}));

vi.mock("@src/service/invite.service", () => ({
  claimPendingInvite,
  revertInviteClaim,
}));

beforeEach(() => vi.clearAllMocks());

// Defaults to a VERIFIED email — most tests below exercise the ordinary
// first-time-provisioning happy path, which now requires `email_verified` to
// be strictly `true` (finding P1). Tests for the unverified-email gate
// itself override this explicitly.
function decodedToken(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  return {
    uid: "uid1",
    email: "foo@bar.com",
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    ...overrides,
  } as DecodedIdToken;
}

describe("resolveOrProvision", () => {
  it("returns ok for a returning active user, leaving the invite path untouched", async () => {
    const { resolveOrProvision } = await import("./provision");
    const user = { firebaseUid: "uid1", status: "active" };
    findUserByFirebaseUid.mockResolvedValueOnce(user);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: true, user });
    expect(claimPendingInvite).not.toHaveBeenCalled();
    expect(createUserFromInvite).not.toHaveBeenCalled();
  });

  it("returns disabled for an existing disabled user, without touching invites", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce({
      firebaseUid: "uid1",
      status: "disabled",
    });

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(claimPendingInvite).not.toHaveBeenCalled();
  });

  it("provisions a new user seeded from the atomically-claimed invite on first sign-in", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US" };
    claimPendingInvite.mockResolvedValueOnce(invite);
    const createdUser = {
      firebaseUid: "uid1",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    };
    createUserFromInvite.mockResolvedValueOnce(createdUser);

    const result = await resolveOrProvision(decodedToken());

    expect(claimPendingInvite).toHaveBeenCalledWith("foo@bar.com");
    expect(createUserFromInvite).toHaveBeenCalledWith({
      firebaseUid: "uid1",
      email: "foo@bar.com",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    });
    expect(revertInviteClaim).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, user: createdUser });
  });

  it("seeds the default locale (es-AR) when the invite carries none", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce({
      _id: "invite1",
      roleIds: [],
      locale: undefined,
    });
    createUserFromInvite.mockResolvedValueOnce({
      firebaseUid: "uid1",
      preferredLocale: "es-AR",
    });

    await resolveOrProvision(decodedToken());

    expect(createUserFromInvite).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLocale: "es-AR" }),
    );
  });

  it("creates nothing and returns no-invite when claimPendingInvite finds no still-pending, unexpired invite", async () => {
    // Covers expired/revoked/mismatched AND the round-2 P1 TOCTOU scenario
    // (an invite revoked/expired concurrently with the claim attempt) — all
    // collapse to the same atomic `null` result at the query layer.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(revertInviteClaim).not.toHaveBeenCalled();
  });

  it("treats an email mismatch (no invite for the normalized email) as no-invite", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);

    await resolveOrProvision(decodedToken({ email: "someone-else@bar.com" }));

    expect(claimPendingInvite).toHaveBeenCalledWith("someone-else@bar.com");
  });

  it("returns no-invite without any DB lookup when the token carries no email", async () => {
    const { resolveOrProvision } = await import("./provision");

    const result = await resolveOrProvision(decodedToken({ email: undefined }));

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(findUserByFirebaseUid).not.toHaveBeenCalled();
    expect(claimPendingInvite).not.toHaveBeenCalled();
  });

  it("rejects an unverified email on first sign-in even with a matching invite, creating nothing", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(
      decodedToken({ email_verified: false }),
    );

    expect(result).toEqual({ ok: false, reason: "email-unverified" });
    expect(claimPendingInvite).not.toHaveBeenCalled();
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(revertInviteClaim).not.toHaveBeenCalled();
  });

  it("treats a missing email_verified claim as unverified (fail closed)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(
      decodedToken({ email_verified: undefined }),
    );

    expect(result).toEqual({ ok: false, reason: "email-unverified" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
  });

  it("provisions a new user on first sign-in when the email IS verified (happy path stays green)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce({
      _id: "invite1",
      roleIds: ["r1"],
      locale: "en-US",
    });
    const createdUser = { firebaseUid: "uid1", preferredLocale: "en-US" };
    createUserFromInvite.mockResolvedValueOnce(createdUser);

    const result = await resolveOrProvision(
      decodedToken({ email_verified: true }),
    );

    expect(createUserFromInvite).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, user: createdUser });
  });

  it("re-reads and returns the concurrently-created user (E11000 idempotency is user.service's job)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce({
      _id: "invite1",
      roleIds: [],
      locale: "es-AR",
    });
    const existing = { firebaseUid: "uid1", preferredLocale: "es-AR" };
    createUserFromInvite.mockResolvedValueOnce(existing);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: true, user: existing });
    expect(revertInviteClaim).not.toHaveBeenCalled();
  });

  it("reverts the claim and returns no-invite when createUserFromInvite fails for a non-duplicate reason after a successful claim", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US" };
    claimPendingInvite.mockResolvedValueOnce(invite);
    createUserFromInvite.mockRejectedValueOnce(new Error("mongo write failed"));

    const result = await resolveOrProvision(decodedToken());

    expect(revertInviteClaim).toHaveBeenCalledWith("invite1");
    expect(result).toEqual({ ok: false, reason: "no-invite" });
  });

  it("rethrows (without reverting) a duplicate-key error that survives createUserFromInvite's own recovery", async () => {
    // createUserFromInvite already retries E11000 internally by re-reading
    // the existing user (covered in user.service.test.ts); it only rethrows
    // that error when its own re-read also comes back empty — an
    // exceedingly rare inconsistency that predates this fix. provision.ts
    // must not paper over it by reverting a claim a user may have genuinely
    // (if racily) already consumed.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US" };
    claimPendingInvite.mockResolvedValueOnce(invite);
    const duplicateKeyError = Object.assign(new Error("duplicate"), {
      code: 11000,
    });
    createUserFromInvite.mockRejectedValueOnce(duplicateKeyError);

    await expect(resolveOrProvision(decodedToken())).rejects.toThrow(
      "duplicate",
    );

    expect(revertInviteClaim).not.toHaveBeenCalled();
  });
});
