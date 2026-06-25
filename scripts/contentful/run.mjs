// Usage: node scripts/contentful/run.mjs 01 [--dry-run]
// Applies scripts/contentful/migrations/<NN>-*.cjs to $CONTENTFUL_ENVIRONMENT (default staging).
import { runMigration } from "contentful-migration";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [num, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const environmentId = process.env.CONTENTFUL_ENVIRONMENT ?? "staging";

if (environmentId === "master" || environmentId === "production") {
  throw new Error(
    "Refusing to run migrations against master or production. Set CONTENTFUL_ENVIRONMENT.",
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
  // contentful-migration@5 has NO programmatic dry-run, so the real preview gate is the
  // interactive confirm: apply mode auto-confirms (yes:true) for non-interactive/agent use;
  // dry-run keeps the confirm (yes:false) and is declined by piping "n" to stdin, printing the
  // plan WITHOUT applying:  printf 'n\n' | node scripts/contentful/run.mjs NN --dry-run
  yes: !dryRun,
});
console.log(
  dryRun
    ? `Planned ${file} against ${environmentId} (dry-run — nothing applied)`
    : `Applied ${file} to ${environmentId}`,
);
