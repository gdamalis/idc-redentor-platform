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
import { COLLECTIONS, type Locale } from "@idcr/content";
import { requireContentDb } from "../lib/content/db";
import {
  createMediaIdentityMap,
  formatDataParityReportMarkdown,
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

async function loadParityMapsFromMongo(): Promise<{
  readonly mediaMap: ReturnType<typeof createMediaIdentityMap>;
  readonly entryIdByContentfulId: Map<string, string>;
  readonly topicSlugsByLocale: Record<Locale, string[]>;
}> {
  const db = await requireContentDb();

  const mediaDocs = await db
    .collection<{
      _id: { toHexString: () => string };
      url: string;
      sha256: string;
      sourceContentfulIds?: string[];
    }>(COLLECTIONS.media)
    .find({}, { projection: { _id: 1, url: 1, sha256: 1, sourceContentfulIds: 1 } })
    .toArray();

  const mediaMap = createMediaIdentityMap(
    mediaDocs.map((m) => ({
      canonicalKey: m.sha256,
      urls: [m.url],
      mongoMediaIds: [m._id.toHexString()],
      contentfulAssetIds: (m.sourceContentfulIds ?? []).map((id) =>
        id.includes(":") ? id.split(":")[0]! : id,
      ),
    })),
  );

  const entryIdByContentfulId = new Map<string, string>();
  const contentCollections = [
    COLLECTIONS.sections,
    COLLECTIONS.beliefCollections,
    COLLECTIONS.eventBanners,
    COLLECTIONS.seoEntries,
    COLLECTIONS.globals,
    COLLECTIONS.posts,
    COLLECTIONS.sermons,
    COLLECTIONS.topics,
    COLLECTIONS.authors,
    COLLECTIONS.bibleVerses,
  ] as const;

  for (const col of contentCollections) {
    const docs = await db
      .collection<{ _id: { toHexString: () => string }; sourceContentfulId?: string }>(
        col,
      )
      .find(
        { sourceContentfulId: { $type: "string" } },
        { projection: { _id: 1, sourceContentfulId: 1 } },
      )
      .toArray();
    for (const d of docs) {
      if (d.sourceContentfulId) {
        entryIdByContentfulId.set(d.sourceContentfulId, d._id.toHexString());
      }
    }
  }

  const topicDocs = await db
    .collection<{
      draft?: { slug?: Partial<Record<Locale, string>> };
      published?: { slug?: Partial<Record<Locale, string>> };
    }>(COLLECTIONS.topics)
    .find({}, { projection: { "draft.slug": 1, "published.slug": 1 } })
    .toArray();

  const esTopics = new Set<string>();
  const enTopics = new Set<string>();
  for (const doc of topicDocs) {
    const es = doc.published?.slug?.["es-AR"] ?? doc.draft?.slug?.["es-AR"];
    const en = doc.published?.slug?.["en-US"] ?? doc.draft?.slug?.["en-US"];
    if (es) esTopics.add(es);
    if (en) enTopics.add(en);
  }

  return {
    mediaMap,
    entryIdByContentfulId,
    topicSlugsByLocale: {
      "es-AR": esTopics.size > 0 ? [...esTopics].sort() : ["privacidad"],
      "en-US": enTopics.size > 0 ? [...enTopics].sort() : ["privacy"],
    },
  };
}

async function main(): Promise<void> {
  const { modes, reportDir } = parseArgs(process.argv.slice(2));
  const { mediaMap, entryIdByContentfulId, topicSlugsByLocale } =
    await loadParityMapsFromMongo();

  const report = await runDataParity({
    modes,
    mediaMap,
    entryIdByContentfulId,
    topicSlugsByLocale,
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
