#!/usr/bin/env tsx
/**
 * Read-only (GET-only) Contentful frozen snapshot exporter (`ICR-203`).
 *
 * Exports CMA entries (drafts + archived + state metadata), CDA published entries,
 * CMA assets, and all asset binaries into a git-ignored directory (default under
 * `artifacts/`). NEVER writes to Contentful and NEVER prints tokens.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local --import tsx apps/admin/scripts/export-contentful-snapshot.ts \
 *     --out /path/to/artifacts/contentful-snapshot
 */
import path from "node:path";
import { exportContentfulSnapshot } from "../src/service/content/import/snapshot";

function parseArgs(argv: readonly string[]): {
  readonly outDir?: string;
  readonly env?: string;
} {
  let outDir: string | undefined;
  let env: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      outDir = argv[i + 1];
      i += 1;
    } else if (arg === "--environment" && argv[i + 1]) {
      env = argv[i + 1];
      i += 1;
    }
  }
  return { outDir, env };
}

async function main(): Promise<void> {
  const { outDir, env } = parseArgs(process.argv.slice(2));
  if (!outDir) {
    console.error(
      "Usage: export-contentful-snapshot.ts --out <git-ignored-dir> [--environment master]",
    );
    process.exit(2);
  }

  const spaceId = process.env.CONTENTFUL_SPACE_ID?.trim();
  const cmaToken = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN?.trim();
  const cdaToken = process.env.CONTENTFUL_ACCESS_TOKEN?.trim();
  const environment =
    env ?? process.env.CONTENTFUL_ENVIRONMENT?.trim() ?? "master";

  if (!spaceId || !cmaToken || !cdaToken) {
    console.error(
      "Missing required Contentful env vars: CONTENTFUL_SPACE_ID, CONTENTFUL_MANAGEMENT_ACCESS_TOKEN, CONTENTFUL_ACCESS_TOKEN",
    );
    process.exit(2);
  }

  const resolvedOut = path.resolve(outDir);
  const repoRoot = path.resolve(__dirname, "../../..");
  if (
    resolvedOut === repoRoot ||
    resolvedOut.startsWith(`${repoRoot}${path.sep}`)
  ) {
    console.error(
      `Refusing to write Contentful snapshot inside the git repository (${repoRoot}): snapshots contain unpublished drafts and author emails. Use the area's git-ignored artifacts/ folder instead.`,
    );
    process.exit(2);
  }

  const manifest = await exportContentfulSnapshot({
    spaceId,
    environment,
    cmaToken,
    cdaToken,
    outputDir: resolvedOut,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir: resolvedOut,
        exportedAt: manifest.exportedAt,
        environment: manifest.environment,
        contentTypes: manifest.contentTypeIds.length,
        cmaEntries: manifest.cmaEntries.length,
        cdaPublishedEntries: manifest.cdaPublishedEntries.length,
        cmaAssets: manifest.cmaAssets.length,
        downloadedFiles: manifest.downloadedFiles.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    "[export-contentful-snapshot] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
