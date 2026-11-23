#!/usr/bin/env tsx
/**
 * Idempotent Contentful -> MongoDB + Vercel Blob importer CLI (`ICR-203`).
 *
 * Defaults to DRY-RUN (zero DB writes, zero Blob uploads). Pass `--apply` to write.
 * Enforces the positive `website*` database allowlist and refuses production `"website"`
 * without `--prod`. Never prints environment secrets or connection strings.
 *
 * Usage:
 *   node --env-file=apps/admin/.env.local --import tsx apps/admin/scripts/import-contentful.ts \
 *     --snapshot /path/to/artifacts/contentful-snapshot [--apply] [--prod] [--report-dir /path/to/reports]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatImportReportMarkdown,
  loadContentfulSnapshotFromDir,
  runContentfulImport,
} from "../src/service/content/import";

interface CliArgs {
  readonly snapshotDir?: string;
  readonly reportDir?: string;
  readonly apply: boolean;
  readonly allowProd: boolean;
  readonly allowTestDb: boolean;
  readonly allowConflictingDuplicateTitles: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let snapshotDir: string | undefined;
  let reportDir: string | undefined;
  let apply = false;
  let allowProd = false;
  let allowTestDb = false;
  let allowConflictingDuplicateTitles = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--snapshot" && argv[i + 1]) {
      snapshotDir = argv[i + 1];
      i += 1;
    } else if (arg === "--report-dir" && argv[i + 1]) {
      reportDir = argv[i + 1];
      i += 1;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--prod") {
      allowProd = true;
    } else if (arg === "--allow-test-db") {
      allowTestDb = true;
    } else if (arg === "--allow-conflicting-duplicate-titles") {
      allowConflictingDuplicateTitles = true;
    }
  }

  return {
    snapshotDir,
    reportDir,
    apply,
    allowProd,
    allowTestDb,
    allowConflictingDuplicateTitles,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.snapshotDir) {
    console.error(
      "Usage: import-contentful.ts --snapshot <dir> [--apply] [--prod] [--allow-test-db] [--report-dir <dir>]",
    );
    process.exit(2);
  }

  const snapshot = await loadContentfulSnapshotFromDir(args.snapshotDir);
  const report = await runContentfulImport(snapshot, {
    apply: args.apply,
    allowProd: args.allowProd,
    allowTestDb: args.allowTestDb,
    allowConflictingDuplicateTitles: args.allowConflictingDuplicateTitles,
  });

  const markdown = formatImportReportMarkdown(report);

  if (args.reportDir) {
    const outDir = path.resolve(args.reportDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(outDir, `import-report-${report.mode}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(outDir, `import-report-${report.mode}.md`),
        markdown,
        "utf8",
      ),
    ]);
  }

  console.log(markdown);

  // Close cleanly — the shared MongoDB connection pool keeps the event loop alive otherwise.
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    "[import-contentful] Failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
