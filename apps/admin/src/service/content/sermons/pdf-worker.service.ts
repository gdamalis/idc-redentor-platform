import type { Locale, Localized } from "@idcr/content";
import { sermonService } from "@src/service/content";
import { createServerMedia, deleteMedia } from "@src/service/media";
import {
  claimContentPdfJob,
  completeContentPdfJob,
  dropContentPdfJob,
  failContentPdfJob,
  nextContentPdfVersion,
  releaseStaleContentPdfClaim,
  selectRenderableContentPdfJobs,
  type ContentPdfJob,
} from "./pdf-jobs.service";
import { renderSermonPdfs } from "./render-sermon-pdf";
import {
  PDF_WORKER_CALLER,
  computeSermonHashForSnapshot,
} from "./sermon-hash.service";

/**
 * Maximum number of sermons rendered per worker invocation. Each render
 * launches a Chromium instance, so sequential execution capped at 3 keeps
 * peak memory and duration safely under `maxDuration = 60` (`ICR-114`/`200`).
 */
export const MAX_PDF_JOBS_PER_TICK = 3;

export interface PdfWorkerTickSummary {
  readonly processed: number;
  readonly rendered: string[];
  readonly skipped: string[];
  readonly failed: string[];
  readonly deferred: number;
}

export interface PdfWorkerDeps {
  readonly now: () => Date;
  readonly selectRenderableJobs: typeof selectRenderableContentPdfJobs;
  readonly claimJob: typeof claimContentPdfJob;
  readonly completeJob: typeof completeContentPdfJob;
  readonly releaseStaleClaim: typeof releaseStaleContentPdfClaim;
  readonly failJob: typeof failContentPdfJob;
  readonly dropJob: typeof dropContentPdfJob;
  readonly getSermonById: typeof sermonService.getById;
  readonly updateSermonPdfMedia: typeof sermonService.updatePdfMedia;
  readonly computeHash: typeof computeSermonHashForSnapshot;
  readonly renderPdfs: typeof renderSermonPdfs;
  readonly createServerMedia: typeof createServerMedia;
  readonly deleteMedia: typeof deleteMedia;
}

const defaultPdfWorkerDeps: PdfWorkerDeps = {
  now: () => new Date(),
  selectRenderableJobs: selectRenderableContentPdfJobs,
  claimJob: claimContentPdfJob,
  completeJob: completeContentPdfJob,
  releaseStaleClaim: releaseStaleContentPdfClaim,
  failJob: failContentPdfJob,
  dropJob: dropContentPdfJob,
  getSermonById: sermonService.getById,
  updateSermonPdfMedia: sermonService.updatePdfMedia,
  computeHash: computeSermonHashForSnapshot,
  renderPdfs: renderSermonPdfs,
  createServerMedia,
  deleteMedia,
};

