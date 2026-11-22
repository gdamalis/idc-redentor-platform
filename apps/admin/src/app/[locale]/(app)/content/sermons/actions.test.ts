// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentDoc, SermonFields } from "@idcr/content";

const revalidatePathMock = vi.fn();
const requireActionPermissionMock = vi.fn();
const getByIdMock = vi.fn();
const createMock = vi.fn();
const saveDraftMock = vi.fn();
const publishMock = vi.fn();
const discardChangesMock = vi.fn();
const getContentByIdMock = vi.fn();
const deleteMediaMock = vi.fn();
const getMediaByIdsMock = vi.fn();
const computeHashMock = vi.fn();
const markDirtyMock = vi.fn();
const getJobMock = vi.fn();
const syncOnDiscardMock = vi.fn();
const checkSlugConflictMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: (...args: unknown[]) =>
    requireActionPermissionMock(...args),
}));

vi.mock("@src/service/content", () => ({
  getContentById: (...args: unknown[]) => getContentByIdMock(...args),
  authorService: { getById: vi.fn() },
  bibleVerseService: { getById: vi.fn() },
  sermonService: {
    getById: (...args: unknown[]) => getByIdMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    saveDraft: (...args: unknown[]) => saveDraftMock(...args),
    publish: (...args: unknown[]) => publishMock(...args),
    discardChanges: (...args: unknown[]) => discardChangesMock(...args),
  },
}));

vi.mock("@src/service/media", () => ({
  deleteMedia: (...args: unknown[]) => deleteMediaMock(...args),
  getMediaByIds: (...args: unknown[]) => getMediaByIdsMock(...args),
}));

vi.mock("@src/service/content/sermons/sermon-hash.service", async () => {
  const actual = await vi.importActual<
    typeof import("@src/service/content/sermons/sermon-hash.service")
  >("@src/service/content/sermons/sermon-hash.service");
  return {
    ...actual,
    computeSermonHashForSnapshot: (...args: unknown[]) =>
      computeHashMock(...args),
  };
});

vi.mock("@src/service/content/sermons/pdf-jobs.service", async () => {
  const actual = await vi.importActual<
    typeof import("@src/service/content/sermons/pdf-jobs.service")
  >("@src/service/content/sermons/pdf-jobs.service");
  return {
    ...actual,
    markSermonPdfDirty: (...args: unknown[]) => markDirtyMock(...args),
    getContentPdfJob: (...args: unknown[]) => getJobMock(...args),
    syncContentPdfJobOnDiscard: (...args: unknown[]) =>
      syncOnDiscardMock(...args),
  };
});

vi.mock("@src/service/content/sermons/sermon-slug.service", () => ({
  checkSermonSlugConflict: (...args: unknown[]) =>
    checkSlugConflictMock(...args),
}));

import { PDF_WORKER_CALLER } from "@src/service/content/sermons/sermon-hash.service";
import {
  confirmSermonPublishAction,
  createSermonAction,
  discardSermonChangesAction,
  getSermonPdfStatusAction,
  prepareSermonPublishAction,
  requestSermonPdfRegenAction,
  saveSermonDraftAction,
} from "./actions";

const AUTHZ_OK = {
  ok: true as const,
  user: {
    _id: { toHexString: () => "65f0000000000000000000aa" },
    email: "pastor@example.org",
    displayName: "Pastor Juan",
  },
  permissions: new Set(["content:read", "content:write", "content:publish"]),
};

function makeSermon(
  draftOverrides: Partial<SermonFields> = {},
  publishedOverrides?: Partial<SermonFields>,
): ContentDoc<SermonFields> {
  const draft: SermonFields = {
    slug: "la-gracia",
    title: { "es-AR": "La gracia" },
    contentHash: "hash-v1",
    pdfSummaryMediaId: { "es-AR": "pdf-v1" },
    ...draftOverrides,
  };
  return {
    _id: "65f000000000000000000001",
    draft,
    ...(publishedOverrides !== undefined && {
      published: { ...draft, ...publishedOverrides },
    }),
    revision: 2,
    createdAt: new Date("2026-11-20T00:00:00Z"),
    updatedAt: new Date("2026-11-22T10:00:00Z"),
    updatedBy: "65f0000000000000000000aa",
  };
}

