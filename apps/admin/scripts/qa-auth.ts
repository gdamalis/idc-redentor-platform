/**
 * ICR-222 — QA sign-in command for the admin app (`yoke/qa-auth@1`).
 *
 * Declared in `.claude/config.json` → `qa.auth.commands.signIn`. Only the
 * `sign-in` verb exists: the QA account is a standing one, so there is nothing
 * to provision or destroy per run.
 *
 *   YOKE_QA_AUTH_CONTRACT=yoke/qa-auth@1 YOKE_QA_AUTH_ENV=previewAdmin \
 *   YOKE_QA_AUTH_BASE_URL=https://<preview-host> \
 *   sh -c 'cd apps/admin && exec node --import tsx scripts/qa-auth.ts sign-in' < creds.json
 *
 * Run it with `node --import tsx` from `apps/admin`, never through `pnpm run` /
 * `pnpm exec`: pnpm rewrites every non-zero exit to 1, which would erase the
 * contract's 2 (refused) and 3 (declined) codes. The cwd must be `apps/admin`
 * because tsx resolves the `@src/*` path alias from the working directory.
 *
 * Credentials come on stdin only. stdout carries exactly one JSON object (it
 * holds a live session cookie — callers must never echo it); narration goes
 * to stderr. See docs/architecture/admin-qa-account.md.
 */
import { writeSync } from "node:fs";
import { QA_AUTH_CONTRACT, runSignIn } from "@src/lib/qa-auth/sign-in";
import type { SignInOutcome } from "@src/lib/qa-auth/sign-in";

const emit = (outcome: SignInOutcome): never => {
  // writeSync: process.exit does not flush an async stdout pipe.
  writeSync(1, `${JSON.stringify(outcome.envelope)}\n`);
  for (const line of outcome.envelope.diagnostics) process.stderr.write(`${line}\n`);
  process.exit(outcome.exitCode);
};

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<never> {
  const verb = process.argv[2];
  if (verb !== "sign-in") {
    return emit({
      exitCode: 2,
      envelope: {
        contract: QA_AUTH_CONTRACT,
        ok: false,
        diagnostics: [`unknown verb "${verb ?? ""}"; the only verb is sign-in`],
      },
    });
  }

  const stdin = await readStdin();
  const outcome = await runSignIn(
    { env: process.env, stdin },
    { fetch: (input, init) => fetch(input, init), now: () => new Date() },
  );
  return emit(outcome);
}

// No top-level await: apps/admin compiles scripts to CommonJS (see seed-admin.ts).
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.name : "Error"}: unexpected failure\n`);
  writeSync(1, `${JSON.stringify({ contract: QA_AUTH_CONTRACT, ok: false, diagnostics: ["unexpected failure"] })}\n`);
  process.exit(1);
});
