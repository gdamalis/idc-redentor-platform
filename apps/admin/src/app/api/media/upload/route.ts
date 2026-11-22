import { NextResponse } from "next/server";
import { z } from "zod";
import type { HandleUploadBody } from "@vercel/blob/client";
import { callerFromAuthorized, type ContentCaller } from "@src/lib/content/caller";
import { requirePermission } from "@src/lib/rbac/require-permission";
import {
  CANONICAL_MEDIA_ID_RE,
  getMediaSizeCapForContentType,
  isAllowedMediaContentType,
  isValidMediaPathname,
  normalizeMediaContentType,
} from "@src/lib/media/policy";
import {
  STORAGE_CLASS,
  handleClientUpload,
} from "@src/service/media/storage.service";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const TOKEN_VALIDITY_MS = 10 * 60 * 1000;
const MAX_CLIENT_PAYLOAD_LENGTH = 2_048;

const clientPayloadSchema = z.strictObject({
  mediaId: z.string().regex(CANONICAL_MEDIA_ID_RE, "Invalid mediaId"),
  contentType: z.string().min(1).max(128),
  size: z.number().int().positive(),
});

export type MediaUploadAuthResult =
  | { readonly ok: true; readonly caller: ContentCaller }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

/**
 * Pluggable request authorizer for `POST /api/media/upload`.
 * Interactive admin users authenticate via session cookie (`requirePermission("media:manage")`);
 * `ICR-204` (predica ingest) can supply a service-token authorizer using the exact same contract.
 */
export type MediaUploadAuthorizer = (
  request: Request,
) => Promise<MediaUploadAuthResult>;

export async function defaultAuthorizeMediaUploadRequest(): Promise<MediaUploadAuthResult> {
  const authz = await requirePermission("media:manage");
  if (!authz.ok) {
    if (authz.reason === "unauthenticated") {
      return { ok: false, status: 401, error: "Unauthorized" };
    }
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, caller: callerFromAuthorized(authz) };
}

export interface MediaUploadRouteDeps {
  readonly authorize: MediaUploadAuthorizer;
  readonly handleClientUpload: typeof handleClientUpload;
  readonly now: () => number;
}

const defaultRouteDeps: MediaUploadRouteDeps = {
  authorize: defaultAuthorizeMediaUploadRequest,
  handleClientUpload,
  now: () => Date.now(),
};

function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isHandleUploadBody(value: unknown): value is HandleUploadBody {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.type === "blob.generate-client-token" ||
      record.type === "blob.upload-completed") &&
    typeof record.payload === "object" &&
    record.payload !== null
  );
}

/**
 * Factory for `POST /api/media/upload` (`ICR-196` AC1 & AC2).
 *
 * NOTE: `apps/admin/src/proxy.ts` excludes `/api/**`, so authorization inside
 * this handler is the SOLE gate preventing unauthorized token issuance.
 */
export function createMediaUploadPostHandler(
  deps: MediaUploadRouteDeps = defaultRouteDeps,
) {
  return async function POST(request: Request): Promise<NextResponse> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonNoStore({ error: "Invalid JSON body" }, 400);
    }

    if (!isHandleUploadBody(rawBody)) {
      return jsonNoStore({ error: "Unsupported upload event" }, 400);
    }

    // Gate token issuance BEFORE touching storage credentials or calling handleUpload.
    let authorizedCaller: ContentCaller | null = null;
    if (rawBody.type === "blob.generate-client-token") {
      const auth = await deps.authorize(request);
      if (!auth.ok) {
        return jsonNoStore({ error: auth.error }, auth.status);
      }
      authorizedCaller = auth.caller;
    }

    try {
      const result = await deps.handleClientUpload({
        storageClass: STORAGE_CLASS.publicMedia,
        body: rawBody,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          // Defense in depth: never issue a token without an authorized caller.
          if (!authorizedCaller) {
            throw new Error("Unauthorized");
          }

          if (
            typeof clientPayload !== "string" ||
            clientPayload.length === 0 ||
            clientPayload.length > MAX_CLIENT_PAYLOAD_LENGTH
          ) {
            throw new Error("Missing or invalid upload metadata");
          }

          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(clientPayload);
          } catch {
            throw new Error("Malformed upload metadata");
          }

          const parsed = clientPayloadSchema.safeParse(parsedJson);
          if (!parsed.success) {
            throw new Error("Invalid upload metadata fields");
          }

          const normalizedType = normalizeMediaContentType(
            parsed.data.contentType,
          );
          if (!isAllowedMediaContentType(normalizedType)) {
            throw new Error("File type is not allowed");
          }

          const cap = getMediaSizeCapForContentType(normalizedType);
          if (cap === null || parsed.data.size > cap) {
            throw new Error("File exceeds maximum allowed size");
          }

          if (!isValidMediaPathname(pathname, parsed.data.mediaId, normalizedType)) {
            throw new Error("Invalid upload pathname");
          }

          // Scope the client token to THIS SINGLE MIME type and its exact cap so
          // a caller cannot declare audio (200 MB) and upload an oversized image.
          return {
            allowedContentTypes: [normalizedType],
            maximumSizeInBytes: cap,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: deps.now() + TOKEN_VALIDITY_MS,
          };
        },
      });

      if (!result.ok) {
        return jsonNoStore({ error: "Media storage is not configured" }, 503);
      }

      return jsonNoStore(result.response, 200);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload token request refused";
      return jsonNoStore({ error: message }, 400);
    }
  };
}

export const POST = createMediaUploadPostHandler();