describe("sermons/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActionPermissionMock.mockResolvedValue(AUTHZ_OK);
    markDirtyMock.mockResolvedValue(true);
    getJobMock.mockResolvedValue(null);
    syncOnDiscardMock.mockResolvedValue(undefined);
    checkSlugConflictMock.mockResolvedValue(null);
    getMediaByIdsMock.mockResolvedValue({ ok: true, items: [] });
    deleteMediaMock.mockResolvedValue({
      ok: true,
      docId: "x",
      blobDeleted: true,
    });
  });

  it("enqueues exactly one pending PDF job when contentHash changes, and none when unchanged (AC3)", async () => {
    const existing = makeSermon();
    getByIdMock.mockResolvedValue({ ok: true, doc: existing, status: "draft" });

    // Non-PDF edit (seoTitle only) -> hash stays hash-v1 -> zero PDF jobs created
    computeHashMock.mockResolvedValue({
      contentHash: "hash-v1",
      resolved: { authorsById: new Map(), versesById: new Map() },
    });
    saveDraftMock.mockResolvedValue({
      ok: true,
      doc: makeSermon({ seoTitle: { "es-AR": "SEO" } }),
      status: "draft",
      changedFields: ["seoTitle"],
      noOp: false,
    });

    const nonPdfRes = await saveSermonDraftAction({
      collection: "sermons",
      docId: existing._id,
      patch: { seoTitle: { "es-AR": "SEO" } },
      expectedRevision: 2,
    });
    expect(nonPdfRes.ok).toBe(true);
    expect(markDirtyMock).not.toHaveBeenCalled();

    // PDF-relevant edit (title changed) -> hash changes to hash-v2 -> 1 pending job
    computeHashMock.mockResolvedValue({
      contentHash: "hash-v2",
      resolved: { authorsById: new Map(), versesById: new Map() },
    });
    saveDraftMock.mockResolvedValue({
      ok: true,
      doc: makeSermon({ title: { "es-AR": "Nuevo título" }, contentHash: "hash-v2" }),
      status: "draft",
      changedFields: ["title", "contentHash"],
      noOp: false,
    });

    const pdfRes = await saveSermonDraftAction({
      collection: "sermons",
      docId: existing._id,
      patch: { title: { "es-AR": "Nuevo título" } },
      expectedRevision: 2,
    });
    expect(pdfRes.ok).toBe(true);
    expect(markDirtyMock).toHaveBeenCalledTimes(1);
    expect(markDirtyMock).toHaveBeenCalledWith(existing._id, "hash-v2");
  });

  it("strips client-submitted pdfSummaryMediaId and contentHash so saves never revert worker PDFs (AC4)", async () => {
    const existing = makeSermon({ pdfSummaryMediaId: { "es-AR": "pdf-worker-v2" } });
    getByIdMock.mockResolvedValue({ ok: true, doc: existing, status: "draft" });
    computeHashMock.mockResolvedValue({
      contentHash: "hash-v1",
      resolved: { authorsById: new Map(), versesById: new Map() },
    });
    saveDraftMock.mockResolvedValue({
      ok: true,
      doc: existing,
      status: "draft",
      changedFields: ["seoTitle"],
      noOp: false,
    });

    await saveSermonDraftAction({
      collection: "sermons",
      docId: existing._id,
      patch: {
        seoTitle: { "es-AR": "SEO" },
        pdfSummaryMediaId: { "es-AR": "stale-pdf-v1" },
        contentHash: "spoofed-hash",
      },
      expectedRevision: 2,
    });

    const sentPatch = saveDraftMock.mock.calls[0]?.[1]?.patch as Record<
      string,
      unknown
    >;
    expect(sentPatch).not.toHaveProperty("pdfSummaryMediaId");
    expect(sentPatch).not.toHaveProperty("contentHash");
    expect(sentPatch).toEqual({ seoTitle: { "es-AR": "SEO" } });
  });

  it("cleans up old unreferenced published PDF on publish and old draft PDF on discard (AC6)", async () => {
    // Draft has pdf-v2, published still had pdf-v1
    const beforePublish = makeSermon(
      { pdfSummaryMediaId: { "es-AR": "pdf-v2" } },
      { pdfSummaryMediaId: { "es-AR": "pdf-v1" } },
    );
    const afterPublish = makeSermon(
      { pdfSummaryMediaId: { "es-AR": "pdf-v2" } },
      { pdfSummaryMediaId: { "es-AR": "pdf-v2" } },
    );

    getByIdMock.mockResolvedValue({
      ok: true,
      doc: beforePublish,
      status: "changed",
    });
    publishMock.mockResolvedValue({
      ok: true,
      doc: afterPublish,
      status: "published",
      revalidated: true,
      notified: false,
    });

    const pubRes = await confirmSermonPublishAction({
      collection: "sermons",
      docId: beforePublish._id,
      expectedRevision: 2,
    });
    expect(pubRes.ok).toBe(true);
    expect(deleteMediaMock).toHaveBeenCalledWith(PDF_WORKER_CALLER, "pdf-v1");
    expect(deleteMediaMock).not.toHaveBeenCalledWith(PDF_WORKER_CALLER, "pdf-v2");

    vi.clearAllMocks();
    requireActionPermissionMock.mockResolvedValue(AUTHZ_OK);

    // Discard reverts draft (pdf-v2) back to published (pdf-v1) -> pdf-v2 removed
    getByIdMock.mockResolvedValue({
      ok: true,
      doc: beforePublish,
      status: "changed",
    });
    discardChangesMock.mockResolvedValue({
      ok: true,
      doc: makeSermon(
        { pdfSummaryMediaId: { "es-AR": "pdf-v1" } },
        { pdfSummaryMediaId: { "es-AR": "pdf-v1" } },
      ),
      status: "published",
      noOp: false,
    });

    const discardRes = await discardSermonChangesAction({
      collection: "sermons",
      docId: beforePublish._id,
      expectedRevision: 2,
    });
    expect(discardRes.ok).toBe(true);
    expect(deleteMediaMock).toHaveBeenCalledWith(PDF_WORKER_CALLER, "pdf-v2");
    expect(deleteMediaMock).not.toHaveBeenCalledWith(PDF_WORKER_CALLER, "pdf-v1");
    expect(syncOnDiscardMock).toHaveBeenCalledWith(
      beforePublish._id,
      "hash-v1",
      true,
    );
  });

  it("never calls deleteMedia when republishing with unchanged PDF media IDs (AC6, M24)", async () => {
    const samePdf = makeSermon(
      { pdfSummaryMediaId: { "es-AR": "pdf-v1" } },
      { pdfSummaryMediaId: { "es-AR": "pdf-v1" } },
    );
    getByIdMock.mockResolvedValue({ ok: true, doc: samePdf, status: "changed" });
    publishMock.mockResolvedValue({
      ok: true,
      doc: samePdf,
      status: "published",
      revalidated: true,
      notified: false,
    });

    const res = await confirmSermonPublishAction({
      collection: "sermons",
      docId: samePdf._id,
      expectedRevision: 2,
    });
    expect(res.ok).toBe(true);
    expect(deleteMediaMock).not.toHaveBeenCalled();
  });

  it("blocks cross-snapshot slug collisions on create, saveDraft, preparePublish, and confirmPublish (C1)", async () => {
    const conflict = {
      ok: false as const,
      reason: "duplicate-key" as const,
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    };
    checkSlugConflictMock.mockResolvedValue(conflict);

    const createRes = await createSermonAction({
      collection: "sermons",
      draft: { slug: "la-gracia", title: { "es-AR": "Otro" } },
    });
    expect(createRes).toEqual(conflict);
    expect(createMock).not.toHaveBeenCalled();

    const existing = makeSermon({ slug: "slug-anterior" });
    getByIdMock.mockResolvedValue({ ok: true, doc: existing, status: "draft" });

    const saveRes = await saveSermonDraftAction({
      collection: "sermons",
      docId: existing._id,
      patch: { slug: "la-gracia" },
      expectedRevision: 2,
    });
    expect(saveRes).toEqual(conflict);
    expect(checkSlugConflictMock).toHaveBeenCalledWith("la-gracia", existing._id);
    expect(saveDraftMock).not.toHaveBeenCalled();

    const prepRes = await prepareSermonPublishAction({
      collection: "sermons",
      docId: existing._id,
      draftPatch: { slug: "la-gracia" },
      expectedRevision: 2,
    });
    expect(prepRes).toEqual(conflict);
    expect(saveDraftMock).not.toHaveBeenCalled();

    const confirmRes = await confirmSermonPublishAction({
      collection: "sermons",
      docId: existing._id,
      expectedRevision: 2,
    });
    expect(confirmRes).toEqual(conflict);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("strips whitespace-only mainPoints and keywords items so blank en-US rows never suppress Spanish fallback (C3)", async () => {
    const existing = makeSermon();
    getByIdMock.mockResolvedValue({ ok: true, doc: existing, status: "draft" });
    computeHashMock.mockResolvedValue({
      contentHash: "hash-v1",
      resolved: { authorsById: new Map(), versesById: new Map() },
    });
    saveDraftMock.mockResolvedValue({
      ok: true,
      doc: existing,
      status: "draft",
      changedFields: ["mainPoints", "keywords"],
      noOp: false,
    });

    await saveSermonDraftAction({
      collection: "sermons",
      docId: existing._id,
      patch: {
        mainPoints: { "es-AR": [" Punto 1 ", "   "], "en-US": ["", "  "] },
        keywords: { "es-AR": ["gracia", ""], "en-US": [""] },
      },
      expectedRevision: 2,
    });

    const sentPatch = saveDraftMock.mock.calls[0]?.[1]?.patch as Record<
      string,
      unknown
    >;
    expect(sentPatch.mainPoints).toEqual({ "es-AR": ["Punto 1"] });
    expect(sentPatch.keywords).toEqual({ "es-AR": ["gracia"] });
  });

  it("returns forbidden and invokes zero services across all 7 actions when permission is denied (M25)", async () => {
    requireActionPermissionMock.mockResolvedValue({ ok: false });

    expect(
      await createSermonAction({
        collection: "sermons",
        draft: { slug: "s", title: { "es-AR": "T" } },
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });

    expect(
      await saveSermonDraftAction({
        collection: "sermons",
        docId: "65f000000000000000000001",
        patch: { title: { "es-AR": "X" } },
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });

    expect(
      await prepareSermonPublishAction({
        collection: "sermons",
        docId: "65f000000000000000000001",
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });

    expect(
      await confirmSermonPublishAction({
        collection: "sermons",
        docId: "65f000000000000000000001",
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });

    expect(
      await discardSermonChangesAction({
        collection: "sermons",
        docId: "65f000000000000000000001",
        expectedRevision: 1,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });

    expect(
      await requestSermonPdfRegenAction({
        docId: "65f000000000000000000001",
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });

    expect(
      await getSermonPdfStatusAction({
        docId: "65f000000000000000000001",
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(getByIdMock).not.toHaveBeenCalled();
    expect(saveDraftMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
    expect(discardChangesMock).not.toHaveBeenCalled();
    expect(markDirtyMock).not.toHaveBeenCalled();
    expect(deleteMediaMock).not.toHaveBeenCalled();
  });

  it("forces regeneration on requestSermonPdfRegenAction even when hash matches", async () => {
    const existing = makeSermon();
    getByIdMock.mockResolvedValue({ ok: true, doc: existing, status: "draft" });
    computeHashMock.mockResolvedValue({
      contentHash: "hash-v1",
      resolved: { authorsById: new Map(), versesById: new Map() },
    });
    getJobMock.mockResolvedValue({
      sermonId: existing._id,
      dirtyAt: new Date(),
      contentHash: "hash-v1",
      lastRenderedHash: "hash-v1",
      forceGeneration: 1,
      lastRenderedGeneration: 0,
      version: 1,
      status: "idle",
    });

    const res = await requestSermonPdfRegenAction({ docId: existing._id });
    expect(res.ok).toBe(true);
    expect(markDirtyMock).toHaveBeenCalledWith(existing._id, "hash-v1", {
      force: true,
    });
    if (res.ok) {
      expect(res.pdfStatus.isPending).toBe(true);
    }
  });
});
