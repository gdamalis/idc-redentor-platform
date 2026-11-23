import type { NextResponse } from "next/server";
import { formatZodFieldErrors } from "@src/lib/content/errors";
import { formatFileSize } from "@src/lib/media/policy";
import {
  authorizePredicaRequest,
  defaultPredicaAuthDeps,
  predicaAuthErrorResponse,
  predicaJsonResponse,
  type PredicaAuthDeps,
} from "@src/lib/predica/auth";
import { predicaPrepareMediaSchema } from "@src/lib/predica/schemas";
import { prepareMediaUpload } from "@src/service/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaMediaPrepareRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly prepareMediaUpload: typeof prepareMediaUpload;
}

const defaultDeps: PredicaMediaPrepareRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  prepareMediaUpload,
};

export function createPredicaMediaPreparePostHandler(
  deps: PredicaMediaPrepareRouteDeps = defaultDeps,
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

    const parsed = predicaPrepareMediaSchema.safeParse(rawBody);
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

    const result = await deps.prepareMediaUpload(auth.caller, parsed.data);
    if (!result.ok) {
      if (result.reason === "file-too-large") {
        return predicaJsonResponse(
          {
            ok: false,
            reason: result.reason,
            maxBytes: result.maxBytes,
            actualBytes: result.actualBytes,
            error: `File exceeds maximum allowed size (${formatFileSize(result.maxBytes, "en-US")})`,
          },
          413,
        );
      }
      if (result.reason === "unsupported-type") {
        return predicaJsonResponse(
          {
            ok: false,
            reason: result.reason,
            error: `Unsupported content type: ${result.contentType}`,
          },
          400,
        );
      }
      if (result.reason === "forbidden") {
        return predicaJsonResponse(
          { ok: false, reason: result.reason, error: "Forbidden" },
          403,
        );
      }
      return predicaJsonResponse(
        {
          ok: false,
          reason: result.reason,
          ...(result.reason === "invalid" && {
            fieldErrors: result.fieldErrors,
          }),
        },
        400,
      );
    }

    if (result.status === "duplicate") {
      return predicaJsonResponse(
        { ok: true, status: "duplicate", media: result.existing },
        200,
      );
    }

    return predicaJsonResponse(
      {
        ok: true,
        status: "ready",
        mediaId: result.mediaId,
        pathname: result.pathname,
        normalizedContentType: result.normalizedContentType,
        maxBytes: result.maxBytes,
        multipart: result.multipart,
      },
      200,
    );
  };
}

export const POST = createPredicaMediaPreparePostHandler();
