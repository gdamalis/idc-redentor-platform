import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DecodedIdToken } from "firebase-admin/auth";

const findUserByFirebaseUid = vi.fn();
const createUserFromInvite = vi.fn();
const findPendingInvite = vi.fn();
const acceptInvite = vi.fn();

vi.mock("@src/service/user.service", () => ({
  findUserByFirebaseUid,
  createUserFromInvite,
}));

vi.mock("@src/service/invite.service", () => ({
  findPendingInvite,
  acceptInvite,
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
    expect(findPendingInvite).not.toHaveBeenCalled();
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
    expect(findPendingInvite).not.toHaveBeenCalled();
  });

  it("provisions a new user seeded from the invite + accepts it on first sign-in", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US" };
    findPendingInvite.mockResolvedValueOnce(invite);
    const createdUser = {
      firebaseUid: "uid1",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    };
    createUserFromInvite.mockResolvedValueOnce(createdUser);

    const result = await resolveOrProvision(decodedToken());

    expect(findPendingInvite).toHaveBeenCalledWith("foo@bar.com");
    expect(createUserFromInvite).toHaveBeenCalledWith({
      firebaseUid: "uid1",
      email: "foo@bar.com",
      roleIds: ["r1"],
      preferredLocale: "en-US",
    });
    expect(acceptInvite).toHaveBeenCalledWith("invite1");
    expect(result).toEqual({ ok: true, user: createdUser });
  });

  it("seeds the default locale (es-AR) when the invite carries none", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce({
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

  it("creates nothing and returns no-invite when there is no pending invite match", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("treats an expired invite (excluded by the query) as no-invite", async () => {
    // findPendingInvite's own query already excludes expiresAt <= now, so an
    // expired invite surfaces to this function as a plain `null` match.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
  });

  it("treats a revoked invite (excluded by the query) as no-invite", async () => {
    // Same reasoning: status:"revoked" is excluded at the query layer.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
  });

  it("treats an email mismatch (no invite for the normalized email) as no-invite", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce(null);

    await resolveOrProvision(decodedToken({ email: "someone-else@bar.com" }));

    expect(findPendingInvite).toHaveBeenCalledWith("someone-else@bar.com");
  });

  it("returns no-invite without any DB lookup when the token carries no email", async () => {
    const { resolveOrProvision } = await import("./provision");

    const result = await resolveOrProvision(decodedToken({ email: undefined }));

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(findUserByFirebaseUid).not.toHaveBeenCalled();
    expect(findPendingInvite).not.toHaveBeenCalled();
  });

  it("rejects an unverified email on first sign-in even with a matching invite, creating nothing", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);

    const result = await resolveOrProvision(
      decodedToken({ email_verified: false }),
    );

    expect(result).toEqual({ ok: false, reason: "email-unverified" });
    expect(findPendingInvite).not.toHaveBeenCalled();
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(acceptInvite).not.toHaveBeenCalled();
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
    findPendingInvite.mockResolvedValueOnce({
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
    expect(acceptInvite).toHaveBeenCalledWith("invite1");
    expect(result).toEqual({ ok: true, user: createdUser });
  });

  it("re-reads and returns the concurrently-created user (E11000 idempotency is user.service's job)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findPendingInvite.mockResolvedValueOnce({
      _id: "invite1",
      roleIds: [],
      locale: "es-AR",
    });
    const existing = { firebaseUid: "uid1", preferredLocale: "es-AR" };
    createUserFromInvite.mockResolvedValueOnce(existing);

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: true, user: existing });
    expect(acceptInvite).toHaveBeenCalledWith("invite1");
  });
});
