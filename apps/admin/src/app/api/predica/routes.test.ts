import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPredicaRateLimiters } from "@src/lib/predica/rate-limit";
import type { PredicaAuthDeps } from "@src/lib/predica/auth";
import { createPredicaHealthGetHandler } from "./health/route";
import { createPredicaLookupGetHandler } from "./sermons/lookup/route";
import { createPredicaSermonsPostHandler } from "./sermons/route";
import { createPredicaMediaPreparePostHandler } from "./media/prepare/route";
import { createPredicaMediaUploadPostHandler } from "./media/upload/route";
import { createPredicaMediaConfirmPostHandler } from "./media/confirm/route";

const VALID_TOKEN = "predica-test-token-32-bytes-long-abc";
const MEDIA_ID = "65f1a2b3c4d5e6f7a8b9c001";
const PATHNAME = `media/${MEDIA_ID}/featured.png`;
const BLOB_URL = `https://store.public.blob.vercel-storage.com/${PATHNAME}`;
const SHA = "a".repeat(64);

function makeAuthDeps(
  overrides: Partial<PredicaAuthDeps> = {},
): PredicaAuthDeps {
  return {
    env: {
      PREDICA_INGEST_TOKEN: VALID_TOKEN,
      VERCEL_TARGET_ENV: "staging",
      NEXT_PUBLIC_ADMIN_BASE_URL: "https://staging.ministerio.idcredentor.org",
    },
    rateLimiters: createPredicaRateLimiters(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("/api/predica/* routes", () => {
  it("GET /api/predica/health returns environment, trialMode, serviceId and no-store headers", async () => {
    const GET = createPredicaHealthGetHandler({
      authDeps: makeAuthDeps(),
      isContentTrialMode: () => true,
    });

    const unauth = await GET(
      new Request("https://staging.ministerio.idcredentor.org/api/predica/health"),
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("Cache-Control")).toBe("no-store");

    const ok = await GET(
      new Request("https://staging.ministerio.idcredentor.org/api/predica/health", {
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "X-Predica-Target": "staging",
        },
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      service: "predica-ingest",
      environment: "staging",
      trialMode: true,
      serviceId: "service:predica-ingest",
    });
  });

  it("POST /api/predica/sermons rejects payloads trying to set published state (AC5)", async () => {
    const POST = createPredicaSermonsPostHandler({
      authDeps: makeAuthDeps(),
      ingestDeps: {} as never,
    });

    const res = await POST(
      new Request("https://staging.ministerio.idcredentor.org/api/predica/sermons", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VALID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "create",
          published: { slug: "hack" },
          sermon: {
            slug: "test-sermon",
            sermonDate: "2026-11-22",
            title: { "es-AR": "Prueba" },
          },
          preacher: { name: "Jonathan" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/predica/sermons/lookup validates slug query param", async () => {
    const GET = createPredicaLookupGetHandler({
      authDeps: makeAuthDeps(),
      ingestDeps: {} as never,
    });

    const bad = await GET(
      new Request(
        "https://staging.ministerio.idcredentor.org/api/predica/sermons/lookup?slug=NOT_A_SLUG!",
        { headers: { Authorization: `Bearer ${VALID_TOKEN}` } },
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("POST /api/predica/media/prepare returns 413 with cap in message when file exceeds cap (Edge Case #6)", async () => {
    const POST = createPredicaMediaPreparePostHandler({
      authDeps: makeAuthDeps(),
      prepareMediaUpload: vi.fn().mockResolvedValue({
        ok: false,
        reason: "file-too-large",
        maxBytes: 15 * 1024 * 1024,
        actualBytes: 20 * 1024 * 1024,
      }),
    });

    const res = await POST(
      new Request(
        "https://staging.ministerio.idcredentor.org/api/predica/media/prepare",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VALID_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: "huge.png",
            contentType: "image/png",
            size: 20 * 1024 * 1024,
            sha256: SHA,
          }),
        },
      ),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("15 MB");
  });

  it("POST /api/predica/media/upload enforces 429 + Retry-After BEFORE createMediaUploadPostHandler (R1)", async () => {
    const rateLimiters = createPredicaRateLimiters();
    const now = 1_700_000_000_000;
    // Exhaust failedAuth IP bucket
    for (let i = 0; i < 20; i += 1) {
      rateLimiters.failedAuth.record("198.51.100.9", now);
    }

    const handleClientUpload = vi.fn();
    const POST = createPredicaMediaUploadPostHandler({
      authDeps: makeAuthDeps({ rateLimiters, now: () => now }),
      handleClientUpload,
    });

    const res = await POST(
      new Request(
        "https://staging.ministerio.idcredentor.org/api/predica/media/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VALID_TOKEN}`,
            "x-forwarded-for": "198.51.100.9",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: { pathname: PATHNAME, clientPayload: "{}", multipart: false },
          }),
        },
      ),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(handleClientUpload).not.toHaveBeenCalled();
  });

  it("POST /api/predica/media/confirm deletes spoofed unregistered blob on magic-byte mismatch (R3)", async () => {
    const delBlob = vi.fn().mockResolvedValue({ ok: true });
    const confirmMediaUpload = vi.fn();
    const fakeMediaCol = { findOne: vi.fn().mockResolvedValue(null) };

    const POST = createPredicaMediaConfirmPostHandler({
      authDeps: makeAuthDeps(),
      getContentDb: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(fakeMediaCol),
      }) as never,
      headBlob: vi.fn().mockResolvedValue({
        ok: true,
        blob: {
          pathname: PATHNAME,
          url: BLOB_URL,
          contentType: "image/png",
          size: 512,
        },
      }),
      delBlob,
      verifyBlobMagicBytes: vi.fn().mockResolvedValue({
        ok: false,
        reason: "mismatch",
        detail: "Uploaded file bytes do not match declared content type (image/png)",
      }),
      confirmMediaUpload,
    });

    const res = await POST(
      new Request(
        "https://staging.ministerio.idcredentor.org/api/predica/media/confirm",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VALID_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaId: MEDIA_ID,
            pathname: PATHNAME,
            url: BLOB_URL,
            filename: "featured.png",
            sha256: SHA,
            title: { "es-AR": "Portada" },
            alt: { "es-AR": "Imagen" },
          }),
        },
      ),
    );

    expect(res.status).toBe(400);
    expect(delBlob).toHaveBeenCalledWith("public-media", BLOB_URL);
    expect(confirmMediaUpload).not.toHaveBeenCalled();
  });
});
