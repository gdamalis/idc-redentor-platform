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
import { ADMIN_EQUIVALENT_KEYS, retainsAdministrability } from "./last-admin";
import { resolvePermissions } from "./resolve";
import type { AdminStateSnapshot } from "./last-admin";

export interface SeedArgs {
  readonly email: string;
  readonly locale: Locale;
  readonly force: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
}

export type SeedAdminFailure =
  | "db-guard"
  | "admin-exists"
  | "user-exists"
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
} as const;

const VALUE_FLAGS = {
  "--email": "email",
  "--locale": "locale",
} as const;

export const USAGE = `Usage: pnpm --filter @idcr/admin seed:admin --email <address> [options]

  --email <address>   REQUIRED (or ADMIN_SEED_EMAIL). The first Admin's address.
  --locale <loc>      ${i18n.locales.join(" | ")}   (default: ${i18n.defaultLocale})
  --force             Proceed even when the panel is already self-administrable.
                      Never relaxes the database guard.
  --yes               Skip the interactive confirmation.
  --dry-run           Print the plan; write nothing.

Env:  MONGODB_URI (required - its PATH decides the target database)
      ADMIN_SEED_EMAIL (optional alternative to --email)
Exit: 0 success - 1 operation failure - 2 usage/guard refusal`;

const seedArgsSchema = z.object({
  email: z.string().min(1).email(),
  locale: z.enum(i18n.locales).default(i18n.defaultLocale),
  force: z.boolean().default(false),
  yes: z.boolean().default(false),
  dryRun: z.boolean().default(false),
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
    const result = await deps.withAdminTransaction(async (session) => {
      const created = await deps.createInvite(input, session);
      if (!created.ok) {
        // The duplicate key already aborted this transaction SERVER-side, but
        // `withTransaction` does not know that — left alone it tries to commit
        // and can throw while finalising an aborted transaction, which would
        // escape this loop and skip the fresh-session retry entirely (Codex
        // P2). Aborting explicitly lets `withTransaction` return the result
        // cleanly so the retry below actually runs. Mirrors the established
        // path in `(app)/users/actions.ts`'s `inviteUserAction`.
        await session.abortTransaction();
      }
      return created;
    });
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

  // Guard 2b — the target must not already have an `AdminUser` (Codex P2).
  // An invite cannot elevate an existing account: `resolveOrProvision()` returns
  // early on `findUserByFirebaseUid` BEFORE it ever calls `claimPendingInvite`,
  // so for anyone who has signed in before, a bootstrap invite is inert — it
  // would sit `pending` forever while the script reported success. That failure
  // lands precisely on the lockout-recovery case guard 2 exists to permit (the
  // sole admin got DISABLED), which is the worst possible time to lie.
  //
  // Refusing is deliberate rather than "fix the account here": re-enabling or
  // re-roling an existing user is a different privilege operation with its own
  // design questions, and this script is a bootstrap, not a role-management
  // tool. `--force` does NOT override this — forcing would just create the same
  // inert invite. Reuses the `users` already read above, so it costs no query.
  const existingUser = users.find(
    (user) => normalizeEmail(user.email) === args.email,
  );
  if (existingUser) {
    return {
      ok: false,
      reason: "user-exists",
      message:
        `An AdminUser already exists for this address (status: ${existingUser.status}). ` +
        "A bootstrap invite cannot elevate an existing account — resolveOrProvision() " +
        "returns before claiming any invite once a user is bound to that Firebase uid, " +
        "so the invite would never be consumed. Grant the role from /users, or if the " +
        "account is disabled and nobody can administer the panel, fix that user document " +
        "directly. See docs/architecture/admin-bootstrap.md.",
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

  // Having a role KEYED "admin" is not the same as having an ADMINISTRATIVE
  // role (Codex P2). `seedSystemRoles()` seeds permissions under `$setOnInsert`
  // — deliberately, so a re-run never clobbers a hand-tuned system role — so an
  // Admin role whose permissions were previously edited down through the
  // `/roles` matrix survives the seed unchanged. (`updateRoleAction` blocks
  // DELETING a system role, not editing one.) Issuing the invite anyway would
  // provision a user who still cannot administer anything, while the CLI
  // reported success — the same lie guard 2b exists to prevent, and reachable
  // in exactly the lockout this script is run to fix.
  const granted = resolvePermissions([{ permissions: adminRole.permissions }]);
  const missing = ADMIN_EQUIVALENT_KEYS.filter((key) => !granted.has(key));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "write-failed",
      message:
        `The "admin" role exists but is missing ${missing.join(" and ")}, so an invite ` +
        "carrying it could not administer the panel. seedSystemRoles() preserves an " +
        "existing system role's permissions by design, so the seed cannot repair this. " +
        "Restore the missing permissions on that role (via /roles if anyone can still " +
        "reach it, otherwise on the role document directly) and re-run.",
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
