import { z } from "zod";
import { getAdminDb, withAdminTransaction } from "@src/service/database.service";
import { appendAuditEntry } from "@src/service/rbac-audit.service";
import { ensureRbacIndexes } from "@src/service/role.service";
import { roleSchema } from "@src/service/types";
import { redactMongoHost } from "./seed-admin";
import type { PermissionKey } from "./permissions";

const ROLES_COLLECTION = "roles";
const SCRIPT_ACTOR_ID = "script:grant-content-permissions";

export const CONTENT_PERMISSION_KEYS = [
  "content:read",
  "content:write",
  "content:publish",
  "content:publish-protected",
  "media:manage",
] as const satisfies readonly PermissionKey[];

export interface GrantContentPermissionsArgs {
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly actorEmail?: string;
}

export type GrantContentPermissionsFailure =
  | "db-guard"
  | "admin-role-not-found"
  | "write-failed";

export type GrantContentPermissionsResult =
  | {
      readonly ok: true;
      readonly dryRun: true;
      readonly databaseName: string;
      readonly roleId: string;
      readonly wouldAddKeys: PermissionKey[];
    }
  | {
      readonly ok: true;
      readonly dryRun: false;
      readonly databaseName: string;
      readonly roleId: string;
      readonly modified: boolean;
      readonly addedKeys: PermissionKey[];
    }
  | {
      readonly ok: false;
      readonly reason: GrantContentPermissionsFailure;
      readonly message: string;
    };

export type ParseGrantArgsResult =
  | { readonly ok: true; readonly args: GrantContentPermissionsArgs }
  | { readonly ok: false; readonly reason: "usage"; readonly message: string };

export const USAGE = `Usage: pnpm --filter @idcr/admin grant:content-permissions [options]

  --yes               Skip the interactive confirmation.
  --dry-run           Print the plan; write nothing.
  --actor <email>     Optional operator email recorded in rbacAudit (default: ${SCRIPT_ACTOR_ID}).

Env:  MONGODB_URI (required - its PATH decides the target database)
Exit: 0 success - 1 operation failure - 2 usage/guard refusal`;

const grantArgsSchema = z.object({
  yes: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  actorEmail: z.string().trim().email().optional(),
});

export function parseGrantArgs(
  argv: readonly string[],
): ParseGrantArgsResult {
  const raw: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (token === "--yes") {
      raw.yes = true;
      continue;
    }
    if (token === "--dry-run") {
      raw.dryRun = true;
      continue;
    }
    if (token === "--actor") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          reason: "usage",
          message: "--actor requires an email value.",
        };
      }
      raw.actorEmail = value;
      index += 1;
      continue;
    }

    return {
      ok: false,
      reason: "usage",
      message: `Unknown argument: ${token}`,
    };
  }

  const parsed = grantArgsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "usage",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, args: parsed.data };
}

export function exitCodeForGrant(
  result:
    | GrantContentPermissionsResult
    | { readonly ok: false; readonly reason: "usage"; readonly message: string },
): 0 | 1 | 2 {
  if (result.ok) return 0;
  return result.reason === "write-failed" ? 1 : 2;
}

export { redactMongoHost };

export interface GrantContentPermissionsDeps {
  readonly getAdminDb: typeof getAdminDb;
  readonly ensureRbacIndexes: typeof ensureRbacIndexes;
  readonly withAdminTransaction: typeof withAdminTransaction;
  readonly appendAuditEntry: typeof appendAuditEntry;
}

export const defaultGrantContentPermissionsDeps: GrantContentPermissionsDeps = {
  getAdminDb,
  ensureRbacIndexes,
  withAdminTransaction,
  appendAuditEntry,
};

/**
 * Idempotently grants the 5 content & media permissions to the stored system
 * `admin` role ONLY (`01-decisions.md`, `ICR-195` AC3).
 *
 * Uses `$addToSet: { permissions: { $each: CONTENT_PERMISSION_KEYS } }` inside
 * `withAdminTransaction`, and appends an `rbacAudit` `role.update` entry ONLY
 * when the document actually changed (`modifiedCount > 0`). Leader, Member, and
 * custom roles are never touched.
 */
export async function grantContentPermissions(
  args: GrantContentPermissionsArgs,
  deps: GrantContentPermissionsDeps = defaultGrantContentPermissionsDeps,
): Promise<GrantContentPermissionsResult> {
  let databaseName: string;
  try {
    databaseName = deps.getAdminDb().databaseName;
  } catch (error) {
    return {
      ok: false,
      reason: "db-guard",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  await deps.ensureRbacIndexes();

  return deps.withAdminTransaction(async (session) => {
    const roles = deps.getAdminDb().collection(ROLES_COLLECTION);
    const rawAdmin = await roles.findOne({ key: "admin" }, { session });

    if (!rawAdmin) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "admin-role-not-found",
        message:
          'No stored role with key "admin" was found. Run seed:admin first.',
      };
    }

    const adminRole = roleSchema.parse(rawAdmin);
    const roleId = adminRole._id.toHexString();
    const missingKeys = CONTENT_PERMISSION_KEYS.filter(
      (key) => !adminRole.permissions.includes(key),
    );

    if (args.dryRun) {
      await session.abortTransaction();
      return {
        ok: true,
        dryRun: true,
        databaseName,
        roleId,
        wouldAddKeys: missingKeys,
      };
    }

    if (missingKeys.length === 0) {
      return {
        ok: true,
        dryRun: false,
        databaseName,
        roleId,
        modified: false,
        addedKeys: [],
      };
    }

    const updateResult = await roles.updateOne(
      { key: "admin" },
      {
        $addToSet: { permissions: { $each: [...CONTENT_PERMISSION_KEYS] } },
        $set: { updatedAt: new Date() },
      },
      { session },
    );

    const modified = (updateResult.modifiedCount ?? 0) > 0;
    if (modified) {
      await deps.appendAuditEntry(
        {
          actorUserId: SCRIPT_ACTOR_ID,
          actorEmail: args.actorEmail ?? SCRIPT_ACTOR_ID,
          action: "role.update",
          targetId: roleId,
          before: { permissions: adminRole.permissions },
          after: { permissions: [...adminRole.permissions, ...missingKeys] },
        },
        session,
      );
    }

    return {
      ok: true,
      dryRun: false,
      databaseName,
      roleId,
      modified,
      addedKeys: modified ? missingKeys : [],
    };
  });
}
