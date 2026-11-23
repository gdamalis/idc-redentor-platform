import type { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@idcr/content";
import { getContentDb } from "@src/service/database.service";
import { formatZodFieldErrors } from "@src/lib/content/errors";
import {
  getMediaSizeCapForContentType,
  isAllowedMediaContentType,
  isAllowedPublicBlobUrl,
  isValidMediaPathname,
  normalizeMediaContentType,
} from "@src/lib/media/policy";
import {
  STORAGE_CLASS,
  confirmMediaUpload,
  delBlob,
  headBlob,
} from "@src/service/media";
import {
  authorizePredicaRequest,
  defaultPredicaAuthDeps,
  predicaAuthErrorResponse,
  predicaJsonResponse,
  type PredicaAuthDeps,
} from "@src/lib/predica/auth";
import { verifyBlobMagicBytes } from "@src/lib/predica/magic-bytes";
import { predicaConfirmMediaSchema } from "@src/lib/predica/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaMediaConfirmRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly getContentDb: () => Db;
  readonly headBlob: typeof headBlob;
  readonly delBlob: typeof delBlob;
  readonly verifyBlobMagicBytes: typeof verifyBlobMagicBytes;
  readonly confirmMediaUpload: typeof confirmMediaUpload;
}

const defaultDeps: PredicaMediaConfirmRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  getContentDb,
  headBlob,
  delBlob,
  verifyBlobMagicBytes,
  confirmMediaUpload,
};

export function createPredicaMediaConfirmPostHandler(
  deps: PredicaMediaConfirmRouteDeps = defaultDeps,
) {
  return async function POST(request: Request): Promise<NextResponse> {
    const auth = authorizePredicaRequest(request, deps.authDeps);
    if (!auth.ok) {
      return predicaAuthErrorResponse(auth);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return predicaJsonResponse(
        { ok: false, reason: "invalid", error: "Invalid JSON body" },
        400,
      );
    }

    const parsed = predicaConfirmMediaSchema.safeParse(rawBody);
    if (!parsed.success) {
      return predicaJsonResponse(
        {
          ok: false,
          reason: "invalid",
          fieldErrors: formatZodFieldErrors(parsed.error),
        },
        400,
      );
    }

    const data = parsed.data;

    // 1. Validate pathname & public Blob host BEFORE any outbound head/Range fetch (SSRF defense)
    if (
      !data.pathname.startsWith(`media/${data.mediaId}/`) ||
      !isAllowedPublicBlobUrl(data.url, data.pathname)
    ) {
      return predicaJsonResponse(
        {
          ok: false,
          reason: "policy-violation",
          detail: "Blob URL does not match public store host or expected pathname",
        },
        400,
      );
    }

    // 2. Verify blob via head() and inspect actual leading magic bytes (`R3`)
    const mediaCol = deps.getContentDb().collection(COLLECTIONS.media);
    const alreadyRegistered = await mediaCol.findOne({
      $or: [{ pathname: data.pathname }, { url: data.url }],
    });
    if (alreadyRegistered) {
      return predicaJsonResponse(
        {
          ok: false,
          reason: "invalid",
          fieldErrors: { pathname: ["duplicate-key"] },
        },
        400,
      );
    }

    const headRes = await deps.headBlob(STORAGE_CLASS.publicMedia, data.url);
    if (!headRes.ok) {
      if (headRes.reason === "storage-not-configured") {
        return predicaJsonResponse(
          { ok: false, reason: "storage-not-configured", error: "Media storage is not configured" },
          503,
        );
      }
      return predicaJsonResponse(
        {
          ok: false,
          reason: "policy-violation",
          detail: "Uploaded blob could not be verified in storage",
        },
        400,
      );
    }

    const verifiedBlob = headRes.blob;
    const verifiedType = normalizeMediaContentType(verifiedBlob.contentType);
    const cap = getMediaSizeCapForContentType(verifiedType);

    if (
      verifiedBlob.pathname !== data.pathname ||
      !isAllowedPublicBlobUrl(verifiedBlob.url, verifiedBlob.pathname) ||
      !isAllowedMediaContentType(verifiedType) ||
      cap === null ||
      verifiedBlob.size <= 0 ||
      verifiedBlob.size > cap ||
      !isValidMediaPathname(verifiedBlob.pathname, data.mediaId, verifiedType)
    ) {
      return predicaJsonResponse(
        {
          ok: false,
          reason: "policy-violation",
          detail: "Uploaded file metadata violated allowed type, size, or pathname policy",
        },
        400,
      );
    }

    const magicRes = await deps.verifyBlobMagicBytes(
      verifiedBlob.url,
      verifiedType,
    );
    if (!magicRes.ok) {
      if (magicRes.reason === "mismatch") {
        // Delete unregistered spoofed blob so it cannot sit in storage
        const registeredCheck = await mediaCol.findOne({
          $or: [{ pathname: verifiedBlob.pathname }, { url: verifiedBlob.url }],
        });
        if (!registeredCheck) {
          await deps.delBlob(STORAGE_CLASS.publicMedia, verifiedBlob.url);
        }
      }
      return predicaJsonResponse(
        {
          ok: false,
          reason: "policy-violation",
          detail: magicRes.detail,
        },
        400,
      );
    }

    // 3. Persist media document + audit log transactionally via ICR-196
    const confirmed = await deps.confirmMediaUpload(auth.caller, data);
    if (!confirmed.ok) {
      if (confirmed.reason === "storage-not-configured") {
        return predicaJsonResponse(
          { ok: false, reason: confirmed.reason, error: "Media storage is not configured" },
          503,
        );
      }
      if (confirmed.reason === "forbidden") {
        return predicaJsonResponse(
          { ok: false, reason: confirmed.reason, error: "Forbidden" },
          403,
        );
      }
      return predicaJsonResponse(confirmed, 400);
    }

    return predicaJsonResponse({ ok: true, media: confirmed.doc }, 201);
  };
}

export const POST = createPredicaMediaConfirmPostHandler();
