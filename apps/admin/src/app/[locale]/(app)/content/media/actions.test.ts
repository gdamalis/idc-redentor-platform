import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const {
  mockGetSessionPermissions,
  mockRequireActionPermission,
  mockListMedia,
  mockGetMediaByIds,
  mockGetMediaUsages,
  mockPrepareMediaUpload,
  mockConfirmMediaUpload,
  mockUpdateMediaDetails,
  mockDeleteMedia,
  mockRevalidatePath,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetSessionPermissions: vi.fn(),
  mockRequireActionPermission: vi.fn(),
  mockListMedia: vi.fn(),
  mockGetMediaByIds: vi.fn(),
  mockGetMediaUsages: vi.fn(),
  mockPrepareMediaUpload: vi.fn(),
  mockConfirmMediaUpload: vi.fn(),
  mockUpdateMediaDetails: vi.fn(),
  mockDeleteMedia: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-pathname": "/es-AR/content/media" })),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "es-AR"),
}));
vi.mock("@src/i18n/routing", () => ({ redirect: mockRedirect }));
vi.mock("@src/lib/rbac/require-permission", () => ({
  getSessionPermissions: mockGetSessionPermissions,
}));
vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: mockRequireActionPermission,
}));
vi.mock("@src/service/media/media.service", () => ({
  listMedia: mockListMedia,
  getMediaByIds: mockGetMediaByIds,
  getMediaUsages: mockGetMediaUsages,
  prepareMediaUpload: mockPrepareMediaUpload,
  confirmMediaUpload: mockConfirmMediaUpload,
  updateMediaDetails: mockUpdateMediaDetails,
  deleteMedia: mockDeleteMedia,
}));

import {
  confirmMediaUploadAction,
  deleteMediaAction,
  getMediaByIdsAction,
  getMediaUsagesAction,
  listMediaAction,
  prepareMediaUploadAction,
  updateMediaDetailsAction,
} from "./actions";

function makeAuthz(perms: PermissionKey[]) {
  return {
    ok: true as const,
    user: {
      _id: new ObjectId("65f1234567890abcdef12345"),
      email: "editor@example.org",
      displayName: "Editor",
    },
    permissions: new Set<PermissionKey>(perms),
  };
}

const SAMPLE_MEDIA = {
  _id: "507f1f77bcf86cd799439011",
  pathname: "media/507f1f77bcf86cd799439011/foto.jpg",
  url: "https://abc.public.blob.vercel-storage.com/media/507f1f77bcf86cd799439011/foto.jpg",
  filename: "foto.jpg",
  contentType: "image/jpeg",
  size: 12000,
  sha256: "a".repeat(64),
  width: 800,
  height: 600,
  title: { "es-AR": "Foto" },
  alt: { "es-AR": "Descripción" },
  createdBy: "65f1234567890abcdef12345",
  createdAt: new Date("2026-11-22T08:00:00.000Z"),
};

describe("content/media/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows content:write-only user to list and resolve media for picking (AC6), while refusing upload/delete", async () => {
    mockGetSessionPermissions.mockResolvedValue(makeAuthz(["content:write"]));
    mockListMedia.mockResolvedValue({
      ok: true,
      items: [SAMPLE_MEDIA],
      total: 1,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });
    mockGetMediaByIds.mockResolvedValue({ ok: true, items: [SAMPLE_MEDIA] });

    const listed = await listMediaAction({ kind: "image" });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.items[0]?.createdAt).toBe("2026-11-22T08:00:00.000Z");
    }

    const batch = await getMediaByIdsAction([SAMPLE_MEDIA._id]);
    expect(batch.ok).toBe(true);

    mockRequireActionPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });
    const prep = await prepareMediaUploadAction({
      filename: "foto.jpg",
      contentType: "image/jpeg",
      size: 1000,
      sha256: "a".repeat(64),
    });
    expect(prep).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    });

    const del = await deleteMediaAction(SAMPLE_MEDIA._id);
    expect(del).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    });
  });

  it("redirects unauthenticated sessions in local multi-permission gate", async () => {
    mockGetSessionPermissions.mockResolvedValue({
      ok: false,
      reason: "unauthenticated",
    });
    await expect(listMediaAction({})).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        href: {
          pathname: "/login",
          query: { callbackUrl: "/es-AR/content/media" },
        },
        locale: "es-AR",
      }),
    );
  });

  it("permits media:manage-only user to inspect usages, confirm upload, edit metadata, and delete with revalidation", async () => {
    mockGetSessionPermissions.mockResolvedValue(makeAuthz(["media:manage"]));
    mockRequireActionPermission.mockResolvedValue(makeAuthz(["media:manage"]));
    mockGetMediaUsages.mockResolvedValue({ ok: true, usedBy: [] });
    mockConfirmMediaUpload.mockResolvedValue({ ok: true, doc: SAMPLE_MEDIA });
    mockUpdateMediaDetails.mockResolvedValue({ ok: true, doc: SAMPLE_MEDIA });
    mockDeleteMedia.mockResolvedValue({
      ok: true,
      docId: SAMPLE_MEDIA._id,
      blobDeleted: true,
    });

    const usages = await getMediaUsagesAction(SAMPLE_MEDIA._id);
    expect(usages).toEqual({ ok: true, usedBy: [] });

    const confirmed = await confirmMediaUploadAction({
      mediaId: SAMPLE_MEDIA._id,
      pathname: SAMPLE_MEDIA.pathname,
      url: SAMPLE_MEDIA.url,
      filename: SAMPLE_MEDIA.filename,
      sha256: SAMPLE_MEDIA.sha256,
      width: 800,
      height: 600,
      title: SAMPLE_MEDIA.title,
      alt: SAMPLE_MEDIA.alt,
    });
    expect(confirmed.ok).toBe(true);

    const updated = await updateMediaDetailsAction({
      mediaId: SAMPLE_MEDIA._id,
      patch: { title: { "es-AR": "Foto actualizada" } },
    });
    expect(updated.ok).toBe(true);

    const deleted = await deleteMediaAction(SAMPLE_MEDIA._id);
    expect(deleted).toEqual({
      ok: true,
      docId: SAMPLE_MEDIA._id,
      blobDeleted: true,
    });
    expect(mockRevalidatePath).toHaveBeenCalledTimes(3);
  });
});
