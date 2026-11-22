/**
 * ICR-195 — Idempotent grant of the 5 content & media permissions to the
 * stored system `admin` role ONLY.
 *
 * Human-run only. Writes `ministry-admin*` exclusively inside
 * `withAdminTransaction` and appends one `rbacAudit` `role.update` entry only
 * when the role document actually changes.
 *
 * Exit codes: 0 success - 1 operation failure - 2 usage/guard refusal.
 */
import { writeSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { getAdminDb } from "@src/service/database.service";
import {
  CONTENT_PERMISSION_KEYS,
  USAGE,
  exitCodeForGrant,
  grantContentPermissions,
  parseGrantArgs,
  redactMongoHost,
} from "@src/lib/rbac/grant-content-permissions";
import type { GrantContentPermissionsResult } from "@src/lib/rbac/grant-content-permissions";

const narrate = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const emit = (
  result:
    | GrantContentPermissionsResult
    | { readonly ok: false; readonly reason: "usage"; readonly message: string },
): never => {
  writeSync(1, `${JSON.stringify(result)}\n`);
  process.exit(exitCodeForGrant(result));
};

async function main(): Promise<never> {
  if (process.env.CI) {
    narrate("Refusing to run: CI is set. This role grant is human-run only.");
    return emit({
      ok: false,
      reason: "usage",
      message: "Refusing to run under CI.",
    });
  }

  const parsed = parseGrantArgs(process.argv.slice(2));
  if (!parsed.ok) {
    narrate(parsed.message);
    narrate("");
    narrate(USAGE);
    return emit(parsed);
  }

  const { args } = parsed;
  const clusterHost = redactMongoHost(process.env.MONGODB_URI);

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
  narrate("  Grant content & media permissions (Admin role only)");
  narrate(`  database : ${databaseName}`);
  narrate(`  cluster  : ${clusterHost}`);
  narrate(`  keys     : ${CONTENT_PERMISSION_KEYS.join(", ")}`);
  narrate(
    `  mode     : ${args.dryRun ? "DRY RUN (writes nothing)" : "WRITE"}`,
  );
  narrate("");

  if (!args.yes && !args.dryRun) {
    if (!process.stdin.isTTY) {
      narrate(
        "Refusing to run: stdin is not a terminal. Pass --yes for a non-interactive run (or --dry-run to preview).",
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
    const answer = await Promise.race([
      rl.question(
        `Add 5 content/media permissions to role "admin" on "${databaseName}"? [y/N] `,
      ),
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

  let result: GrantContentPermissionsResult;
  try {
    result = await grantContentPermissions(args);
  } catch (error) {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    narrate(detail);
    return emit({
      ok: false,
      reason: "write-failed",
      message: `Grant failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!result.ok) narrate(result.message);
  return emit(result);
}

main().catch((error: unknown) => {
  narrate(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exit(1);
});
