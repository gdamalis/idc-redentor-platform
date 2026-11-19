/**
 * ICR-222 — provision the standing QA account, or rotate its password.
 *
 * Human/agent-run one-off, never in CI. Refuses every admin database except
 * `ministry-admin-staging`. Runbook (env pulled from Vercel's STAGING target
 * into a 0600 file, shredded afterwards): docs/architecture/admin-qa-account.md.
 *
 *   cd apps/admin
 *   node --env-file=<staging.env> --import tsx scripts/qa-account.ts provision \
 *     --email <address> --firebase-project <staging project id> --qa-env <repo>/qa-env.json
 *   node --env-file=<staging.env> --import tsx scripts/qa-account.ts rotate \
 *     --firebase-project <staging project id> --qa-env <repo>/qa-env.json
 *
 * stdout: one JSON line with no email, uid, password or key.
 * Exit: 0 success - 1 operation failure - 2 usage/guard refusal.
 */
import { writeSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getAdminDb,
  withAdminTransaction,
} from "@src/service/database.service";
import { createInvite } from "@src/service/invite.service";
import { listRoles } from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { normalizeEmail } from "@src/lib/auth/email";
import {
  QA_ACCOUNT_USAGE,
  generateQaPassword,
  parseQaAccountArgs,
  provisionQaAccount,
  readQaEnvFile,
  rotateQaPassword,
  writeQaEnvFile,
} from "@src/lib/qa-auth/qa-account";
import type {
  QaAccountDeps,
  QaAccountResult,
} from "@src/lib/qa-auth/qa-account";

const narrate = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const exitCodeFor = (result: QaAccountResult): 0 | 1 | 2 => {
  if (result.ok) return 0;
  return result.reason === "invite-failed" ? 1 : 2;
};

const emit = (
  result: QaAccountResult | { ok: false; reason: string; message: string },
  code: 0 | 1 | 2,
): never => {
  writeSync(1, `${JSON.stringify(result)}\n`);
  process.exit(code);
};

function buildDeps(qaEnvPath: string): QaAccountDeps {
  // Lazy: the Firebase app is only initialised once a Firebase call is made,
  // i.e. after the database guard has passed.
  let auth: ReturnType<typeof getAuth> | null = null;
  const firebaseAuth = () => {
    if (auth) return auth;
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
          /\\n/g,
          "\n",
        ),
      }),
    });
    auth = getAuth(app);
    return auth;
  };

  return {
    databaseName: () => getAdminDb().databaseName,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    firebase: {
      getUserByEmail: async (email) => {
        try {
          const user = await firebaseAuth().getUserByEmail(email);
          return { uid: user.uid };
        } catch (error) {
          if ((error as { code?: string }).code === "auth/user-not-found")
            return null;
          throw error;
        }
      },
      createUser: async (input) => {
        const user = await firebaseAuth().createUser(input);
        return { uid: user.uid };
      },
      updateUser: (uid, input) => firebaseAuth().updateUser(uid, input),
      revokeRefreshTokens: (uid) => firebaseAuth().revokeRefreshTokens(uid),
    },
    adminUserExists: async (email) =>
      (await listUsers()).some(
        (user) => normalizeEmail(user.email) === normalizeEmail(email),
      ),
    adminRoleId: async () =>
      (await listRoles())
        .find((role) => role.key === "admin")
        ?._id.toHexString() ?? null,
    createAdminInvite: async (input) => {
      // Same retry shape as seed-admin's createBootstrapInvite: retry the whole
      // transaction once on an insert race, aborting the doomed one explicitly.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await withAdminTransaction(async (session) => {
          const created = await createInvite(input, session);
          if (!created.ok) await session.abortTransaction();
          return created;
        });
        if (result.ok) return { ok: true, refreshed: result.refreshed };
      }
      return { ok: false };
    },
    readQaEnv: () => readQaEnvFile(qaEnvPath),
    writeQaEnv: (value) => writeQaEnvFile(qaEnvPath, value),
    generatePassword: generateQaPassword,
  };
}

async function main(): Promise<never> {
  if (process.env.CI) {
    narrate("Refusing to run: CI is set.");
    return emit(
      { ok: false, reason: "usage", message: "Refusing to run under CI." },
      2,
    );
  }

  const parsed = parseQaAccountArgs(process.argv.slice(2));
  if (!parsed.ok) {
    narrate(parsed.message);
    narrate(QA_ACCOUNT_USAGE);
    return emit({ ok: false, reason: "usage", message: parsed.message }, 2);
  }

  const { args } = parsed;
  const deps = buildDeps(args.qaEnvPath);
  try {
    const result =
      args.verb === "provision"
        ? await provisionQaAccount(
            {
              email: args.email,
              expectedFirebaseProject: args.expectedFirebaseProject,
            },
            deps,
          )
        : await rotateQaPassword(
            { expectedFirebaseProject: args.expectedFirebaseProject },
            deps,
          );
    if (!result.ok) narrate(result.message);
    return emit(result, exitCodeFor(result));
  } catch (error) {
    // Firebase/Mongo errors can quote request data; print only the code/name.
    const code = (error as { code?: unknown }).code;
    const label =
      typeof code === "string"
        ? code
        : error instanceof Error
          ? error.name
          : "Error";
    narrate(`Operation failed: ${label}`);
    return emit(
      {
        ok: false,
        reason: "operation-failed",
        message: `Operation failed: ${label}`,
      },
      1,
    );
  }
}

main().catch(() => {
  narrate("Unexpected failure.");
  process.exit(1);
});
