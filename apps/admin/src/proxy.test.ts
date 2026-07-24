import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const intlMiddlewareMock = vi.hoisted(() => vi.fn());
const createMiddlewareMock = vi.hoisted(() => vi.fn(() => intlMiddlewareMock));
const verifySessionMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl/middleware", () => ({
  default: createMiddlewareMock,
}));
// `./i18n/routing` calls next-intl's `createNavigation()`, which pulls in
// `next-intl/navigation` and (transitively) fails to resolve under Vitest's
// pnpm module graph — unrelated to this change (mirrors the same mock in
// apps/web/src/app/[locale]/page.test.tsx). Mock it with the same shape so
// the module under test still exercises real values without loading that
// chain.
vi.mock("./i18n/routing", () => ({
  routing: { locales: ["es-AR", "en-US"], defaultLocale: "es-AR" },
}));
vi.mock("@src/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "__session",
  verifySession: verifySessionMock,
}));

import { proxy } from "./proxy";

const makeRequest = (path: string, cookieHeader?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  // Simulate what next-intl actually does for a locale-less path: redirect
  // toward the default locale (es-AR).
  intlMiddlewareMock.mockReturnValue(
    NextResponse.redirect("http://localhost:3000/es-AR"),
  );
});

describe("proxy", () => {
  it.each([
    "/assets/img/redentor_logo_100.png",
    "/assets/svg/logo.svg",
    "/styles/theme.css",
  ])(
    "bypasses the intl middleware for a static asset path (%s) — no locale redirect",
    async (path) => {
      const response = await proxy(makeRequest(path));

      expect(intlMiddlewareMock).not.toHaveBeenCalled();
      expect(verifySessionMock).not.toHaveBeenCalled();
      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("short-circuits an OPTIONS preflight request with a 200, bypassing intl", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/", { method: "OPTIONS" }),
    );

    expect(intlMiddlewareMock).not.toHaveBeenCalled();
    expect(verifySessionMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("delegates a normal locale-less path to the intl middleware when the session is valid", async () => {
    verifySessionMock.mockResolvedValueOnce({ uid: "uid1" });

    const response = await proxy(makeRequest("/", "__session=valid-cookie"));

    expect(intlMiddlewareMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toContain("/es-AR");
  });

  it("redirects an unauthenticated (app) path to login with an encoded callbackUrl", async () => {
    const response = await proxy(makeRequest("/es-AR/people"));

    expect(intlMiddlewareMock).not.toHaveBeenCalled();
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/es-AR/login?callbackUrl=%2Fes-AR%2Fpeople",
    );
  });

  it.each(["/es-AR/login", "/en-US/reset-password", "/es-AR/no-access"])(
    "bypasses the session check for the public auth path %s",
    async (path) => {
      const response = await proxy(makeRequest(path));

      expect(verifySessionMock).not.toHaveBeenCalled();
      expect(intlMiddlewareMock).toHaveBeenCalledTimes(1);
      expect(response.headers.get("location")).toContain("/es-AR");
    },
  );

  it("continues to the intl middleware when the session cookie is valid", async () => {
    verifySessionMock.mockResolvedValueOnce({ uid: "uid1" });

    const response = await proxy(
      makeRequest("/es-AR/people", "__session=valid-cookie"),
    );

    expect(verifySessionMock).toHaveBeenCalledWith("valid-cookie", false);
    expect(intlMiddlewareMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toContain("/es-AR");
  });
});
