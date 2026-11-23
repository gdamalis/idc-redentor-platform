import { NextResponse } from "next/server";
import type { ServiceContentCaller } from "@src/lib/content/caller";
import { extractBearerToken, isAuthorizedSecret } from "@src/lib/http/secret";
import type { MediaUploadAuthResult } from "@src/app/api/media/upload/route";
import {
  defaultPredicaRateLimiters,
  type PredicaRateLimiters,
} from "./rate-limit";

export const PREDICA_INGEST_SERVICE_ID = "service:predica-ingest";

/**
 * Fixed, least-privilege service identity for `/api/predica/*` (`ICR-204`).
 *
 * Holds ZERO `content:publish` or `content:publish-protected` permissions, so
 * draft-only is enforced both at the route schema boundary AND inside `ICR-195`
 * services. Recording `updatedBy = "service:predica-ingest"` automatically
 * surfaces the `"Para revisar"` chip/notice in the Hub, Sermons list, and
 * Sermon editor (`F-editor-ux-decisions.md` §2.10, `ICR-200` AC8).
 */
export const PREDICA_INGEST_CALLER: ServiceContentCaller = {
  kind: "service",
  serviceId: PREDICA_INGEST_SERVICE_ID,
  label: "Ingesta automática de prédicas",
  permissions: new Set(["content:read", "content:write", "media:manage"]),
};

export const PREDICA_TARGET_ENV = {
  production: "production",
  staging: "staging",
} as const;

export type PredicaRuntimeTarget =
  (typeof PREDICA_TARGET_ENV)[keyof typeof PREDICA_TARGET_ENV];

export const PREDICA_TARGET_HEADER = "x-predica-target";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export interface PredicaAuthEnv {
  readonly PREDICA_INGEST_TOKEN?: string;
  readonly VERCEL_TARGET_ENV?: string;
  readonly NEXT_PUBLIC_ADMIN_BASE_URL?: string;
}

export interface PredicaAuthDeps {
  readonly env: PredicaAuthEnv;
  readonly rateLimiters: PredicaRateLimiters;
  readonly now: () => number;
}

export const defaultPredicaAuthDeps: PredicaAuthDeps = {
  env: process.env,
  rateLimiters: defaultPredicaRateLimiters,
  now: () => Date.now(),
};

export type PredicaAuthResult =
  | {
      readonly ok: true;
      readonly caller: ServiceContentCaller;
      readonly environment: PredicaRuntimeTarget;
    }
  | {
      readonly ok: false;
      readonly status: 401 | 403 | 429;
      readonly error: string;
      readonly retryAfterSeconds?: number;
    };

/**
 * Distinguishes production from staging/preview/development via
 * `VERCEL_TARGET_ENV` (Lesson H #5: Vercel staging reports `VERCEL_ENV=preview`).
 */
export function resolveAdminRuntimeTarget(
  env: Pick<PredicaAuthEnv, "VERCEL_TARGET_ENV"> = process.env,
): PredicaRuntimeTarget {
  return env.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production"
    ? PREDICA_TARGET_ENV.production
    : PREDICA_TARGET_ENV.staging;
}

export function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

function parseTargetHeader(
  raw: string | null,
): PredicaRuntimeTarget | "invalid" | null {
  if (raw === null) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return null;
  if (normalized === "production" || normalized === "prod") {
    return PREDICA_TARGET_ENV.production;
  }
  if (normalized === "staging" || normalized === "test") {
    return PREDICA_TARGET_ENV.staging;
  }
  return "invalid";
}

/**
 * Single authoritative security boundary for every `/api/predica/*` handler.
 *
 * Order of checks:
 * 1. Check IP failed-auth lockout (`429` + `Retry-After`) before touching token.
 * 2. Constant-time fail-closed check of `Authorization: Bearer <PREDICA_INGEST_TOKEN>` (`401`).
 * 3. Check optional `X-Predica-Target` against `VERCEL_TARGET_ENV` ONLY AFTER
 *    auth succeeds (`403`) so unauthenticated callers cannot probe runtime env.
 * 4. Consume authenticated per-minute rate limit (`429`).
 */
