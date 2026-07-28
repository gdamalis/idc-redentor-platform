# ICR-128 — Admin RBAC: permission registry, roles, permission matrix, user management

> **Ticket:** [ICR-128](https://divinelab.atlassian.net/browse/ICR-128) · Story → `feat` · Priority High
> **Epic:** ICR-13 (Admin · Platform Foundation) · **CP3** of `tasks/specs/admin-mvp.md` §12
> **QA depth:** heavy · **Sensitive areas:** `auth/roles`, `form-pii-spam`, `i18n-messages`, `env-secrets`

This is the ticket that turns enforcement **on** for the first time. Today `apps/admin` has zero
permission checks anywhere. Every later admin feature (People, Activities, Calendar, Preaching
Evaluator) hangs its enforcement off what lands here.

---

## 1. Dependencies check

| Dependency                                     | Status                | What this ticket consumes                                                                                                          |
| ---------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **ICR-124** — scaffold `apps/admin`            | ✅ landed             | `getAdminDb()` (`src/service/database.service.ts:168`), the `(app)`/`(auth)` route groups, `AppShell`                              |
| **ICR-127** — Firebase auth                    | ✅ landed (`e54b273`) | `getCurrentUser()` (`src/lib/auth/current-user.ts:17`), `SessionResult`, the `(app)/layout.tsx` gate of record                     |
| **ICR-166** — per-DB connection split          | ✅ landed             | `getAdminDb()` / `getContentDb()`, the positive-allowlist DB-name assertions                                                       |
| **ICR-140** — admin harness safety rails       | ✅ landed             | `.claude/config.json` now carries `apps/admin/**` `sensitivePaths` and `^(website\|ministry-admin)-(test\|qa\|e2e)$` DB allowlists |
| **ICR-16** — `packages/config` + `packages/ui` | ✅ landed             | `cn()` from `@idcr/ui`                                                                                                             |

> **The ticket description's "⚠️ ICR-140 verified still open … treat as a blocker" is stale.** Verified
> against `.claude/config.json`: `qa.autoMerge.sensitivePaths` contains ten `apps/admin/**` globs and
> `qa.env.*.dbNameAllow` includes `ministry-admin`. The blocker is cleared.

**Downstream (do not build here):** ICR-155 (`seed:admin` bootstrap script) consumes this ticket's
`PERMISSIONS` registry and the stable `Role.key`. ICR-129/130/131 (People/Families/Activities CRUD)
consume `requirePermission()` and `omitPii()`.

### Spec drift — `admin-mvp.md` §5 is already superseded by shipped code

§5 declares `User { id: string; … }`. The shipped type is `AdminUser` with `_id: ObjectId`
(`src/service/types.ts:6-16`) and **`roleIds: string[]` already exists and is already populated** by
`createUserFromInvite`, carrying the code comment _"resolved from the Invite; ENFORCEMENT is
ICR-128"_. This spec designs against the shipped code, not §5's prose.

---

## 2. Requirements

### R1 — Permission registry (`lib/rbac/permissions.ts`)

Exactly the 15 M1b keys from `admin-mvp.md` §6, as a const map — **no enum**:

```ts
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

/** Non-empty tuple — the shape `z.enum()` requires. */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [
  PermissionKey,
  ...PermissionKey[],
];

export function isPermissionKey(value: unknown): value is PermissionKey;
```

**The map values are dev-facing fallbacks, never rendered.** UI labels come from next-intl (R9).
Adding a feature key must require touching **only** this map — the matrix UI iterates
`PERMISSION_KEYS` and groups by the `resource:` prefix, so a new key renders with no UI change.

### R2 — Pure resolution (`lib/rbac/resolve.ts`)

```ts
export function resolvePermissions(
  roles: readonly Pick<Role, "permissions">[],
): ReadonlySet<PermissionKey>;

export function hasPermission(
  granted: ReadonlySet<PermissionKey>,
  key: PermissionKey,
): boolean;
```

`resolvePermissions` is the union of every role's `permissions`, **filtered through
`isPermissionKey`**. A stored key absent from the registry (a renamed/removed feature key) grants
nothing — fail-closed on drift. Pure, no IO, no imports beyond the registry.

### R3 — The administrability invariant (`lib/rbac/last-admin.ts`)

The last-admin guard is **an invariant over a proposed post-state, not an admin count**. Naively
guarding "don't delete the last Admin user" misses the path that actually bricks the panel:
unchecking `roles:manage` on the Admin _role_ demotes every admin at once.

```ts
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

/** True when ≥1 `active` user resolves to a set containing BOTH admin-equivalent keys. */
export function retainsAdministrability(state: AdminStateSnapshot): boolean;
```

One predicate covers all five mutation paths (R4). Pure ⇒ exhaustively unit-testable, which is
exactly what the ticket's testing AC asks for.

### R4 — Transactional enforcement of the invariant

Every RBAC mutation runs inside a single Mongo transaction:

1. read the current `users` + `roles` (with `{ session }`),
2. apply the proposed change **in memory** to build the post-state snapshot,
3. `retainsAdministrability(postState)` — if false, abort and return `{ ok: false, reason: "last-admin" }`,
4. write, append the audit entry (R6), commit.

Five paths must be covered: **delete user · disable user · remove a role from a user · edit the
Admin role's permissions · delete a role.**

`database.service.ts` gains one export so the client stays encapsulated:

```ts
export async function withAdminTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T>;
```

Every service read/write inside takes an optional `session` parameter and passes it through.

> **Accepted, disclosed limitation.** The repo's admin tests are 100% `vi.mock`ed
> (`vi.mock("@src/service/database.service")`), so the transaction _wrapper_ is not meaningfully
> exercised by unit tests. This is why the invariant itself is a pure function: the logic that can be
> wrong is fully tested, and the untested surface is a thin, declarative wrapper. See §9.

### R5 — `requirePermission` — the IO boundary (`lib/rbac/require-permission.ts`)

```ts
export type DeniedReason =
  | "unauthenticated" // no session cookie, or expired/revoked
  | "no-account" // valid Firebase session, no Mongo AdminUser
  | "disabled" // AdminUser.status === "disabled"
  | "forbidden"; // authenticated + provisioned, lacks the key

export interface Authorized {
  readonly ok: true;
  readonly user: AdminUser;
  readonly permissions: ReadonlySet<PermissionKey>;
}
export interface Refused {
  readonly ok: false;
  readonly reason: DeniedReason;
}

/** cache()-memoized: one Mongo round-trip per request, shared by layout + page + actions. */
export const getSessionPermissions: () => Promise<Authorized | Refused>;

export async function requirePermission(
  key: PermissionKey,
): Promise<Authorized | Refused>;
```

**Never throws.** Maps `getCurrentUser()`'s existing `SessionResult` reasons:
`no-session`/`expired` → `unauthenticated` · `no-user` → `no-account` · `disabled` → `disabled`;
then a missing key → `forbidden`.

- **Server Actions** early-return the refusal as their own result union — no throw, no `try/catch`
  control flow.
- **RSC loaders** render the `<PermissionDenied>` panel (R8) on `forbidden`; `no-account`/`disabled`
  keep ICR-127's existing `redirect("/no-access")`, and `unauthenticated` keeps its `/login`
  redirect. `redirect()` is framework-sanctioned control flow, not a custom error.

Wrapping with React `cache()` is what makes per-page checks cheap: `(app)/layout.tsx` already calls
`getCurrentUser()`, so the layout, the page, and any action in the same request share one resolve.

### R6 — Audit log (`service/rbac-audit.service.ts`)

`roles:manage` and `users:manage` are **admin-equivalent by construction** — anyone holding either can
grant themselves anything. Traceability is therefore the only real control, so every RBAC mutation
appends an entry **inside the same transaction** as the write (the log cannot drift from reality).
Append-only; **no viewer UI** (explicitly post-M1).

### R7 — Registry-derived validation (mass-assignment defence)

Every action that writes permission keys validates against the registry, never free strings (§4).
`roleIds` on invite/assign are validated against roles that actually exist. Symmetric to R2's
resolve-time filter: **reject at write, ignore at read.**

### R8 — Screens, nav gating, denied state

- `/roles` — role list + permission matrix (roles × keys, checkboxes). Read gated `roles:read`,
  mutations gated `roles:manage`.
- `/users` — user list + invite dialog (email + roles). Read gated `users:read`, mutations gated
  `users:manage`.
- `sidebar.tsx` `NAV_ITEMS` gains `permission?: PermissionKey`; items the user lacks are hidden.
  **Convenience only — never the gate.**
- `<PermissionDenied>` — a localized in-page 403 panel rendered inside `AppShell`, keeping
  `/no-access` meaning exactly one thing (no account), per ICR-127's contract.
- The six key-mapped `(app)` pages (`people`, `families`, `activities`, `calendar`, `users`, `roles`)
  each get their read gate now, so ICR-129–131 inherit a fail-closed page. `dashboard` and `settings`
  stay authenticated-only — the registry has no key for either, and inventing one would violate the
  "exactly the 15 M1b keys" requirement.

> **Deliberately NOT permission-gated** (documented so a reviewer doesn't read it as an omission):
> `api/auth/session/route.ts` (pre-auth session exchange), `(auth)/reset-password/actions.ts`
> (public, enumeration-safe), `shell/locale-actions.ts` (self-service preference). Adding a
> permission check to any of these would be theater.

### R9 — Bilingual strings

Every permission label + description, both screens, and every denied / last-admin / system-role error
exist in **both** `es-AR` and `en-US`. Enforced by extending the existing parity test
`src/i18n/messages.test.ts` (§10.10's parity check already lives there).

### R10 — PII gating primitive (`lib/rbac/pii.ts`)

```ts
export function omitPii<T extends { phone?: string; email?: string }>(
  record: T,
  granted: ReadonlySet<PermissionKey>,
): T | Omit<T, "phone" | "email">;
```

Server-side **field omission**, not CSS hiding — without `people:pii` the fields never enter the
payload. Shipped here with unit tests; **wired into real DTOs by ICR-129** (see §11 Q1).

---

## 3. Data model changes

### New: `Role` (collection `roles`, database `ministry-admin`)

```ts
export type SystemRoleKey = "admin" | "leader" | "member";

export interface Role {
  _id: ObjectId;
  /** Immutable, system roles ONLY. Custom roles have no key. Never updatable. */
  key?: SystemRoleKey;
  name: string; // editable display name
  description?: string; // editable display description
  permissions: string[]; // stored loosely; resolve() filters to the registry
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

`key` exists because `name` is mutable and localizable: the seed, the system-role guards, and
ICR-155 all need a stable identifier, and `admin-mvp.md` §10.5 requires seed roles not be renamable
into meaninglessness. It is optional because custom roles have no natural key.

### New: `RbacAuditEntry` (collection `rbacAudit`)

```ts
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
  actorUserId: ObjectId;
  actorEmail: string;
  action: RbacAuditAction;
  targetId: ObjectId;
  before: unknown | null; // null on create
  after: unknown | null; // null on delete
}
```

### Unchanged

`AdminUser.roleIds: string[]` already exists and is already populated. This ticket only begins
**reading** it. No migration is required.

### Indexes

Created via a memoized lazy promise mirroring `ensureAuthIndexes()` (`user.service.ts:29-44`) —
including the `vi.resetModules()` + `loadService()` test-isolation pattern that shape requires.

| Collection  | Index                     | Options                                                         |
| ----------- | ------------------------- | --------------------------------------------------------------- |
| `roles`     | `{ key: 1 }`              | `unique`, `partialFilterExpression: { key: { $exists: true } }` |
| `roles`     | `{ name: 1 }`             | `unique`                                                        |
| `rbacAudit` | `{ at: -1 }`              | —                                                               |
| `rbacAudit` | `{ targetId: 1, at: -1 }` | —                                                               |

### Seed roles — idempotent, non-destructive

| `key`    | `name` (seed default) | Permissions                                                                                                                                                      | `isSystem` |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `admin`  | Admin                 | all 15 keys                                                                                                                                                      | `true`     |
| `leader` | Leader                | `people:read`, `people:write`, `people:pii`, `families:read`, `families:write`, `activities:read`, `activities:write`, `calendar:read`, `calendar:print` (**9**) | `true`     |
| `member` | Member                | `people:read`, `calendar:read`                                                                                                                                   | `true`     |

**Leader is exactly 9 keys — no `:delete`, and calendar is `read` + `print`.** §6's prose
("calendar read+write") is unsatisfiable as literally written: `calendar` has no `write` key.
Resolved at the design gate: "read+write" excludes delete, and Leaders get `calendar:print` because
printing the calendar is the church's actual leader workflow — the entire M1b calendar feature exists
to be printed.

**Idempotency:** upsert by `key` with `$setOnInsert` for `permissions`/`name`/`description` and `$set`
only for `key`/`isSystem`/`updatedAt`. A re-run therefore (a) creates nothing twice, (b) never resets
a deliberately hand-edited Leader or Member, and (c) never touches custom roles at all.

---

## 4. API changes — Zod schemas + contracts

All input validated at the boundary. `z.enum(PERMISSION_KEYS)` is derived from the registry, so an
unknown key can never be persisted.

```ts
const permissionKeySchema = z.enum(PERMISSION_KEYS);

export const roleCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionKeySchema).default([]),
});

