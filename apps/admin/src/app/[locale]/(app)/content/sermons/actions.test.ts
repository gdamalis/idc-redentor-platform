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
  };
});

import { PDF_WORKER_CALLER } from "@src/service/content/sermons/sermon-hash.service";
import {
  confirmSermonPublishAction,
  discardSermonChangesAction,
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
