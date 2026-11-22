// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ContentDoc, MediaDoc, SermonFields } from "@idcr/content";
import type { ContentPdfJob } from "./pdf-jobs.service";
import {
  MAX_PDF_JOBS_PER_TICK,
  runPdfWorkerTick,
  type PdfWorkerDeps,
} from "./pdf-worker.service";
import { PDF_WORKER_CALLER } from "./sermon-hash.service";

function makeJob(overrides: Partial<ContentPdfJob> = {}): ContentPdfJob {
  return {
    sermonId: "65f000000000000000000001",
    dirtyAt: new Date("2026-11-22T12:00:00Z"),
    contentHash: "hash-new",
    forceGeneration: 0,
    lastRenderedGeneration: 0,
    version: 1,
    status: "idle",
    ...overrides,
  };
}

function makeSermonDoc(
  overrides: Partial<SermonFields> = {},
): ContentDoc<SermonFields> {
  return {
    _id: "65f000000000000000000001",
    draft: {
      slug: "la-gracia",
      title: { "es-AR": "La gracia", "en-US": "Grace" },
      sermonDate: "2026-11-15",
      contentHash: "hash-new",
      ...overrides,
    },
    revision: 3,
    createdAt: new Date("2026-11-20T00:00:00Z"),
    updatedAt: new Date("2026-11-22T12:00:00Z"),
    updatedBy: "user-1",
  };
}

function makeMediaDoc(id: string): MediaDoc {
  return {
    _id: id,
    pathname: `media/${id}/file.pdf`,
    url: `https://abc.public.blob.vercel-storage.com/media/${id}/file.pdf`,
    filename: "file.pdf",
    contentType: "application/pdf",
    size: 1024,
    sha256: "a".repeat(64),
    title: { "es-AR": "PDF" },
    createdBy: PDF_WORKER_CALLER.serviceId,
    createdAt: new Date("2026-11-22T12:00:00Z"),
  };
}

function createDeps(overrides: Partial<PdfWorkerDeps> = {}): PdfWorkerDeps {
  let mediaSeq = 0;
  return {
    now: () => new Date("2026-11-22T12:05:00Z"),
    selectRenderableJobs: vi.fn(async () => [makeJob()]),
    claimJob: vi.fn(async (id) => makeJob({ sermonId: id, status: "rendering" })),
    completeJob: vi.fn(async () => undefined),
    releaseStaleClaim: vi.fn(async () => undefined),
    failJob: vi.fn(async () => undefined),
    dropJob: vi.fn(async () => undefined),
    getSermonById: vi.fn(async () => ({
      ok: true as const,
      doc: makeSermonDoc(),
      status: "draft" as const,
    })),
    updateSermonPdfMedia: vi.fn(async () => ({
      ok: true as const,
      updatedDraft: true,
      updatedPublished: false,
      previousMediaIds: ["old-es-id"],
      revalidated: false,
    })),
    computeHash: vi.fn(async () => ({
      contentHash: "hash-new",
      resolved: { authorsById: new Map(), versesById: new Map() },
    })),
    renderPdfs: vi.fn(async () => ({
      "es-AR": Buffer.from("%PDF-es"),
      "en-US": Buffer.from("%PDF-en"),
    })),
    createServerMedia: vi.fn(async () => {
      mediaSeq += 1;
      return {
        ok: true as const,
        status: "created" as const,
        doc: makeMediaDoc(`new-media-${mediaSeq}`),
        reused: false as const,
      };
    }),
    deleteMedia: vi.fn(async (_caller, id) => ({
      ok: true as const,
      docId: id,
      blobDeleted: true,
    })),
    ...overrides,
  };
}

