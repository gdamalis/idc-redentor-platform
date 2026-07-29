import { z } from "zod";
import { i18n } from "@src/i18n/config";
import type { Locale } from "@src/i18n/config";
import { normalizeEmail } from "@src/lib/auth/email";
import {
  getAdminDb,
  withAdminTransaction,
} from "@src/service/database.service";
import { listRoles, seedSystemRoles } from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { createInvite } from "@src/service/invite.service";
import { retainsAdministrability } from "./last-admin";
import type { AdminStateSnapshot } from "./last-admin";

export interface SeedArgs {
  readonly email: string;
  readonly locale: Locale;
  readonly force: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly sendEmail: boolean;
}

export type SeedAdminFailure =
  | "db-guard"
  | "admin-exists"
  | "invalid-email"
  | "write-failed";

/**
 * Discriminated on `dryRun` so a dry run is structurally incapable of
 * reporting ids it never created.
 */
export type SeedAdminResult =
  | { ok: true; dryRun: true }
  | {
      ok: true;
      dryRun: false;
      roleIds: string[];
      inviteId: string;
      refreshed: boolean;
    }
  | { ok: false; reason: SeedAdminFailure; message: string };

export type ParseSeedArgsResult =
  | { ok: true; args: SeedArgs }
  | { ok: false; reason: "usage" | "invalid-email"; message: string };

const BOOLEAN_FLAGS = {
  "--force": "force",
  "--yes": "yes",
  "--dry-run": "dryRun",
  "--send-email": "sendEmail",
} as const;

const VALUE_FLAGS = {
  "--email": "email",
  "--locale": "locale",
} as const;

export const USAGE = `Usage: pnpm --filter @idcr/admin seed:admin -- --email <address> [options]

  --email <address>   REQUIRED (or ADMIN_SEED_EMAIL). The first Admin's address.
  --locale <loc>      ${i18n.locales.join(" | ")}   (default: ${i18n.defaultLocale})
  --force             Proceed even when the panel is already self-administrable.
                      Never relaxes the database guard.
  --yes               Skip the interactive confirmation.
  --dry-run           Print the plan; write nothing.
  --send-email        Also send the courtesy invite email (opt-in; needs mail env).

Env:  MONGODB_URI (required - its PATH decides the target database)
      ADMIN_SEED_EMAIL (optional alternative to --email)
Exit: 0 success - 1 operation failure - 2 usage/guard refusal`;

const seedArgsSchema = z.object({
  email: z.string().min(1).email(),
  locale: z.enum(i18n.locales).default(i18n.defaultLocale),
  force: z.boolean().default(false),
  yes: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
});

export function parseSeedArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ParseSeedArgsResult {
  const raw: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (token in BOOLEAN_FLAGS) {
      raw[BOOLEAN_FLAGS[token as keyof typeof BOOLEAN_FLAGS]] = true;
      continue;
    }

    if (token in VALUE_FLAGS) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          reason: "usage",
          message: `${token} requires a value.`,
        };
      }
      raw[VALUE_FLAGS[token as keyof typeof VALUE_FLAGS]] = value;
      index += 1;
      continue;
    }

    return {
      ok: false,
      reason: "usage",
      message: `Unknown argument: ${token}`,
    };
  }

  // normalizeEmail trims + lowercases; it returns "" for null/undefined.
  const email = normalizeEmail(
    typeof raw.email === "string" ? raw.email : env.ADMIN_SEED_EMAIL,
  );
  if (!email) {
    return {
      ok: false,
      reason: "usage",
      message: "--email (or ADMIN_SEED_EMAIL) is required.",
    };
  }

  const parsed = seedArgsSchema.safeParse({ ...raw, email });
  if (!parsed.success) {
    const isEmailIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "email",
    );
    return {
      ok: false,
      reason: isEmailIssue ? "invalid-email" : "usage",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, args: parsed.data };
}

export function exitCodeFor(
  result:
    | SeedAdminResult
    | { ok: false; reason: "usage" | "invalid-email"; message: string },
): 0 | 1 | 2 {
  if (result.ok) return 0;
  return result.reason === "write-failed" ? 1 : 2;
}

/**
 * Guard 6. Returns the cluster hostname ONLY — never the userinfo, never the
 * raw string on a parse failure (which could itself contain a credential).
 */
