/**
 * ICR-222 — provisioning and password rotation for the standing QA account.
 *
 * A one-off, human- or agent-run tool (like `seed:admin`), never part of the
 * app. It:
 *  - refuses every admin database except `ministry-admin-staging`, by exact
 *    name (production `ministry-admin` included — `getAdminDb()`'s own
 *    allowlist accepts that name, so it is not enough on its own here);
 *  - creates or updates the Firebase user with `emailVerified: true` (the
 *    invite gate refuses unverified email), in whatever Firebase project the
 *    environment names — the project id is read from the env, never
 *    hardcoded, so a separate staging Firebase project needs no code change;
 *  - generates the password in-process and writes it straight into the
 *    git-ignored qa-env.json (mode 600) — it never reaches argv, the
 *    environment, stdout or a log;
 *  - creates one pending Admin invite through the shipped `createInvite()`.
 *    The first sign-in then provisions the AdminUser through the app's normal
 *    invite gate. No email is sent.
 *
 * See docs/architecture/admin-qa-account.md.
 */
import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";
import { normalizeEmail } from "@src/lib/auth/email";

export const QA_ACCOUNT_DB_NAME = "ministry-admin-staging";

/** Where the credentials live inside qa-env.json (config: credentialsFrom = "adminQa.users"). */
export const QA_ENV_ROLE_KEY = "admin";

export interface QaAccountCredentials {
  email: string;
  password: string;
  firebaseApiKey: string;
}

export type QaAccountArgs =
  | { verb: "provision"; email: string; qaEnvPath: string }
  | { verb: "rotate"; qaEnvPath: string };

export type ParseQaAccountArgsResult = { ok: true; args: QaAccountArgs } | { ok: false; message: string };

export const QA_ACCOUNT_USAGE = `Usage (from apps/admin, with the STAGING env loaded):
  node --env-file=<staging.env> --import tsx scripts/qa-account.ts provision --email <address> --qa-env <path>
  node --env-file=<staging.env> --import tsx scripts/qa-account.ts rotate --qa-env <path>

Env: MONGODB_URI (path must be ${QA_ACCOUNT_DB_NAME}), FIREBASE_PROJECT_ID,
     FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, NEXT_PUBLIC_FIREBASE_API_KEY
Exit: 0 success - 1 operation failure - 2 usage/guard refusal`;

export function parseQaAccountArgs(argv: readonly string[]): ParseQaAccountArgsResult {
  const [verb, ...rest] = argv;
  if (verb !== "provision" && verb !== "rotate") {
    return { ok: false, message: `Unknown verb "${verb ?? ""}"; use provision or rotate.` };
  }

  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? "";
    const value = rest[index + 1];
    if (flag !== "--email" && flag !== "--qa-env") return { ok: false, message: `Unknown argument: ${flag}` };
    if (value === undefined || value.startsWith("--")) return { ok: false, message: `${flag} requires a value.` };
    values[flag] = value;
  }

  const qaEnvPath = values["--qa-env"];
  if (!qaEnvPath) return { ok: false, message: "--qa-env <path> is required." };

  if (verb === "rotate") {
    if (values["--email"] !== undefined) return { ok: false, message: "rotate takes no --email; it reads qa-env.json." };
    return { ok: true, args: { verb, qaEnvPath } };
  }

  const email = normalizeEmail(values["--email"]);
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, message: "--email <address> is required and must be an email address." };
  }
  return { ok: true, args: { verb, email, qaEnvPath } };
}

