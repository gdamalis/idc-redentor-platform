#!/usr/bin/env tsx
/**
 * Mode-matched Data Parity CLI (`ICR-203` AC7).
 *
 * Compares every reader in `apps/web/lib/contentful/` against its twin in
 * `apps/web/lib/content/` across both locales (`es-AR`, `en-US`) and both
 * `published` and `draft` modes. Requests ZERO pages from any production site.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local --import tsx apps/web/scripts/verify-data-parity.ts \
 *     [--mode published|draft|both] [--report-dir /path/to/reports]
 */
import { mkdir, writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import type { ParityMode } from "../lib/content/parity";

/**
 * Standalone Node CLI shim for `next/cache`: `apps/web/lib/content/cache.ts` wraps
 * published readers in Next's `unstable_cache`, which requires Next's runtime
 * `incrementalCache` AsyncLocalStorage store. Pass through directly when running
 * the offline CLI against live MongoDB + Contentful.
 */
function installCliNextCacheShim(): void {
  const nextCacheShim = {
    unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
    revalidateTag: () => undefined,
    revalidatePath: () => undefined,
  };

  const mod = Module as unknown as {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  if (typeof mod._load === "function") {
    const origLoad = mod._load;
    mod._load = function patchedLoad(
      request: string,
      parent: unknown,
      isMain: boolean,
    ) {
      if (request === "next/cache") {
        return nextCacheShim;
      }
      return origLoad.call(this, request, parent, isMain);
    };
  }
}

function parseArgs(argv: readonly string[]): {
  readonly modes: readonly ParityMode[];
  readonly reportDir?: string;
} {
  let modeArg = "both";
  let reportDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode" && argv[i + 1]) {
      modeArg = argv[i + 1];
      i += 1;
    } else if (arg === "--report-dir" && argv[i + 1]) {
      reportDir = argv[i + 1];
      i += 1;
    }
  }

  const modes: readonly ParityMode[] =
    modeArg === "published"
      ? ["published"]
      : modeArg === "draft"
        ? ["draft"]
        : ["published", "draft"];

  return { modes, reportDir };
}

async function main(): Promise<void> {
  installCliNextCacheShim();
  const {
    formatDataParityReportMarkdown,
    loadParityMapsFromMongo,
    runDataParity,
  } = await import("../lib/content/parity");

  const { modes, reportDir } = parseArgs(process.argv.slice(2));
  const ctx = await loadParityMapsFromMongo();

  const report = await runDataParity({
    modes,
    mediaMap: ctx.mediaMap,
    entryIdByContentfulId: ctx.entryIdByContentfulId,
    topicSlugsByLocale: ctx.topicSlugsByLocale,
    extraBlogSlugs: ctx.postSlugs,
    extraSermonSlugs: ctx.sermonSlugs,
    mongoMediaCount: ctx.mediaCount,
    mongoCollections: ctx.collectionCounts,
  });

  const markdown = formatDataParityReportMarkdown(report);

  if (reportDir) {
    const outDir = path.resolve(reportDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(outDir, "data-parity-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
      writeFile(path.join(outDir, "data-parity-report.md"), markdown, "utf8"),
    ]);
  }

  console.log(markdown);
  // Close cleanly — the shared MongoDB connection pool keeps the event loop alive otherwise.
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    "[verify-data-parity] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
