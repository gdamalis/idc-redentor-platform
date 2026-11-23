#!/usr/bin/env tsx
/**
 * Page-level DOM & Screenshot Parity CLI (`ICR-203` AC8, used at cutover in `ICR-205`).
 *
 * Refuses ANY production host before making a single request.
 * Supports loading `mediaMap` (and dynamic post/sermon/topic slugs) directly from
 * MongoDB via `--from-db` or from a JSON file via `--media-map <path>`.
 *
 * Usage:
 *   node --import tsx apps/web/scripts/verify-page-parity.ts \
 *     --base-a http://127.0.0.1:3001 --base-b http://127.0.0.1:3002 \
 *     [--from-db | --media-map /path/to/media-map.json] \
 *     [--post-slugs slug1,slug2] [--sermon-slugs slug1,slug2] \
 *     [--screenshots] [--report-dir /path/to/reports]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@idcr/content";
import {
  buildParityRouteInventory,
  createMediaIdentityMap,
  formatPageParityReportMarkdown,
  loadParityMapsFromMongo,
  runPageParity,
  type MediaIdentityMap,
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
  let fromDb = false;
  let mediaMapFile: string | undefined;
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
    } else if (arg === "--from-db") {
      fromDb = true;
    } else if (arg === "--media-map" && argv[i + 1]) {
      mediaMapFile = argv[i + 1];
      i += 1;
    } else if (arg === "--screenshots") {
      screenshots = true;
    } else if (arg === "--report-dir" && argv[i + 1]) {
      reportDir = argv[i + 1];
      i += 1;
    }
  }

  return {
    baseUrlA,
    baseUrlB,
    postSlugs,
    sermonSlugs,
    fromDb,
    mediaMapFile,
    screenshots,
    reportDir,
  };
}

async function loadMediaMapFromJsonFile(
  filePath: string,
): Promise<MediaIdentityMap> {
  const raw = await readFile(path.resolve(filePath), "utf8");
  const entries = JSON.parse(raw) as Parameters<typeof createMediaIdentityMap>[0];
  if (!Array.isArray(entries)) {
    throw new Error(`Invalid media map JSON at ${filePath}: expected an array`);
  }
  return createMediaIdentityMap(entries);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrlA || !args.baseUrlB) {
    console.error(
      "Usage: verify-page-parity.ts --base-a <url> --base-b <url> [--from-db | --media-map <file>] [--post-slugs a,b] [--sermon-slugs c,d] [--screenshots] [--report-dir <dir>]",
    );
    process.exit(2);
  }

  let mediaMap: MediaIdentityMap | undefined;
  let postSlugs = args.postSlugs;
  let sermonSlugs = args.sermonSlugs;
  let topicSlugsByLocale: Readonly<Partial<Record<Locale, readonly string[]>>> =
    {
      "es-AR": ["privacidad"],
      "en-US": ["privacy"],
    };

  let allowedNotFoundRoutes: string[] = [];

  if (args.fromDb) {
    const ctx = await loadParityMapsFromMongo();
    mediaMap = ctx.mediaMap;
    if (postSlugs.length === 0) postSlugs = [...ctx.postSlugs];
    if (sermonSlugs.length === 0) sermonSlugs = [...ctx.sermonSlugs];
    topicSlugsByLocale = ctx.topicSlugsByLocale;
    allowedNotFoundRoutes = [
      ...ctx.draftOnlyPostSlugs.flatMap((slug) => [
        `/es-AR/blog/${slug}`,
        `/en-US/blog/${slug}`,
      ]),
      ...ctx.draftOnlySermonSlugs.flatMap((slug) => [
        `/es-AR/predicas/${slug}`,
        `/en-US/predicas/${slug}`,
      ]),
    ];
  } else if (args.mediaMapFile) {
    mediaMap = await loadMediaMapFromJsonFile(args.mediaMapFile);
  }

  const routes = buildParityRouteInventory({
    postSlugs,
    sermonSlugs,
    topicSlugsByLocale,
  });

  const screenshotRoutes = args.screenshots
    ? [
        "/es-AR",
        "/es-AR/community",
        "/es-AR/come-meet-us",
        "/es-AR/blog",
        ...(postSlugs[0] ? [`/es-AR/blog/${postSlugs[0]}`] : []),
        "/es-AR/predicas",
        ...(sermonSlugs[0] ? [`/es-AR/predicas/${sermonSlugs[0]}`] : []),
        "/es-AR/privacidad",
      ]
    : [];

  const report = await runPageParity({
    baseUrlA: args.baseUrlA,
    baseUrlB: args.baseUrlB,
    routes,
    mediaMap,
    screenshotRoutes,
    allowedNotFoundRoutes,
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
  // Close cleanly — `--from-db` opens the shared MongoDB connection pool.
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    "[verify-page-parity] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