export const roleUpdateSchema = roleCreateSchema.extend({
  roleId: z.string().refine(ObjectId.isValid),
});
// `key` and `isSystem` are absent by construction — they are not updatable.

export const roleDeleteSchema = z.object({
  roleId: z.string().refine(ObjectId.isValid),
});

export const inviteCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleIds: z.array(z.string().refine(ObjectId.isValid)).min(1),
});

export const userRolesUpdateSchema = z.object({
  userId: z.string().refine(ObjectId.isValid),
  roleIds: z.array(z.string().refine(ObjectId.isValid)),
});

export const userStatusUpdateSchema = z.object({
  userId: z.string().refine(ObjectId.isValid),
  status: z.enum(["active", "disabled"]),
});
```

`roleIds` are additionally checked to exist in the `roles` collection server-side — a valid ObjectId
for a nonexistent role is rejected.

### Server Action result contract

Every action returns a discriminated union; **nothing throws**:

```ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason:
        | DeniedReason
        | "last-admin"
        | "system-role"
        | "invalid"
        | "not-found"
        | "conflict";
      fieldErrors?: Record<string, string[]>;
    };
```

`reason` maps 1:1 to a localized message key (§8). No new API **routes** — all mutations are Server
Actions, matching the repo's convention (the public site's contact form is a Server Action too).

---

## 5. Files

### New

| File                                                              | Purpose                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/admin/src/lib/rbac/permissions.ts`                          | The registry, `PermissionKey`, `PERMISSION_KEYS`, `isPermissionKey` |
| `apps/admin/src/lib/rbac/permissions.test.ts`                     | 15-key exactness, tuple/type guard behaviour                        |
| `apps/admin/src/lib/rbac/resolve.ts`                              | `resolvePermissions`, `hasPermission` (pure)                        |
| `apps/admin/src/lib/rbac/resolve.test.ts`                         | Union, dedup, unknown-key drift is ignored                          |
| `apps/admin/src/lib/rbac/last-admin.ts`                           | `retainsAdministrability`, `AdminStateSnapshot` (pure)              |
| `apps/admin/src/lib/rbac/last-admin.test.ts`                      | All 5 mutation paths                                                |
| `apps/admin/src/lib/rbac/require-permission.ts`                   | `getSessionPermissions` (cached), `requirePermission`               |
| `apps/admin/src/lib/rbac/require-permission.test.ts`              | Reason mapping, memoization, forbidden path                         |
| `apps/admin/src/lib/rbac/pii.ts` + `.test.ts`                     | `omitPii` field omission                                            |
| `apps/admin/src/lib/rbac/schemas.ts` + `.test.ts`                 | All Zod schemas (§4)                                                |
| `apps/admin/src/service/role.service.ts` + `.test.ts`             | Role CRUD, idempotent seed, indexes                                 |
| `apps/admin/src/service/rbac-audit.service.ts` + `.test.ts`       | Append-only audit writes                                            |
| `apps/admin/src/app/[locale]/(app)/roles/actions.ts` + `.test.ts` | Role create/update/delete Server Actions                            |
| `apps/admin/src/app/[locale]/(app)/roles/permission-matrix.tsx`   | Matrix (client)                                                     |
| `apps/admin/src/app/[locale]/(app)/roles/role-list.tsx`           | Role list (server)                                                  |
| `apps/admin/src/app/[locale]/(app)/users/actions.ts` + `.test.ts` | Invite, role assignment, enable/disable/delete                      |
| `apps/admin/src/app/[locale]/(app)/users/user-table.tsx`          | User table                                                          |
| `apps/admin/src/app/[locale]/(app)/users/invite-dialog.tsx`       | Invite modal (client, Radix)                                        |
| `apps/admin/src/components/ui/dialog.tsx`                         | Radix Dialog wrapper (cva, matching `button.tsx`)                   |
| `apps/admin/src/components/ui/table.tsx`                          | Semantic table primitives                                           |
| `apps/admin/src/components/rbac/permission-denied.tsx`            | Localized in-page 403 panel                                         |

