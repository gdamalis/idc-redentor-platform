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
import path from "node:path";
import {
  formatDataParityReportMarkdown,
  loadParityMapsFromMongo,
  runDataParity,
  type ParityMode,
} from "../lib/content/parity";

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
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "[verify-data-parity] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
