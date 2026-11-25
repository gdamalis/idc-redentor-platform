import type { Collection, Db } from "mongodb";
import { getContentDb } from "@src/service/database.service";

/**
 * Dedicated queue collection in `website*` DB (`ICR-200` AC7):
 * completely isolated from `apps/web`'s live legacy `pdf_jobs` collection
 * (which carries a non-partial unique `{ entryId: 1 }` index and unfiltered
 * `selectRenderableJobs()` query).
 */
export const CONTENT_PDF_JOBS_COLLECTION = "content_pdf_jobs";

/** How long a `"rendering"` lock is honored before being treated as abandoned. */
export const STALE_PDF_LOCK_MS = 5 * 60 * 1000;

export interface ContentPdfJob {
  /** MongoDB sermon `_id` 24-hex string — UNIQUE key (`{ sermonId: 1 }`). */
  readonly sermonId: string;
  /** Timestamp of the latest dirty mark (save or manual Regenerar). */
  readonly dirtyAt: Date;
  /** Canonical TipTap sermon content hash (`computeTipTapSermonContentHash`). */
  readonly contentHash: string;
  /** Hash of the last successful render (absent before first render). */
  readonly lastRenderedHash?: string;
  /** Monotonic counter bumped on manual Regenerar/Generar/Reintentar. */
  readonly forceGeneration: number;
  /** Value of `forceGeneration` at the last successful render. */
  readonly lastRenderedGeneration: number;
  /** Monotonic PDF version stamped in footer (`· v<N>`) & media title. Starts 0; first render -> 1. */
  readonly version: number;
  readonly status: "idle" | "rendering";
  readonly lockedAt?: Date;
  readonly lastRenderedAt?: Date;
  readonly lastError?: string;
  readonly lastFailedAt?: Date;
}

export type SermonPdfUiState = "ok" | "pending" | "failed" | "none";

export interface ContentPdfJobsDeps {
  readonly getContentDb: () => Db;
  readonly now: () => Date;
  readonly ensureIndexes?: (col: Collection<ContentPdfJob>) => Promise<void>;
}

const defaultDeps: ContentPdfJobsDeps = {
  getContentDb,
  now: () => new Date(),
};

let indexesPromise: Promise<void> | null = null;

export function ensureContentPdfJobIndexes(
  col: Collection<ContentPdfJob>,
): Promise<void> {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      col.createIndex({ sermonId: 1 }, { unique: true }),
      col.createIndex({ status: 1, dirtyAt: 1 }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesPromise = null;
        throw error;
      });
  }
  return indexesPromise;
}

export function resetContentPdfJobIndexesCacheForTest(): void {
  indexesPromise = null;
}

async function getJobsCollection(
  deps: ContentPdfJobsDeps,
): Promise<Collection<ContentPdfJob>> {
  const col = deps
    .getContentDb()
    .collection<ContentPdfJob>(CONTENT_PDF_JOBS_COLLECTION);
  const ensure = deps.ensureIndexes ?? ensureContentPdfJobIndexes;
  await ensure(col);
  return col;
}

function isLockStale(
  lockedAt: Date | undefined,
  now: Date,
  staleLockMs: number,
): boolean {
  if (!lockedAt) return true;
  return now.getTime() - lockedAt.getTime() >= staleLockMs;
}

/** True when the job still needs a render (hash changed or manual force requested). */
export function jobNeedsRender(
  job: Pick<
    ContentPdfJob,
    "contentHash" | "lastRenderedHash" | "forceGeneration" | "lastRenderedGeneration"
  >,
): boolean {
  return (
    job.contentHash !== job.lastRenderedHash ||
    (job.forceGeneration ?? 0) > (job.lastRenderedGeneration ?? 0)
  );
}

/**
 * Pure authoritative predicate for whether a job can be claimed & rendered now.
 * Form saves are discrete (no autosave debounce delay).
 */
