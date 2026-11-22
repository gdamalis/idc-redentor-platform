import type { NextRequest } from "next/server";
import { LOCALES, type Locale } from "@idcr/content";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { COLLECTION_META } from "@src/lib/content/guards";
import {
  buildSignedPreviewRedirectUrl,
  resolveEntryPreviewPath,
  validatePreviewConfig,
} from "@src/lib/content/preview-url";
import { collectionSupportsPreview } from "@src/lib/content/routes";
import { getContentById } from "@src/service/content/content-core.service";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function plainResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...NO_STORE_HEADERS,
    },
  });
}

function isContentCollectionName(value: string): value is ContentCollectionName {
  return Object.prototype.hasOwnProperty.call(COLLECTION_META, value);
}

/**
 * Server-side preview opener (`ICR-197` AC7, `F-editor-ux-decisions.md` §2.11):
 * - Requires `content:read` (401 unauthenticated, 403 forbidden).
 * - Resolves the entry's exact public route path & locale on the server.
 * - Signs a 60s HMAC-SHA256 link via `@idcr/content/preview` without ever
 *   exposing `CONTENT_PREVIEW_SECRET` to admin HTML or URLs.
 * - Returns `307 Temporary Redirect` to `<websiteOrigin>/api/preview?...`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const authz = await requirePermission("content:read");
  if (!authz.ok) {
    if (authz.reason === "unauthenticated") {
      return plainResponse("Unauthorized", 401);
    }
    return plainResponse("Forbidden", 403);
  }

  const { searchParams } = request.nextUrl;
  const collectionParam = searchParams.get("collection")?.trim() ?? "";
  const idParam = searchParams.get("id")?.trim() ?? "";
  const localeParam = searchParams.get("locale")?.trim() ?? "";

  if (
    !collectionParam ||
    !idParam ||
    !isContentCollectionName(collectionParam) ||
    !collectionSupportsPreview(collectionParam) ||
    !(LOCALES as readonly string[]).includes(localeParam)
  ) {
    return plainResponse("Invalid preview parameters", 400);
  }

  const locale = localeParam as Locale;
  const caller = callerFromAuthorized(authz);
  const loaded = await getContentById<Record<string, unknown>>(
    caller,
    collectionParam,
    idParam,
  );
  if (!loaded.ok) {
    if (loaded.reason === "forbidden") return plainResponse("Forbidden", 403);
    return plainResponse("Entry not found", 404);
  }

  const resolved = resolveEntryPreviewPath(
    collectionParam,
    loaded.doc.draft,
    locale,
  );
  if (!resolved.ok) {
    return plainResponse("Entry cannot be previewed yet (missing address)", 422);
  }

  const config = validatePreviewConfig();
  if (!config.ok) {
    return plainResponse("Preview is not configured for this environment", 503);
  }

  const redirectUrl = buildSignedPreviewRedirectUrl({
    origin: config.origin,
    path: resolved.path,
    secret: config.secret,
  });

  return new Response(null, {
    status: 307,
    headers: {
      Location: redirectUrl,
      ...NO_STORE_HEADERS,
    },
  });
}
