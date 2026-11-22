import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { verifyPreviewLink } from "@idcr/content/preview";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const { mockRequirePermission, mockGetContentById } = vi.hoisted(() => ({
  mockRequirePermission: vi.fn(),
  mockGetContentById: vi.fn(),
}));

vi.mock("@src/lib/rbac/require-permission", () => ({
  requirePermission: mockRequirePermission,
}));

vi.mock("@src/service/content/content-core.service", () => ({
  getContentById: mockGetContentById,
}));

import { GET } from "./route";
import { validatePreviewConfig } from "@src/lib/content/preview-url";

function makeAuthz(perms: PermissionKey[]) {
  return {
    ok: true as const,
    user: {
      _id: new ObjectId("65f1234567890abcdef12345"),
      email: "editor@example.org",
      displayName: "Editor",
      firebaseUid: "uid-1",
      roleIds: [],
      preferredLocale: "es-AR" as const,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    permissions: new Set<PermissionKey>(perms),
  };
}

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3001/api/content/preview?${query}`);
}

describe("GET /api/content/preview (AC7)", () => {
  const ORIGINAL_ENV = { ...process.env };
  const TEST_SECRET = "test-preview-hmac-secret-never-exposed";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTENT_PREVIEW_SECRET = TEST_SECRET;
    process.env.WEBSITE_REVALIDATE_URL = "https://staging.idcredentor.org";
    process.env.VERCEL_TARGET_ENV = "staging";
    delete process.env.WEBSITE_PREVIEW_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 401 when unauthenticated and 403 when lacking content:read", async () => {
    mockRequirePermission.mockResolvedValueOnce({
      ok: false,
      reason: "unauthenticated",
    });
    const r401 = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(r401.status).toBe(401);
    expect(r401.headers.get("Cache-Control")).toBe("no-store");

    mockRequirePermission.mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    const r403 = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(r403.status).toBe(403);
    expect(mockGetContentById).not.toHaveBeenCalled();
  });

  it("refuses library collections (authors, bible_verses) with 400", async () => {
    mockRequirePermission.mockResolvedValue(makeAuthz(["content:read"]));
    const res = await GET(
      makeRequest("collection=authors&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(res.status).toBe(400);
  });

  it("mints a valid 60s signed redirect bound to entry path and locale without exposing secret", async () => {
    mockRequirePermission.mockResolvedValue(makeAuthz(["content:read"]));
    mockGetContentById.mockResolvedValue({
      ok: true,
      status: "draft",
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: { slug: "gracia-y-verdad", title: { "es-AR": "Gracia" } },
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });

    const res = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=en-US"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    const location = res.headers.get("Location");
    expect(location).toBeTruthy();
    expect(location).not.toContain(TEST_SECRET);

    const parsed = new URL(location!);
    expect(parsed.origin).toBe("https://staging.idcredentor.org");
    expect(parsed.pathname).toBe("/api/preview");

    const verified = verifyPreviewLink({
      path: parsed.searchParams.get("path"),
      exp: parsed.searchParams.get("exp"),
      sig: parsed.searchParams.get("sig"),
      secret: TEST_SECRET,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.path).toBe("/en-US/blog/gracia-y-verdad");
      expect(verified.locale).toBe("en-US");
    }
  });

  it("resolves fixed entries from FIXED_ENTRIES previewPage and returns 422 when topic locale slug is missing", async () => {
    mockRequirePermission.mockResolvedValue(makeAuthz(["content:read"]));
    mockGetContentById.mockResolvedValueOnce({
      ok: true,
      status: "published",
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: { machineName: "event-sunday-meetings" },
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });

    const fixedRes = await GET(
      makeRequest(
        "collection=event_banners&id=65f1234567890abcdef12345&locale=es-AR",
      ),
    );
    expect(fixedRes.status).toBe(307);
    const fixedLoc = new URL(fixedRes.headers.get("Location")!);
    expect(fixedLoc.searchParams.get("path")).toBe("/es-AR/come-meet-us");

    mockGetContentById.mockResolvedValueOnce({
      ok: true,
      status: "draft",
      doc: {
        _id: "65f1234567890abcdef12346",
        draft: { slug: { "es-AR": "privacidad" } },
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });
    const missingTopicEn = await GET(
      makeRequest("collection=topics&id=65f1234567890abcdef12346&locale=en-US"),
    );
    expect(missingTopicEn.status).toBe(422);
  });

  it("blocks production website hosts whenever VERCEL_TARGET_ENV !== 'production'", () => {
    const blocked = validatePreviewConfig({
      CONTENT_PREVIEW_SECRET: TEST_SECRET,
      WEBSITE_REVALIDATE_URL: "https://www.idcredentor.org",
      VERCEL_TARGET_ENV: "staging",
    });
    expect(blocked).toEqual({ ok: false, reason: "production-host-blocked" });

    const allowedProd = validatePreviewConfig({
      CONTENT_PREVIEW_SECRET: TEST_SECRET,
      WEBSITE_REVALIDATE_URL: "https://www.idcredentor.org",
      VERCEL_TARGET_ENV: "production",
    });
    expect(allowedProd).toEqual({
      ok: true,
      origin: "https://www.idcredentor.org",
      secret: TEST_SECRET,
    });
  });

  it("fails closed with 503 when CONTENT_PREVIEW_SECRET is unset/blank or server website URLs are unset (ignoring NEXT_PUBLIC_WEBSITE_URL)", async () => {
    mockRequirePermission.mockResolvedValue(makeAuthz(["content:read"]));
    mockGetContentById.mockResolvedValue({
      ok: true,
      status: "draft",
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: { slug: "gracia-y-verdad", title: { "es-AR": "Gracia" } },
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });

    // Unset secret
    delete process.env.CONTENT_PREVIEW_SECRET;
    const missingSecret = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(missingSecret.status).toBe(503);
    expect(missingSecret.headers.get("Cache-Control")).toBe("no-store");

    // Blank secret
    process.env.CONTENT_PREVIEW_SECRET = "   ";
    const blankSecret = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(blankSecret.status).toBe(503);

    // Unset server website URLs even when NEXT_PUBLIC_WEBSITE_URL is set
    process.env.CONTENT_PREVIEW_SECRET = TEST_SECRET;
    delete process.env.WEBSITE_PREVIEW_URL;
    delete process.env.WEBSITE_REVALIDATE_URL;
    process.env.NEXT_PUBLIC_WEBSITE_URL = "https://staging.idcredentor.org";
    const missingOrigin = await GET(
      makeRequest("collection=posts&id=65f1234567890abcdef12345&locale=es-AR"),
    );
    expect(missingOrigin.status).toBe(503);
    expect(missingOrigin.headers.get("Cache-Control")).toBe("no-store");
  });
});
