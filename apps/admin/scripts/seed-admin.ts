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
import { sendInviteEmail } from "@src/service/auth-email";
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
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const answer = await rl.question(
      `Grant Admin to ${args.email} on "${databaseName}"? [y/N] `,
    );
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

  const result = await seedAdmin(args);

  // Opt-in courtesy only. The invite URL carries no token, so a failed send is
  // never fatal: the invite is already committed and the human can sign in.
  if (result.ok && !result.dryRun && args.sendEmail) {
    const base = process.env.NEXT_PUBLIC_ADMIN_BASE_URL;
    if (!base) {
      narrate("--send-email skipped: NEXT_PUBLIC_ADMIN_BASE_URL is not set.");
    } else {
      const sent = await sendInviteEmail({
        to: args.email,
        inviteUrl: `${base}/${args.locale}/login`,
        locale: args.locale,
      });
      narrate(
        sent
          ? "Invite email sent."
          : "Invite email FAILED to send (the invite is still valid).",
      );
    }
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