### Modified

| File                                                                               | Change                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/service/types.ts`                                                  | Add `Role`, `SystemRoleKey`, `RbacAuditEntry`, `RbacAuditAction`, `ActionResult`                          |
| `apps/admin/src/service/database.service.ts`                                       | Add `withAdminTransaction()` (**sensitive file** — the DB-name assertions must not be touched)            |
| `apps/admin/src/components/shell/sidebar.tsx`                                      | `NavItem.permission?`, filter `NAV_ITEMS` by resolved set; remove the "no permission gating here" comment |
| `apps/admin/src/app/[locale]/(app)/{people,families,activities,calendar}/page.tsx` | Add the read gate (one call each)                                                                         |
| `apps/admin/src/app/[locale]/(app)/{users,roles}/page.tsx`                         | Replace `PlaceholderPage` with the real screens + gates                                                   |
| `apps/admin/messages/es-AR.json`, `messages/en-US.json`                            | New `permissions`, `roles`, `users`, `rbac` namespaces                                                    |
| `apps/admin/src/i18n/messages.test.ts`                                             | Subtree assertions for the new namespaces                                                                 |
| `apps/admin/package.json`                                                          | Add `@radix-ui/react-dialog`                                                                              |
| `docs/architecture/admin-auth.md`                                                  | Cross-reference the new RBAC layer                                                                        |
| `docs/architecture/admin-rbac.md`                                                  | **New** — registry, resolution, the invariant, audit, the enforcement boundary                            |

---

## 6. Component hierarchy

```
AppShell (existing, protected by (app)/layout.tsx)
├── Sidebar
│   └── NAV_ITEMS.filter(i => !i.permission || granted.has(i.permission))   ← convenience only
└── <main>
    │
    ├── RolesPage (RSC)                      gate: roles:read → <PermissionDenied>
    │   ├── RoleList ('use client')          name · description · isSystem badge · member count
    │   │                                    + create form + per-role delete (see note below)
    │   └── PermissionMatrix ('use client')  <table>: rows = PERMISSION_KEYS grouped by
    │       │                                resource prefix; cols = roles
    │       ├── <input type="checkbox">      disabled when: role.isSystem && key === "admin"
    │       │                                && (users:manage | roles:manage)
    │       └── useActionState(updateRole)   optimistic off; server is the source of truth
    │
    └── UsersPage (RSC)                      gate: users:read → <PermissionDenied>
        ├── UserTable (RSC)                  email · displayName · roles · status
        │   └── row actions                  rendered only with users:manage
        └── InviteDialog ('use client')      Radix Dialog
            └── form                         email <Input> + role checkboxes
                └── useActionState(invite)   + Zod (server-authoritative)

