import { draftMode } from "next/headers";
import { verifyPreviewLink } from "@idcr/content/preview";
import {
  DRAFT_CACHE_CONTROL,
  DRAFT_ROBOTS_TAG,
} from "@src/lib/draft-headers";

const NO_STORE_HEADERS = {
  "Cache-Control": DRAFT_CACHE_CONTROL,
  "X-Robots-Tag": DRAFT_ROBOTS_TAG,
} as const;

const BAD_REQUEST_REASONS = new Set([
  "missing-params",
  "invalid-path",
  "invalid-exp",
]);

/**
 * Site half of the signed Draft Mode preview flow (`ICR-201`, paired with admin `ICR-197`).
 *
 * Verifies the HMAC-SHA256 signature, 60-second expiry window, and relative site route pattern
 * before enabling Next.js Draft Mode and redirecting to the relative `path`. Fails closed when
 * `CONTENT_PREVIEW_SECRET` is unset. Legacy `/api/draft/enable` remains untouched until `ICR-205`.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const result = verifyPreviewLink({
    path: searchParams.get("path"),
    exp: searchParams.get("exp"),
    sig: searchParams.get("sig"),
    secret: process.env.CONTENT_PREVIEW_SECRET,
  });

  if (!result.ok) {
    const status = BAD_REQUEST_REASONS.has(result.reason) ? 400 : 401;
    return new Response(`Preview link rejected: ${result.reason}`, {
      status,
      headers: NO_STORE_HEADERS,
    });
  }

  const dm = await draftMode();
  dm.enable();

  return new Response(null, {
    status: 307,
    headers: {
      Location: result.path,
      ...NO_STORE_HEADERS,
    },
  });
}
