# Admin RBAC — permission registry, roles, the last-admin invariant, audit

ICR-127 built the front door (Firebase Auth, invite-only, `AdminUser.roleIds` resolved and
returned). ICR-128 is the ticket that turns enforcement **on**: before it, `apps/admin` had zero
permission checks anywhere — every route was reachable by any signed-in, provisioned user. This is
the sibling doc to `docs/architecture/admin-auth.md`; read that one first if you haven't — this doc
assumes `SessionResult`, `getCurrentUser()`, and the invite gate as background. Design record:
`tasks/specs/ICR-128-admin-rbac-permission-registry.md`.

## The registry — a const map, not an enum

`apps/admin/src/lib/rbac/permissions.ts` is the single source of truth for what a permission key
_is_:

```ts
export const PERMISSIONS = {
  "people:read": "View people",
  "people:write": "Create/edit people",
  // … 15 keys total
} as const satisfies Record<string, string>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [
  PermissionKey,
  ...PermissionKey[],
];
```

It's a const map, never an enum, following this repo's repo-wide convention (`CLAUDE.md` § Code
Conventions: "Avoid enums; use const maps instead"). Keys are shaped `resource:action`
(`people:read`, `roles:manage`, …) — that shape is load-bearing, not stylistic: the permission
matrix UI (`(app)/roles/permission-matrix.tsx`) groups its rows by splitting on `:` and rendering
one `<tbody>` per resource prefix (`permissions.groups.<resource>` heading), so **a new feature
appends one entry to `PERMISSIONS` and the matrix grows a row and, if the resource is new, a group
— zero UI code touched.** The values on the map itself are dev-facing fallbacks only, never
rendered; every user-visible label/description comes from next-intl
(`permissions.<key>.{label,description}`, both catalogs — see the i18n section below).

`isPermissionKey(value): value is PermissionKey` checks membership via
`Object.prototype.hasOwnProperty.call(PERMISSIONS, value)`, not `value in PERMISSIONS` — the `in`
operator walks the prototype chain and would accept `"toString"` or `"constructor"` as a valid key.
This is exercised directly (`permissions.test.ts`: `isPermissionKey("toString")` must be `false`).

## Reject-at-write / ignore-at-read symmetry

The registry feeds two independent gates that fail closed the same way, at opposite ends of a
permission key's lifecycle:

| Side               | File                                             | Behavior                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Write** (reject) | `lib/rbac/schemas.ts`: `z.enum(PERMISSION_KEYS)` | A role's `permissions` field is validated against the registry before persistence. A crafted POST carrying `"finances:write"` or `"*"` cannot ever land in Mongo — Zod rejects it, `roleUpdateSchema.safeParse` fails, the action returns `{ ok: false, reason: "invalid" }`. |
| **Read** (ignore)  | `lib/rbac/resolve.ts`: `resolvePermissions()`    | Every stored key is filtered through `isPermissionKey()` before being added to the granted set. A key that's stored but no longer registered — a renamed or removed feature — grants nothing.                                                                                 |

Why both are needed, not just one: the write-side guard only prevents _new_ drift. It cannot help a
role document that already carries a since-removed key (a feature was retired and its permission
key deleted from the registry, but old `Role.permissions` arrays on disk still list it). The
read-side filter is what makes that safe — `resolvePermissions` (and therefore
`retainsAdministrability`, which is built on it) simply never sees the stale key, so drift
**fails closed**: a dangling permission grants nothing rather than silently continuing to grant
access to a feature that no longer exists (or, worse, being re-registered later for something
unrelated and inheriting old grants by accident). `Role.permissions` is typed loosely
(`permissions: string[]`, `service/types.ts`) specifically so a stale value round-trips through
Mongo without a Zod parse failure — enforcement, not storage, is where the registry is authoritative.

## `requirePermission` — the one IO boundary

`lib/rbac/require-permission.ts` is the only place permission-checking touches the network/DB. Two
exports:

