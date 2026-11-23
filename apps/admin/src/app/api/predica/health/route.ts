import type { NextResponse } from "next/server";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  PREDICA_INGEST_SERVICE_ID,
  authorizePredicaRequest,
  defaultPredicaAuthDeps,
  predicaAuthErrorResponse,
  predicaJsonResponse,
  type PredicaAuthDeps,
} from "@src/lib/predica/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PredicaHealthRouteDeps {
  readonly authDeps: PredicaAuthDeps;
  readonly isContentTrialMode: typeof isContentTrialMode;
}

const defaultDeps: PredicaHealthRouteDeps = {
  authDeps: defaultPredicaAuthDeps,
  isContentTrialMode,
};

export function createPredicaHealthGetHandler(
  deps: PredicaHealthRouteDeps = defaultDeps,
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const auth = authorizePredicaRequest(request, deps.authDeps);
    if (!auth.ok) {
      return predicaAuthErrorResponse(auth);
    }

    return predicaJsonResponse({
      ok: true,
      service: "predica-ingest",
      environment: auth.environment,
      trialMode: deps.isContentTrialMode(),
      serviceId: PREDICA_INGEST_SERVICE_ID,
    });
  };
}

export const GET = createPredicaHealthGetHandler();
