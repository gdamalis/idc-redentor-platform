import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DecodedIdToken } from "firebase-admin/auth";

const findUserByFirebaseUid = vi.fn();
const createUserFromInvite = vi.fn();
const claimPendingInvite = vi.fn();
const revertInviteClaim = vi.fn();
const findInviteByEmail = vi.fn();

vi.mock("@src/service/user.service", () => ({
  findUserByFirebaseUid,
  createUserFromInvite,
}));

vi.mock("@src/service/invite.service", () => ({
  claimPendingInvite,
  revertInviteClaim,
  findInviteByEmail,
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

  it("creates nothing and returns no-invite when the null claim's re-read finds no user AND no invite doc exists at all (Codex round-4 P1)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null); // initial existing-user check
    claimPendingInvite.mockResolvedValueOnce(null);
    findUserByFirebaseUid.mockResolvedValueOnce(null); // round-3 re-read after lost claim
    findInviteByEmail.mockResolvedValueOnce(null); // round-4: provably no invite for this email

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(revertInviteClaim).not.toHaveBeenCalled();
    expect(findUserByFirebaseUid).toHaveBeenCalledTimes(2);
    expect(findInviteByEmail).toHaveBeenCalledWith("foo@bar.com");
  });

  it("creates nothing and returns no-invite when the invite doc exists but is revoked (or expired pending) — provably no-invite (Codex round-4 P1)", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findInviteByEmail.mockResolvedValueOnce({
      _id: "invite1",
      email: "foo@bar.com",
      roleIds: [],
      status: "revoked",
    });

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "no-invite" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
  });

  it("returns provisioning-conflict (never no-invite) when the invite doc is accepted but no user was found yet — cannot prove no-invite (Codex round-4 P1)", async () => {
    // A concurrent same-uid winner may have claimed this invite and be
    // mid-provision (its own insertOne not yet visible to this read), or an
    // unrelated uid accepted it earlier. Either way we cannot PROVE
    // "never invited" — must not trigger the client's orphan-Firebase-account
    // cleanup, which fires only on `no-invite`.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findInviteByEmail.mockResolvedValueOnce({
      _id: "invite1",
      email: "foo@bar.com",
      roleIds: [],
      status: "accepted",
    });

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "provisioning-conflict" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(revertInviteClaim).not.toHaveBeenCalled();
  });

  it("treats an email mismatch (no invite for the normalized email) as no-invite", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    findInviteByEmail.mockResolvedValueOnce(null);

    await resolveOrProvision(decodedToken({ email: "someone-else@bar.com" }));

    expect(claimPendingInvite).toHaveBeenCalledWith("someone-else@bar.com");
    expect(findInviteByEmail).toHaveBeenCalledWith("someone-else@bar.com");
  });

  it("re-reads by uid and returns the concurrent winner's active user when claimPendingInvite loses the race (Codex round-3 P1)", async () => {
    // Two concurrent same-uid first-login exchanges: both see no existing
    // user, both call claimPendingInvite — only one wins. The loser must
    // resolve to the winner's user, NOT no-invite (which would make the
    // client delete the winner's just-provisioned Firebase credential too).
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null); // initial existing-user check: neither has a User yet
    claimPendingInvite.mockResolvedValueOnce(null); // this call lost the race
    const winnerUser = {
      firebaseUid: "uid1",
      status: "active",
      preferredLocale: "en-US",
    };
    findUserByFirebaseUid.mockResolvedValueOnce(winnerUser); // re-read finds the winner's User

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: true, user: winnerUser });
    expect(createUserFromInvite).not.toHaveBeenCalled();
    expect(revertInviteClaim).not.toHaveBeenCalled();
    expect(findUserByFirebaseUid).toHaveBeenNthCalledWith(1, "uid1");
    expect(findUserByFirebaseUid).toHaveBeenNthCalledWith(2, "uid1");
  });

  it("returns disabled (not ok) when the concurrent winner's user is disabled", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    claimPendingInvite.mockResolvedValueOnce(null);
    findUserByFirebaseUid.mockResolvedValueOnce({
      firebaseUid: "uid1",
      status: "disabled",
    });

    const result = await resolveOrProvision(decodedToken());

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(createUserFromInvite).not.toHaveBeenCalled();
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

  it("reverts the claim (with its acceptedAt) and returns provisioning-conflict when createUserFromInvite fails for a non-duplicate reason after a successful claim", async () => {
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US", acceptedAt };
    claimPendingInvite.mockResolvedValueOnce(invite);
    createUserFromInvite.mockRejectedValueOnce(new Error("mongo write failed"));

    const result = await resolveOrProvision(decodedToken());

    expect(revertInviteClaim).toHaveBeenCalledWith("invite1", acceptedAt);
    expect(result).toEqual({ ok: false, reason: "provisioning-conflict" });
  });

  it("reverts the claim and returns provisioning-conflict (never rethrows) on a duplicate-key error that survives createUserFromInvite's own recovery (Codex round-4 P2)", async () => {
    // createUserFromInvite already retries E11000 internally by re-reading
    // the user by firebaseUid (covered in user.service.test.ts); it only
    // rethrows that error when its own re-read ALSO comes back empty — which
    // happens precisely when the duplicate came from the EMAIL unique index
    // (a re-invited address whose stale Mongo row still holds that email
    // under a different/old firebaseUid), not the firebaseUid index. By the
    // time this error reaches provision.ts, no user was created under THIS
    // firebaseUid — reverting the claim is always correct, and the outcome
    // is transient/ambiguous, never destructive.
    const { resolveOrProvision } = await import("./provision");
    findUserByFirebaseUid.mockResolvedValueOnce(null);
    const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
    const invite = { _id: "invite1", roleIds: ["r1"], locale: "en-US", acceptedAt };
    claimPendingInvite.mockResolvedValueOnce(invite);
    const duplicateKeyError = Object.assign(new Error("duplicate"), {
      code: 11000,
    });
    createUserFromInvite.mockRejectedValueOnce(duplicateKeyError);

    const result = await resolveOrProvision(decodedToken());

    expect(revertInviteClaim).toHaveBeenCalledWith("invite1", acceptedAt);
    expect(result).toEqual({ ok: false, reason: "provisioning-conflict" });
  });
});
