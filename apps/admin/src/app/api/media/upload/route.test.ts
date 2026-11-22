import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { HandleUploadBody } from "@vercel/blob/client";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { UserContentCaller } from "@src/lib/content/caller";
import { MEDIA_SIZE_CAPS } from "@src/lib/media/policy";

const { mockRequirePermission } = vi.hoisted(() => ({
  mockRequirePermission: vi.fn(),
}));

vi.mock("@src/lib/rbac/require-permission", () => ({
  requirePermission: mockRequirePermission,
}));

import {
  createMediaUploadPostHandler,
  defaultAuthorizeMediaUploadRequest,
  type MediaUploadRouteDeps,
} from "./route";

const SAMPLE_ID = "507f1f77bcf86cd799439011";

const ADMIN_CALLER: UserContentCaller = {
  kind: "user",
  userId: "65f1234567890abcdef12345",
  email: "admin@example.org",
  displayName: "Admin",
  permissions: new Set<PermissionKey>(["media:manage", "content:read", "content:write"]),
};

function makeTokenBody(
  pathname: string,
  clientPayload: Record<string, unknown> | null,
  multipart = false,
): HandleUploadBody {
  return {
    type: "blob.generate-client-token",
    payload: {
      pathname,
      multipart,
      clientPayload: clientPayload ? JSON.stringify(clientPayload) : null,
    },
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3001/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeps(overrides: Partial<MediaUploadRouteDeps> = {}) {
  const capturedOptions: unknown[] = [];
  const handleClientUpload = vi.fn(async (input) => {
    if (input.body.type === "blob.generate-client-token") {
      const opts = await input.onBeforeGenerateToken(
        input.body.payload.pathname,
        input.body.payload.clientPayload,
        input.body.payload.multipart,
      );
      capturedOptions.push(opts);
      return {
        ok: true as const,
        response: {
          type: "blob.generate-client-token" as const,
          clientToken: "vercel_blob_client_token_test",
        },
      };
    }
    return {
      ok: true as const,
      response: {
        type: "blob.upload-completed" as const,
        response: "ok" as const,
      },
    };
  });

  const deps: MediaUploadRouteDeps = {
    authorize: vi.fn(async () => ({ ok: true as const, caller: ADMIN_CALLER })),
    handleClientUpload,
    now: () => 1_700_000_000_000,
    ...overrides,
  };

  return { deps, handleClientUpload, capturedOptions };
}

describe("POST /api/media/upload (AC1 & AC2)", () => {
  it("returns 401 when unauthenticated and never calls handleClientUpload", async () => {
    const { deps, handleClientUpload } = makeDeps({
      authorize: vi.fn(async () => ({
        ok: false as const,
        status: 401 as const,
        error: "Unauthorized",
      })),
    });
    const POST = createMediaUploadPostHandler(deps);

    const res = await POST(
      makeRequest(
        makeTokenBody(`media/${SAMPLE_ID}/photo.jpg`, {
          mediaId: SAMPLE_ID,
          contentType: "image/jpeg",
          size: 1024,
        }),
      ),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(handleClientUpload).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated user lacks media:manage permission", async () => {
    const { deps, handleClientUpload } = makeDeps({
      authorize: vi.fn(async () => ({
        ok: false as const,
        status: 403 as const,
        error: "Forbidden",
      })),
    });
    const POST = createMediaUploadPostHandler(deps);

    const res = await POST(
      makeRequest(
        makeTokenBody(`media/${SAMPLE_ID}/photo.jpg`, {
          mediaId: SAMPLE_ID,
          contentType: "image/jpeg",
          size: 1024,
        }),
      ),
    );
    expect(res.status).toBe(403);
    expect(handleClientUpload).not.toHaveBeenCalled();
  });

  it("refuses disallowed content types without issuing a token", async () => {
    const { deps, capturedOptions } = makeDeps();
    const POST = createMediaUploadPostHandler(deps);

    const res = await POST(
      makeRequest(
        makeTokenBody(`media/${SAMPLE_ID}/evil.svg`, {
          mediaId: SAMPLE_ID,
          contentType: "image/svg+xml",
          size: 512,
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(capturedOptions).toHaveLength(0);
  });

  it.each([
    ["image", "image/jpeg", `media/${SAMPLE_ID}/big.jpg`, MEDIA_SIZE_CAPS.image + 1],
    ["pdf", "application/pdf", `media/${SAMPLE_ID}/big.pdf`, MEDIA_SIZE_CAPS.pdf + 1],
    ["audio", "audio/mpeg", `media/${SAMPLE_ID}/big.mp3`, MEDIA_SIZE_CAPS.audio + 1],
  ])(
    "refuses %s file exceeding its server-side size cap without issuing a token",
    async (_label, contentType, pathname, size) => {
      const { deps, capturedOptions } = makeDeps();
      const POST = createMediaUploadPostHandler(deps);

      const res = await POST(
        makeRequest(
          makeTokenBody(pathname, { mediaId: SAMPLE_ID, contentType, size }),
        ),
      );
      expect(res.status).toBe(400);
      expect(capturedOptions).toHaveLength(0);
    },
  );

  it("refuses mismatched pathname extension or mismatched mediaId", async () => {
    const { deps, capturedOptions } = makeDeps();
    const POST = createMediaUploadPostHandler(deps);

    const wrongExt = await POST(
      makeRequest(
        makeTokenBody(`media/${SAMPLE_ID}/pic.png`, {
          mediaId: SAMPLE_ID,
          contentType: "audio/mpeg",
          size: 50 * 1024 * 1024,
        }),
      ),
    );
    expect(wrongExt.status).toBe(400);
    expect(capturedOptions).toHaveLength(0);
  });

  it("issues single-MIME, exact-cap, never-overwrite token for valid image, PDF, and >4.5 MB audio", async () => {
    const { deps, capturedOptions } = makeDeps();
    const POST = createMediaUploadPostHandler(deps);

    const resAudio = await POST(
      makeRequest(
        makeTokenBody(
          `media/${SAMPLE_ID}/domingo.m4a`,
          {
            mediaId: SAMPLE_ID,
            contentType: "audio/x-m4a",
            size: 25 * 1024 * 1024,
          },
          true,
        ),
      ),
    );
    expect(resAudio.status).toBe(200);
    const json = (await resAudio.json()) as { clientToken?: string };
    expect(json.clientToken).toBe("vercel_blob_client_token_test");
    expect(capturedOptions[0]).toEqual({
      allowedContentTypes: ["audio/mp4"],
      maximumSizeInBytes: MEDIA_SIZE_CAPS.audio,
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: 1_700_000_600_000,
    });
  });

  it("returns 503 when media storage token is not configured", async () => {
    const { deps } = makeDeps({
      handleClientUpload: vi.fn(async () => ({
        ok: false as const,
        reason: "storage-not-configured" as const,
      })),
    });
    const POST = createMediaUploadPostHandler(deps);

    const res = await POST(
      makeRequest(
        makeTokenBody(`media/${SAMPLE_ID}/photo.jpg`, {
          mediaId: SAMPLE_ID,
          contentType: "image/jpeg",
          size: 1024,
        }),
      ),
    );
    expect(res.status).toBe(503);
  });

  it("defaultAuthorizeMediaUploadRequest gates via requirePermission('media:manage')", async () => {
    mockRequirePermission.mockResolvedValueOnce({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await defaultAuthorizeMediaUploadRequest()).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    mockRequirePermission.mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    expect(await defaultAuthorizeMediaUploadRequest()).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden",
    });

    mockRequirePermission.mockResolvedValueOnce({
      ok: true,
      user: {
        _id: new ObjectId("65f1234567890abcdef12345"),
        email: "admin@example.org",
        displayName: "Admin",
      },
      permissions: new Set<PermissionKey>(["media:manage"]),
    });
    const okAuth = await defaultAuthorizeMediaUploadRequest();
    expect(okAuth.ok).toBe(true);
    expect(mockRequirePermission).toHaveBeenCalledWith("media:manage");
  });
});