export function isContentPdfJobRenderable(
  job: ContentPdfJob,
  now: Date,
  staleLockMs: number = STALE_PDF_LOCK_MS,
): boolean {
  if (!jobNeedsRender(job)) return false;
  if (job.status === "idle") return true;
  return isLockStale(job.lockedAt, now, staleLockMs);
}

/** Monotonic version bump; a missing/undefined version starts at 0. */
export function nextContentPdfVersion(
  job: Pick<ContentPdfJob, "version">,
): number {
  return (job.version ?? 0) + 1;
}

/**
 * Derives the exact 4-state UI status shown by `SermonPdfStatusCard` (`F` §2.10).
 */
export function deriveSermonPdfUiState(input: {
  readonly job: ContentPdfJob | null | undefined;
  readonly hasPdfForLocale: boolean;
}): SermonPdfUiState {
  const { job, hasPdfForLocale } = input;
  if (job) {
    if (job.status === "rendering") return "pending";
    if (jobNeedsRender(job)) {
      return job.lastError ? "failed" : "pending";
    }
  }
  return hasPdfForLocale ? "ok" : "none";
}

/**
 * Idempotent dirty-mark keyed by `{ sermonId }` (AC3):
 * - Normal save: updates `dirtyAt` and `contentHash` in place (one job per sermon),
 *   clearing any prior `lastError`.
 * - Manual `force: true` ("Regenerar" / "Generar" / "Reintentar"): also increments
 *   `forceGeneration` so an up-to-date hash still queues a fresh render.
 */
