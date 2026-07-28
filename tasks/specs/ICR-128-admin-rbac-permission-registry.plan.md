# ICR-128 — Admin RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` composed with
> `superpowers:executing-plans` (the `/work` harness dispatches one `divinelab:implementer` per
> checkpoint). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship granular, server-enforced RBAC for `apps/admin` — a 15-key permission registry, three
seeded system roles, a permission-matrix UI, user/invite management, and a last-admin invariant that
cannot be violated.

**Architecture:** Five layers, correctness concentrated in a pure core. A const-map **registry** feeds
both Zod validation (write side) and resolution filtering (read side). Two **pure functions**
(`resolvePermissions`, `retainsAdministrability`) hold all the logic that can be wrong, so they are
exhaustively unit-testable. A `cache()`-memoized **`requirePermission`** is the single IO boundary.
**Services** wrap every mutation in a Mongo transaction that asserts the invariant against a proposed
post-state and appends an audit entry. The **UI** gates nav and screens as convenience only.

**Tech Stack:** Next.js 16.2.9 (App Router, RSC) · React 19.2.1 · TypeScript 5.9 strict ·
mongodb 6.21.0 · zod 3.25.76 · next-intl 4.13 · Tailwind 4 · Vitest 4 · `@radix-ui/react-dialog` (new)

**Spec:** `tasks/specs/ICR-128-admin-rbac-permission-registry.md` — read it first.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Functional-first, no classes.** Model failures as return values — a discriminated union
  (`{ ok: true; … } | { ok: false; reason: … }`) or `null`. **Never** throw a custom `Error` subclass
  for control flow. The one sanctioned throw in this app is `database.service.ts`'s DB-name
  assertion (a deployment defect, not a branchable outcome) — do not add a second.
- **No enums.** Const maps with `as const satisfies`. Prefer `interface` for object shapes.
- **`??` over `||`.**
- **RSC-first.** `'use client'` only where interactivity demands it (the matrix and the invite dialog).
- **Always `await`** `cookies()`, `headers()`, `params`, `searchParams`.
- **Untrusted-shape defense (existing repo convention, `service/types.ts:45`):** every Mongo document
  is parsed through a Zod schema before use — `adminUserSchema.parse(doc)`. `Role` and
  `RbacAuditEntry` must follow this.
- **Mongo access** only via `getAdminDb()`. Never a bare `client.db()` — an ESLint
  `no-restricted-syntax` rule enforces this. **Do not modify the DB-name assertions.**
- **Every user-facing string exists in BOTH** `apps/admin/messages/es-AR.json` and `en-US.json`.
  Default locale is `es-AR`.
- **Commits:** Conventional Commits, header ≤ 100 chars, scope `ICR-128`.
- **Verification after every checkpoint:** `pnpm --filter @idcr/admin type-check`, `lint`, `test`.

### Transaction rules (verified against mongodb 6.21.0 `mongodb.d.ts:2494`, `:9025`)

`withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T>` — returns the callback's
value. Three driver behaviours that will silently break this feature if ignored:

1. **Every operation inside the callback MUST receive `{ session }`.** The driver's own docs
   (`mongodb.d.ts:2468`): _"if it is not provided the explicit session in its options, it will not be
   part of the transaction."_ An un-sessioned read inside the callback is the single most likely bug
   in this ticket — it makes the invariant check read stale, uncommitted-invisible data.
2. **The callback may run more than once** (`:2476` — the driver retries). It must therefore be
   idempotent and must not mutate anything outside its own scope.
3. **Do not silently swallow errors inside the callback** (`:2487`) — the driver can then retry
   indefinitely. To refuse _without_ throwing, call `await session.abortTransaction()` and return the
   refusal: _"If the transaction is manually aborted within the provided function it will not throw"_
   (`:2475`). **This is the sanctioned functional-first refusal path.**

---

## File Structure

| File                                    | Responsibility                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/rbac/permissions.ts`               | The 15-key registry. Zero imports. The single source of truth for what a permission key _is_. |
| `lib/rbac/resolve.ts`                   | Pure: roles → permission set. Filters unknown keys.                                           |
| `lib/rbac/last-admin.ts`                | Pure: the administrability invariant over a proposed post-state.                              |
| `lib/rbac/schemas.ts`                   | Zod schemas derived from the registry. Server-only inputs.                                    |
| `lib/rbac/pii.ts`                       | Pure: `people:pii` field omission.                                                            |
| `lib/rbac/require-permission.ts`        | The only IO boundary. `cache()`-memoized.                                                     |
| `service/role.service.ts`               | `roles` collection: CRUD, idempotent seed, indexes.                                           |
| `service/rbac-audit.service.ts`         | `rbacAudit` collection: append-only writes.                                                   |
| `service/database.service.ts`           | _(modify)_ add `withAdminTransaction`.                                                        |
| `service/types.ts`                      | _(modify)_ add `Role`, `RbacAuditEntry`, `ActionResult` + their Zod schemas.                  |
| `(app)/roles/*`                         | Roles screen + its Server Actions.                                                            |
| `(app)/users/*`                         | Users screen + its Server Actions.                                                            |
| `components/rbac/permission-denied.tsx` | Localized in-page 403 panel.                                                                  |
| `components/ui/{table,dialog}.tsx`      | Primitives (only `button.tsx` + `input.tsx` exist today).                                     |

---

## Task 1: Permission registry, pure resolution, and Zod schemas

**Files:**

- Create: `apps/admin/src/lib/rbac/permissions.ts`, `permissions.test.ts`
- Create: `apps/admin/src/lib/rbac/resolve.ts`, `resolve.test.ts`
- Create: `apps/admin/src/lib/rbac/schemas.ts`, `schemas.test.ts`

**Interfaces:**

- Consumes: nothing (this is the root of the dependency graph).
- Produces: `PERMISSIONS`, `PermissionKey`, `PERMISSION_KEYS: [PermissionKey, ...PermissionKey[]]`,
  `isPermissionKey(v: unknown): v is PermissionKey`, `resolvePermissions(roles): ReadonlySet<PermissionKey>`,
  `hasPermission(granted, key): boolean`, and the six schemas in `schemas.ts`.

- [ ] **Step 1: Write the failing registry test**

```ts
// apps/admin/src/lib/rbac/permissions.test.ts
import { describe, expect, it } from "vitest";
import { PERMISSIONS, PERMISSION_KEYS, isPermissionKey } from "./permissions";

describe("PERMISSIONS registry", () => {
  it("contains exactly the 15 M1b keys", () => {
    expect(PERMISSION_KEYS).toHaveLength(15);
    expect([...PERMISSION_KEYS].sort()).toEqual(
      [
        "activities:delete",
        "activities:read",
        "activities:write",
        "calendar:print",
        "calendar:read",
        "families:read",
        "families:write",
        "people:delete",
        "people:pii",
        "people:read",
        "people:write",
        "roles:manage",
        "roles:read",
        "users:manage",
        "users:read",
      ].sort(),
    );
  });

  it("every key is resource:action shaped", () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z]+:[a-z]+$/);
  });

  it("isPermissionKey accepts registry keys and rejects everything else", () => {
    expect(isPermissionKey("people:read")).toBe(true);
    expect(isPermissionKey("finances:write")).toBe(false);
    expect(isPermissionKey("*")).toBe(false);
    expect(isPermissionKey("toString")).toBe(false); // prototype-pollution guard
    expect(isPermissionKey(null)).toBe(false);
    expect(isPermissionKey(42)).toBe(false);
  });

  it("PERMISSIONS values are non-empty dev-facing fallbacks", () => {
    for (const key of PERMISSION_KEYS)
      expect(PERMISSIONS[key].length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm --filter @idcr/admin test src/lib/rbac/permissions.test.ts`
Expected: FAIL — cannot resolve `./permissions`.

- [ ] **Step 3: Implement the registry**

```ts
// apps/admin/src/lib/rbac/permissions.ts

/**
 * The M1b permission catalog (`tasks/specs/admin-mvp.md` §6). Keys are
 * `resource:action`, so the matrix UI groups rows by prefix and a new feature
 * appends a key here WITHOUT touching the UI.
 *
 * The values are DEV-FACING FALLBACKS, never rendered — user-visible labels come
 * from next-intl (`permissions.<key>.label`). See the spec §8.
 */
