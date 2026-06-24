// Usage: node scripts/contentful/run.mjs 01 [--dry-run]
// Applies scripts/contentful/migrations/<NN>-*.cjs to $CONTENTFUL_ENVIRONMENT (default master-1.0.0).
import { runMigration } from "contentful-migration";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [num, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "master-1.0.0";

if (environmentId === "master") {
  throw new Error(
    "Refusing to run migrations against master. Set CONTENTFUL_ENVIRONMENT.",
  );
}
const dir = join(here, "migrations");
const file = readdirSync(dir).find((f) => f.startsWith(`${num}-`));
if (!file) throw new Error(`No migration found for prefix ${num} in ${dir}`);

await runMigration({
  filePath: join(dir, file),
  spaceId: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN,
  environmentId,
  // Always auto-confirm: this runner is meant for non-interactive/agent use, where the
  // interactive "apply?" prompt crashes (ERR_USE_AFTER_CLOSE) with no TTY. The review step
  // is the `--dry-run` invocation; `dryRun` (below) is what actually gates whether changes apply.
  yes: true,
  ...(dryRun ? { dryRun: true } : {}),
});
console.log(`Applied ${file} to ${environmentId}${dryRun ? " (dry-run)" : ""}`);
