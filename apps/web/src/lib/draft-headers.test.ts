import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  applyDraftResponseHeaders,
  DRAFT_CACHE_CONTROL,
  DRAFT_MODE_COOKIE_NAME,
  DRAFT_ROBOTS_TAG,
  isAlwaysDraftEnvironment,
  isDraftResponseContext,
} from "./draft-headers";

function makeCookieRequest(hasBypassCookie: boolean) {
  return {
    cookies: {
      has: (name: string) =>
        hasBypassCookie && name === DRAFT_MODE_COOKIE_NAME,
    },
  } as Parameters<typeof isDraftResponseContext>[0];
}

describe("isAlwaysDraftEnvironment", () => {
  it("detects staging and preview via VERCEL_TARGET_ENV (H lesson 5)", () => {
    expect(
      isAlwaysDraftEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "staging",
      }),
    ).toBe(true);
    expect(
      isAlwaysDraftEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "preview",
      }),
    ).toBe(true);
    expect(
      isAlwaysDraftEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
      }),
    ).toBe(false);
  });

  it("falls back to VERCEL_ENV=preview and NODE_ENV=development when VERCEL_TARGET_ENV is unset", () => {
    expect(
      isAlwaysDraftEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(true);
    expect(isAlwaysDraftEnvironment({ NODE_ENV: "development" })).toBe(true);
    expect(
      isAlwaysDraftEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
  });
});

describe("applyDraftResponseHeaders", () => {
  it("sets Cache-Control: no-store and X-Robots-Tag: noindex, nofollow when Draft Mode cookie is set in production", () => {
    const res = NextResponse.next();
    applyDraftResponseHeaders(makeCookieRequest(true), res, {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    });

    expect(res.headers.get("Cache-Control")).toBe(DRAFT_CACHE_CONTROL);
    expect(res.headers.get("X-Robots-Tag")).toBe(DRAFT_ROBOTS_TAG);
  });

  it("sets no-store and noindex on staging / preview even without the cookie", () => {
    for (const env of [
      { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "staging" },
      { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" },
      { NODE_ENV: "development" },
    ]) {
      const res = NextResponse.next();
      applyDraftResponseHeaders(makeCookieRequest(false), res, env);
      expect(res.headers.get("Cache-Control")).toBe(DRAFT_CACHE_CONTROL);
      expect(res.headers.get("X-Robots-Tag")).toBe(DRAFT_ROBOTS_TAG);
    }
  });

  it("leaves non-draft production responses untouched", () => {
    const res = NextResponse.next();
    applyDraftResponseHeaders(makeCookieRequest(false), res, {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    });

    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });
});