export const PERMISSIONS = {
  "people:read": "View people",
  "people:write": "Create/edit people",
  "people:delete": "Delete people",
  "people:pii": "View sensitive fields (phone/email)",
  "families:read": "View families",
  "families:write": "Create/edit families",
  "activities:read": "View activities",
  "activities:write": "Create/edit activities",
  "activities:delete": "Delete activities",
  "calendar:read": "View calendar",
  "calendar:print": "Print calendar",
  "users:read": "View users",
  "users:manage": "Invite users, assign roles",
  "roles:read": "View roles",
  "roles:manage": "Create/edit roles + permissions",
} as const satisfies Record<string, string>;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Non-empty tuple — the exact shape `z.enum()` requires. */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [
  PermissionKey,
  ...PermissionKey[],
];

/**
 * `hasOwnProperty` via `Object.prototype`, not `key in PERMISSIONS` — the latter
 * would return true for inherited members like `toString`.
 */
export function isPermissionKey(value: unknown): value is PermissionKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PERMISSIONS, value)
  );
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm --filter @idcr/admin test src/lib/rbac/permissions.test.ts` → PASS (4 tests).

- [ ] **Step 5: Write the failing resolve test**

```ts
// apps/admin/src/lib/rbac/resolve.test.ts
import { describe, expect, it } from "vitest";
import { hasPermission, resolvePermissions } from "./resolve";

describe("resolvePermissions", () => {
  it("unions permissions across roles", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read"] },
      { permissions: ["calendar:read"] },
    ]);
    expect([...granted].sort()).toEqual(["calendar:read", "people:read"]);
  });

  it("dedupes overlapping permissions", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read"] },
      { permissions: ["people:read"] },
    ]);
    expect(granted.size).toBe(1);
  });

  it("IGNORES stored keys absent from the registry (fail-closed on drift)", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read", "finances:write", "*", "toString"] },
    ]);
    expect([...granted]).toEqual(["people:read"]);
  });

  it("returns an empty set for no roles", () => {
    expect(resolvePermissions([]).size).toBe(0);
  });
});

describe("hasPermission", () => {
  it("is true only for a granted key", () => {
    const granted = resolvePermissions([{ permissions: ["people:read"] }]);
    expect(hasPermission(granted, "people:read")).toBe(true);
    expect(hasPermission(granted, "people:write")).toBe(false);
  });
});
```

- [ ] **Step 6: Run and verify it fails** — `pnpm --filter @idcr/admin test src/lib/rbac/resolve.test.ts`

- [ ] **Step 7: Implement resolve**

```ts
// apps/admin/src/lib/rbac/resolve.ts
import { isPermissionKey } from "./permissions";
import type { PermissionKey } from "./permissions";

/** Only the field this function needs — keeps it usable with post-state snapshots. */
export interface PermissionSource {
  readonly permissions: readonly string[];
}

/**
 * Pure. Union of every role's permissions, FILTERED through the registry: a key
 * that is stored but no longer registered (renamed/removed feature) grants
 * nothing. Read-side twin of the write-side `z.enum(PERMISSION_KEYS)` guard —
 * reject at write, ignore at read.
 */
export function resolvePermissions(
  roles: readonly PermissionSource[],
): ReadonlySet<PermissionKey> {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of role.permissions) {
      if (isPermissionKey(key)) granted.add(key);
    }
  }
  return granted;
}

export function hasPermission(
  granted: ReadonlySet<PermissionKey>,
  key: PermissionKey,
): boolean {
  return granted.has(key);
}
```

- [ ] **Step 8: Run and verify it passes** (5 tests)

- [ ] **Step 9: Write the failing schema test**

```ts
// apps/admin/src/lib/rbac/schemas.test.ts
import { describe, expect, it } from "vitest";
import {
  inviteCreateSchema,
  roleUpdateSchema,
  userStatusUpdateSchema,
} from "./schemas";

const OID = "507f1f77bcf86cd799439011";

