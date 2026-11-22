import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const {
  mockRequireActionPermission,
  mockRevalidatePath,
  mockGetContentByNaturalKey,
  mockGetContentById,
  mockCreateContent,
  mockSaveDraft,
  mockListContent,
  mockPublishContent,
  mockDiscardChanges,
  mockUnpublishContent,
  mockDeleteContent,
  mockRetryRevalidation,
  mockFindContentUsages,
} = vi.hoisted(() => ({
  mockRequireActionPermission: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetContentByNaturalKey: vi.fn(),
  mockGetContentById: vi.fn(),
  mockCreateContent: vi.fn(),
  mockSaveDraft: vi.fn(),
  mockListContent: vi.fn(),
  mockPublishContent: vi.fn(),
  mockDiscardChanges: vi.fn(),
  mockUnpublishContent: vi.fn(),
  mockDeleteContent: vi.fn(),
  mockRetryRevalidation: vi.fn(),
  mockFindContentUsages: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: mockRequireActionPermission,
}));

vi.mock("@src/service/content/content-core.service", () => ({
  createContent: mockCreateContent,
  saveDraft: mockSaveDraft,
  getContentById: mockGetContentById,
  getContentByNaturalKey: mockGetContentByNaturalKey,
  listContent: mockListContent,
  publishContent: mockPublishContent,
  discardChanges: mockDiscardChanges,
  unpublishContent: mockUnpublishContent,
  deleteContent: mockDeleteContent,
  retryRevalidation: mockRetryRevalidation,
  findContentUsages: mockFindContentUsages,
}));