export function authorizePredicaRequest(
  request: Request,
  deps: PredicaAuthDeps = defaultPredicaAuthDeps,
): PredicaAuthResult {
  const nowMs = deps.now();
  const clientIp = extractClientIp(request);

  const failedCheck = deps.rateLimiters.failedAuth.check(clientIp, nowMs);
  if (!failedCheck.allowed) {
    return {
      ok: false,
      status: 429,
      error: "Too many failed authentication attempts",
      retryAfterSeconds: failedCheck.retryAfterSeconds,
    };
  }

  const candidate = extractBearerToken(request.headers.get("authorization"));
  const expected = deps.env.PREDICA_INGEST_TOKEN?.trim();
  if (!isAuthorizedSecret(candidate, expected)) {
    const afterFailure = deps.rateLimiters.failedAuth.record(clientIp, nowMs);
    if (!afterFailure.allowed) {
      return {
        ok: false,
        status: 429,
        error: "Too many failed authentication attempts",
        retryAfterSeconds: afterFailure.retryAfterSeconds,
      };
    }
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const environment = resolveAdminRuntimeTarget(deps.env);
  const declaredTarget = parseTargetHeader(
    request.headers.get(PREDICA_TARGET_HEADER),
  );
  if (declaredTarget === "invalid") {
    return {
      ok: false,
      status: 403,
      error: "Invalid target environment header",
    };
  }
  if (declaredTarget !== null && declaredTarget !== environment) {
    return {
      ok: false,
      status: 403,
      error: "Target environment mismatch",
    };
  }

  const authedDecision = deps.rateLimiters.authed.consume(
    PREDICA_INGEST_SERVICE_ID,
    nowMs,
  );
  if (!authedDecision.allowed) {
    return {
      ok: false,
      status: 429,
      error: "Rate limit exceeded",
      retryAfterSeconds: authedDecision.retryAfterSeconds,
    };
  }

  return {
    ok: true,
    caller: PREDICA_INGEST_CALLER,
    environment,
  };
}

/**
 * Authorizer adapter for `createMediaUploadPostHandler` (`ICR-196`), used
 * AFTER `checkPredicaPreUploadRateLimit` handles `429` cleanly (`R1`).
 */
export function authorizePredicaMediaUploadWithoutAuthedConsume(
  request: Request,
  deps: PredicaAuthDeps = defaultPredicaAuthDeps,
): MediaUploadAuthResult {
  const nowMs = deps.now();
  const clientIp = extractClientIp(request);

  const candidate = extractBearerToken(request.headers.get("authorization"));
  const expected = deps.env.PREDICA_INGEST_TOKEN?.trim();
  if (!isAuthorizedSecret(candidate, expected)) {
    deps.rateLimiters.failedAuth.record(clientIp, nowMs);
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const environment = resolveAdminRuntimeTarget(deps.env);
  const declaredTarget = parseTargetHeader(
    request.headers.get(PREDICA_TARGET_HEADER),
  );
  if (
    declaredTarget === "invalid" ||
    (declaredTarget !== null && declaredTarget !== environment)
  ) {
    return { ok: false, status: 403, error: "Target environment mismatch" };
  }

  return { ok: true, caller: PREDICA_INGEST_CALLER };
}

export function predicaJsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Readonly<Record<string, string>>,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function predicaAuthErrorResponse(
  auth: Extract<PredicaAuthResult, { ok: false }>,
): NextResponse {
  return predicaJsonResponse(
    { ok: false, error: auth.error },
    auth.status,
    auth.retryAfterSeconds !== undefined
      ? { "Retry-After": String(auth.retryAfterSeconds) }
      : undefined,
  );
}

/**
 * Resolves the canonical admin origin for constructing `editUrl` in responses.
 * Prefers `NEXT_PUBLIC_ADMIN_BASE_URL`, then the request origin, then canonical
 * host by `VERCEL_TARGET_ENV`.
 */
export function resolveAdminOrigin(
  request: Request,
  env: Pick<
    PredicaAuthEnv,
    "NEXT_PUBLIC_ADMIN_BASE_URL" | "VERCEL_TARGET_ENV"
  > = process.env,
): string {
  const configured = env.NEXT_PUBLIC_ADMIN_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return resolveAdminRuntimeTarget(env) === PREDICA_TARGET_ENV.production
      ? "https://ministerio.idcredentor.org"
      : "https://staging.ministerio.idcredentor.org";
  }
}