describe("roleUpdateSchema", () => {
  it("accepts registry keys", () => {
    const parsed = roleUpdateSchema.safeParse({
      roleId: OID,
      name: "Leader",
      permissions: ["people:read"],
    });
    expect(parsed.success).toBe(true);
  });

  it("REJECTS a permission key absent from the registry", () => {
    for (const bad of ["finances:write", "*", "people:read "]) {
      expect(
        roleUpdateSchema.safeParse({
          roleId: OID,
          name: "X",
          permissions: [bad],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a malformed roleId", () => {
    expect(
      roleUpdateSchema.safeParse({ roleId: "nope", name: "X", permissions: [] })
        .success,
    ).toBe(false);
  });

  it("silently drops key and isSystem (not updatable)", () => {
    const parsed = roleUpdateSchema.parse({
      roleId: OID,
      name: "X",
      permissions: [],
      key: "admin",
      isSystem: false,
    });
    expect(parsed).not.toHaveProperty("key");
    expect(parsed).not.toHaveProperty("isSystem");
  });

  it("rejects an empty name", () => {
    expect(
      roleUpdateSchema.safeParse({ roleId: OID, name: "   ", permissions: [] })
        .success,
    ).toBe(false);
  });
});

describe("inviteCreateSchema", () => {
  it("normalizes the email to trimmed lowercase", () => {
    expect(
      inviteCreateSchema.parse({ email: "  Ana@IDCR.org ", roleIds: [OID] })
        .email,
    ).toBe("ana@idcr.org");
  });

  it("requires at least one role", () => {
    expect(
      inviteCreateSchema.safeParse({ email: "a@b.co", roleIds: [] }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteCreateSchema.safeParse({ email: "nope", roleIds: [OID] }).success,
    ).toBe(false);
  });
});

describe("userStatusUpdateSchema", () => {
  it("accepts only active/disabled", () => {
    expect(
      userStatusUpdateSchema.safeParse({ userId: OID, status: "active" })
        .success,
    ).toBe(true);
    expect(
      userStatusUpdateSchema.safeParse({ userId: OID, status: "deleted" })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 10: Run and verify it fails**

- [ ] **Step 11: Implement the schemas**

```ts
// apps/admin/src/lib/rbac/schemas.ts
import { z } from "zod";
import { PERMISSION_KEYS } from "./permissions";

/**
 * Hex-string check rather than importing `ObjectId` from mongodb — keeps the
 * driver out of anything a client component might ever import.
 */
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "invalid-id");

/**
 * Registry-DERIVED, never a free string. This is the mass-assignment defence:
 * a crafted POST cannot persist "finances:write" or "*" onto a role.
 */
const permissionKeySchema = z.enum(PERMISSION_KEYS);

const roleFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionKeySchema).default([]),
};

// `key` and `isSystem` are absent by construction — they are NOT updatable.
// zod strips unknown keys by default, so passing them is silently ignored.
export const roleCreateSchema = z.object(roleFields);
export const roleUpdateSchema = z.object({ roleId: objectId, ...roleFields });
export const roleDeleteSchema = z.object({ roleId: objectId });

export const inviteCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  roleIds: z.array(objectId).min(1),
});

export const userRolesUpdateSchema = z.object({
  userId: objectId,
  roleIds: z.array(objectId),
});

export const userStatusUpdateSchema = z.object({
  userId: objectId,
  status: z.enum(["active", "disabled"]),
});
```

- [ ] **Step 12: Run the full admin suite and verify green**

Run: `pnpm --filter @idcr/admin test && pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin lint`

- [ ] **Step 13: Commit**

```bash
git add apps/admin/src/lib/rbac/
git commit -m "feat(ICR-128): add permission registry, pure resolution, and zod schemas"
```

---

## Task 2: The administrability invariant

The last-admin guard is **an invariant over a proposed post-state, not an admin count**. Counting
admins misses the path that actually bricks the panel: unchecking `roles:manage` on the Admin _role_
demotes every admin at once.

**Files:**

- Create: `apps/admin/src/lib/rbac/last-admin.ts`, `last-admin.test.ts`

**Interfaces:**

- Consumes: `resolvePermissions` (Task 1).
- Produces: `AdminStateSnapshot`, `retainsAdministrability(state): boolean`, `ADMIN_EQUIVALENT_KEYS`.

- [ ] **Step 1: Write the failing test — all five paths plus boundaries**

```ts
// apps/admin/src/lib/rbac/last-admin.test.ts
import { describe, expect, it } from "vitest";
import { retainsAdministrability } from "./last-admin";
import type { AdminStateSnapshot } from "./last-admin";

const ADMIN_ROLE = {
  id: "r-admin",
  permissions: ["users:manage", "roles:manage"],
};
const LEADER_ROLE = {
  id: "r-leader",
  permissions: ["people:read", "people:write"],
};

const base = (over: Partial<AdminStateSnapshot> = {}): AdminStateSnapshot => ({
  users: [{ id: "u1", status: "active", roleIds: ["r-admin"] }],
  roles: [ADMIN_ROLE, LEADER_ROLE],
  ...over,
});

describe("retainsAdministrability", () => {
  it("holds with one active admin", () => {
    expect(retainsAdministrability(base())).toBe(true);
  });

  // --- path 1: delete the last admin user
  it("fails when the last admin user is removed", () => {
    expect(retainsAdministrability(base({ users: [] }))).toBe(false);
  });

  // --- path 2: disable the last admin user
  it("fails when the last admin user is disabled", () => {
    expect(
      retainsAdministrability(
        base({
          users: [{ id: "u1", status: "disabled", roleIds: ["r-admin"] }],
        }),
      ),
    ).toBe(false);
  });

  // --- path 3: remove the Admin role from the last admin user
  it("fails when the last admin user loses the admin role", () => {
    expect(
      retainsAdministrability(
        base({
          users: [{ id: "u1", status: "active", roleIds: ["r-leader"] }],
        }),
      ),
    ).toBe(false);
  });

  // --- path 4: uncheck users:manage/roles:manage on the Admin ROLE (the matrix path)
  it("fails when the admin role loses roles:manage", () => {
    expect(
      retainsAdministrability(
        base({
          roles: [
            { id: "r-admin", permissions: ["users:manage"] },
            LEADER_ROLE,
          ],
        }),
      ),
    ).toBe(false);
  });

  // --- path 5: delete the Admin role entirely
  it("fails when the admin role is deleted", () => {
    expect(retainsAdministrability(base({ roles: [LEADER_ROLE] }))).toBe(false);
  });

  // --- boundaries
  it("requires BOTH keys, not either", () => {
    expect(
      retainsAdministrability(
        base({
          roles: [{ id: "r-admin", permissions: ["users:manage"] }],
        }),
      ),
    ).toBe(false);
  });

  it("holds when the two keys come from two DIFFERENT roles combined", () => {
    expect(
      retainsAdministrability({
        users: [{ id: "u1", status: "active", roleIds: ["r-a", "r-b"] }],
        roles: [
          { id: "r-a", permissions: ["users:manage"] },
          { id: "r-b", permissions: ["roles:manage"] },
        ],
      }),
    ).toBe(true);
  });

  it("holds when a second active admin remains", () => {
    expect(
      retainsAdministrability(
        base({
          users: [
            { id: "u1", status: "disabled", roleIds: ["r-admin"] },
            { id: "u2", status: "active", roleIds: ["r-admin"] },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("ignores dangling roleIds that reference a deleted role", () => {
    expect(
      retainsAdministrability(
        base({
          users: [
            { id: "u1", status: "active", roleIds: ["r-admin", "r-ghost"] },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("ignores unregistered stored keys when deciding administrability", () => {
    expect(
      retainsAdministrability({
        users: [{ id: "u1", status: "active", roleIds: ["r-x"] }],
        roles: [
          {
            id: "r-x",
            permissions: ["users:manage", "roles:manage", "bogus:key"],
          },
        ],
      }),
    ).toBe(true);
  });

  it("fails on an empty system", () => {
    expect(retainsAdministrability({ users: [], roles: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify it fails** — `pnpm --filter @idcr/admin test src/lib/rbac/last-admin.test.ts`

- [ ] **Step 3: Implement the invariant**

```ts
// apps/admin/src/lib/rbac/last-admin.ts
import { resolvePermissions } from "./resolve";
import type { PermissionKey } from "./permissions";

/**
 * Holding EITHER of these is admin-equivalent in effect (anyone with one can
 * grant themselves the other), so administrability requires BOTH to survive
 * somewhere — otherwise the panel can reach a state nobody can repair.
 */
export const ADMIN_EQUIVALENT_KEYS = [
  "users:manage",
  "roles:manage",
] as const satisfies readonly PermissionKey[];

export interface AdminStateSnapshot {
  readonly users: readonly {
    readonly id: string;
    readonly status: "active" | "disabled";
    readonly roleIds: readonly string[];
  }[];
  readonly roles: readonly {
    readonly id: string;
    readonly permissions: readonly string[];
  }[];
}

/**
 * THE invariant. Pure, and evaluated against a PROPOSED POST-STATE — which is
 * why one predicate covers all five mutation paths (delete user · disable user ·
 * remove a role from a user · edit the Admin role's permissions · delete a role).
 * A naive "count the admins" check cannot see the matrix path at all.
 */
export function retainsAdministrability(state: AdminStateSnapshot): boolean {
  const rolesById = new Map(state.roles.map((role) => [role.id, role]));

  return state.users.some((user) => {
    if (user.status !== "active") return false;

    const roles = user.roleIds
      .map((id) => rolesById.get(id))
      .filter((role) => role !== undefined);

    const granted = resolvePermissions(roles);
    return ADMIN_EQUIVALENT_KEYS.every((key) => granted.has(key));
  });
}
```

- [ ] **Step 4: Run and verify it passes** (13 tests)

- [ ] **Step 5: Mutation-check the test suite** (this repo's ICR-108/ICR-18 rule: prove a gate by
      mutation or it is decoration)

Temporarily change `ADMIN_EQUIVALENT_KEYS.every` to `.some` and re-run. Expected: the "requires BOTH
keys, not either" test goes RED. Then `git checkout -- apps/admin/src/lib/rbac/last-admin.ts` and
confirm `git status --porcelain` shows the file unmodified before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/rbac/last-admin.ts apps/admin/src/lib/rbac/last-admin.test.ts
git commit -m "feat(ICR-128): add last-admin invariant over proposed post-state"
```

---

## Task 3: Role + audit services, seed, indexes, transaction helper

**Files:**

- Modify: `apps/admin/src/service/types.ts` (append `Role`, `RbacAuditEntry`, `ActionResult` + schemas)
- Modify: `apps/admin/src/service/database.service.ts` (append `withAdminTransaction` only)
- Create: `apps/admin/src/service/role.service.ts`, `role.service.test.ts`
- Create: `apps/admin/src/service/rbac-audit.service.ts`, `rbac-audit.service.test.ts`

**Interfaces:**

- Consumes: `getAdminDb` (existing), `PERMISSION_KEYS` + `retainsAdministrability` (Tasks 1–2).
- Produces: `withAdminTransaction<T>(fn)`, `ensureRbacIndexes()`, `findRolesByIds(ids, session?)`,
  `listRoles(session?)`, `seedSystemRoles()`, `appendAuditEntry(entry, session)`, and the
  `Role` / `RbacAuditEntry` / `ActionResult` types.
  _(The role MUTATORS — `createRole`/`updateRole`/`deleteRole` — are deliberately NOT here: they are
  added in Task 5, alongside the actions that call them, so their shape is driven by a real caller.)_

- [ ] **Step 1: Add the types (no test — types are checked by `type-check`)**

Append to `apps/admin/src/service/types.ts`, reusing the file's existing `objectIdSchema`:

```ts
export type SystemRoleKey = "admin" | "leader" | "member";

export interface Role {
  _id: ObjectId;
  /** Immutable; SYSTEM roles only. Custom roles have none. Never updatable. */
  key?: SystemRoleKey;
  name: string;
  description?: string;
  permissions: string[]; // stored loosely; resolvePermissions() filters to the registry
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const roleSchema = z.object({
  _id: objectIdSchema,
  key: z.enum(["admin", "leader", "member"]).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  isSystem: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Role>;

export type RbacAuditAction =
  | "role.create"
  | "role.update"
  | "role.delete"
  | "user.invite"
  | "user.roles.update"
  | "user.disable"
  | "user.enable"
  | "user.delete";

export interface RbacAuditEntry {
  _id: ObjectId;
  at: Date;
  actorUserId: string;
  actorEmail: string;
  action: RbacAuditAction;
  targetId: string;
  before: unknown | null;
  after: unknown | null;
}

/** Every Server Action returns this. Nothing throws. */
export type ActionFailureReason =
  | "unauthenticated"
  | "no-account"
  | "disabled"
  | "forbidden"
  | "last-admin"
  | "system-role"
  | "invalid"
  | "not-found"
  | "conflict";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: ActionFailureReason;
      fieldErrors?: Record<string, string[]>;
    };
```

- [ ] **Step 2: Add `withAdminTransaction` to `database.service.ts`**

Append at the end. **Do not touch `assertAdminDbName` / `assertWebsiteDbName` / the accessors** —
they are the security boundary and are covered by existing tests.

```ts
/**
 * The ONE place transactions are created, so the MongoClient stays private to
 * this module (same reason `getAdminClient` is not exported).
 *
 * CALLERS MUST pass the `session` into EVERY operation inside `fn` — an
 * un-sessioned operation silently runs OUTSIDE the transaction
 * (mongodb 6.21.0 `mongodb.d.ts:2468`). `fn` may also be RETRIED by the driver,
 * so it must be idempotent and must not mutate outer state.
 */
export async function withAdminTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = getAdminClient().startSession();
  try {
    return await session.withTransaction((s) => fn(s));
  } finally {
    await session.endSession();
  }
}
```

Add `ClientSession` to the existing type import from `mongodb`.

- [ ] **Step 3: Write the failing role-service test** (mock `database.service`, the repo's convention —
      see `user.service.test.ts` for the `vi.resetModules()` + `loadService()` pattern that the
      memoized index promise requires)

```ts
// apps/admin/src/service/role.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createIndex = vi.fn().mockResolvedValue("ok");
const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const find = vi.fn();
const collection = vi.fn(() => ({ createIndex, updateOne, find }));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({ collection }),
  withAdminTransaction: (fn: (s: unknown) => Promise<unknown>) =>
    fn({ id: "session" }),
}));

async function loadService() {
  vi.resetModules();
  return import("./role.service");
}

beforeEach(() => vi.clearAllMocks());

describe("seedSystemRoles", () => {
  it("upserts exactly three system roles", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    expect(updateOne).toHaveBeenCalledTimes(3);
  });

  it("seeds Leader with exactly the 9 agreed keys", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    const leader = updateOne.mock.calls.find(
      ([filter]) => filter.key === "leader",
    );
    expect(leader?.[1].$setOnInsert.permissions.sort()).toEqual([
      "activities:read",
      "activities:write",
      "calendar:print",
      "calendar:read",
      "families:read",
      "families:write",
      "people:pii",
      "people:read",
      "people:write",
    ]);
  });

  it("seeds Admin with all 15 keys", async () => {
    const { seedSystemRoles } = await loadService();
    const { PERMISSION_KEYS } = await import("@src/lib/rbac/permissions");
    await seedSystemRoles();
    const admin = updateOne.mock.calls.find(
      ([filter]) => filter.key === "admin",
    );
    expect(admin?.[1].$setOnInsert.permissions).toHaveLength(
      PERMISSION_KEYS.length,
    );
  });

  it("is NON-DESTRUCTIVE: permissions go in $setOnInsert, never $set", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    for (const [, update] of updateOne.mock.calls) {
      expect(update.$setOnInsert).toHaveProperty("permissions");
      expect(update.$set ?? {}).not.toHaveProperty("permissions");
      expect(update.$set ?? {}).not.toHaveProperty("name");
    }
  });

  it("upserts by the stable key, never by name", async () => {
    const { seedSystemRoles } = await loadService();
    await seedSystemRoles();
    for (const [filter, , options] of updateOne.mock.calls) {
      expect(Object.keys(filter)).toEqual(["key"]);
      expect(options).toMatchObject({ upsert: true });
    }
  });
});

describe("ensureRbacIndexes", () => {
  it("creates the partial-unique key index and the name index", async () => {
    const { ensureRbacIndexes } = await loadService();
    await ensureRbacIndexes();
    expect(createIndex).toHaveBeenCalledWith(
      { key: 1 },
      { unique: true, partialFilterExpression: { key: { $exists: true } } },
    );
    expect(createIndex).toHaveBeenCalledWith({ name: 1 }, { unique: true });
  });

  it("is memoized across calls", async () => {
    const { ensureRbacIndexes } = await loadService();
    await ensureRbacIndexes();
    const after = createIndex.mock.calls.length;
    await ensureRbacIndexes();
    expect(createIndex.mock.calls.length).toBe(after);
  });
});
```

- [ ] **Step 4: Run and verify it fails**

- [ ] **Step 5: Implement `role.service.ts`**

Mirror `user.service.ts` exactly: `const ROLES_COLLECTION = "roles"`, a module-level memoized
`indexesPromise` with `??=`, `await ensureRbacIndexes()` at the top of every entrypoint, and
`roleSchema.parse(doc)` on every read.

Required exports:

```ts
export function ensureRbacIndexes(): Promise<void>; // roles: {key:1} partial-unique, {name:1} unique
export async function listRoles(session?: ClientSession): Promise<Role[]>;
export async function findRolesByIds(
  ids: readonly string[],
  session?: ClientSession,
): Promise<Role[]>;
export async function seedSystemRoles(): Promise<void>;
```

`SYSTEM_ROLE_SEEDS` is a const array of `{ key, name, description, permissions }`. Admin gets
`[...PERMISSION_KEYS]`. **Leader gets exactly these 9** (locked at the design gate — `calendar` has no
`write` key, and "read+write" excludes `:delete`):

```ts
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
```

Member gets `["people:read", "calendar:read"]`.

Each seed is one `updateOne({ key }, { $setOnInsert: { name, description, permissions, createdAt }, $set: { key, isSystem: true, updatedAt } }, { upsert: true })`. `$setOnInsert` is what makes a
re-run non-destructive to a hand-edited role; `key` in the filter is what makes it non-duplicating.

- [ ] **Step 6: Run and verify it passes** (7 tests)

- [ ] **Step 7: Implement `rbac-audit.service.ts` + its test**

```ts
export async function appendAuditEntry(
  entry: Omit<RbacAuditEntry, "_id" | "at">,
  session: ClientSession, // REQUIRED — the audit write must join the caller's transaction
): Promise<void>;
```

Test asserts: the insert receives `{ session }`, `at` is set server-side (not caller-supplied), and
the `rbacAudit` indexes (`{at:-1}`, `{targetId:1, at:-1}`) are created.

- [ ] **Step 8: Full verification**

Run: `pnpm --filter @idcr/admin type-check && lint && test`. Confirm the existing
`database.service.test.ts` DB-name assertion tests still pass untouched.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/service/
git commit -m "feat(ICR-128): add role and rbac-audit services with transactional guards"
```

---

## Task 4: `requirePermission`, denied state, nav gating, stub-page gates

**Files:**

- Create: `apps/admin/src/lib/rbac/require-permission.ts`, `require-permission.test.ts`
- Create: `apps/admin/src/components/rbac/permission-denied.tsx`
- Modify: `apps/admin/src/components/shell/sidebar.tsx`
- Modify: `apps/admin/src/app/[locale]/(app)/{people,families,activities,calendar}/page.tsx`

**Interfaces:**

- Consumes: `getCurrentUser` (existing), `findRolesByIds` (Task 3), `resolvePermissions` (Task 1).
- Produces: `DeniedReason`, `Authorized`, `Refused`, `getSessionPermissions()`, `requirePermission(key)`.

- [ ] **Step 1: Write the failing test**

Mock `@src/lib/auth/current-user` and `@src/service/role.service`. Cover:

- `no-session` → `unauthenticated`; `expired` → `unauthenticated`; `revoked` → `unauthenticated`
- `no-user` → `no-account`; `disabled` → `disabled`
- `no-invite` / `email-unverified` / `provisioning-conflict` → `unauthenticated`
  (**`SessionResult` has 8 reasons — `service/types.ts:34-42`. The mapping must be exhaustive.**)
- authorized + holds the key → `{ ok: true }` with the resolved set
- authorized + lacks the key → `{ ok: false, reason: "forbidden" }`
- a user with zero roles → `forbidden` for every key
- **memoization:** two `requirePermission` calls in one request hit `findRolesByIds` **once**

- [ ] **Step 2: Run and verify it fails**

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/lib/rbac/require-permission.ts
import { cache } from "react";
import { getCurrentUser } from "@src/lib/auth/current-user";
import { findRolesByIds } from "@src/service/role.service";
import { resolvePermissions } from "./resolve";
import type { PermissionKey } from "./permissions";
import type { AdminUser } from "@src/service/types";

export type DeniedReason =
  | "unauthenticated" // no/expired/revoked cookie, or an unprovisionable session
  | "no-account" // valid session, no Mongo AdminUser
  | "disabled" // AdminUser.status === "disabled"
  | "forbidden"; // authenticated + provisioned, but lacks the key

export interface Authorized {
  readonly ok: true;
  readonly user: AdminUser;
  readonly permissions: ReadonlySet<PermissionKey>;
}
export interface Refused {
  readonly ok: false;
  readonly reason: DeniedReason;
}

/**
 * `cache()` scopes memoization to ONE React request, so the (app) layout, the
 * page, and any Server Action in that request share a single Mongo resolve —
 * which is what makes per-page permission checks cheap enough to put everywhere.
 *
 * Permissions are re-resolved on EVERY request and never cached in the session
 * cookie: that is precisely what makes mid-session revocation take effect on the
 * next request with no sign-out.
 */
export const getSessionPermissions = cache(
  async (): Promise<Authorized | Refused> => {
    const session = await getCurrentUser();

    if (!session.ok) {
      switch (session.reason) {
        case "no-user":
          return { ok: false, reason: "no-account" };
        case "disabled":
          return { ok: false, reason: "disabled" };
        case "no-session":
        case "expired":
        case "revoked":
        case "no-invite":
        case "email-unverified":
        case "provisioning-conflict":
          return { ok: false, reason: "unauthenticated" };
      }
    }

    const roles = await findRolesByIds(session.user.roleIds);
    return {
      ok: true,
      user: session.user,
      permissions: resolvePermissions(roles),
    };
  },
);

/** Never throws. Callers branch on the result. */
export async function requirePermission(
  key: PermissionKey,
): Promise<Authorized | Refused> {
  const result = await getSessionPermissions();
  if (!result.ok) return result;
  if (!result.permissions.has(key)) return { ok: false, reason: "forbidden" };
  return result;
}
```

The `switch` is exhaustive over all 8 `SessionResult` reasons, so adding a ninth becomes a
**type error** rather than a silent fall-through to "authorized".

- [ ] **Step 4: Run and verify it passes**

- [ ] **Step 5: Create `<PermissionDenied>`**

Server component; `getTranslations("rbac")`; renders `rbac.denied.title` / `.body` and a link back to
the dashboard. Rendered **inside** `AppShell`, so the user keeps their nav — `/no-access` keeps
meaning exactly one thing (no account), per ICR-127's contract.

- [ ] **Step 6: Gate the four stub pages**

For each of `people` / `families` / `activities` / `calendar`, replace the body with:

```tsx
const authz = await requirePermission("people:read"); // families:read | activities:read | calendar:read
if (!authz.ok) {
  if (authz.reason === "forbidden") return <PermissionDenied />;
  redirect({
    href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
    locale,
  });
}
```

(`redirect` from `@src/i18n/routing`, matching `(app)/layout.tsx:31`.) The pages otherwise keep
rendering `PlaceholderPage` — ICR-129/130/131 fill them in and inherit a fail-closed gate.

- [ ] **Step 7: Gate the nav**

In `sidebar.tsx`: add `readonly permission?: PermissionKey` to `NavItem`; set it on the six
key-mapped items (`people:read`, `families:read`, `activities:read`, `calendar:read`, `users:read`,
`roles:read`); leave `dashboard` and `settings` ungated. In the component:

```tsx
const authz = await getSessionPermissions();
const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
const items = NAV_ITEMS.filter(
  (i) => !i.permission || granted.has(i.permission),
);
```

**Replace the stale comment at `sidebar.tsx:22-24`** ("no permission gating here … lands in a later
checkpoint") with a note that this filtering is **convenience only and never the gate** — the server
check in each page is.

- [ ] **Step 8: Verify + commit**

```bash
pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin lint && pnpm --filter @idcr/admin test
git add apps/admin/src/lib/rbac/ apps/admin/src/components/ apps/admin/src/app/
git commit -m "feat(ICR-128): enforce permissions in rsc loaders, nav, and denied state"
```

---

## Task 5: `/roles` — permission matrix

**Files:**

- Create: `apps/admin/src/components/ui/table.tsx`
- Create: `apps/admin/src/app/[locale]/(app)/roles/{role-list.tsx,permission-matrix.tsx,actions.ts,actions.test.ts}`
- Modify: `apps/admin/src/app/[locale]/(app)/roles/page.tsx`
- **Modify: `apps/admin/src/service/role.service.ts`** — add the role mutators (Step 0)
- **Modify: `apps/admin/src/service/user.service.ts`** — add `listUsers` (Step 0)

**Interfaces:**

- Consumes: `requirePermission`, `listRoles`, `withAdminTransaction`, `retainsAdministrability`,
  `appendAuditEntry`, `roleUpdateSchema` / `roleCreateSchema` / `roleDeleteSchema`.
- Produces: `updateRoleAction`, `createRoleAction`, `deleteRoleAction` — all `Promise<ActionResult>`;
  plus `createRole` / `updateRole` / `deleteRole` and `listUsers`, which **Task 6 also consumes**.

- [ ] **Step 0: Add the service functions these actions call**

> **Plan correction (found during CP3).** Task 3's _Produces_ line originally advertised
> `createRole`/`updateRole`/`deleteRole`, but no task defined them, and this task's Step 3 skeleton
> calls `updateRole(...)`. The skeleton also called `listActiveUsers(...)`, which no task defined
> either — the only user-list function in the plan was `listUsers`, in Task **6**, i.e. after it is
> needed. Both are fixed here: the mutators land in this task, beside their first real caller.

Add to `role.service.ts`, following that file's existing shape (`await ensureRbacIndexes()` first,
`roleSchema.parse` on reads, every operation forwarding `{ session }`):

```ts
export async function createRole(
  input: { name: string; description?: string; permissions: readonly string[] },
  session: ClientSession,
): Promise<{ ok: true; roleId: string } | { ok: false; reason: "conflict" }>;

/** Never writes `key` or `isSystem` — neither is updatable. */
export async function updateRole(
  input: {
    roleId: string;
    name: string;
    description?: string;
    permissions: readonly string[];
  },
  session: ClientSession,
): Promise<void>;

export async function deleteRole(
  roleId: string,
  session: ClientSession,
): Promise<void>;
```

`createRole` maps a duplicate-key error from the unique `name` index to
`{ ok: false, reason: "conflict" }`. Reuse `user.service.ts`'s existing `isDuplicateKeyError` helper
(export it from there) rather than writing a second copy.

Add to `user.service.ts`:

```ts
/** ALL users, not just active — `retainsAdministrability` filters by status itself. */
export async function listUsers(session?: ClientSession): Promise<AdminUser[]>;
```

Tests for this step: each mutator forwards `{ session }`; `updateRole` never `$set`s `key` or
`isSystem`; `createRole` maps a duplicate-key error to `conflict`; `listUsers` returns disabled users
too (the invariant needs them to decide correctly).

**In Step 3's skeleton below, read `listUsers(session)` wherever it says `listActiveUsers(session)`.**

- [ ] **Step 1: Write the failing action test** — the security-critical assertions

For each of the three actions, with a session lacking `roles:manage`:

1. the result is `{ ok: false, reason: "forbidden" }`, **and**
2. **no collection mutator was called** (`expect(updateOne).not.toHaveBeenCalled()`).

Plus, with a valid `roles:manage` session:

- an unregistered permission key → `{ ok: false, reason: "invalid" }`, no write
- deleting an `isSystem` role → `{ ok: false, reason: "system-role" }`, no write
- removing `users:manage` from the Admin role → `{ ok: false, reason: "system-role" }`, no write
- an edit that would violate administrability → `{ ok: false, reason: "last-admin" }`, and
  `session.abortTransaction` **was** called
- a valid edit → `{ ok: true }`, and `appendAuditEntry` was called with the same `session`

- [ ] **Step 2: Run and verify it fails**

- [ ] **Step 3: Implement the actions**

Every mutating action follows this exact skeleton. Note the transaction rules from Global Constraints:

```ts
"use server";

export async function updateRoleAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requirePermission("roles:manage");
  if (!authz.ok) return { ok: false, reason: authz.reason };

  const parsed = roleUpdateSchema.safeParse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  return withAdminTransaction(async (session) => {
    // EVERY read/write below passes { session } — without it the operation runs
    // OUTSIDE the transaction and the invariant check reads stale data.
    const [roles, users] = await Promise.all([
      listRoles(session),
      listUsers(session),
    ]);

    const target = roles.find(
      (r) => r._id.toHexString() === parsed.data.roleId,
    );
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // System-role guard: the Admin role can never lose the admin-equivalent keys.
    if (target.key === "admin") {
      const keeps = ADMIN_EQUIVALENT_KEYS.every((k) =>
        parsed.data.permissions.includes(k),
      );
      if (!keeps) {
        await session.abortTransaction();
        return { ok: false, reason: "system-role" };
      }
    }

    // Build the PROPOSED POST-STATE and assert the invariant against it.
    const postState = {
      users: users.map((u) => ({
        id: u._id.toHexString(),
        status: u.status,
        roleIds: u.roleIds,
      })),
      roles: roles.map((r) =>
        r._id.toHexString() === parsed.data.roleId
          ? { id: parsed.data.roleId, permissions: parsed.data.permissions }
          : { id: r._id.toHexString(), permissions: r.permissions },
      ),
    };
    if (!retainsAdministrability(postState)) {
      // Manual abort does NOT throw (mongodb.d.ts:2475) — this is the
      // functional-first refusal path.
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await updateRole(parsed.data, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "role.update",
        targetId: parsed.data.roleId,
        before: { name: target.name, permissions: target.permissions },
        after: { name: parsed.data.name, permissions: parsed.data.permissions },
      },
      session,
    );
    return { ok: true, data: undefined };
  });
}
```

After a successful mutation call `revalidatePath` for the roles route so the RSC list refreshes.

- [ ] **Step 4: Run and verify it passes**

- [ ] **Step 5: Build the matrix UI**

`permission-matrix.tsx` (`'use client'`): a semantic `<table>`; rows are `PERMISSION_KEYS` **grouped by
the `resource:` prefix** (a `<tbody>` per group with a `permissions.groups.<resource>` heading row);
columns are roles; cells are `<input type="checkbox" name="permissions" value={key}>`.

A checkbox is `disabled` when `role.key === "admin" && ADMIN_EQUIVALENT_KEYS.includes(key)` — and the
server rejects the same write independently (Step 3), so the disabled attribute is convenience only.

Submit via `useActionState(updateRoleAction, undefined)`. **No optimistic UI** — the server is the
source of truth and a refused write must not flash as applied.

Wrap the table in `<div className="overflow-x-auto">` with the key column `sticky left-0` so the page
body never scrolls horizontally on mobile.

- [ ] **Step 6: Wire `roles/page.tsx`**

Replace `PlaceholderPage`: gate on `roles:read` (→ `<PermissionDenied>`), render `RoleList` +
`PermissionMatrix`, and pass `canManage = granted.has("roles:manage")` to disable inputs for
read-only viewers.

- [ ] **Step 7: Registry-extensibility test**

Prove the AC "adding a key requires touching only the map": a test that renders the matrix from a
fixture key list and asserts the row set derives from `PERMISSION_KEYS` — no hardcoded row list
anywhere in the component.

- [ ] **Step 8: Verify + commit**

```bash
git commit -m "feat(ICR-128): add roles screen with permission matrix"
```

---

## Task 6: `/users` — table, invite dialog, role assignment

**Files:**

- Modify: `apps/admin/package.json` (add `@radix-ui/react-dialog`)
- Create: `apps/admin/src/components/ui/dialog.tsx`
- Create: `apps/admin/src/app/[locale]/(app)/users/{user-table.tsx,invite-dialog.tsx,actions.ts,actions.test.ts}`
- Modify: `apps/admin/src/app/[locale]/(app)/users/page.tsx`
- Modify: `apps/admin/src/service/user.service.ts` (add `updateUserRoles`, `updateUserStatus`, `deleteUser` — all session-aware. **`listUsers` already exists — Task 5 Step 0 added it.**)

**Interfaces:**

- Consumes: everything from Tasks 1–4, plus `invite.service.ts`'s existing invite creation.
- Produces: `inviteUserAction`, `updateUserRolesAction`, `updateUserStatusAction`, `deleteUserAction`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @idcr/admin add @radix-ui/react-dialog
```

> **Verified 2026-07-27** against the Radix docs: the anatomy is `Dialog.Root` / `Trigger` / `Portal` /
> `Overlay` / `Content` / `Title` / `Description` / `Close`, and **`Dialog.Title` is REQUIRED** for an
> accessible modal (it is what gets announced on open). Radix now also ships a unified `radix-ui`
> package; we use the scoped `@radix-ui/react-dialog` to match this app's existing
> `@radix-ui/react-slot`. Do not omit `Title`, even when the design shows no visible heading — use a
> visually-hidden one.

- [ ] **Step 2: Write the failing action tests**

Same two-part security assertion as Task 5 (refusal shape **and** no write) for each action, with a
session lacking `users:manage`. Plus:

- inviting with a `roleId` that does not exist → `{ ok: false, reason: "not-found" }`, no write
- disabling / deleting / de-roling the last admin → `{ ok: false, reason: "last-admin" }`, aborted
- a Leader session invoking `updateUserRolesAction` directly with a crafted admin `roleId` →
  `forbidden`, no write (**the privilege-escalation AC**)
- every successful mutation writes an audit entry with the caller's `session`

- [ ] **Step 3: Run and verify it fails**

- [ ] **Step 4: Implement the actions**

Identical skeleton to Task 5 — `requirePermission("users:manage")` → Zod → `withAdminTransaction` →
build post-state → `retainsAdministrability` → write → audit. For `updateUserRolesAction` and
`updateUserStatusAction` and `deleteUserAction`, the post-state substitutes the **user** rather than
the role. `inviteUserAction` cannot reduce administrability, so it needs no invariant check — but it
**must** still validate that every `roleId` exists.

The three `user.service.ts` functions these call (`listUsers` already exists from Task 5 Step 0):

```ts
export async function updateUserRoles(
  userId: string,
  roleIds: readonly string[],
  session: ClientSession,
): Promise<void>;

export async function updateUserStatus(
  userId: string,
  status: "active" | "disabled",
  session: ClientSession,
): Promise<void>;

export async function deleteUser(
  userId: string,
  session: ClientSession,
): Promise<void>;
```

All three take `_id` as a hex string and convert with `new ObjectId(userId)` internally, matching how
`AdminStateSnapshot.users[].id` is produced (`_id.toHexString()`).

- [ ] **Step 5: Build `dialog.tsx` + `invite-dialog.tsx` + `user-table.tsx`**

`dialog.tsx`: thin cva-styled wrappers over the Radix parts, matching `button.tsx`'s existing pattern.
`invite-dialog.tsx` (`'use client'`): `Dialog.Title` present, email `<Input>`, role checkboxes,
`useActionState(inviteUserAction, undefined)`, field errors from `fieldErrors`.
`user-table.tsx`: email · displayName · roles · status; row actions rendered **only** when the viewer
holds `users:manage`.

- [ ] **Step 6: Wire `users/page.tsx`** — gate on `users:read` → `<PermissionDenied>`.

- [ ] **Step 7: Verify + commit**

```bash
git commit -m "feat(ICR-128): add users screen with invite dialog and role assignment"
```

---

## Task 7: PII helper, bilingual catalogs, parity tests, docs

**Files:**

- Create: `apps/admin/src/lib/rbac/pii.ts`, `pii.test.ts`
- Modify: `apps/admin/messages/es-AR.json`, `apps/admin/messages/en-US.json`
- Modify: `apps/admin/src/i18n/messages.test.ts`
- Create: `docs/architecture/admin-rbac.md`
- Modify: `docs/architecture/admin-auth.md` (cross-reference)

- [ ] **Step 1: Write the failing PII test**

```ts
import { describe, expect, it } from "vitest";
import { omitPii } from "./pii";
import { resolvePermissions } from "./resolve";

const withPii = resolvePermissions([{ permissions: ["people:pii"] }]);
const without = resolvePermissions([{ permissions: ["people:read"] }]);
const person = {
  id: "p1",
  firstName: "Ana",
  phone: "+5411",
  email: "ana@x.co",
};

describe("omitPii", () => {
  it("returns the record untouched with people:pii", () => {
    expect(omitPii(person, withPii)).toEqual(person);
  });

  it("OMITS phone/email entirely without the permission — not empty strings", () => {
    const result = omitPii(person, without);
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("email");
    expect(result).toMatchObject({ id: "p1", firstName: "Ana" });
  });

  it("does not mutate its input", () => {
    omitPii(person, without);
    expect(person.phone).toBe("+5411");
  });

  it("is safe on a record with no PII fields set", () => {
    expect(omitPii({ id: "p2", firstName: "Beto" }, without)).toEqual({
      id: "p2",
      firstName: "Beto",
    });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

- [ ] **Step 3: Implement `omitPii`** — destructure `phone`/`email` out and return the rest; never
      mutate. **Field omission, not masking:** the fields must never enter the payload at all.

> **Scope note (spec §11 Q1):** the AC's "confirm absence in list, detail and print views" cannot be
> demonstrated here — People views ship in ICR-129. This task delivers the enforcement primitive and
> its tests; ICR-129 wires it into the real DTOs. Say so in the PR body.

- [ ] **Step 4: Add every string to BOTH catalogs**

Namespaces per spec §8: `permissions.<key>.{label,description}` ×15, `permissions.groups.<resource>` ×6,
`roles.*` (incl. `roles.system.<key>.{name,description}` ×3), `users.*`, `rbac.denied.*`,
`rbac.errors.{lastAdmin,systemRole,forbidden,invalid,notFound,conflict}`.

`es-AR` is the default and must read naturally in Argentine Spanish (e.g. `roles.system.admin.name` =
"Administrador"), not as a translation of the English.

- [ ] **Step 5: Extend the parity test**

`src/i18n/messages.test.ts` already flattens both catalogs and asserts an empty symmetric difference —
that covers parity automatically. Add explicit per-subtree key-list assertions for `permissions`,
`roles`, `users`, and `rbac`, following the file's existing pattern, plus one asserting **every**
`PERMISSION_KEYS` entry has both a `.label` and a `.description` in both catalogs (so adding a
registry key without its strings fails CI).

- [ ] **Step 6: Write `docs/architecture/admin-rbac.md`**

Cover: the registry and why it is a const map; the reject-at-write / ignore-at-read symmetry; why the
invariant is a post-state predicate and not an admin count; the transaction rules and the
`abortTransaction`-as-refusal pattern; why permissions are never in the token or cookie (and how that
delivers mid-session revocation); the audit log; and the explicit list of surfaces that are
**deliberately not** permission-gated. Add a cross-reference from `admin-auth.md`.

- [ ] **Step 7: Full verification**

```bash
pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin lint \
  && pnpm --filter @idcr/admin test && pnpm --filter @idcr/admin build
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(ICR-128): add pii omission helper, bilingual rbac strings, and docs"
```

---

## Self-review

**Spec coverage.** R1→T1 · R2→T1 · R3→T2 · R4→T3/T5/T6 · R5→T4 · R6→T3 · R7→T1/T5/T6 · R8→T4/T5/T6 ·
R9→T7 · R10→T7. Data model §3→T3. Zod §4→T1. Edge cases §7: 1→T1/T2, 2→T1, 3→T6, 4→T5, 5→T5, 6/7/8→T5/T6,
9→T3 transaction rules, 10→T4 (no cookie caching), 11→T4 (exhaustive switch, no token read), 12→T4,
13→T2 (dangling roleIds), 14→T4, 15→T3 (`$setOnInsert`). i18n §8→T7. Testing §9→every task.

**Placeholders:** none — every code step carries real code or an exact, named change.

**Type consistency:** `PermissionKey`, `PERMISSION_KEYS`, `ADMIN_EQUIVALENT_KEYS`,
`AdminStateSnapshot`, `ActionResult`, `ActionFailureReason`, `DeniedReason`, `Authorized`/`Refused`,
`Role`, `RbacAuditEntry` are each defined once and referenced identically thereafter.
`AdminStateSnapshot.users[].id` is a **string** everywhere, so every call site converts via
`_id.toHexString()` — checked in Tasks 5 and 6.

**Checkpoint count: 7** (≤ 8, so the ticket-too-large guard passes).