describe("pdf-worker.service", () => {
  it("renders bilingual PDFs, uploads via createServerMedia, swaps via updatePdfMedia, cleans up unreferenced old PDF, and completes job (AC4/AC6)", async () => {
    const deps = createDeps();
    const summary = await runPdfWorkerTick(deps);

    expect(summary).toEqual({
      processed: 1,
      rendered: ["65f000000000000000000001"],
      skipped: [],
      failed: [],
      deferred: 0,
    });

    expect(deps.createServerMedia).toHaveBeenCalledTimes(2);
    expect(deps.updateSermonPdfMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, {
      docId: "65f000000000000000000001",
      pdfSummaryMediaId: { "es-AR": "new-media-1", "en-US": "new-media-2" },
      expectedContentHash: "hash-new",
    });
    expect(deps.deleteMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, "old-es-id");
    expect(deps.completeJob).toHaveBeenCalledWith(
      "65f000000000000000000001",
      "hash-new",
      0,
      2,
      expect.any(Date),
    );
  });

  it("NEVER deletes a PDF still referenced by published snapshot (AC6)", async () => {
    // When draft swaps to v2 while published still holds v1, updateSermonPdfMedia
    // returns previousMediaIds: [] so v1 is never passed to deleteMedia.
    const deps = createDeps({
      updateSermonPdfMedia: vi.fn(async () => ({
        ok: true as const,
        updatedDraft: true,
        updatedPublished: false,
        previousMediaIds: [],
        revalidated: false,
      })),
    });

    const summary = await runPdfWorkerTick(deps);
    expect(summary.rendered).toEqual(["65f000000000000000000001"]);
    expect(deps.deleteMedia).not.toHaveBeenCalled();
  });

  it("carries finished PDF to published copy when hash matches (AC5)", async () => {
    const deps = createDeps({
      updateSermonPdfMedia: vi.fn(async () => ({
        ok: true as const,
        updatedDraft: true,
        updatedPublished: true,
        previousMediaIds: ["pub-old-es", "pub-old-en"],
        revalidated: true,
      })),
    });

    const summary = await runPdfWorkerTick(deps);
    expect(summary.rendered).toEqual(["65f000000000000000000001"]);
    expect(deps.deleteMedia).toHaveBeenCalledTimes(2);
    expect(deps.deleteMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, "pub-old-es");
    expect(deps.deleteMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, "pub-old-en");
  });

  it("cleans up unattached uploads and releases claim on stale mid-render edit (Edge Case #2)", async () => {
    const deps = createDeps({
      updateSermonPdfMedia: vi.fn(async () => ({
        ok: true as const,
        updatedDraft: false,
        updatedPublished: false,
        previousMediaIds: [],
        revalidated: false,
      })),
    });

    const summary = await runPdfWorkerTick(deps);
    expect(summary.skipped).toEqual(["65f000000000000000000001"]);
    expect(summary.rendered).toEqual([]);
    expect(deps.deleteMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, "new-media-1");
    expect(deps.deleteMedia).toHaveBeenCalledWith(PDF_WORKER_CALLER, "new-media-2");
    expect(deps.releaseStaleClaim).toHaveBeenCalledWith("65f000000000000000000001");
    expect(deps.completeJob).not.toHaveBeenCalled();
  });

  it("records render failure, cleans up partial uploads, and leaves previous PDF intact (Edge Case #12)", async () => {
    const deps = createDeps({
      renderPdfs: vi.fn(async () => {
        throw new Error("Chromium crashed");
      }),
    });

    const summary = await runPdfWorkerTick(deps);
    expect(summary.failed).toEqual(["65f000000000000000000001"]);
    expect(deps.failJob).toHaveBeenCalledWith(
      "65f000000000000000000001",
      "Chromium crashed",
      expect.any(Date),
    );
    expect(deps.updateSermonPdfMedia).not.toHaveBeenCalled();
    expect(deps.deleteMedia).not.toHaveBeenCalled();
  });

  it("drops job when sermon document was deleted and defers overflow past MAX_PDF_JOBS_PER_TICK", async () => {
    const jobs = Array.from({ length: MAX_PDF_JOBS_PER_TICK + 2 }, (_, idx) =>
      makeJob({ sermonId: `65f00000000000000000000${idx}` }),
    );
    const deps = createDeps({
      selectRenderableJobs: vi.fn(async () => jobs),
      getSermonById: vi.fn(async () => ({ ok: false as const, reason: "not-found" as const })),
    });

    const summary = await runPdfWorkerTick(deps);
    expect(summary.processed).toBe(MAX_PDF_JOBS_PER_TICK);
    expect(summary.deferred).toBe(2);
    expect(summary.skipped).toHaveLength(MAX_PDF_JOBS_PER_TICK);
    expect(deps.dropJob).toHaveBeenCalledTimes(MAX_PDF_JOBS_PER_TICK);
  });
});