export async function markSermonPdfDirty(
  sermonId: string,
  contentHash: string,
  options: { readonly force?: boolean } = {},
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<boolean> {
  try {
    const col = await getJobsCollection(deps);
    const now = deps.now();

    if (options.force) {
      await col.updateOne(
        { sermonId },
        {
          $set: { dirtyAt: now, contentHash },
          $inc: { forceGeneration: 1 },
          $unset: { lastError: "", lastFailedAt: "" },
          $setOnInsert: {
            version: 0,
            status: "idle",
            lastRenderedGeneration: 0,
          },
        },
        { upsert: true },
      );
    } else {
      await col.updateOne(
        { sermonId },
        {
          $set: { dirtyAt: now, contentHash },
          $unset: { lastError: "", lastFailedAt: "" },
          $setOnInsert: {
            version: 0,
            status: "idle",
            forceGeneration: 0,
            lastRenderedGeneration: 0,
          },
        },
        { upsert: true },
      );
    }

    return true;
  } catch (error) {
    console.error(
      `[content/pdf-jobs] markSermonPdfDirty failed for ${sermonId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function getContentPdfJob(
  sermonId: string,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<ContentPdfJob | null> {
  const col = await getJobsCollection(deps);
  return col.findOne({ sermonId });
}

/**
 * Fetches candidate jobs needing render and filters via `isContentPdfJobRenderable`.
 * Ordered oldest `dirtyAt` first so queued jobs drain fairly.
 */
export async function selectRenderableContentPdfJobs(
  now: Date,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<ContentPdfJob[]> {
  const col = await getJobsCollection(deps);
  const candidates = await col
    .find({
      $or: [
        { $expr: { $ne: ["$contentHash", "$lastRenderedHash"] } },
        { $expr: { $gt: ["$forceGeneration", "$lastRenderedGeneration"] } },
      ],
    })
    .sort({ dirtyAt: 1 })
    .toArray();
  return candidates.filter((job) =>
    isContentPdfJobRenderable(job, now, STALE_PDF_LOCK_MS),
  );
}

/**
 * Atomic race-safe claim: acquires `status: "rendering"` + `lockedAt: now` ONLY
 * when the job still needs a render and is idle or has a stale lock.
 */
export async function claimContentPdfJob(
  sermonId: string,
  now: Date,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<ContentPdfJob | null> {
  const col = await getJobsCollection(deps);
  const staleBefore = new Date(now.getTime() - STALE_PDF_LOCK_MS);
  const result = await col.findOneAndUpdate(
    {
      sermonId,
      $and: [
        {
          $or: [
            { $expr: { $ne: ["$contentHash", "$lastRenderedHash"] } },
            { $expr: { $gt: ["$forceGeneration", "$lastRenderedGeneration"] } },
          ],
        },
        {
          $or: [
            { status: "idle" },
            { status: "rendering", lockedAt: { $lte: staleBefore } },
          ],
        },
      ],
    },
    { $set: { status: "rendering", lockedAt: now } },
    { returnDocument: "after" },
  );
  return result ?? null;
}

/** Marks a successful render: advances `lastRenderedHash`, `lastRenderedGeneration`, `version`, and releases lock. */
export async function completeContentPdfJob(
  sermonId: string,
  renderedHash: string,
  renderedGeneration: number,
  version: number,
  now: Date,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<void> {
  const col = await getJobsCollection(deps);
  await col.updateOne(
    { sermonId },
    {
      $set: {
        lastRenderedHash: renderedHash,
        lastRenderedGeneration: renderedGeneration,
        version,
        status: "idle",
        lastRenderedAt: now,
      },
      $unset: { lockedAt: "", lastError: "", lastFailedAt: "" },
    },
  );
}

/**
 * Releases a lock WITHOUT advancing `lastRenderedHash` / `version` — used when
 * a newer editor save arrived mid-render so the next tick immediately re-renders
 * the newer content (Edge Case #2).
 */
export async function releaseStaleContentPdfClaim(
  sermonId: string,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<void> {
  const col = await getJobsCollection(deps);
  await col.updateOne(
    { sermonId },
    {
      $set: { status: "idle" },
      $unset: { lockedAt: "" },
    },
  );
}

const MAX_ERROR_LEN = 500;

/** Records a render failure and releases the lock back to `"idle"`. */
export async function failContentPdfJob(
  sermonId: string,
  error: string,
  now: Date,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<void> {
  const col = await getJobsCollection(deps);
  const safeError = error.trim().slice(0, MAX_ERROR_LEN) || "Render failed";
  await col.updateOne(
    { sermonId },
    {
      $set: { status: "idle", lastError: safeError, lastFailedAt: now },
      $unset: { lockedAt: "" },
    },
  );
}

/** Removes the job when the underlying sermon document no longer exists. */
export async function dropContentPdfJob(
  sermonId: string,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<void> {
  const col = await getJobsCollection(deps);
  await col.deleteOne({ sermonId });
}

/**
 * Re-synchronizes `content_pdf_jobs` after a sermon's draft changes are
 * discarded back to `published` (`ICR-200` C2):
 * - When the reverted draft already points at a valid Spanish PDF (`hasRevertedPdf`),
 *   align `contentHash`, `lastRenderedHash`, and `lastRenderedGeneration` to the
 *   reverted hash so the UI immediately reads `"ok"` and any later re-edit back
 *   to the discarded hash sees a real hash delta and regenerates.
 * - When no PDF exists on the reverted copy, align `contentHash` to `revertedHash`
 *   so the next render reflects the reverted text.
 */
export async function syncContentPdfJobOnDiscard(
  sermonId: string,
  revertedHash: string,
  hasRevertedPdf: boolean,
  deps: ContentPdfJobsDeps = defaultDeps,
): Promise<void> {
  const col = await getJobsCollection(deps);
  const existing = await col.findOne({ sermonId });
  if (!existing) return;

  if (hasRevertedPdf) {
    await col.updateOne(
      { sermonId },
      {
        $set: {
          contentHash: revertedHash,
          lastRenderedHash: revertedHash,
          lastRenderedGeneration: existing.forceGeneration ?? 0,
        },
        $unset: { lastError: "", lastFailedAt: "" },
      },
    );
  } else {
    await col.updateOne(
      { sermonId },
      {
        $set: {
          contentHash: revertedHash,
        },
        $unset: { lastError: "", lastFailedAt: "" },
      },
    );
  }
}
