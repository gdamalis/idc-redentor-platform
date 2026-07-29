/**
 * ICR-155 — the one-time Ministry Admin bootstrap.
 *
 * Human-run only. Writes Mongo exclusively: it never creates a Firebase user,
 * never publishes, never touches the website database. See
 * docs/architecture/admin-bootstrap.md for the runbook.
 *
 * Exit codes: 0 success - 1 operation failure - 2 usage/guard refusal.
 */
import { writeSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { getAdminDb } from "@src/service/database.service";
import {
  USAGE,
  exitCodeFor,
  parseSeedArgs,
  redactMongoHost,
  seedAdmin,
} from "@src/lib/rbac/seed-admin";
import type { SeedAdminResult } from "@src/lib/rbac/seed-admin";

// stdout carries exactly one JSON line (machine-readable); all narration goes
// to stderr so a caller can pipe stdout safely.
const narrate = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/**
 * writeSync is synchronous even when stdout is a pipe, so the JSON line cannot
 * be truncated by the process.exit below. (process.stdout.write is async on a
 * pipe, and process.exit does not flush it.)
 */
const emit = (
  result: SeedAdminResult | { ok: false; reason: string; message: string },
): never => {
  writeSync(1, `${JSON.stringify(result)}\n`);
  process.exit(exitCodeFor(result as SeedAdminResult));
};

async function main(): Promise<never> {
  // Guard 5a — never in automation. Checked before ANY database access.
  if (process.env.CI) {
    narrate("Refusing to run: CI is set. This bootstrap is human-run only.");
    return emit({
      ok: false,
      reason: "usage",
      message: "Refusing to run under CI.",
    });
  }

  const parsed = parseSeedArgs(process.argv.slice(2));
  if (!parsed.ok) {
    narrate(parsed.message);
    narrate("");
    narrate(USAGE);
    return emit(parsed);
  }

  const { args } = parsed;

  // Guard 6 — computed once, host only, never the URI itself. Independent of
  // guard 1: a wrong-database refusal below must still be able to show WHICH
  // cluster was almost used, without ever risking the credential.
  const clusterHost = redactMongoHost(process.env.MONGODB_URI);

  // Guard 1 runs inside seedAdmin too; this early call is what lets the banner
  // print the RESOLVED database name before the human confirms.
  let databaseName: string;
  try {
    databaseName = getAdminDb().databaseName;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    narrate(message);
    narrate(`  cluster  : ${clusterHost}`);
    return emit({ ok: false, reason: "db-guard", message });
  }

  narrate("");
  narrate("  Ministry Admin bootstrap");
  narrate(`  database : ${databaseName}`);
  narrate(`  cluster  : ${clusterHost}`);
  narrate(`  invite   : ${args.email} (${args.locale})`);
  narrate(
    `  mode     : ${args.dryRun ? "DRY RUN (writes nothing)" : "WRITE"}${args.force ? " --force" : ""}`,
  );
  narrate("");

  // Guard 5b — deliberate. --yes is the non-interactive human escape hatch.
  if (!args.yes && !args.dryRun) {
    // Refuse up front when there is no terminal to answer with (Codex P2).
    // `readline/promises.question()` never settles on EOF, and at this point no
    // Mongo connection is open, so the event loop simply drains and Node exits
    // **0** — printing the prompt, writing nothing, emitting no JSON, and
    // handing the caller a success code for a run that did nothing. For a
    // script whose entire job is granting the highest privilege in the system,
    // a silent no-op that reads as success is the worst available outcome.
    if (!process.stdin.isTTY) {
      narrate(
        "Refusing to run: stdin is not a terminal, so the confirmation cannot be " +
          "answered. Pass --yes for a non-interactive run (or --dry-run to preview).",
      );
      return emit({
        ok: false,
        reason: "usage",
        message: "Confirmation required but stdin is not a TTY; pass --yes.",
      });
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    // Belt-and-braces for an EOF mid-prompt (Ctrl-D on a real terminal), which
    // leaves `question()` pending forever: whichever settles first wins, and a
    // close resolves to a decline rather than hanging.
    const answer = await Promise.race([
      rl.question(`Grant Admin to ${args.email} on "${databaseName}"? [y/N] `),
      new Promise<string>((resolve) => rl.once("close", () => resolve(""))),
    ]);
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      narrate("Aborted — nothing was written.");
      return emit({
        ok: false,
        reason: "usage",
        message: "Confirmation declined.",
      });
    }
  }

  // Any rejection from the seed itself (Mongo unreachable, auth failure, an
  // index build blowing up) must still leave stdout carrying exactly one JSON
  // line — that is the CLI's advertised contract, and "the database was down"
  // is the single most likely real failure (Codex P2). Letting it reach
  // `main().catch` would exit 1 with an EMPTY stdout, so a caller parsing the
  // result channel sees nothing at all. Guard 1's refusal is already a typed
  // result inside `seedAdmin`; this covers everything after it.
  let result: SeedAdminResult;
  try {
    result = await seedAdmin(args);
  } catch (error) {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    narrate(detail);
    return emit({
      ok: false,
      reason: "write-failed",
      message: `The seed failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!result.ok) narrate(result.message);
  return emit(result);
}

// No top-level await: `apps/admin/package.json` has no `"type": "module"`,
// so tsx/esbuild transforms this file to CommonJS, which rejects top-level
// await. `main()` always terminates via `emit()`'s `process.exit`, so the
// `.catch` below exists only to report an error that reaches neither guard
// (e.g. a `readline` failure) instead of dying as an unhandled rejection.
main().catch((error: unknown) => {
  narrate(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