async function bestEffortDeleteMediaIds(
  mediaIds: readonly string[],
  deps: PdfWorkerDeps,
  context: string,
): Promise<void> {
  for (const mediaId of mediaIds) {
    try {
      const res = await deps.deleteMedia(PDF_WORKER_CALLER, mediaId);
      if (!res.ok) {
        console.warn(`[pdf-worker] ${context}: skipped delete of ${mediaId}`, {
          reason: res.reason,
        });
      }
    } catch (error) {
      console.warn(`[pdf-worker] ${context}: delete failed for ${mediaId}:`, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function buildPdfMediaTitle(
  sermonTitle: Localized<string>,
  locale: Locale,
  version: number,
): Localized<string> {
  const esTitle = sermonTitle["es-AR"]?.trim() || "Prédica";
  if (locale === "es-AR") {
    return {
      "es-AR": `${esTitle} — PDF es-AR · v${version}`,
    };
  }
  const enTitle = sermonTitle["en-US"]?.trim() || esTitle;
  return {
    "es-AR": `${enTitle} — PDF en-US · v${version}`,
    "en-US": `${enTitle} — PDF en-US · v${version}`,
  };
}

async function processClaimedJob(
  job: ContentPdfJob,
  now: Date,
  summary: {
    rendered: string[];
    skipped: string[];
    failed: string[];
  },
  deps: PdfWorkerDeps,
): Promise<void> {
  const { sermonId } = job;
  const claimed = await deps.claimJob(sermonId, now);
  if (!claimed) {
    summary.skipped.push(sermonId);
    return;
  }

  const uploadedMediaIds: string[] = [];
  let swapped = false;

  try {
    const loaded = await deps.getSermonById(PDF_WORKER_CALLER, sermonId);
    if (!loaded.ok) {
      if (loaded.reason === "not-found") {
        await deps.dropJob(sermonId);
        summary.skipped.push(sermonId);
        return;
      }
      throw new Error(`getSermonById failed: ${loaded.reason}`);
    }

    const draft = loaded.doc.draft;
    const { contentHash: computedHash, resolved } = await deps.computeHash(
      PDF_WORKER_CALLER,
      draft,
    );
    // Use the sermon's persisted `draft.contentHash` as the optimistic swap
    // guard when present: if a referenced author's name or Bible verse was
    // edited after the sermon was saved, `computedHash` diverges from the
    // persisted hash even though the sermon draft itself did not change.
    // Swapping and completing against `expectedHash` renders the latest
    // dependency text without looping, while genuine mid-render sermon edits
    // (which advance `draft.contentHash` in MongoDB) are still caught as stale.
    const expectedHash = draft.contentHash ?? computedHash;
    const version = nextContentPdfVersion(claimed);
    const renderedBuffers = await deps.renderPdfs(draft, resolved, version);

    const slugBase = draft.slug?.trim() || sermonId;
    const esUpload = await deps.createServerMedia(PDF_WORKER_CALLER, {
      buffer: renderedBuffers["es-AR"],
      filename: `${slugBase}-es-AR-v${version}.pdf`,
      contentType: "application/pdf",
      title: buildPdfMediaTitle(draft.title, "es-AR", version),
      dedupeBySha256: false,
    });
    if (!esUpload.ok) {
      throw new Error(`createServerMedia(es-AR) failed: ${esUpload.reason}`);
    }
    uploadedMediaIds.push(esUpload.doc._id);

    let enMediaId: string | undefined;
    if (renderedBuffers["en-US"]) {
      const enUpload = await deps.createServerMedia(PDF_WORKER_CALLER, {
        buffer: renderedBuffers["en-US"],
        filename: `${slugBase}-en-US-v${version}.pdf`,
        contentType: "application/pdf",
        title: buildPdfMediaTitle(draft.title, "en-US", version),
        dedupeBySha256: false,
      });
      if (!enUpload.ok) {
        throw new Error(`createServerMedia(en-US) failed: ${enUpload.reason}`);
      }
      enMediaId = enUpload.doc._id;
      uploadedMediaIds.push(enMediaId);
    }

    const nextPdfMap: Localized<string> = {
      "es-AR": esUpload.doc._id,
      ...(enMediaId !== undefined && { "en-US": enMediaId }),
    };

    const swapResult = await deps.updateSermonPdfMedia(PDF_WORKER_CALLER, {
      docId: sermonId,
      pdfSummaryMediaId: nextPdfMap,
      expectedContentHash: expectedHash,
    });
    if (!swapResult.ok) {
      throw new Error(`updateSermonPdfMedia failed: ${swapResult.reason}`);
    }

    // Stale render: an editor saved newer text mid-render, so neither draft
    // nor published matched `expectedHash`. Delete the unattached uploads and
    // release the lock so the next tick renders the newer draft immediately.
    if (!swapResult.updatedDraft && !swapResult.updatedPublished) {
      await bestEffortDeleteMediaIds(
        uploadedMediaIds,
        deps,
        "stale-render-cleanup",
      );
      await deps.releaseStaleClaim(sermonId);
      summary.skipped.push(sermonId);
      return;
    }

    swapped = true;

    // Delete superseded PDFs that are NO LONGER referenced by either draft OR
    // published (`updateSermonPdfMedia` excludes anything still referenced by
    // published, and `deleteMedia` re-verifies `_refs.mediaIds` transactionally).
    if (swapResult.previousMediaIds.length > 0) {
      await bestEffortDeleteMediaIds(
        swapResult.previousMediaIds,
        deps,
        "superseded-pdf-cleanup",
      );
    }

    await deps.completeJob(
      sermonId,
      expectedHash,
      claimed.forceGeneration ?? 0,
      version,
      now,
    );
    summary.rendered.push(sermonId);
  } catch (error) {
    if (!swapped && uploadedMediaIds.length > 0) {
      await bestEffortDeleteMediaIds(
        uploadedMediaIds,
        deps,
        "failed-render-cleanup",
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pdf-worker] failed for sermon ${sermonId}: ${message}`);
    await deps.failJob(sermonId, message, now);
    summary.failed.push(sermonId);
  }
}

/**
 * Runs one sequential tick of the admin sermon PDF rebuild worker (`ICR-200`).
 */
export async function runPdfWorkerTick(
  deps: PdfWorkerDeps = defaultPdfWorkerDeps,
): Promise<PdfWorkerTickSummary> {
  const now = deps.now();
  const renderable = await deps.selectRenderableJobs(now);
  const toProcess = renderable.slice(0, MAX_PDF_JOBS_PER_TICK);
  const deferred = Math.max(renderable.length - toProcess.length, 0);

  const summary = {
    processed: 0,
    rendered: [] as string[],
    skipped: [] as string[],
    failed: [] as string[],
    deferred,
  };

  for (const job of toProcess) {
    summary.processed += 1;
    await processClaimedJob(job, now, summary, deps);
  }

  return summary;
}