/** 32 random bytes, base64url: 43 URL-safe characters. */
export function generateQaPassword(): string {
  return randomBytes(32).toString("base64url");
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Sets `adminQa.users.admin`, preserving every other key in the file. */
export function mergeQaEnv(current: unknown, credentials: QaAccountCredentials): Record<string, unknown> {
  const root = asRecord(current);
  const adminQa = asRecord(root.adminQa);
  const users = asRecord(adminQa.users);
  return { ...root, adminQa: { ...adminQa, users: { ...users, [QA_ENV_ROLE_KEY]: { ...credentials } } } };
}

function storedCredentials(current: unknown): Partial<QaAccountCredentials> {
  const entry = asRecord(asRecord(asRecord(asRecord(current).adminQa).users)[QA_ENV_ROLE_KEY]);
  return {
    email: typeof entry.email === "string" ? entry.email : undefined,
  };
}

export async function readQaEnvFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

/** Atomic (temp file + rename), mode 600 before any secret is written. */
export async function writeQaEnvFile(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

export interface QaAccountFirebase {
  getUserByEmail: (email: string) => Promise<{ uid: string } | null>;
  createUser: (input: { email: string; password: string; emailVerified: true }) => Promise<{ uid: string }>;
  updateUser: (uid: string, input: { password: string; emailVerified?: true }) => Promise<unknown>;
  revokeRefreshTokens: (uid: string) => Promise<unknown>;
}

export interface QaAccountDeps {
  /** The RESOLVED admin database name; may throw (getAdminDb's own guard). */
  databaseName: () => string;
  firebaseProjectId: string | undefined;
  firebaseApiKey: string | undefined;
  firebase: QaAccountFirebase;
  adminUserExists: (email: string) => Promise<boolean>;
  adminRoleId: () => Promise<string | null>;
  createAdminInvite: (input: {
    email: string;
    roleIds: string[];
    locale: "es-AR";
  }) => Promise<{ ok: true; refreshed: boolean } | { ok: false }>;
  readQaEnv: () => Promise<unknown>;
  writeQaEnv: (value: unknown) => Promise<void>;
  generatePassword: () => string;
}

export type QaAccountFailure =
  | "db-guard"
  | "missing-env"
  | "no-admin-role"
  | "user-exists"
  | "not-provisioned"
  | "invite-failed";

/** Results carry no email, uid, password or key — safe to print. */
export type QaAccountResult =
  | {
      ok: true;
      verb: "provision";
      firebaseProjectId: string;
      firebase: "created" | "updated";
      invite: "created" | "refreshed";
      qaEnv: "written";
    }
  | {
      ok: true;
      verb: "rotate";
      firebaseProjectId: string;
      firebase: "updated";
      qaEnv: "written";
      sessionsRevoked: true;
    }
  | { ok: false; reason: QaAccountFailure; message: string };

type Preflight = { ok: true; firebaseProjectId: string; firebaseApiKey: string } | Extract<QaAccountResult, { ok: false }>;

function preflight(deps: QaAccountDeps): Preflight {
  let name: string;
  try {
    name = deps.databaseName();
  } catch (error) {
    return { ok: false, reason: "db-guard", message: error instanceof Error ? error.message : String(error) };
  }
  if (name !== QA_ACCOUNT_DB_NAME) {
    return {
      ok: false,
      reason: "db-guard",
      message: `Refusing database "${name}": the QA account lives only in ${QA_ACCOUNT_DB_NAME}.`,
    };
  }

  const firebaseProjectId = deps.firebaseProjectId?.trim() ?? "";
  const firebaseApiKey = deps.firebaseApiKey?.trim() ?? "";
  if (firebaseProjectId === "" || firebaseApiKey === "") {
    return {
      ok: false,
      reason: "missing-env",
      message: "FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_API_KEY must both be set.",
    };
  }
  return { ok: true, firebaseProjectId, firebaseApiKey };
}

export async function provisionQaAccount(args: { email: string }, deps: QaAccountDeps): Promise<QaAccountResult> {
  const checked = preflight(deps);
  if (!checked.ok) return checked;

  const adminRoleId = await deps.adminRoleId();
  if (!adminRoleId) {
    return { ok: false, reason: "no-admin-role", message: "The admin system role does not exist in this database." };
  }

  // An invite cannot elevate an existing AdminUser (resolveOrProvision returns
  // on the uid lookup first) — same refusal as seed:admin's `user-exists`.
  if (await deps.adminUserExists(args.email)) {
    return {
      ok: false,
      reason: "user-exists",
      message: "An AdminUser already holds this address; use rotate to change its password.",
    };
  }

  const password = deps.generatePassword();
  const existing = await deps.firebase.getUserByEmail(args.email);
  if (existing) {
    await deps.firebase.updateUser(existing.uid, { password, emailVerified: true });
  } else {
    await deps.firebase.createUser({ email: args.email, password, emailVerified: true });
  }

  // Credentials are stored BEFORE the invite: if the invite write fails, the
  // password is not lost and a re-run (createInvite is an upsert) finishes.
  await deps.writeQaEnv(
    mergeQaEnv(await deps.readQaEnv(), { email: args.email, password, firebaseApiKey: checked.firebaseApiKey }),
  );

  const invite = await deps.createAdminInvite({ email: args.email, roleIds: [adminRoleId], locale: "es-AR" });
  if (!invite.ok) {
    return { ok: false, reason: "invite-failed", message: "The invite write failed; re-run provision." };
  }

  return {
    ok: true,
    verb: "provision",
    firebaseProjectId: checked.firebaseProjectId,
    firebase: existing ? "updated" : "created",
    invite: invite.refreshed ? "refreshed" : "created",
    qaEnv: "written",
  };
}

export async function rotateQaPassword(deps: QaAccountDeps): Promise<QaAccountResult> {
  const checked = preflight(deps);
  if (!checked.ok) return checked;

  const current = await deps.readQaEnv();
  const { email } = storedCredentials(current);
  if (!email) {
    return { ok: false, reason: "not-provisioned", message: "qa-env.json holds no adminQa.users.admin account." };
  }

  const user = await deps.firebase.getUserByEmail(email);
  if (!user) {
    return { ok: false, reason: "not-provisioned", message: "No Firebase user exists for the stored account." };
  }

  const password = deps.generatePassword();
  await deps.firebase.updateUser(user.uid, { password });
  await deps.writeQaEnv(mergeQaEnv(current, { email, password, firebaseApiKey: checked.firebaseApiKey }));
  // Kill every session minted with the old password.
  await deps.firebase.revokeRefreshTokens(user.uid);

  return {
    ok: true,
    verb: "rotate",
    firebaseProjectId: checked.firebaseProjectId,
    firebase: "updated",
    qaEnv: "written",
    sessionsRevoked: true,
  };
}
