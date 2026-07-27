import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyIdToken = vi.hoisted(() => vi.fn());
const revokeRefreshTokens = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
const verifySession = vi.hoisted(() => vi.fn());
const resolveOrProvision = vi.hoisted(() => vi.fn());

vi.mock("@src/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken, revokeRefreshTokens }),
}));

vi.mock("@src/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "__session",
  buildSessionCookieOptions: () => ({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 432000,
  }),
  createSession,
  verifySession,
}));

vi.mock("@src/lib/auth/provision", () => ({ resolveOrProvision }));

import { POST, DELETE } from "./route";

const authTimeNow = () => Math.floor(Date.now() / 1000);

const postReq = (body: unknown) =>
  new NextRequest("http://x/api/auth/session", {
    method: "POST",
    body: JSON.stringify(body),
  });

const rawPostReq = (body: string) =>
  new NextRequest("http://x/api/auth/session", { method: "POST", body });

const deleteReq = (cookieHeader?: string) =>
  new NextRequest("http://x/api/auth/session", {
    method: "DELETE",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/session", () => {
  it("200 + Set-Cookie with the exact attributes, and returns preferredLocale", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow(),
    });
    resolveOrProvision.mockResolvedValueOnce({
      ok: true,
      user: { firebaseUid: "uid1", preferredLocale: "en-US" },
    });
    createSession.mockResolvedValueOnce("session-cookie-value");

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, preferredLocale: "en-US" });
    expect(createSession).toHaveBeenCalledWith("id-token");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__session=session-cookie-value");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=432000");
  });

  it("401 stale-token when auth_time is older than 5 minutes, and sets no cookie", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow() - 301,
    });

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "stale-token" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(resolveOrProvision).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("401 invalid-token when verifyIdToken throws", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("bad token"));

    const res = await POST(postReq({ idToken: "garbage" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: "invalid-token" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(resolveOrProvision).not.toHaveBeenCalled();
  });

  it("403 no-invite, and sets no cookie", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow(),
    });
    resolveOrProvision.mockResolvedValueOnce({ ok: false, reason: "no-invite" });

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "no-invite" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("403 disabled, and sets no cookie", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow(),
    });
    resolveOrProvision.mockResolvedValueOnce({ ok: false, reason: "disabled" });

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "disabled" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("403 email-unverified, and sets no cookie", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow(),
    });
    resolveOrProvision.mockResolvedValueOnce({
      ok: false,
      reason: "email-unverified",
    });

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "email-unverified" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("409 provisioning-conflict, and sets no cookie (Codex round-4)", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "uid1",
      auth_time: authTimeNow(),
    });
    resolveOrProvision.mockResolvedValueOnce({
      ok: false,
      reason: "provisioning-conflict",
    });

    const res = await POST(postReq({ idToken: "id-token" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "provisioning-conflict",
    });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("400 on a malformed body, without calling verifyIdToken", async () => {
    const res = await POST(rawPostReq("{not json"));

    expect(res.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("400 when idToken is missing", async () => {
    const res = await POST(postReq({}));

    expect(res.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/session", () => {
  it("revokes refresh tokens for a valid cookie and clears the cookie (Max-Age=0)", async () => {
    verifySession.mockResolvedValueOnce({ uid: "uid1" });

    const res = await DELETE(deleteReq("__session=valid-cookie"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifySession).toHaveBeenCalledWith("valid-cookie", false);
    expect(revokeRefreshTokens).toHaveBeenCalledWith("uid1");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Max-Age=0");
  });

  it("is idempotent (200) when there is no cookie at all", async () => {
    const res = await DELETE(deleteReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifySession).not.toHaveBeenCalled();
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("still clears the cookie + returns 200 when the cookie fails verification", async () => {
    verifySession.mockResolvedValueOnce(null);

    const res = await DELETE(deleteReq("__session=stale-cookie"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("does not fail sign-out when revokeRefreshTokens itself throws", async () => {
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    revokeRefreshTokens.mockRejectedValueOnce(new Error("network"));

    const res = await DELETE(deleteReq("__session=valid-cookie"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
