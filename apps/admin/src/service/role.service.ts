import { ObjectId } from "mongodb";
import type { ClientSession } from "mongodb";
import { getAdminDb } from "@src/service/database.service";
import { isDuplicateKeyError } from "@src/service/user.service";
import { PERMISSION_KEYS } from "@src/lib/rbac/permissions";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import { roleSchema } from "./types";
import type { Role, SystemRoleKey } from "./types";

const ROLES_COLLECTION = "roles";

/**
 * Memoized module-level promise (mirrors `user.service.ts`'s
 * `ensureAuthIndexes`): idempotent `createIndex` calls, called lazily from
 * every read/write entrypoint in this service (never at import time).
 */
let indexesPromise: Promise<void> | null = null;

export function ensureRbacIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const roles = getAdminDb().collection(ROLES_COLLECTION);

    await Promise.all([
      // Partial — custom roles have no `key`, so a plain unique index would
      // collide the moment a second one was missing it.
      roles.createIndex(
        { key: 1 },
        { unique: true, partialFilterExpression: { key: { $exists: true } } },
      ),
      roles.createIndex({ name: 1 }, { unique: true }),
    ]);
  })();

  return indexesPromise;
}

export async function listRoles(session?: ClientSession): Promise<Role[]> {
  await ensureRbacIndexes();
  const docs = await getAdminDb()
    .collection(ROLES_COLLECTION)
    .find({}, { session })
    .toArray();

  return docs.map((doc) => roleSchema.parse(doc));
}

export async function findRolesByIds(
  ids: readonly string[],
  session?: ClientSession,
): Promise<Role[]> {
  await ensureRbacIndexes();
  if (ids.length === 0) return [];

  const docs = await getAdminDb()
    .collection(ROLES_COLLECTION)
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { session })
    .toArray();

  return docs.map((doc) => roleSchema.parse(doc));
}

/** Locked at the design gate (spec §3): `calendar` has no `:write` key, and
 * "read+write" excludes `:delete` — so Leader is exactly these 9, never a
 * hand-copied slice of the registry. */
const LEADER_PERMISSIONS = [
  "people:read",
  "people:write",
  "people:pii",
  "families:read",
  "families:write",
  "activities:read",
  "activities:write",
  "calendar:read",
  "calendar:print",
] as const satisfies readonly PermissionKey[];

const MEMBER_PERMISSIONS = [
  "people:read",
  "calendar:read",
] as const satisfies readonly PermissionKey[];

interface SystemRoleSeed {
  readonly key: SystemRoleKey;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
}

const SYSTEM_ROLE_SEEDS: readonly SystemRoleSeed[] = [
  {
    key: "admin",
    // Derived from the registry — never a hand-copied list, so it cannot
    // drift as new permission keys are added.
    name: "Admin",
    description: "Full access to every module and to role/user management.",
    permissions: PERMISSION_KEYS,
  },
  {
    key: "leader",
    name: "Leader",
    description:
      "Manages people, families, and activities; prints the calendar.",
    permissions: LEADER_PERMISSIONS,
  },
  {
    key: "member",
    name: "Member",
    description: "Read-only access to people and the calendar.",
    permissions: MEMBER_PERMISSIONS,
  },
];

/**
 * Idempotent + non-destructive. Upserts by the immutable `key` (never
 * `name`), and puts `permissions`/`name`/`description` in `$setOnInsert` so a
 * re-run (a) creates nothing twice, (b) never resets a deliberately
 * hand-edited system role, and (c) never touches custom roles at all.
 */
export async function seedSystemRoles(): Promise<void> {
  await ensureRbacIndexes();
  const roles = getAdminDb().collection(ROLES_COLLECTION);
  const now = new Date();

  await Promise.all(
    SYSTEM_ROLE_SEEDS.map((seed) =>
      roles.updateOne(
        { key: seed.key },
        {
          $setOnInsert: {
            name: seed.name,
            description: seed.description,
            permissions: [...seed.permissions],
            createdAt: now,
          },
          $set: { key: seed.key, isSystem: true, updatedAt: now },
        },
        { upsert: true },
      ),
    ),
  );
}

export interface CreateRoleInput {
  readonly name: string;
  readonly description?: string;
  readonly permissions: readonly string[];
}

/**
 * Custom roles only — `key`/`isSystem` are never set here, matching
 * `Role.key`'s "SYSTEM roles only" contract. Maps the unique `name` index's
 * duplicate-key error to a refusal rather than letting it escape as a throw
 * (Global Constraints: no throw for control flow).
 */
export async function createRole(
  input: CreateRoleInput,
  session: ClientSession,
): Promise<{ ok: true; roleId: string } | { ok: false; reason: "conflict" }> {
  await ensureRbacIndexes();
  const now = new Date();

  try {
    const result = await getAdminDb()
      .collection(ROLES_COLLECTION)
      .insertOne(
        {
          name: input.name,
          description: input.description,
          permissions: [...input.permissions],
          isSystem: false,
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );
    return { ok: true, roleId: result.insertedId.toHexString() };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { ok: false, reason: "conflict" };
    throw error;
  }
}

export interface UpdateRoleInput {
  readonly roleId: string;
  readonly name: string;
  readonly description?: string;
  readonly permissions: readonly string[];
}

/** Never writes `key` or `isSystem` — neither is updatable, by construction. */
export async function updateRole(
  input: UpdateRoleInput,
  session: ClientSession,
): Promise<void> {
  await ensureRbacIndexes();
  await getAdminDb().collection(ROLES_COLLECTION).updateOne(
    { _id: new ObjectId(input.roleId) },
    {
      $set: {
        name: input.name,
        description: input.description,
        permissions: [...input.permissions],
        updatedAt: new Date(),
      },
    },
    { session },
  );
}

export async function deleteRole(
  roleId: string,
  session: ClientSession,
): Promise<void> {
  await ensureRbacIndexes();
  await getAdminDb()
    .collection(ROLES_COLLECTION)
    .deleteOne({ _id: new ObjectId(roleId) }, { session });
}