- **`getSessionPermissions()`** — `cache()`-memoized (see the testing caveat below). Calls
  `getCurrentUser()`, maps its 8-reason `SessionResult` refusal union down to 3 `DeniedReason`s
  (`unauthenticated` covers `no-session`/`expired`/`revoked`/`no-invite`/`email-unverified`/
  `provisioning-conflict`; `no-account` is `no-user`; `disabled` stays `disabled`) via an
  **exhaustive `switch`** — adding a ninth `SessionResult` reason is a TypeScript error here, not a
  silent fall-through to "authorized". On success it resolves the user's roles
  (`findRolesByIds(session.user.roleIds)`) and returns `resolvePermissions(roles)`.
- **`requirePermission(key)`** — calls `getSessionPermissions()`, then checks
  `result.permissions.has(key)`, returning `{ ok: false, reason: "forbidden" }` on a miss. Never
  throws; every caller branches on the return value.

`cache()` scopes memoization to one React request — the `(app)` layout, the page, the sidebar, and
any Server Action invoked in that request all share a single Mongo role resolve, which is what
makes calling `requirePermission()` at the top of every page cheap enough to do everywhere rather
than centralizing it in middleware.

### Why permissions are never in the token or the session cookie

Same discipline as `admin-auth.md`'s divergence table: `roleIds` comes from `AdminUser` in Mongo,
never from `decoded.customClaims`, and the **resolved permission set is never cached in the
`__session` cookie either** — `getSessionPermissions()` re-reads roles from Mongo on every request
(memoized only within that one request, not across requests). This is precisely what makes
mid-session revocation take effect immediately, with no sign-out required: an admin who unchecks a
permission on someone's role, or disables their account, changes what that user can do starting on
their **very next request** — there is no stale JWT or custom claim anywhere in the path that could
keep granting the old access until a token refresh. The cost is a Mongo round trip per request
(amortized to one per request by the `cache()` memoization above) instead of a free claims read;
this codebase has consistently traded that cost for correctness (see `admin-auth.md`'s
`roleIds`-from-Mongo rationale for the identical tradeoff one layer up).

### Testing caveat — do not remove the `cache()` mock

React's `cache()` only memoizes inside a live React Server render, which requires Node's
`react-server` module-resolution condition. React 19.2.1 ships `"react-server": "./react.react-server.js"`
alongside `"default": "./index.js"` in its `package.json` exports map; Next resolves the
`react-server` condition for RSC/Server Actions (so memoization is real in production), but Vitest's
default Node resolution does not use that condition and resolves `"default"` instead — where
`cache()` is a plain passthrough (`return function() { return fn.apply(null, arguments) }`, no
memoization at all). `require-permission.test.ts` therefore mocks `react`'s `cache` export with a
minimal single-call-cached reimplementation, so the "two calls in one request hit `findRolesByIds`
once" assertion tests something real instead of trivially passing because every mocked call happens
to be idempotent. **Do not remove that mock** — without it, the memoization assertions would keep
passing even if `require-permission.ts` stopped calling `cache()` at all, silently making the test
suite blind to a real regression.

## The last-admin invariant — a post-state predicate, not an admin count

`lib/rbac/last-admin.ts`'s `retainsAdministrability(state: AdminStateSnapshot): boolean` is the one
predicate every mutating action in `/roles` and `/users` must pass before it's allowed to commit.
It is evaluated against a **proposed post-state** — the system as it would look _after_ the pending
write — not a live count of admins in the current state. That distinction is the entire reason this
exists as a dedicated module instead of a one-line `if (adminCount <= 1) refuse`:

> A naive admin **count** cannot see the path that actually bricks the panel: unchecking
> `roles:manage` on the Admin **role** in the permission matrix instantly demotes every user holding
> that role at once — the admin count before the edit and immediately after could be identical (say,
> 3 admins), yet after the edit none of those 3 users hold an admin-equivalent permission anymore.

`ADMIN_EQUIVALENT_KEYS = ["users:manage", "roles:manage"]` — holding **either** key is
admin-equivalent in effect, because anyone holding one can grant themselves the other (`users:manage`
lets you reassign your own roles to include one that has `roles:manage`; `roles:manage` lets you add
`users:manage` to a role you hold). So administrability requires **both** keys to survive somewhere
in the system — not necessarily on the same role (`ADMIN_EQUIVALENT_KEYS.every(k => granted.has(k))`
is evaluated over the union of a user's roles, so two different roles jointly holding one key each
still counts), just held collectively by at least one active user.

