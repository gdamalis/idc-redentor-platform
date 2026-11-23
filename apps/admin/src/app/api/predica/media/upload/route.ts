import type { NextResponse } from "next/server";
import { createMediaUploadPostHandler } from "@src/app/api/media/upload/route";
import { handleClientUpload } from "@src/service/media/storage.service";
import {
  authorizePredicaRequest,
  defaultPredicaAuthDeps,
  predicaAuthErrorResponse,
  predicaJsonResponse,
  type PredicaAuthDeps,
} from "@src/lib/predica/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaMediaUploadRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly handleClientUpload: typeof handleClientUpload;
}

const defaultDeps: PredicaMediaUploadRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  handleClientUpload,
};

/**
 * Direct-to-Blob upload token grant endpoint for `/predica` (`ICR-204`).
 *
 * Enforces `authorizePredicaRequest` (including `429` + `Retry-After` rate
 * limiting per PM `R1`) BEFORE delegating to `ICR-196`'s
 * `createMediaUploadPostHandler` verbatim, so token scoping, single-MIME
 * locking, per-kind size caps, and pathname rules have a single source of truth.
 */
export function createPredicaMediaUploadPostHandler(
  deps: PredicaMediaUploadRouteDeps = defaultDeps,
) {
  return async function POST(request: Request): Promise<NextResponse> {
    let rawText: string;
    let rawBody: unknown;
    try {
      rawText = await request.text();
      rawBody = JSON.parse(rawText);
    } catch {
      return predicaJsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const eventType =
      rawBody && typeof rawBody === "object"
        ? (rawBody as Record<string, unknown>).type
        : undefined;

    let preAuthorizedCaller: ReturnType<typeof authorizePredicaRequest> | null =
      null;
    if (eventType === "blob.generate-client-token") {
      const auth = authorizePredicaRequest(request, deps.authDeps);
      if (!auth.ok) {
        return predicaAuthErrorResponse(auth);
      }
      preAuthorizedCaller = auth;
    }

    const delegate = createMediaUploadPostHandler({
      authorize: async () => {
        if (preAuthorizedCaller?.ok) {
          return { ok: true, caller: preAuthorizedCaller.caller };
        }
        return { ok: false, status: 401, error: "Unauthorized" };
      },
      handleClientUpload: deps.handleClientUpload,
      now: deps.authDeps.now,
    });

    const clonedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawText,
    });

    return delegate(clonedRequest);
  };
}

export const POST = createPredicaMediaUploadPostHandler();
