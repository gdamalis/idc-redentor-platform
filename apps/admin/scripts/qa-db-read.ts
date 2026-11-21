/**
 * ICR-223 — QA read-only database command (`yoke/qa-db-read@1`).
 *
 *   YOKE_QA_DB_ENV=previewAdmin MONGODB_URI=… \
 *   sh -c 'cd apps/admin && exec node --import tsx scripts/qa-db-read.ts read \
 *     --db ministry-admin-staging --collection rbacAudit --filter "{}" --limit 5'
 *
 * Run with `node --import tsx` from `apps/admin`, never `pnpm run`/`pnpm exec`
 * (pnpm rewrites non-zero exits to 1 and would erase the refusal code 2).
 * Exit 0 ok, 2 refused, 1 unexpected. stdout carries exactly one scrubbed JSON
 * object; diagnostics go to stderr. The connection string comes from the
 * environment only — never argv — and is never printed.
 * See docs/architecture/qa-db-read.md.
 */
import { writeSync } from "node:fs";
import { connectReadOnly } from "@src/lib/qa-db/driver";
import { runQaDbRead } from "@src/lib/qa-db/run";
import { QA_DB_CONTRACT } from "@src/lib/qa-db/policy";
import type { QaDbOutcome } from "@src/lib/qa-db/run";

const emit = (outcome: QaDbOutcome): never => {
  writeSync(1, `${JSON.stringify(outcome.envelope)}\n`);
  for (const line of outcome.envelope.diagnostics)
    process.stderr.write(`${line}\n`);
  process.exit(outcome.exitCode);
};

// No top-level await: apps/admin compiles scripts to CommonJS (see seed-admin.ts).
runQaDbRead(
  { env: process.env, argv: process.argv.slice(2) },
  { connect: connectReadOnly },
)
  .then(emit)
  .catch(() => {
    writeSync(
      1,
      `${JSON.stringify({ contract: QA_DB_CONTRACT, ok: false, diagnostics: ["unexpected failure"] })}\n`,
    );
    process.exit(1);
  });