<PermissionDenied>                           localized 403 panel, rendered INSIDE AppShell
```

**Responsive:** the matrix is the only wide surface — it scrolls horizontally inside an
`overflow-x-auto` container with the permission-key column `sticky left-0`, so the page body never
scrolls sideways on mobile. `UserTable` collapses row actions into a stacked layout below `sm`.

> **Why `RoleList` is a client component** (amended during CP5; this diagram originally said RSC).
> Its create and delete forms drive the same `(prevState, formData)` Server Actions as the matrix,
> and only `useActionState` can surface their `conflict` / `system-role` / `last-admin` refusals
> inline. Kept as RSC, those refusals would be silent no-ops — the user would click Delete on the
> last admin role and see nothing happen. The page itself (`roles/page.tsx`) remains an RSC and does
> all the data fetching; only the interactive shell is client-side, and roles carry no PII.
>
> **System-role display names.** Seeded `Role.name`/`description` are English, written once at seed
> time. The UI renders `roles.system.<key>.name` instead, so the label is localized — while a hidden
> input round-trips the raw DB value on submit, so an edit never overwrites the stored name with a
> translated string. Custom roles render their stored fields directly.

---

## 7. Edge cases

1. **Unknown stored permission key** (feature key renamed/removed) → `resolvePermissions` filters it
   out; grants nothing. No crash, no error surface.
2. **Crafted payload with an unregistered key** (`"finances:write"`, `"*"`) → rejected by
   `z.enum(PERMISSION_KEYS)`; never persisted; action returns `reason: "invalid"`.
3. **Valid ObjectId for a nonexistent role** on invite/assign → `reason: "not-found"`; no write.
4. **Unchecking `users:manage`/`roles:manage` on the Admin role** → checkbox disabled in the UI **and**
   the server rejects (`reason: "system-role"`), even when the action is invoked directly.
5. **Deleting an `isSystem` role** → refused, `reason: "system-role"`.
6. **Deleting/disabling the last administrable user** → refused, `reason: "last-admin"`, localized.
7. **Removing the Admin role from the last admin user** → same invariant, same refusal.
8. **Deleting a role that is the only source of admin permissions** → same invariant.
9. **Concurrent demotion of two different last-two admins** → the transaction re-reads inside the
   session, so the second commit fails the invariant and aborts. This is the specific race the
   transaction exists for.
10. **Mid-session revocation** → permissions are re-resolved per request from Mongo and never cached
    in the session cookie, so a role change takes effect on the **next request** with no sign-out.
    A user disabled mid-session is refused by `getCurrentUser()`'s existing `disabled` check.
11. **Forged token claim** (`role: "admin"`) → grants nothing; there is no token-based authorization
    read path in this app (`current-user.ts:14-15`), and this ticket adds none.
12. **User with zero roles** → resolves to an empty set; every gated page renders `<PermissionDenied>`;
    nav shows only ungated items (dashboard, settings).
13. **Role deleted while still assigned to users** → allowed if the invariant holds; dangling
    `roleIds` entries resolve to nothing (R2's filter), so they grant nothing.
14. **Session expires mid-edit** → the action returns `unauthenticated`; the client redirects to
    `/login` preserving the return path (§10.11's existing behaviour, unchanged).
15. **Re-running the seed after a hand-edit** → `$setOnInsert` leaves the edited permission set alone;
    only `updatedAt`/`isSystem`/`key` are re-asserted.

---

## 8. i18n

New namespaces in **both** `apps/admin/messages/es-AR.json` and `en-US.json`. Permission keys contain
`:` but no `.`, so each is a valid single next-intl segment.

```
permissions.<key>.label          ×15   e.g. permissions."people:read".label
permissions.<key>.description    ×15
permissions.groups.<resource>    ×6    people · families · activities · calendar · users · roles

