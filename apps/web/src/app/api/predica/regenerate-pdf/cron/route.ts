import { NextResponse } from "next/server";

import { getSermonById } from "@lib/contentful/getSermons";
import {
  claimJob,
  completeJob,
  dropJob,
  failJob,
  nextVersion,
  selectRenderableJobs,
} from "@src/service/predica/pdfJobs";
import type { PdfJob } from "@src/service/predica/pdfJobs";
import {
  deleteSupersededAsset,
  swapPdfSummary,
  uploadPdfAsset,
} from "@src/service/predica/contentfulWriteBack";
import { renderSermonPdfs } from "@src/service/predica/renderSermonPdf";
import type { Sermon } from "@src/types/Sermon";
import type { SupportedLocale } from "@src/utils/predica/helpers";
import { computeSermonContentHash } from "@src/utils/predica/regenContent";

/**
 * Debounced cron that renders + writes back edited sermon PDFs (ICR-114, CP7).
 *
 * Vercel invokes this every minute (see `vercel.json`'s `crons`) — cron invocations
 * only ever target the PRODUCTION deployment, never a preview
 * (see docs.vercel.com/docs/cron-jobs#how-cron-jobs-work), so this route can only
 * be exercised end-to-end after merge (QA must account for that).
 *
 * One job's Chromium render runs at a time (memory-heavy) and the tick is capped
 * at `MAX_PER_TICK` so one run never wedges the function past `maxDuration` — any
 * remainder is picked up by the next tick and surfaced as `deferred`, never silently
 * dropped.
 */
export const maxDuration = 60;

const MAX_PER_TICK = 3;
const LOCALES: SupportedLocale[] = ["es-AR", "en-US"];

interface CronSummary {
  processed: number;
  rendered: string[];
  skipped: string[];
  failed: string[];
  deferred: number;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const renderable = await selectRenderableJobs(now);
  const toProcess = renderable.slice(0, MAX_PER_TICK);
  const deferred = Math.max(renderable.length - toProcess.length, 0);

  const summary: CronSummary = { processed: 0, rendered: [], skipped: [], failed: [], deferred };

  // Sequential, not Promise.all — each job launches its own Chromium instance
  // (@sparticuz/chromium), which is memory-heavy enough that overlapping renders
  // risk exceeding the function's memory budget.
  for (const job of toProcess) {
    summary.processed += 1;
    await processJob(job, now, summary);
  }

  return NextResponse.json(summary, { status: 200 });
}

async function processJob(job: PdfJob, now: Date, summary: CronSummary): Promise<void> {
  const { entryId } = job;

  const claimed = await claimJob(entryId, now);
  if (!claimed) {
    // Another tick already won the race — not a failure, just nothing to do here.
    summary.skipped.push(entryId);
    return;
  }

  try {
    // No draft cookie in a cron invocation — pass `isDraftMode: true` explicitly so
    // both fetches read the DRAFT edit that made this job dirty.
    const [esAR, enUS] = await Promise.all([
      getSermonById(entryId, "es-AR", true),
      getSermonById(entryId, "en-US", true),
    ]);

    if (!esAR && !enUS) {
      // The entry vanished from Contentful entirely between the webhook and this
      // tick — drop the job rather than retry it forever.
      await dropJob(entryId);
      summary.skipped.push(entryId);
      return;
    }

    // Recomputed from the freshly-fetched draft (not the webhook's stale hash) so
    // `lastRenderedHash` reflects exactly what was rendered just now.
    const contentHash = computeSermonContentHash(esAR, enUS);
    const version = nextVersion(job);
    const pdfs = await renderSermonPdfs(esAR, enUS, version);

    const sermonsByLocale: Record<SupportedLocale, Sermon | undefined> = {
      "es-AR": esAR,
      "en-US": enUS,
    };

    for (const locale of LOCALES) {
      const sermon = sermonsByLocale[locale];
      if (!sermon) continue; // that locale isn't translated yet — nothing to swap

      const title = `${sermon.title} — PDF ${locale} · v${version}`;
      const fileName = `${sermon.slug}-${locale}-v${version}.pdf`;

      const uploadResult = await uploadPdfAsset({
        buffer: pdfs[locale],
        fileName,
        title,
        locale,
      });
      if (!uploadResult.ok) {
        throw new Error(`uploadPdfAsset(${locale}) failed: ${uploadResult.reason}`);
      }

      const swapResult = await swapPdfSummary({
        entryId,
        locale,
        assetId: uploadResult.assetId,
      });
      if (!swapResult.ok) {
        throw new Error(`swapPdfSummary(${locale}) failed: ${swapResult.reason}`);
      }

      // Swap-before-delete: the guard-referenced check in `deleteSupersededAsset`
      // must run AFTER the entry points at the new asset, so the old one reads as
      // unreferenced.
      if (swapResult.previousAssetId) {
        const deleteResult = await deleteSupersededAsset({
          assetId: swapResult.previousAssetId,
          exceptEntryId: entryId,
        });
        if (!deleteResult.ok) {
          throw new Error(`deleteSupersededAsset(${locale}) failed: ${deleteResult.reason}`);
        }
      }
    }

    await completeJob(entryId, contentHash, version, now);
    summary.rendered.push(entryId);
  } catch (error) {
    // Never leave a job wedged in "rendering" — release the lock and retry next tick.
    await failJob(entryId, error instanceof Error ? error.message : String(error), now);
    summary.failed.push(entryId);
  }
}
