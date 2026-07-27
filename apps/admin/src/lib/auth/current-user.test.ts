import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cookiesGet = vi.fn();
const verifySession = vi.fn();
const findUserByFirebaseUid = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookiesGet }),
}));

vi.mock("./session", () => ({
  SESSION_COOKIE_NAME: "__session",
  verifySession,
}));

vi.mock("@src/service/user.service", () => ({
  findUserByFirebaseUid,
}));

beforeEach(() => vi.clearAllMocks());

describe("getCurrentUser", () => {
  it("returns no-session when there is no session cookie", async () => {
    const { getCurrentUser } = await import("./current-user");
    cookiesGet.mockReturnValueOnce(undefined);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "no-session" });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("returns expired when the cookie fails verification", async () => {
    const { getCurrentUser } = await import("./current-user");
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce(null);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "expired" });
    // Authoritative path: checkRevoked:true (pays the network hop).
    expect(verifySession).toHaveBeenCalledWith("cookie-value", true);
  });

  it("returns no-user when the cookie is valid but no Mongo user matches", async () => {
    const { getCurrentUser } = await import("./current-user");
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce(null);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "no-user" });
  });

  it("returns disabled when the matching user is disabled", async () => {
    const { getCurrentUser } = await import("./current-user");
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce({
      firebaseUid: "uid1",
      status: "disabled",
    });

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "disabled" });
  });

  it("returns ok with the resolved active user", async () => {
    const { getCurrentUser } = await import("./current-user");
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    const user = { firebaseUid: "uid1", status: "active" };
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce(user);

    expect(await getCurrentUser()).toEqual({ ok: true, user });
  });

  it("never reads customClaims/decoded.role/token.role for authorization", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/auth/current-user.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/customClaims|decoded\.role|token\.role/);
  });
});