roles.title / roles.subtitle / roles.matrix.* / roles.new / roles.edit / roles.delete
roles.system.<key>.name          ×3    seeded display names (es-AR: "Administrador" / …)
roles.system.<key>.description   ×3

users.title / users.subtitle / users.table.* / users.invite.* / users.status.*

rbac.denied.title / rbac.denied.body / rbac.denied.backToDashboard
rbac.errors.lastAdmin
rbac.errors.systemRole
rbac.errors.forbidden
rbac.errors.invalid
rbac.errors.notFound
rbac.errors.conflict
```

Parity is enforced by extending `src/i18n/messages.test.ts`, which already flattens both catalogs to
dotted key lists and asserts an empty symmetric difference — plus explicit per-subtree key-list
assertions following the file's existing pattern.

---

## 9. Testing strategy

**Unit (Vitest) — where correctness actually lives:**

- `resolvePermissions`: union across roles, dedup, **unknown-key drift ignored**.
- `hasPermission`.
- `retainsAdministrability`: all 5 paths, plus the boundary cases (exactly one admin; two admins
  demoting different users; an admin whose permissions come from two roles combined).
- Zod schemas: unregistered key rejected, `key`/`isSystem` not accepted on update, email normalization.
- `omitPii`: fields absent (not empty-string) without the permission; untouched with it.
- Seed idempotency: second run writes no duplicate and does **not** reset a hand-edited role.
- Registry extensibility: a test adds a fixture key and asserts the matrix row-set derives from
  `PERMISSION_KEYS` — proving a new key needs no UI change.

**Server Action tests (mocked, repo convention):** for each mutating action, invoke it directly with a
session for a user lacking the permission and assert **(a)** the refusal shape and **(b) that no
collection mutator was called**. Hiding a UI control is explicitly not sufficient.

**i18n:** extended parity test (§8).

**Not built here — disclosed:** a live `ministry-admin-test` integration harness. Every existing
`apps/admin` test is 100% `vi.mock`ed; building a live-DB harness is net-new infrastructure. Decided
at the design gate to defer it to a follow-up ticket, which also means the **transaction wrapper**
itself is not exercised by unit tests (§R4). Heavy preview QA carries correspondingly more weight.

**Preview QA (heavy):** both locales; the matrix; an invite; a Leader account confirming nav gating,
the denied panel, and that direct action invocation is refused.

---

## 10. Implementation checkpoints

| #   | Scope                                                             | Files                                                                                                                                                             | Verification                                                                                                                                                                                                      | Commit                                                                      |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Registry + pure resolve + Zod schemas                             | `lib/rbac/{permissions,resolve,schemas}.ts` + tests                                                                                                               | 15 keys exactly; unknown key filtered at read and rejected at write                                                                                                                                               | `feat(ICR-128): add permission registry, pure resolution, and zod schemas`  |
| 2   | The administrability invariant                                    | `lib/rbac/last-admin.ts` + test                                                                                                                                   | All 5 paths + boundary cases green                                                                                                                                                                                | `feat(ICR-128): add last-admin invariant over proposed post-state`          |
| 3   | Role + audit services, seed, indexes, transaction helper          | `service/{role,rbac-audit}.service.ts`, `service/types.ts`, `service/database.service.ts`                                                                         | Seed idempotent + non-destructive; audit written in-transaction; DB-name assertions untouched                                                                                                                     | `feat(ICR-128): add role and rbac-audit services with transactional guards` |
| 4   | `requirePermission` + denied state + nav gating + stub-page gates | `lib/rbac/require-permission.ts`, `components/rbac/permission-denied.tsx`, `shell/sidebar.tsx`, the 4 stub pages (`people`, `families`, `activities`, `calendar`) | One Mongo resolve per request; those 4 stubs fail closed; nav hides ungranted items. `/users` + `/roles` get their own gates in CP5/CP6 alongside their screens — all 6 key-mapped pages are gated once CP6 lands | `feat(ICR-128): enforce permissions in rsc loaders, nav, and denied state`  |
| 5   | `/roles` — matrix + actions                                       | `(app)/roles/*`, `components/ui/table.tsx`                                                                                                                        | Matrix renders grouped rows; Admin's two keys locked; server refuses direct writes                                                                                                                                | `feat(ICR-128): add roles screen with permission matrix`                    |
| 6   | `/users` — table + invite                                         | `(app)/users/*`, `components/ui/dialog.tsx`, `package.json`                                                                                                       | Invite creates a pending Invite; role assignment honours the invariant                                                                                                                                            | `feat(ICR-128): add users screen with invite dialog and role assignment`    |
| 7   | PII helper, bilingual catalogs, docs                              | `lib/rbac/pii.ts`, both `messages/*.json`, `i18n/messages.test.ts`, `docs/architecture/admin-rbac.md`                                                             | Parity test green; both locales render; docs cross-referenced                                                                                                                                                     | `feat(ICR-128): add pii omission helper, bilingual rbac strings, and docs`  |

Sequencing: 1→2 are pure and independent of IO; 3 depends on both; 4 depends on 3; 5 and 6 depend on
4; 7 can land last. Every checkpoint ends green on `pnpm type-check`, `lint`, `test`.

---

## 11. Open questions

1. **PII AC is only partially demonstrable this ticket.** The AC asks to confirm `phone`/`email`
   absence "in list, detail, and print views" — those views ship with ICR-129 (People CRUD). This
   ticket delivers `omitPii()` + unit tests as the enforcement primitive. _Decided at the design
   gate: ship the primitive, disclose the gap, let ICR-129 demonstrate it end-to-end._
2. **Integration-test harness deferred.** A follow-up ticket will add a `ministry-admin-test` harness
   (`mongodb-memory-server` with a replica set would also let the transaction path be tested
   properly). To be filed during this run's triage.
3. **`revokeRefreshTokens(uid)` on disable?** Per-request Mongo resolution already makes revocation
   effective on the next request, so this is defence-in-depth only. `getCurrentUser()` already uses
   `checkRevoked: true`. _Proposal: out of scope here; revisit if session-invalidation latency ever
   becomes a real complaint._
4. **Role name uniqueness** is enforced by a unique index, case-sensitively. Two roles named `Leader`
   and `leader` would both be allowed. _Proposal: accept for M1b; a collation-based index is
   available later if it bites._
5. **`seed:admin` (ICR-155) linkage.** This ticket creates the `Admin` role and the `Role.key` that
   ICR-155's script upserts against. Neither is complete without the other — ICR-155 should be
   scheduled immediately after this merges, since **nobody can sign in until it runs.**
