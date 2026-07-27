import { describe, it, expect, vi, beforeEach } from "vitest";

const createSessionCookie = vi.fn();
const verifySessionCookie = vi.fn();

vi.mock("@src/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ createSessionCookie, verifySessionCookie }),
}));

beforeEach(() => vi.clearAllMocks());

describe("SESSION_EXPIRES_IN_MS", () => {
  it("is exactly 5 days in milliseconds", async () => {
    const { SESSION_EXPIRES_IN_MS } = await import("./session");
    expect(SESSION_EXPIRES_IN_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("falls inside Firebase's 5min-2wk session cookie range", async () => {
    const { SESSION_EXPIRES_IN_MS } = await import("./session");
    expect(SESSION_EXPIRES_IN_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(SESSION_EXPIRES_IN_MS).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
  });
});

describe("SESSION_COOKIE_NAME", () => {
  it("is the Firebase-hosting-safe __session name", async () => {
    const { SESSION_COOKIE_NAME } = await import("./session");
    expect(SESSION_COOKIE_NAME).toBe("__session");
  });
});

describe("buildSessionCookieOptions", () => {
  it("returns the exact cookie attributes, maxAge in seconds", async () => {
    const { buildSessionCookieOptions } = await import("./session");
    expect(buildSessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 432000,
    });
  });
});

describe("createSession", () => {
  it("creates a session cookie via the Admin SDK with the configured expiresIn", async () => {
    const { createSession, SESSION_EXPIRES_IN_MS } = await import("./session");
    createSessionCookie.mockResolvedValueOnce("cookie-value");

    const cookie = await createSession("id-token");

    expect(cookie).toBe("cookie-value");
    expect(createSessionCookie).toHaveBeenCalledWith("id-token", {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });
  });
});

describe("verifySession", () => {
  it("returns the decoded token on success, forwarding checkRevoked", async () => {
    const { verifySession } = await import("./session");
    const decoded = { uid: "uid1" };
    verifySessionCookie.mockResolvedValueOnce(decoded);

    expect(await verifySession("cookie-value", true)).toBe(decoded);
    expect(verifySessionCookie).toHaveBeenCalledWith("cookie-value", true);
  });

  it("returns null (never throws) when verification fails", async () => {
    const { verifySession } = await import("./session");
    verifySessionCookie.mockRejectedValueOnce(new Error("invalid"));

    expect(await verifySession("bad-cookie", false)).toBeNull();
    expect(verifySessionCookie).toHaveBeenCalledWith("bad-cookie", false);
  });
});