export function redactMongoHost(uri: string | undefined): string {
  if (!uri) return "<unset>";
  try {
    const { hostname } = new URL(uri);
    return hostname === "" ? "<unparseable>" : hostname;
  } catch {
    return "<unparseable>";
  }
}

/**
 * The six collaborators, injected so tests control every one of them without
 * `vi.mock`. Each is an already-shipped function: this script orchestrates,
 * it never reimplements a guard.
 */
export interface SeedAdminDeps {
  readonly getAdminDb: typeof getAdminDb;
  readonly seedSystemRoles: typeof seedSystemRoles;
  readonly listRoles: typeof listRoles;
  readonly listUsers: typeof listUsers;
  readonly createInvite: typeof createInvite;
  readonly withAdminTransaction: typeof withAdminTransaction;
}

export const defaultSeedAdminDeps: SeedAdminDeps = {
  getAdminDb,
  seedSystemRoles,
  listRoles,
  listUsers,
  createInvite,
  withAdminTransaction,
};

/**
 * Retries the whole TRANSACTION, never the operation inside it: a duplicate
 * key inside a transaction aborts it server-side, and a same-session retry
 * would read the pre-race snapshot and could never observe the winner. Mirrors
 * `inviteUserAction`'s documented pattern.
 */
async function createBootstrapInvite(
  deps: SeedAdminDeps,
  input: { email: string; roleIds: string[]; locale: Locale },
): Promise<{ ok: true; inviteId: string; refreshed: boolean } | { ok: false }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await deps.withAdminTransaction((session) =>
      deps.createInvite(input, session),
    );
    if (result.ok) return result;
  }
  return { ok: false };
}

export async function seedAdmin(
  args: SeedArgs,
  deps: SeedAdminDeps = defaultSeedAdminDeps,
): Promise<SeedAdminResult> {
  // Guard 1 — wrong database. Delegated entirely to getAdminDb(), which throws
  // on any name outside its positive allowlist. Never relaxed by --force.
  try {
    deps.getAdminDb();
  } catch (error) {
    return {
      ok: false,
      reason: "db-guard",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // Guard 2 — already administrable. Evaluated BEFORE any write, so a refusal
  // leaves the database byte-for-byte untouched. On a fresh database the
  // snapshot is empty, the predicate is false, and the seed proceeds.
  const [users, roles] = await Promise.all([
    deps.listUsers(),
    deps.listRoles(),
  ]);
  const snapshot: AdminStateSnapshot = {
    users: users.map((user) => ({
      id: user._id.toHexString(),
      status: user.status,
      roleIds: user.roleIds,
    })),
    roles: roles.map((role) => ({
      id: role._id.toHexString(),
      permissions: role.permissions,
    })),
  };

  if (retainsAdministrability(snapshot) && !args.force) {
    return {
      ok: false,
      reason: "admin-exists",
      message:
        "The panel is already self-administrable — an active user holds both " +
        "users:manage and roles:manage. Pass --force only to recover from a genuine lockout.",
    };
  }

  if (args.dryRun) return { ok: true, dryRun: true };

  // Guard 3 — idempotency is inherited, never reimplemented: seedSystemRoles
  // upserts by the immutable Role.key with $setOnInsert, and createInvite is a
  // single atomic upsert on { email, status: "pending" }.
  await deps.seedSystemRoles();

  // seedSystemRoles returns void, so the Admin role id is read back by its
  // immutable key rather than by name.
  const seededRoles = await deps.listRoles();
  const adminRole = seededRoles.find((role) => role.key === "admin");
  if (!adminRole) {
    return {
      ok: false,
      reason: "write-failed",
      message:
        'No role with key "admin" exists after seedSystemRoles() — the seed did not apply.',
    };
  }

  const invite = await createBootstrapInvite(deps, {
    email: args.email,
    roleIds: [adminRole._id.toHexString()],
    locale: args.locale,
  });

  if (!invite.ok) {
    return {
      ok: false,
      reason: "write-failed",
      message:
        "Could not create the bootstrap invite: the upsert lost an insert race twice. Re-run the script.",
    };
  }

  return {
    ok: true,
    dryRun: false,
    roleIds: seededRoles
      .filter((role) => role.isSystem)
      .map((role) => role._id.toHexString()),
    inviteId: invite.inviteId,
    refreshed: invite.refreshed,
  };
}