`retainsAdministrability` is the single predicate covering **all five** ways an edit can remove the
last administrator, each exercised in `last-admin.test.ts`:

1. **Delete the last admin user.**
2. **Disable the last admin user** (`status: "disabled"` — a disabled user is filtered out of the
   `.some(...)` before its roles are even resolved).
3. **Remove the Admin role from the last admin user** (reassign their `roleIds` to exclude it).
4. **Uncheck `users:manage`/`roles:manage` on the Admin _role_ in the matrix** — the path a count
   can't see, described above.
5. **Delete the Admin role entirely.**

Every mutating action (`(app)/roles/actions.ts`, `(app)/users/actions.ts`) follows the identical
shape: read the current `roles`/`users` inside the transaction, build the `AdminStateSnapshot` as it
would look **after** applying the pending change (substituting the one role/user being edited,
filtering out the one being deleted), call `retainsAdministrability(postState)`, and refuse
`{ reason: "last-admin" }` before writing anything if it returns `false`.

`ADMIN_EQUIVALENT_KEYS.every` (not `.some`) is what makes step 4 above actually require **both**
keys — verified by mutation during CP2 (flip `.every` to `.some`, confirm the "requires BOTH keys,
not either" test goes red, then revert) rather than trusted on inspection alone.

## Services and transactions

`role.service.ts`, `rbac-audit.service.ts`, and `user.service.ts`'s mutators
(`updateUserRoles`/`updateUserStatus`/`deleteUser`) all follow the same shape as the pre-existing
`user.service.ts` — a module-level memoized `indexesPromise` (`??=`), `ensureRbacIndexes()`/
`ensureAuthIndexes()` awaited at the top of every entrypoint, every read parsed through a Zod schema
(`roleSchema.parse(doc)`) before use — the repo's "untrusted-shape defense" convention
(`service/types.ts:45`) applied to `Role` and `RbacAuditEntry` the same way it already applied to
`AdminUser`.

### `withAdminTransaction` — the transaction rules

`service/database.service.ts`'s `withAdminTransaction<T>(fn)` is the **one** place a Mongo
transaction is opened in this app (the `MongoClient` stays private to the module, same reason
`getAdminClient` isn't exported). It wraps `session.startSession()` /
`session.withTransaction(fn)` / `session.endSession()`. Three driver behaviors (verified against
`mongodb` 6.21.0's own `.d.ts`) shape every caller:

1. **Every operation inside `fn` must receive `{ session }` explicitly.** An un-sessioned read or
   write silently runs OUTSIDE the transaction — it doesn't error, it just doesn't join. This is the
   single most dangerous mistake available in this code: an un-sessioned `listRoles()`/`listUsers()`
   call inside `updateRoleAction`'s transaction would read **stale, pre-transaction** data when
   building the post-state snapshot, letting `retainsAdministrability` pass on data that's about to
   be superseded. Every action in `(app)/roles/actions.ts` and `(app)/users/actions.ts` threads
   `session` through every read and write for exactly this reason.
2. **The callback may be retried by the driver.** `fn` must be idempotent and must not mutate
   anything outside its own scope — which is why `inviteUserAction` sends the invite email **after**
   `withAdminTransaction` resolves (i.e. after commit), never from inside the callback: an email
   send is not idempotent, and a retried callback would risk sending it twice, or sending it for a
   transaction that later aborts for an unrelated reason.
3. **A caught error inside the callback must not be silently swallowed** — the driver can retry the
   transaction indefinitely against an error it never sees. The sanctioned refusal path is
   `await session.abortTransaction()` followed by `return { ok: false, reason: … }` — MongoDB's own
   docs promise a manual `abortTransaction()` inside the callback does **not** throw. This is the
   functional-first refusal pattern applied to transactions specifically: every mutating action
   below aborts-and-returns rather than throwing a custom `Error` for a business-rule refusal
   (`system-role`, `last-admin`, `not-found`, `conflict`), keeping the "no `Error` subclass for
   control flow" rule (`CLAUDE.md` § Code Conventions) intact even inside a transaction callback.

## The audit log

`rbac-audit.service.ts`'s `appendAuditEntry(entry, session)` writes to the append-only `rbacAudit`
collection. `session` is a **required** parameter (not optional, unlike most read helpers) — the
audit write must join the same transaction as the mutation it's recording, or the log could commit
independently of (and drift from) what was actually persisted. `at` is always stamped server-side
inside the function, never taken from caller input, so the timestamp can't be spoofed by a caller
that constructs the `Omit<RbacAuditEntry, "_id" | "at">` payload.

Every mutating action appends one entry: `role.create` / `role.update` / `role.delete` /
`user.invite` / `user.roles.update` / `user.disable` / `user.enable` / `user.delete`
(`RbacAuditAction`, `service/types.ts`), each carrying `actorUserId`/`actorEmail` (who),
`targetId` (what), and a `before`/`after` snapshot of just the changed fields.

**Why `users:manage` and `roles:manage` are admin-equivalent by construction, and why the seed
grants both only to Admin.** As established above (last-admin section), holding either key lets you
grant yourself the other — there is no privilege boundary between "can manage users" and "can manage
roles" once you hold one of them. That means **the audit log is the real control here, not a
narrower permission split** — this ticket does not attempt to prevent a `users:manage`-only holder
from reaching admin-equivalent access (that would require a different, more granular design than
what M1b's 15-key registry defines), it makes sure every such escalation is traceable to a specific
actor and timestamp. This is also exactly why `role.service.ts`'s `SYSTEM_ROLE_SEEDS` grants **both**
keys only to the seeded `admin` role — Leader (9 keys) and Member (2 keys) hold neither, so no
non-admin system role starts one edit away from admin-equivalence.

## UI enforcement — convenience only, never the gate

`components/shell/sidebar.tsx` filters `NAV_ITEMS` by `getSessionPermissions()` before rendering —
but this is explicitly **convenience only**: a hidden nav item that a user reaches anyway via a
direct URL is refused by the real gate, which is the `requirePermission()` call at the top of the
page/action itself. The four still-placeholder feature pages (`people`, `families`, `activities`,
`calendar`) already carry their real server-side gate even though their bodies are still
`PlaceholderPage` — each calls `requirePermission("<resource>:read")` and either renders
`<PermissionDenied />` (authenticated + provisioned but lacking the key — `reason: "forbidden"`) or
redirects to `/login` (`unauthenticated`) / `/no-access` (`no-account`/`disabled`), so ICR-129/130/131
inherit a fail-closed gate on day one instead of having to remember to add one later.

`<PermissionDenied>` (`components/rbac/permission-denied.tsx`) renders **inside** `AppShell` — the
user keeps their nav — which is deliberate: `/no-access` (ICR-127) means exactly one thing, "no
Mongo account at all," and reusing it for "wrong permission" would blur that contract. A `forbidden`
result gets its own in-page panel instead.

### System-role display naming

The three seeded system roles' `Role.name`/`Role.description` are set once, in English, at seed time
(`role.service.ts`'s `SYSTEM_ROLE_SEEDS`) and are **never edited** after that — `$setOnInsert` makes
re-running the seed non-destructive to a hand-edited role, but nothing translates the stored value.
`RoleList`/`PermissionMatrix` instead render `roles.system.<key>.name`/`.description` (translated,
both catalogs) for any role where `Role.isSystem` is true, falling back to the raw `name`/
`description` fields only for custom (user-authored) roles, which have no i18n key to render and
whose content genuinely is whatever the creating admin typed. The role edit form's `name` input for
a system role is a **hidden field carrying the raw stored (English) value**, not the translated
display string — so submitting an edit (e.g. to a system role's permissions) round-trips the
original DB `name` unchanged rather than overwriting it with whatever locale happened to be active
in the admin's browser at edit time.

### `Role.key` — immutable, system-roles-only, partial-unique

`Role.key?: SystemRoleKey` (`"admin" | "leader" | "member"`) is optional — custom roles have none —
and, once seeded, **never updatable**: `updateRoleAction`/`updateRole` never write it, and
`roleUpdateSchema` doesn't even accept it as a field (Zod strips unknown keys by default, so a
crafted payload carrying `key` is silently dropped rather than validated-and-rejected). The
`{ key: 1 }` index in `ensureRbacIndexes()` is unique but **partial**
(`partialFilterExpression: { key: { $exists: true } }`) — a plain unique index would collide the
moment a second custom role (which has no `key` field) was inserted, since Mongo treats a missing
field as `null` for uniqueness purposes and a second `null` collides with the first.

This ticket creates the `Admin` role and its `key: "admin"` — the stable identifier a **downstream**
ticket, ICR-155's `seed:admin` bootstrap script, is designed to upsert against
(`updateOne({ key: "admin" }, …, { upsert: true })`) rather than matching on the mutable, i18n-only
`name` field. ICR-155 is out of scope here; this ticket only ships the identifier it will consume.

## The `people:pii` scope boundary

`lib/rbac/pii.ts`'s `omitPii(record, granted)` is a pure, non-mutating helper:

```ts
export function omitPii<T extends PiiFields>(
  record: T,
  granted: ReadonlySet<PermissionKey>,
): T | Omit<T, "phone" | "email"> {
  if (granted.has("people:pii")) return record;
  // … returns a shallow copy with phone/email deleted, not blanked
}
```

It is **field omission, not masking** — without `people:pii`, `phone`/`email` are absent from the
returned object entirely (`expect(result).not.toHaveProperty("phone")`), never rewritten to `""` or
`null`. This distinction matters for a viewer building UI or an API client off the response: a
masked-but-present field still discloses that a value exists (and sometimes its shape, e.g. a
partially-redacted phone number); an absent key discloses nothing.

**This ticket ships the enforcement primitive and its unit tests only.** There is no People
list/detail/print view yet to call it on a real DTO — those arrive in ICR-129/130/131, which is what
actually wires `omitPii()` into a real congregant-data response. The spec's acceptance criterion
"confirm phone/email are absent from the list, detail, and print views without `people:pii`" **cannot
be demonstrated by this ticket** — there is nothing rendered yet for it to be absent from. Treat
`pii.ts` as load-bearing but unverified-end-to-end until ICR-129 lands.

## Surfaces deliberately NOT permission-gated

Three Server Action/route surfaces in `apps/admin` have no `requirePermission()` call. Each is a
deliberate omission, not oversight — a reader auditing for gaps should stop at these three rather
than filing a "missing gate" finding:

| Surface                                                     | Why it's ungated                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/auth/session/route.ts` (`POST`/`DELETE`)           | **Pre-auth by definition.** This route is what _establishes_ the session cookie in the first place (`POST`) or tears it down (`DELETE`) — gating it on a permission derived from a session that doesn't exist yet is circular. Its own security boundary is the Firebase ID-token verification + invite-gate (`resolveOrProvision`) described in `admin-auth.md`.                                                                                       |
| `(auth)/reset-password/actions.ts`'s `requestPasswordReset` | **Public by design, and enumeration-safe by construction** — it always returns `{ ok: true }` regardless of whether the email exists, is throttled, or the send fails (see `admin-auth.md`'s "Enumeration-safe by construction"). A permission check here would either require exposing account existence (defeating the enumeration-safety) or would be meaningless (there's no session to hold a permission yet — the requester isn't authenticated). |
| `components/shell/locale-actions.ts`'s `setPreferredLocale` | **Self-service, and already gated on identity rather than a specific permission.** It requires a valid session (`getCurrentUser()`; no-op `{ ok: false }` without one) and writes only the calling user's own `preferredLocale` — there is no `PermissionKey` for "may change your own display language," and adding one would be pure ceremony: every provisioned user is allowed to do this by definition of having an account.                       |

## `createInvite` — CP6/CP7 design decisions

`invite.service.ts`'s `createInvite(input, session)` (added in CP6 — ICR-127 shipped invite
**acceptance** only; there was no creation path anywhere in `apps/admin` before this ticket) carries
three judgment calls worth recording:

1. **7-day expiry.** No TTL value is specified anywhere in the ICR-127/ICR-128 spec or docs; 7 days
   is a conventional default for an admin invite link. Revisit if product wants something
   shorter/longer.
2. **Re-inviting an email with an existing pending, unexpired invite is refused
   (`reason: "conflict"`)**, not silently re-sent or upserted — there is no UI yet to view or revoke
   a stuck pending invite if one is ever needed (tracked as a follow-up, not this ticket).
3. **`createInvite` does not check whether the email already belongs to an active `AdminUser`** — no
   such lookup exists in `user.service.ts`, adding one is out of scope, and re-inviting an existing
   user is harmless (`inviteUserAction` has no `retainsAdministrability` check to run here either —
   inviting can only ever **add** a prospective grantee, never reduce administrability).

**Uniqueness enforcement is ONE rule (CP7, settled after two rounds of review).** CP6 implemented "at
most one pending invite per address" as a `findOne` pre-check alone. That's a TOCTOU race: MongoDB
transactions use snapshot isolation, which does **not** prevent a phantom insert — two concurrent
invites for the same address can both observe "no pending invite" from their own transaction snapshot
and both proceed to insert, even though each runs inside `withAdminTransaction`. This is the identical
read-then-write bug class the last-admin invariant exists to prevent, just on a different collection.

The fix is a **partial unique index** in `ensureAuthIndexes()` (`user.service.ts`, which already owns
the `invites` indexes):

```ts
invites.createIndex(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
```

`createInvite` attempts the insert directly — **no pre-check** — and maps the resulting `E11000` to
`{ ok: false, reason: "conflict" }` via `isDuplicateKeyError` (exported from `user.service.ts`, reused
by both `invite.service.ts` and `createRole`'s duplicate-name handling — one implementation, not two
copies). An earlier revision paired the index with a `findOne` pre-check for a clean non-exception
result in the common case; it was removed. The reason is stronger than "the index makes it redundant":
the pre-check used a **different predicate** than the index — `expiresAt: { $gt: new Date() }` vs. the
index's bare `status: "pending"` — so the two guards could **disagree** at the edges, producing a
confusing "passes the pre-check, then collides on insert anyway" outcome for an expired-but-still-
pending invite. Removing the pre-check collapses this to one authoritative rule instead of two rules
that don't always agree, and matches `createRole`'s catch-only pattern against its own unique index —
one duplicate-detection idiom in this codebase, not two.

**Known limitation, not fixed here.** With one rule, the gap is simpler to state: the partial index
keys off `status: "pending"` alone, and nothing in this codebase ever transitions a `pending` invite to
another status on natural expiry (`expiresAt` is only ever a query filter elsewhere — e.g.
`findPendingInvite` — never written). So a genuinely expired-but-still-`"pending"` invite permanently
blocks re-inviting that address — it still collides with the index — until the doc is manually cleared,
and there is no revoke path or pending-invites list UI yet to do that. Flagged in `tasks/todo.md` for a
follow-up. The real fix is either an `expiresAt` clause added to the partial filter or upsert-and-
refresh semantics on `createInvite` — both are scope decisions for a follow-up ticket, not a checkpoint
detail.

## Related docs

- `docs/architecture/admin-auth.md` — the sign-in → session-cookie → invite-gate flow this ticket
  enforces on top of; `SessionResult`, `getCurrentUser()`, the two-verification model.
- `docs/architecture/admin-database.md` — the two-connection Mongo model `role.service.ts` /
  `rbac-audit.service.ts` / `user.service.ts` all read and write through (`getAdminDb()`).
- `docs/architecture/i18n.md` — the next-intl setup `permissions.*`/`roles.*`/`users.*`/`rbac.*`
  plug into; both catalogs' parity is asserted in `src/i18n/messages.test.ts`.
- `tasks/specs/ICR-128-admin-rbac-permission-registry.md` — the full spec (requirements, edge cases,
  data model, i18n key structure).
- `tasks/specs/ICR-128-admin-rbac-permission-registry.plan.md` — the checkpoint-by-checkpoint
  implementation plan, including every plan defect found and corrected along the way.
