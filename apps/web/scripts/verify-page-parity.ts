#!/usr/bin/env tsx
/**
 * Page-level DOM & Screenshot Parity CLI (`ICR-203` AC8, used at cutover in `ICR-205`).
 *
 * Refuses ANY production host before making a single request.
 *
 * Usage:
 *   node --import tsx apps/web/scripts/verify-page-parity.ts \
 *     --base-a http://127.0.0.1:3001 --base-b http://127.0.0.1:3002 \
 *     [--post-slugs slug1,slug2] [--sermon-slugs slug1,slug2] \
 *     [--screenshots] [--report-dir /path/to/reports]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildParityRouteInventory,
  formatPageParityReportMarkdown,
  runPageParity,
} from "../lib/content/parity";

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(argv: readonly string[]) {
  let baseUrlA = "";
  let baseUrlB = "";
  let postSlugs: string[] = [];
  let sermonSlugs: string[] = [];
  let screenshots = false;
  let reportDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-a" && argv[i + 1]) {
      baseUrlA = argv[i + 1];
      i += 1;
    } else if (arg === "--base-b" && argv[i + 1]) {
      baseUrlB = argv[i + 1];
      i += 1;
    } else if (arg === "--post-slugs" && argv[i + 1]) {
      postSlugs = parseList(argv[i + 1]);
      i += 1;
    } else if (arg === "--sermon-slugs" && argv[i + 1]) {
      sermonSlugs = parseList(argv[i + 1]);
      i += 1;
    } else if (arg === "--screenshots") {
      screenshots = true;
    } else if (arg === "--report-dir" && argv[i + 1]) {
      reportDir = argv[i + 1];
      i += 1;
    }
  }

  return { baseUrlA, baseUrlB, postSlugs, sermonSlugs, screenshots, reportDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrlA || !args.baseUrlB) {
    console.error(
      "Usage: verify-page-parity.ts --base-a <url> --base-b <url> [--post-slugs a,b] [--sermon-slugs c,d] [--screenshots] [--report-dir <dir>]",
    );
    process.exit(2);
  }

  const routes = buildParityRouteInventory({
    postSlugs: args.postSlugs,
    sermonSlugs: args.sermonSlugs,
    topicSlugsByLocale: {
      "es-AR": ["privacidad"],
      "en-US": ["privacy"],
    },
  });

  const screenshotRoutes = args.screenshots
    ? [
        "/es-AR",
        "/es-AR/community",
        "/es-AR/come-meet-us",
        "/es-AR/blog",
        ...(args.postSlugs[0] ? [`/es-AR/blog/${args.postSlugs[0]}`] : []),
        "/es-AR/predicas",
        ...(args.sermonSlugs[0]
          ? [`/es-AR/predicas/${args.sermonSlugs[0]}`]
          : []),
        "/es-AR/privacidad",
      ]
    : [];

  const report = await runPageParity({
    baseUrlA: args.baseUrlA,
    baseUrlB: args.baseUrlB,
    routes,
    screenshotRoutes,
  });

  const markdown = formatPageParityReportMarkdown(report);

  if (args.reportDir) {
    const outDir = path.resolve(args.reportDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(outDir, "page-parity-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
      writeFile(path.join(outDir, "page-parity-report.md"), markdown, "utf8"),
    ]);
  }

  console.log(markdown);
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "[verify-page-parity] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
