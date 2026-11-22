import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const {
  mockRequireActionPermission,
  mockRevalidatePath,
  mockGetContentByNaturalKey,
  mockCreateContent,
  mockListContent,
} = vi.hoisted(() => ({
  mockRequireActionPermission: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetContentByNaturalKey: vi.fn(),
  mockCreateContent: vi.fn(),
  mockListContent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: mockRequireActionPermission,
}));

vi.mock("@src/service/content/content-core.service", () => ({
  createContent: mockCreateContent,
  saveDraft: vi.fn(),
  getContentById: vi.fn(),
  getContentByNaturalKey: mockGetContentByNaturalKey,
  listContent: mockListContent,
  publishContent: vi.fn(),
  discardChanges: vi.fn(),
  unpublishContent: vi.fn(),
  deleteContent: vi.fn(),
  retryRevalidation: vi.fn(),
  findContentUsages: vi.fn(),
}));

import {
  createOrReuseBibleVerseAction,
  searchContentEntriesAction,
} from "./actions";

function authorizedWith(perms: PermissionKey[]) {
  return {
    ok: true as const,
    user: {
      _id: new ObjectId("65f1234567890abcdef12345"),
      email: "admin@example.org",
      displayName: "Admin",
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

describe("Shared content Server Actions (Checkpoint 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses searchContentEntriesAction when caller lacks content:read", async () => {
    mockRequireActionPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });

    const res = await searchContentEntriesAction({ collection: "authors" });
    expect(res).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    });
    expect(mockListContent).not.toHaveBeenCalled();
  });

  it("filters authors/posts/sermons in searchContentEntriesAction and honors excludeId", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read"]),
    );
    mockListContent.mockResolvedValue({
      ok: true,
      total: 2,
      items: [
        {
          doc: {
            _id: "p1",
            draft: { title: { "es-AR": "Gracia" }, slug: "gracia" },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "u1",
          },
          status: "published",
        },
        {
          doc: {
            _id: "p2",
            draft: { title: { "es-AR": "Esperanza" }, slug: "esperanza" },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "u1",
          },
          status: "draft",
        },
      ],
    });

    const res = await searchContentEntriesAction({
      collection: "posts",
      query: "esper",
      excludeId: "p1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({
        id: "p2",
        label: "Esperanza",
        status: "draft",
      });
    }
  });

  it("reuses an existing Bible verse with matching version-scoped natural key without creating a duplicate", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read", "content:write"]),
    );
    const existingFields = {
      book: { "es-AR": "Juan", "en-US": "John" },
      chapter: 3,
      fromVerse: 16,
      version: { "es-AR": "RVR1960", "en-US": "KJV" },
      text: { "es-AR": "Porque de tal manera..." },
    };
    mockGetContentByNaturalKey.mockResolvedValue({
      ok: true,
      status: "published",
      doc: {
        _id: "v1",
        draft: existingFields,
        revision: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });

    const res = await createOrReuseBibleVerseAction({ draft: existingFields });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.reused).toBe(true);
      expect(res.verse.id).toBe("v1");
    }
    expect(mockCreateContent).not.toHaveBeenCalled();
  });
});
