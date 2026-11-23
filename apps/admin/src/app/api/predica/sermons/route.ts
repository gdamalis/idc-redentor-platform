import type { NextResponse } from "next/server";
import { formatZodFieldErrors } from "@src/lib/content/errors";
import {
  authorizePredicaRequest,
  defaultPredicaAuthDeps,
  predicaAuthErrorResponse,
  predicaJsonResponse,
  resolveAdminOrigin,
  type PredicaAuthDeps,
} from "@src/lib/predica/auth";
import { predicaIngestRequestSchema } from "@src/lib/predica/schemas";
import {
  defaultPredicaIngestDeps,
  ingestSermonDraft,
  type PredicaIngestDeps,
} from "@src/service/predica/ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaSermonsRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly ingestDeps: PredicaIngestDeps;
}

const defaultDeps: PredicaSermonsRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  ingestDeps: defaultPredicaIngestDeps,
};

export function createPredicaSermonsPostHandler(
  deps: PredicaSermonsRouteDeps = defaultDeps,
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

    const parsed = predicaIngestRequestSchema.safeParse(rawBody);
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

    const result = await ingestSermonDraft(
      auth.caller,
      parsed.data,
      { adminOrigin: resolveAdminOrigin(request, deps.authDeps.env) },
      deps.ingestDeps,
    );

    if (!result.ok) {
      return predicaJsonResponse(result, result.status);
    }

    return predicaJsonResponse(result, result.mode === "create" ? 201 : 200);
  };
}

export const POST = createPredicaSermonsPostHandler();
