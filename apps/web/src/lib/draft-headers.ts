import type { NextRequest, NextResponse } from "next/server";

/** Next.js App Router Draft Mode cookie name. */
export const DRAFT_MODE_COOKIE_NAME = "__prerender_bypass";

export const DRAFT_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate";
export const DRAFT_ROBOTS_TAG = "noindex, nofollow";

export interface DraftEnvLike {
  readonly NODE_ENV?: string;
  readonly VERCEL_ENV?: string;
  readonly VERCEL_TARGET_ENV?: string;
}

/**
 * True on environments where drafts are always displayed (staging, PR previews, local dev).
 * Uses `VERCEL_TARGET_ENV` first because staging reports `VERCEL_ENV=preview` (H lesson 5).
 */
export function isAlwaysDraftEnvironment(
  env: DraftEnvLike = process.env,
): boolean {
  if (
    env.VERCEL_TARGET_ENV === "staging" ||
    env.VERCEL_TARGET_ENV === "preview"
  ) {
    return true;
  }
  if (env.VERCEL_TARGET_ENV === "production") {
    return false;
  }
  return env.VERCEL_ENV === "preview" || env.NODE_ENV === "development";
}

/**
 * True when a request will render draft content (Draft Mode bypass cookie set OR an
 * always-draft environment such as staging, PR preview, or local development).
 */
export function isDraftResponseContext(
  request: Pick<NextRequest, "cookies">,
  env: DraftEnvLike = process.env,
): boolean {
  if (request.cookies.has(DRAFT_MODE_COOKIE_NAME)) {
    return true;
  }
  return isAlwaysDraftEnvironment(env);
}

/**
 * Attaches `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` to draft/preview
 * responses while leaving non-draft production responses untouched.
 */
export function applyDraftResponseHeaders(
  request: Pick<NextRequest, "cookies">,
  response: NextResponse,
  env: DraftEnvLike = process.env,
): NextResponse {
  if (isDraftResponseContext(request, env)) {
    response.headers.set("Cache-Control", DRAFT_CACHE_CONTROL);
    response.headers.set("X-Robots-Tag", DRAFT_ROBOTS_TAG);
  }
  return response;
}
