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
import { predicaLookupQuerySchema } from "@src/lib/predica/schemas";
import {
  defaultPredicaIngestDeps,
  lookupSermonsForGate0,
  type PredicaIngestDeps,
} from "@src/service/predica/ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaLookupRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly ingestDeps: PredicaIngestDeps;
}

const defaultDeps: PredicaLookupRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  ingestDeps: defaultPredicaIngestDeps,
};

export function createPredicaLookupGetHandler(
  deps: PredicaLookupRouteDeps = defaultDeps,
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const auth = authorizePredicaRequest(request, deps.authDeps);
    if (!auth.ok) {
      return predicaAuthErrorResponse(auth);
    }

    const url = new URL(request.url);
    const rawSlug = url.searchParams.get("slug") ?? "";
    const rawDate = url.searchParams.get("sermonDate") ?? undefined;

    const parsed = predicaLookupQuerySchema.safeParse({
      slug: rawSlug,
      ...(rawDate !== undefined && rawDate !== "" && { sermonDate: rawDate }),
    });
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

    const result = await lookupSermonsForGate0(
      auth.caller,
      {
        slug: parsed.data.slug,
        ...(parsed.data.sermonDate !== undefined && {
          sermonDate: parsed.data.sermonDate,
        }),
        environment: auth.environment,
        adminOrigin: resolveAdminOrigin(request, deps.authDeps.env),
      },
      deps.ingestDeps,
    );

    return predicaJsonResponse(result, 200);
  };
}

export const GET = createPredicaLookupGetHandler();
