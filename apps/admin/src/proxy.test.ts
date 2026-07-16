import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const intlMiddlewareMock = vi.hoisted(() => vi.fn());
const createMiddlewareMock = vi.hoisted(() => vi.fn(() => intlMiddlewareMock));

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

import { proxy } from "./proxy";

const makeRequest = (path: string) =>
  new NextRequest(`http://localhost:3000${path}`);

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
    (path) => {
      const response = proxy(makeRequest(path));

      expect(intlMiddlewareMock).not.toHaveBeenCalled();
      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("delegates a normal (locale-less) path to the intl middleware", () => {
    const response = proxy(makeRequest("/"));

    expect(intlMiddlewareMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toContain("/es-AR");
  });

  it("short-circuits an OPTIONS preflight request with a 200, bypassing intl", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/", { method: "OPTIONS" }),
    );

    expect(intlMiddlewareMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