import {
  checkContentUsagesAction,
  confirmPublishAction,
  createContentAction,
  createOrReuseBibleVerseAction,
  deleteContentAction,
  discardChangesAction,
  preparePublishAction,
  retryRevalidationAction,
  saveDraftAction,
  searchContentEntriesAction,
  unpublishContentAction,
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

  it("refuses every core content Server Action when requireActionPermission denies access (C2)", async () => {
    mockRequireActionPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });

    const id = "65f1234567890abcdef12345";
    expect(
      await createContentAction({
        collection: "posts",
        draft: { title: { "es-AR": "Hola" } },
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });
    expect(
      await saveDraftAction({
        collection: "posts",
        docId: id,
        patch: { title: { "es-AR": "Hola" } },
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });
    expect(
      await preparePublishAction({
        collection: "posts",
        docId: id,
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });
    expect(
      await confirmPublishAction({
        collection: "posts",
        docId: id,
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });
    expect(
      await discardChangesAction({
        collection: "posts",
        docId: id,
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });
    expect(
      await unpublishContentAction({
        collection: "posts",
        docId: id,
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });
    expect(
      await deleteContentAction({
        collection: "posts",
        docId: id,
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });
    expect(
      await retryRevalidationAction({
        collection: "posts",
        docId: id,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });
    expect(
      await checkContentUsagesAction({
        collection: "bible_verses",
        docId: id,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    });

    expect(mockCreateContent).not.toHaveBeenCalled();
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockGetContentById).not.toHaveBeenCalled();
    expect(mockPublishContent).not.toHaveBeenCalled();
    expect(mockDiscardChanges).not.toHaveBeenCalled();
    expect(mockUnpublishContent).not.toHaveBeenCalled();
    expect(mockDeleteContent).not.toHaveBeenCalled();
    expect(mockRetryRevalidation).not.toHaveBeenCalled();
    expect(mockFindContentUsages).not.toHaveBeenCalled();
  });

  it("refuses preparePublishAction on protected entries without content:publish-protected (C2)", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read", "content:write", "content:publish"]),
    );
    mockGetContentById.mockResolvedValue({
      ok: true,
      status: "draft",
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: {
          name: { "es-AR": "Política de privacidad" },
          slug: { "es-AR": "privacidad" },
          protected: true,
        },
        revision: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
    });

    const res = await preparePublishAction({
      collection: "topics",
      docId: "65f1234567890abcdef12345",
      expectedRevision: 2,
    });
    expect(res).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
  });

  it("returns conflict from clean preparePublishAction when revision drifted without overwrite (C2)", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read", "content:write", "content:publish"]),
    );
    const updatedAt = new Date("2026-11-22T05:00:00.000Z");
    mockGetContentById.mockResolvedValue({
      ok: true,
      status: "draft",
      updatedByLabel: "María",
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: {
          book: { "es-AR": "Juan" },
          chapter: 3,
          fromVerse: 16,
          version: { "es-AR": "NVI" },
          text: { "es-AR": "Texto" },
        },
        revision: 5,
        createdAt: new Date(),
        updatedAt,
        updatedBy: "u2",
      },
    });

    const res = await preparePublishAction({
      collection: "bible_verses",
      docId: "65f1234567890abcdef12345",
      expectedRevision: 2,
    });
    expect(res).toEqual({
      ok: false,
      reason: "conflict",
      updatedBy: "u2",
      updatedByLabel: "María",
      updatedAt: updatedAt.toISOString(),
      currentRevision: 5,
    });
  });

  it("saves draft and returns savedDoc + fieldErrors on strict publish failure, and populates willCascade on valid publish (C2)", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read", "content:write", "content:publish"]),
    );

    // 1. Strict publish check failure still preserves savedDoc
    const invalidVerseDoc = {
      _id: "65f1234567890abcdef12345",
      draft: {
        book: { "es-AR": "Juan" },
        chapter: 3,
        fromVerse: 16,
        version: { "es-AR": "NVI" },
        text: { "es-AR": "" },
      },
      revision: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "u1",
    };
    mockSaveDraft.mockResolvedValueOnce({
      ok: true,
      doc: invalidVerseDoc,
      status: "draft",
      changedFields: ["text"],
      noOp: false,
      updatedByLabel: "Admin",
    });

    const invalidRes = await preparePublishAction({
      collection: "bible_verses",
      docId: invalidVerseDoc._id,
      draftPatch: { text: { "es-AR": "" } },
      expectedRevision: 2,
    });
    expect(invalidRes.ok).toBe(false);
    if (!invalidRes.ok && invalidRes.reason === "invalid") {
      expect("savedDoc" in invalidRes && invalidRes.savedDoc?._id).toBe(
        invalidVerseDoc._id,
      );
      expect("savedDoc" in invalidRes && invalidRes.savedDoc?.revision).toBe(3);
      expect(Object.keys(invalidRes.fieldErrors).length).toBeGreaterThan(0);
    }

    // 2. Valid publish resolves never-published referenced author into willCascade
    const validPostDoc = {
      _id: "65f1234567890abcdef99999",
      draft: {
        slug: "gracia",
        title: { "es-AR": "Gracia" },
        subtitle: { "es-AR": "Reflexión" },
        category: "Community",
        featuredImageId: "65f1234567890abcdef22222",
        content: {
          "es-AR": {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Contenido del artículo" }],
              },
            ],
          },
        },
        authorId: "65f1234567890abcdef11111",
        publishedDate: "2026-11-22",
        seoTitle: { "es-AR": "Gracia" },
        seoDescription: { "es-AR": "Resumen SEO" },
        keywords: { "es-AR": ["gracia"] },
        relatedPostIds: [],
      },
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "u1",
    };
    mockGetContentById
      .mockResolvedValueOnce({
        ok: true,
        doc: validPostDoc,
        status: "draft",
        updatedByLabel: "Admin",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "draft",
        doc: {
          _id: "65f1234567890abcdef11111",
          draft: { name: "Pastor Juan" },
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: "u1",
        },
      });

    const validRes = await preparePublishAction({
      collection: "posts",
      docId: validPostDoc._id,
      expectedRevision: 1,
    });
    expect(validRes.ok).toBe(true);
    if (validRes.ok) {
      expect(validRes.isFirstPublish).toBe(true);
      expect(validRes.willCascade).toEqual([
        {
          collection: "authors",
          docId: "65f1234567890abcdef11111",
          label: "Pastor Juan",
        },
      ]);
    }
  });

  it("forwards notify and approvedConfirmed in confirmPublishAction (C2)", async () => {
    mockRequireActionPermission.mockResolvedValue(
      authorizedWith(["content:read", "content:write", "content:publish"]),
    );
    mockPublishContent.mockResolvedValue({
      ok: true,
      doc: {
        _id: "65f1234567890abcdef12345",
        draft: { title: { "es-AR": "Prédica" } },
        published: { title: { "es-AR": "Prédica" } },
        revision: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
        firstPublishedAt: new Date(),
        updatedBy: "u1",
      },
      status: "published",
      revalidated: true,
      notified: true,
      updatedByLabel: "Admin",
    });

    const res = await confirmPublishAction({
      collection: "sermons",
      docId: "65f1234567890abcdef12345",
      expectedRevision: 3,
      notify: true,
      approvedConfirmed: true,
    });
    expect(res.ok).toBe(true);
    expect(mockPublishContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        collection: "sermons",
        docId: "65f1234567890abcdef12345",
        expectedRevision: 3,
        notify: true,
        approvedConfirmed: true,
      }),
    );
  });
});
