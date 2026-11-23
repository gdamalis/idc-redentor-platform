import { describe, expect, it } from "vitest";
import {
  PREDICA_INGEST_CALLER,
  PREDICA_INGEST_SERVICE_ID,
  PREDICA_TARGET_HEADER,
  authorizePredicaRequest,
  resolveAdminRuntimeTarget,
} from "./auth";
import { createPredicaRateLimiters } from "./rate-limit";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://staging.ministerio.idcredentor.org/api/predica/health", {
    method: "GET",
    headers,
  });
}

describe("predica auth & service identity", () => {
  it("pins fixed least-privilege service identity with zero publish permissions", () => {
    expect(PREDICA_INGEST_CALLER.kind).toBe("service");
    expect(PREDICA_INGEST_CALLER.serviceId).toBe(PREDICA_INGEST_SERVICE_ID);
    expect(PREDICA_INGEST_CALLER.permissions.has("content:read")).toBe(true);
    expect(PREDICA_INGEST_CALLER.permissions.has("content:write")).toBe(true);
    expect(PREDICA_INGEST_CALLER.permissions.has("media:manage")).toBe(true);
    expect(PREDICA_INGEST_CALLER.permissions.has("content:publish")).toBe(false);
    expect(
      PREDICA_INGEST_CALLER.permissions.has("content:publish-protected"),
    ).toBe(false);
  });

  it("distinguishes production vs staging using VERCEL_TARGET_ENV", () => {
    expect(resolveAdminRuntimeTarget({ VERCEL_TARGET_ENV: "production" })).toBe(
      "production",
    );
    expect(resolveAdminRuntimeTarget({ VERCEL_TARGET_ENV: "staging" })).toBe(
      "staging",
    );
    expect(resolveAdminRuntimeTarget({ VERCEL_TARGET_ENV: "preview" })).toBe(
      "staging",
    );
    expect(resolveAdminRuntimeTarget({})).toBe("staging");
  });

  it("fails closed (401) when env token is unset, header is missing, or token mismatches", () => {
    const baseDeps = () => ({
      env: {
        PREDICA_INGEST_TOKEN: "staging-secret-token-value-123456",
        VERCEL_TARGET_ENV: "staging",
      },
      rateLimiters: createPredicaRateLimiters(),
      now: () => 10_000,
    });

    // Unset server secret
    expect(
      authorizePredicaRequest(
        makeRequest({ Authorization: "Bearer anything" }),
        { ...baseDeps(), env: {} },
      ),
    ).toMatchObject({ ok: false, status: 401 });

    // Missing header
    expect(authorizePredicaRequest(makeRequest(), baseDeps())).toMatchObject({
      ok: false,
      status: 401,
    });

    // Wrong / other-environment token
    expect(
      authorizePredicaRequest(
        makeRequest({ Authorization: "Bearer prod-secret-token-different-999" }),
        baseDeps(),
      ),
    ).toMatchObject({ ok: false, status: 401 });

    // Unauthenticated caller with mismatched target header still gets 401 (cannot probe env)
    expect(
      authorizePredicaRequest(
        makeRequest({
          Authorization: "Bearer wrong",
          [PREDICA_TARGET_HEADER]: "production",
        }),
        baseDeps(),
      ),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects cross-environment X-Predica-Target header (403) after auth succeeds", () => {
    const deps = {
      env: {
        PREDICA_INGEST_TOKEN: "staging-secret-token-value-123456",
        VERCEL_TARGET_ENV: "staging",
      },
      rateLimiters: createPredicaRateLimiters(),
      now: () => 10_000,
    };

    expect(
      authorizePredicaRequest(
        makeRequest({
          Authorization: "Bearer staging-secret-token-value-123456",
          [PREDICA_TARGET_HEADER]: "production",
        }),
        deps,
      ),
    ).toMatchObject({ ok: false, status: 403 });

    expect(
      authorizePredicaRequest(
        makeRequest({
          Authorization: "Bearer staging-secret-token-value-123456",
          [PREDICA_TARGET_HEADER]: "staging",
        }),
        deps,
      ),
    ).toMatchObject({ ok: true, environment: "staging", caller: PREDICA_INGEST_CALLER });
  });

  it("enforces failed-auth IP lockout (429) with Retry-After", () => {
    const rateLimiters = createPredicaRateLimiters();
    const deps = {
      env: {
        PREDICA_INGEST_TOKEN: "valid-secret",
        VERCEL_TARGET_ENV: "staging",
      },
      rateLimiters,
      now: () => 50_000,
    };

    for (let i = 0; i < 19; i += 1) {
      const res = authorizePredicaRequest(
        makeRequest({
          Authorization: "Bearer bad",
          "x-forwarded-for": "203.0.113.5",
        }),
        deps,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(401);
    }

    const locked = authorizePredicaRequest(
      makeRequest({
        Authorization: "Bearer bad",
        "x-forwarded-for": "203.0.113.5",
      }),
      deps,
    );
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.status).toBe(429);
      expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
