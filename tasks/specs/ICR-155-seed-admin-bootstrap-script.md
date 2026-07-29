# ICR-155 — Guarded `seed:admin` bootstrap script

**Jira:** [ICR-155](https://divinelab.atlassian.net/browse/ICR-155) · Task → commit type `feat` · QA depth **heavy**
**Epic:** ICR-13 Admin · Platform Foundation
**Branch:** `feat/ICR-155-seed-admin-bootstrap-script`
**Sensitive areas:** `auth/roles` (this _is_ the privilege-grant path) · `env-secrets` (`MONGODB_URI` carries the target DB in its path) · Mongo write path · congregant PII

---

## 0. Premise correction (read this first)

The Jira issue was written against PR #115's head `8ec3a29`. It has since merged as `7f21c75`, and
**one of its two named defects no longer exists.**

### Defect 1 ("an expired invite permanently bricks the bootstrap") is ALREADY FIXED upstream

ICR-128's P1 fix rewrote `createInvite` as a single atomic upsert
(`apps/admin/src/service/invite.service.ts:102-144`):

```ts
findOneAndUpdate(
  { email, status: "pending" }, // matches expired-but-pending too
  {
    $set: {
      roleIds,
      locale,
      expiresAt: now + INVITE_EXPIRY_MS,
      invitedByUserId,
    },
    $setOnInsert: { email, status: "pending", createdAt: now },
  },
  {
    upsert: true,
    returnDocument: "after",
    includeResultMetadata: true,
    session,
  },
);
```

The filter is `{ email, status: "pending" }` with **no `expiresAt` clause**, so a long-expired pending
invite is matched and refreshed in place — new `expiresAt`, new `roleIds`, same `_id`. Its own doc
comment says so: _"re-inviting an address, whether its invite is live or long expired, always
refreshes."_

This is precisely the outcome the issue predicted would make the local handling unnecessary: _"if
ICR-185 lands first with upsert-and-refresh semantics in `createInvite`, this script inherits the
behaviour and its local handling collapses to nothing."_ It did.

**Consequences, all confirmed with the human at the design gate (2026-07-28):**

| #   | Issue said                                   | This spec does                                                             | Why                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Script owns expired-invite refresh semantics | Script owns none; it calls `createInvite` and reports its `refreshed` flag | The upsert already refreshes                                                                                                                                                                                                                                                               |
| 2   | `--ttl-days`, default 7                      | **Dropped**                                                                | `INVITE_EXPIRY_MS` is private to `createInvite` and it takes no TTL param. Supporting the flag means widening a function that just absorbed a P1 and five Codex rounds — for a flag whose only purpose was mitigating defect 1. A lapsed window is now recoverable by re-running the seed. |
| 3   | Second run reports `reused: true`            | Second run reports `refreshed: true`                                       | `createInvite` returns only `lastErrorObject.updatedExisting`; it **cannot** distinguish a live pending invite from an expired one. Reporting `reused` would need an extra, inherently racy pre-read for purely cosmetic output.                                                           |

**Two Jira ACs must be corrected** to stop instructing future agents to build a distinction the data
layer cannot make — see §11.

### Defect 2 (Google-only first sign-in) stands, unchanged

`provision.ts` gates first sign-in on `decoded.email_verified !== true`. The bootstrap address must be
Google-capable, and the bootstrap must use the **Google** button. This is runbook content (§9), not code.

---

## 1. Dependencies Check

Everything this script consumes is **merged and verified on `main` at `7f21c75`** (re-read, not
trusted from the issue's line numbers):

| Symbol                      | File                                  | Verified signature                                                                                            |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `getAdminDb()`              | `src/service/database.service.ts:168` | `(): Db` — **synchronous**; **throws** a plain `Error` via `assertAdminDbName(db.databaseName)`               |
| `ADMIN_DB_NAME_PATTERN`     | `:73`                                 | `/^ministry-admin(-staging\|-test\|-qa\|-e2e)?$/`                                                             |
| `withAdminTransaction`      | `:214`                                | `<T>(fn: (session: ClientSession) => Promise<T>) => Promise<T>` — `fn` may be **retried**, must be idempotent |
| `seedSystemRoles()`         | `src/service/role.service.ts:119`     | `(): Promise<void>` — **no params, no return payload**, no session                                            |
| `listRoles()`               | `:37`                                 | `(session?: ClientSession) => Promise<Role[]>`                                                                |
| `listUsers()`               | `src/service/user.service.ts:133`     | `(session?: ClientSession) => Promise<AdminUser[]>` — **all** statuses                                        |
| `createInvite()`            | `src/service/invite.service.ts:102`   | `(input, session /* REQUIRED */) => Promise<{ok:true;inviteId;refreshed} \| {ok:false;reason:"insert-race"}>` |
| `retainsAdministrability()` | `src/lib/rbac/last-admin.ts:32`       | `(state: AdminStateSnapshot) => boolean`                                                                      |
| `normalizeEmail()`          | `src/lib/auth/email.ts`               | `(value?: string \| null) => string`                                                                          |
| `PERMISSION_KEYS`           | `src/lib/rbac/permissions.ts`         | `[PermissionKey, ...PermissionKey[]]` (15 keys)                                                               |
| `sendInviteEmail()`         | `src/service/auth-email.ts:17`        | `({to, inviteUrl, locale}) => Promise<boolean>`                                                               |
| `i18n` / `Locale`           | `src/i18n/config.ts`                  | `{defaultLocale:"es-AR", locales:["es-AR","en-US"]}`                                                          |

**Import-chain safety (the decision that permits TypeScript + `tsx`):** the whole chain
`database.service → role/invite/user.service → types.ts → i18n/config.ts → lib/auth/email.ts →
lib/rbac/*` is plain TypeScript. `server-only` is imported **only** by `lib/firebase/admin.ts`, which
is outside this chain — the script never touches Firebase. `database.service.ts:110` states the intent
outright: _"ICR-155's plain Node/tsx seed script can import these directly."_

**Tooling facts verified in this worktree:**

- **No `tsx` anywhere in the monorepo.** It must be a **direct `@idcr/admin` devDependency** — with
  `shamefully-hoist=false`, only direct deps land in `apps/admin/node_modules/.bin`, which is what
  `"seed:admin": "tsx scripts/seed-admin.ts"` resolves against.
- **`tsconfig.json` `include` is `["**/\*.ts", ...]`, `exclude: ["node_modules"]`** → `scripts/seed-admin.ts`**is** covered by`pnpm type-check`.
- **`vitest.config.ts` `include` is `["src/**/\*.{test,spec}.{ts,tsx}"]`** → a test under `scripts/` is
  **silently skipped** (ICR-21). This is the single biggest constraint on the file layout (§5).
- **No `mongodb-memory-server`.** All 40 admin test files mock at the module boundary. Confirmed at the
  design gate: idempotency/refresh are proven by injected fakes; the real-DB run is a human runbook step.
- ESLint's `no-restricted-syntax` ban on bare `client.db()` is scoped to `files: ["src/**/*.{ts,tsx}"]`,
  so it does not cover `scripts/` — moot, since the script calls `getAdminDb()` and never the driver.

---

## 2. Requirements

**R1 — Layout.** All logic that must be tested lives under `src/`; `scripts/seed-admin.ts` is a thin
shell. Rationale: `vitest` only sees `src/**`.

**R2 — `parseSeedArgs(argv, env)`** (pure) returns
`{ok:true; args: SeedArgs} | {ok:false; reason:"invalid-email"|"usage"; message: string}`.
Flags: `--email <addr>` (or `ADMIN_SEED_EMAIL`), `--locale es-AR|en-US` (default `i18n.defaultLocale`),
`--force`, `--yes`, `--dry-run`, `--send-email`. Unknown flags → `usage`. Email is Zod-validated then
run through `normalizeEmail()`.

**R3 — `seedAdmin(input, deps)`** (orchestration) returns a union discriminated on `dryRun`, so a
dry run cannot claim ids it never created:

```ts
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

export type SeedAdminFailure =
  | "db-guard"
  | "admin-exists"
  | "invalid-email"
  | "write-failed";
```

No thrown `Error` subclasses for control flow; `getAdminDb()`'s throw is caught at the boundary and
mapped to `db-guard`.

`exitCodeFor` accepts **either** a `SeedAdminResult` or a `parseSeedArgs` failure, since the CLI maps
both through one function:

```ts
export function exitCodeFor(
  result: SeedAdminResult | { ok: false; reason: "usage" | "invalid-email" },
): 0 | 1 | 2;
```

**R4 — `deps` is an injected object with real defaults**, so tests control every collaborator without
`vi.mock`:

```ts
export interface SeedAdminDeps {
  readonly getAdminDb: typeof getAdminDb;
  readonly seedSystemRoles: typeof seedSystemRoles;
  readonly listRoles: typeof listRoles;
  readonly listUsers: typeof listUsers;
  readonly createInvite: typeof createInvite;
  readonly withAdminTransaction: typeof withAdminTransaction;
}
```

**R5 — Guard 1 (wrong database).** The ONLY database resolution is `deps.getAdminDb()`. No DB-name env
var, no local copy of the allowlist, no re-derivation. Its throw → `{ok:false, reason:"db-guard"}` with
**zero writes**. `--force` never relaxes this guard.

**R6 — Guard 2 (already administrable), evaluated BEFORE any write.** Build
`AdminStateSnapshot` from `listUsers()` + `listRoles()`:

```ts
{
  users: users.map(u => ({ id: u._id.toHexString(), status: u.status, roleIds: u.roleIds })),
  roles: roles.map(r => ({ id: r._id.toHexString(), permissions: r.permissions })),
}
```

If `retainsAdministrability(snapshot) === true` and `--force` is absent → `{ok:false,
reason:"admin-exists"}`. Ordering this before `seedSystemRoles()` is what makes "refuses with zero
writes" literally true: a fresh DB yields an empty snapshot → predicate false → proceed; a
bootstrapped DB yields an administrable snapshot → refuse, untouched.

**R7 — Guard 3 (idempotency).** Roles via `seedSystemRoles()` (upsert by immutable `key`, `$setOnInsert`).
Invite via `createInvite`'s upsert. Indexes come free from `ensureAuthIndexes()`/`ensureRbacIndexes()`.
The script adds **no** idempotency logic of its own.

**R8 — Guard 4 (explicit target).** `--email` required (env alternative `ADMIN_SEED_EMAIL`). **No
hardcoded address anywhere in the diff** — including `gabriel@idcredentor.org`, which is a runbook
argument, never a code value, default parameter, fallback constant, or test fixture default.

**R9 — Guard 5 (deliberate + human).** Refuse when `process.env.CI` is set (exit 2). Print the resolved
DB name + redacted cluster host and require an interactive confirm, bypassed by `--yes`. `--dry-run`
prints the plan and writes nothing.

**R10 — Guard 6 (secret hygiene).** Never print `MONGODB_URI` or any Firebase value. The host is
redacted to its hostname only, never credentials.

**R11 — Admin role resolution.** `seedSystemRoles()` returns `void`, so after it the script calls
`listRoles()` and selects `role.key === "admin"`. Absent (impossible unless the seed silently failed) →
`{ok:false, reason:"write-failed"}`.

**R12 — Invite creation.** Inside `withAdminTransaction`, call `createInvite({email, roleIds:
[adminRoleId], locale}, session)` with `invitedByUserId` **omitted**. On `insert-race`, retry the whole
transaction **once** in a fresh session — mirroring `inviteUserAction`'s documented pattern (a retry on
the same session can never observe the winner). A second `insert-race` → `write-failed`.

**R13 — Upstream relax.** `CreateInviteInput.invitedByUserId` becomes optional. **The `$set` object
must be built conditionally so the key is omitted, never written as `null`** — see §3.

**R14 — `--send-email`** is opt-in and best-effort: a failed send never fails the run (the invite is
already written and the URL carries no token). It additionally requires `NEXT_PUBLIC_ADMIN_BASE_URL`
and the mail-provider env — which is exactly why it is not the default (R10's minimal env surface).

**R15 — Exit codes** (mirroring `.claude/scripts/predica/delete-contentful.mjs`): `0` success ·
`2` usage/guard refusal (`usage`, `invalid-email`, `db-guard`, `admin-exists`, CI, declined confirm) ·
`1` operation failure (`write-failed`).

**R16 — Termination.** The MongoClient is private to `database.service.ts` with no close export, so the
process will not exit on its own. The CLI writes its single JSON line with `writeSync(1, …)` —
synchronous even when stdout is a pipe, so nothing truncates — then calls `process.exit(code)`.
**No change to `database.service.ts`.**

**R17 — Not wired into automation.** Absent from `turbo.json`, from all three `.github/workflows/`
files, and from any `postinstall`/`prepare` hook.

---

## 3. Data Model Changes

**No schema change. No new collection. No new index. No new env var.**

The only type change is relaxing one input interface:

```ts
// apps/admin/src/service/invite.service.ts
export interface CreateInviteInput {
  readonly email: string;
  readonly roleIds: readonly string[];
  readonly locale: Locale;
  readonly invitedByUserId?: string; // was: readonly invitedByUserId: string
}
```

`Invite.invitedByUserId` on the stored type is **already** `?: string` with the comment
`// nullable (seeded invites have none)` — only the _input_ forced it.

### The `null` hazard this introduces (must be handled, gets its own test)

`createInvite` currently does `$set: { …, invitedByUserId: input.invitedByUserId }`. With the field
optional and absent, the Node driver serialises `undefined` to BSON **`null`** (`ignoreUndefined`
defaults to false). `inviteSchema` types the field `z.string().optional()`, which **rejects `null`** —
so every subsequent `findPendingInvite`/`claimPendingInvite`/`findAcceptedInviteByEmail` parse of that
document would throw, breaking the very sign-in this ticket exists to enable.

The `$set` must therefore be built so the key is **omitted**:

```ts
const $set: Record<string, unknown> = {
  roleIds: [...input.roleIds],
  locale: input.locale,
  expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS),
};
if (input.invitedByUserId !== undefined)
  $set.invitedByUserId = input.invitedByUserId;
```

This is behaviour-preserving for the UI path (`inviteUserAction` always passes an id).

---

## 4. API Changes

No HTTP route, no Server Action, no public API. The CLI contract is the interface:

```
Usage: pnpm --filter @idcr/admin seed:admin -- --email <address> [options]

  --email <address>   REQUIRED (or ADMIN_SEED_EMAIL). The first Admin's address.
  --locale <loc>      es-AR | en-US   (default: es-AR)
  --force             Proceed even when the panel is already self-administrable.
                      Never relaxes the database guard.
  --yes               Skip the interactive confirmation (non-interactive human run).
  --dry-run           Print the plan; write nothing.
  --send-email        Also send the courtesy invite email (opt-in; needs mail env).

Env:  MONGODB_URI (required — its PATH decides the target database)
      ADMIN_SEED_EMAIL (optional alternative to --email)
Exit: 0 success · 1 operation failure · 2 usage/guard refusal
```

**Zod validation at the one untrusted boundary (argv/env):**

```ts
const seedArgsSchema = z.object({
  email: z.string().trim().min(1).email(),
  locale: z.enum(i18n.locales).default(i18n.defaultLocale),
  force: z.boolean().default(false),
  yes: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
});
```

**stdout contract — exactly one JSON line:**

```json
{"ok":true,"dryRun":false,"roleIds":["<hex>","<hex>","<hex>"],"inviteId":"<hex>","refreshed":false}
{"ok":true,"dryRun":true}
{"ok":false,"reason":"admin-exists","message":"The panel is already self-administrable…"}
```

Human-facing narration (the DB banner, the confirm prompt) goes to **stderr**, keeping stdout
machine-readable.

---

## 5. New / Modified Files

### New

| File                                         | Purpose                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/lib/rbac/seed-admin.ts`      | `parseSeedArgs()`, `seedAdmin(input, deps)`, `exitCodeFor()`, `redactMongoHost()` — everything testable |
| `apps/admin/src/lib/rbac/seed-admin.test.ts` | Unit tests (inside vitest's `src/**` include)                                                           |
| `apps/admin/scripts/seed-admin.ts`           | ~40-line CLI shell: argv → banner → confirm → `seedAdmin` → `writeSync` → `process.exit`                |
| `docs/architecture/admin-bootstrap.md`       | The runbook (§9)                                                                                        |
| `.changeset/<generated>.md`                  | `@idcr/admin` **minor** (new feature)                                                                   |

### Modified

| File                                            | Change                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `apps/admin/src/service/invite.service.ts`      | `CreateInviteInput.invitedByUserId` → optional; conditional `$set` so the key is omitted, never `null`; doc-comment note |
| `apps/admin/src/service/invite.service.test.ts` | New case: omitted `invitedByUserId` must not write the key                                                               |
| `apps/admin/package.json`                       | `"seed:admin": "tsx scripts/seed-admin.ts"` + `tsx` devDependency                                                        |
| `pnpm-lock.yaml`                                | `tsx` (load-bearing — a stale lockfile fails the Vercel deploy, ICR-16)                                                  |
| `docs/architecture/admin-rbac.md`               | Cross-link the bootstrap runbook from § Known limitations                                                                |
| `CLAUDE.md`                                     | Add `admin-bootstrap.md` to the engineering-docs index                                                                   |

**Explicitly NOT touched:** `apps/admin/src/service/database.service.ts` (R16), `turbo.json`,
`.github/workflows/*`, `apps/admin/.env.example` (no new app-runtime var — `ADMIN_SEED_EMAIL` is an
operator convenience documented in the runbook, not app config).

---

## 6. Call hierarchy

```
scripts/seed-admin.ts                        [shell — not unit-tested by design]
└── parseSeedArgs(process.argv.slice(2), process.env)      ── src/lib/rbac/seed-admin.ts
    ├── !ok                       → stderr usage  → exit 2
    └── ok
        ├── process.env.CI set    → stderr refusal → exit 2
        ├── banner → stderr: "database: ministry-admin-staging @ <host>"   [redacted]
        ├── !yes && !dryRun → confirm (node:readline/promises)
        │     └── declined        → exit 2
        └── seedAdmin(args, defaultDeps)     ── src/lib/rbac/seed-admin.ts
            ├── deps.getAdminDb()                       [Guard 1 — throws → db-guard]
            ├── deps.listUsers() + deps.listRoles()
            │   └── retainsAdministrability(snapshot)   [Guard 2 — before ANY write]
            │         true && !force → admin-exists     [ZERO WRITES]
            ├── args.dryRun → { ok:true, dryRun:true }  [ZERO WRITES — no ids claimed]
            ├── deps.seedSystemRoles()                  ◀── first write
            ├── deps.listRoles() → find key === "admin" → adminRoleId
            │     absent → write-failed
            └── deps.withAdminTransaction(s =>
                  deps.createInvite({email, roleIds:[adminRoleId], locale}, s))
                  ├── ok               → { ok:true, roleIds, inviteId, refreshed }
                  └── "insert-race"    → retry ONCE in a fresh transaction
                        └── "insert-race" again → write-failed
        ├── args.sendEmail && result.ok → sendInviteEmail(...)  [best-effort]
        ├── writeSync(1, JSON.stringify(result) + "\n")         [pipe-safe]
        └── process.exit(exitCodeFor(result))
```

---

## 7. Edge Cases

1. **`MONGODB_URI` unset** → `getAdminClient()` throws `"MONGODB_URI is not defined"` → caught → `db-guard`, exit 2, zero writes.
2. **URI with no path database** → driver resolves `test` → fails `ADMIN_DB_NAME_PATTERN` → `db-guard`. This is the documented silent-fallback trap.
3. **URI points at `website*`** → fails the admin allowlist → `db-guard`.
4. **URI points at `ministry-admin-test` from a prod credential** → **passes** the code assertion (the ICR-166 accepted widening). Only the Atlas grant stops it — which is exactly why the print-and-confirm guard (R9) is mandatory and why the banner prints the resolved name.
5. **Fresh DB** → snapshot empty → `retainsAdministrability` false → proceed → roles seeded → invite inserted → `refreshed: false`.
6. **Immediate re-run** → invite exists and is pending → upsert matches → `refreshed: true`, exit 0. No duplicate role, no duplicate invite, no `User`.
7. **Re-run after the 7-day window** → same upsert matches the expired-pending invite, extends `expiresAt`, refreshes `roleIds` → `refreshed: true`, and the invite is now claimable by `claimPendingInvite` (whose filter is `expiresAt: {$gt: now}`). **This is `createInvite`'s behaviour, not the script's** (§0).
8. **Panel already administrable** → `admin-exists`, exit 2, zero writes — including no `seedSystemRoles()` call.
9. **`--force` with an administrable panel** → proceeds to create/refresh the invite. Guard 1 still applies.
10. **`--force` with a bad DB name** → still `db-guard`. Force never relaxes guard 1. _(Explicit test.)_
11. **A disabled user holding Admin** → `retainsAdministrability` skips non-`active` users → not administrable → the seed proceeds. Correct: a disabled admin cannot repair the panel.
12. **A user holding only `users:manage`** (not `roles:manage`) → `ADMIN_EQUIVALENT_KEYS.every(...)` fails → not administrable → seed proceeds. Matches the shipped invariant (AND, not OR).
13. **Concurrent seed runs** → one wins the upsert; the loser gets `insert-race`, retries in a fresh transaction, sees the winner, and reports `refreshed: true`. Both exit 0.
14. **`CI` set** → refuse, exit 2, before any DB access.
15. **Confirm declined** → exit 2, zero writes.
16. **`--dry-run`** → runs guards 1 and 2 (both read-only) and prints the plan; returns before `seedSystemRoles()`. Zero writes.
17. **Invalid/missing email** → `invalid-email` / `usage`, exit 2, before any DB access.
18. **Invalid `--locale`** → Zod rejects → `usage`, exit 2. (Note `inviteLocaleSchema.catch()` repairs bad locales on _read_; the CLI is stricter on _write_ so a typo is surfaced, not silently defaulted.)
19. **`--send-email` without `NEXT_PUBLIC_ADMIN_BASE_URL`/mail env** → the invite is already committed; the send fails, is reported on stderr, and the run still exits 0. The invite URL carries no token, so the email is a courtesy.
20. **Admin role missing after `seedSystemRoles()`** → `write-failed`, exit 1.

---

## 8. i18n

**None.** This is an operator-facing CLI, not product UI — no `messages/{es-AR,en-US}.json` keys are
added, and the `i18n-messages` sensitive area is **not** engaged. The only locale involvement is
`--locale`, which seeds `Invite.locale` → the provisioned user's `preferredLocale`; both existing
locale values are accepted and validated against `i18n.locales`.

---

## 9. Runbook — `docs/architecture/admin-bootstrap.md`

Content the doc must carry:

- **Why it exists** — the invite-only chicken-and-egg on a fresh admin database.
- **The two invocation styles** (Node 22.14 pins `--env-file` support):

  ```bash
  # From a local env file
  node --env-file=apps/admin/.env.local \
    ./node_modules/.bin/tsx apps/admin/scripts/seed-admin.ts --email <address> --dry-run

  # Production — URI exported for one command only, never committed
  MONGODB_URI='mongodb+srv://…/ministry-admin?authSource=admin' \
    pnpm --filter @idcr/admin seed:admin -- --email <address> --yes
  ```

- **The database rides in the URI path** — no DB-name env var exists; a URI missing its path silently
  resolves to `test` and is refused.
- **🔴 Google sign-in only.** `provision.ts` refuses a first sign-in whose token lacks
  `email_verified: true`. Firebase email/password signup starts unverified and the admin app never
  sends Firebase's verification mail, so **the bootstrap must use the Google button**. The first Admin
  is `gabriel@idcredentor.org` (Google Workspace — `idcredentor.org` MX is `1 smtp.google.com`).
  _This file is the ONLY place in the repo where that address appears._
- **Re-running is safe**, and a lapsed 7-day window is recovered by simply re-running (the upsert
  refreshes `expiresAt`).
- **What "already administrable" means** and when `--force` is legitimate (a genuine lockout).
- **Verification after the run** — sign in, confirm `/users` and `/roles` are reachable.
- **`WEBSITE_MONGODB_URI` must stay unset** for the seed process.

---

## 10. Testing Strategy

Mocked-driver unit tests via injected `deps` (no `vi.mock` needed), matching the repo's existing
40-file admin suite. Baseline before this ticket: **342 passing**.

### `src/lib/rbac/seed-admin.test.ts`

**`parseSeedArgs`** — missing email → `usage`; `ADMIN_SEED_EMAIL` fallback works; malformed email →
`invalid-email`; email is normalized (` Gabriel@X.COM` → `gabriel@x.com`); default locale is `es-AR`;
invalid locale → `usage`; unknown flag → `usage`; each boolean flag parses.

**`seedAdmin` guards**

- `getAdminDb` throws → `db-guard`, **and** `seedSystemRoles`/`createInvite` were never called.
- `getAdminDb` throws **with `--force`** → still `db-guard` (guard 1 is unconditional).
- administrable snapshot → `admin-exists`, **and `seedSystemRoles` never called** (zero writes).
- administrable snapshot **+ `--force`** → proceeds to `createInvite`.
- disabled-admin-only snapshot → **not** administrable → proceeds.
- `users:manage` without `roles:manage` → **not** administrable → proceeds.
- `--dry-run` → `ok`, `dryRun: true`, `seedSystemRoles`/`createInvite` never called.

**`seedAdmin` happy + failure paths**

- fresh DB → `refreshed: false`, `inviteId` returned, `createInvite` called with `invitedByUserId`
  **absent from the input object** (`expect(input).not.toHaveProperty("invitedByUserId")`).
- `createInvite` → `refreshed: true` → result reports `refreshed: true`, exit 0.
- `insert-race` then success → exactly **two** `withAdminTransaction` calls; result `ok`.
- `insert-race` twice → `write-failed`.
- `listRoles` returns no `key === "admin"` → `write-failed`.
- invite is created with `roleIds === [adminRoleId]` and the parsed locale.

**`exitCodeFor`** — `ok`→0; `write-failed`→1; `db-guard`/`admin-exists`/`invalid-email`/`usage`→2.

**`redactMongoHost`** — a full `mongodb+srv` URI carrying `user:pass` userinfo yields the bare
hostname (`cluster0.abcde.mongodb.net`) and **no** credentials; a malformed URI yields `<unparseable>`
rather than echoing the raw string back.

> **Fixture constraint.** The husky `pre-commit` hook rejects any staged diff matching
> `mongodb(\+srv)?://[^@[:space:]]+@`, and `--no-verify` is banned — so a _fake_ credential-bearing URI
> written as one literal cannot be committed. Test fixtures and doc examples must assemble such a URI
> from parts (e.g. `[scheme + credentials, host].join("@")`) so the pattern never appears contiguously
> in the diff.

### `src/service/invite.service.test.ts` (extend)

- `createInvite` with `invitedByUserId` omitted → the `$set` passed to `findOneAndUpdate` **does not
  contain the key** (guards the BSON-`null` hazard, §3).
- `createInvite` with `invitedByUserId` present → unchanged behaviour (regression guard for the UI path).

### Verification gates

`pnpm type-check` · `pnpm lint` · `pnpm test` · `pnpm build` — all green.

### Deliberately NOT covered by the pipeline (confirmed at the design gate)

| AC                           | Why                                                                            | Where it is proven                                                                |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Real-DB idempotency / expiry | No `mongodb-memory-server` in the repo; adding it is a scope expansion         | Human `--dry-run` then real run against `ministry-admin-staging`, per the runbook |
| Google first sign-in E2E     | Needs a real Google credential; admin Vercel previews are SSO-walled (ICR-169) | Human, post-merge                                                                 |

QA will report these as **env-limited BLOCKED**, not FAIL — the terminal state established by ICR-44 and
ICR-136. They must not be routed back to the implementer as code defects.

---

## 11. Implementation Checkpoints

**CP1 — Relax `CreateInviteInput` + close the `null` hazard**
Files: `src/service/invite.service.ts`, `src/service/invite.service.test.ts`
Verify: new test fails before the conditional `$set`, passes after; existing invite tests stay green;
`pnpm type-check` (proves no caller depended on the field being required).
Commit: `feat(ICR-155): allow createInvite without an inviting user`

**CP2 — `parseSeedArgs` + `exitCodeFor` + `redactMongoHost`**
Files: `src/lib/rbac/seed-admin.ts`, `src/lib/rbac/seed-admin.test.ts`
Verify: arg/exit/redaction tests green; no address literal in the diff.
Commit: `feat(ICR-155): add seed-admin arg parsing, exit codes, host redaction`

**CP3 — `seedAdmin(input, deps)` + guards**
Files: `src/lib/rbac/seed-admin.ts`, `src/lib/rbac/seed-admin.test.ts`
Verify: all guard/happy/failure tests green, including "`--force` does not relax guard 1" and
"`admin-exists` performs zero writes".
Commit: `feat(ICR-155): add guarded seedAdmin bootstrap orchestration`

**CP4 — CLI shell + package wiring**
Files: `apps/admin/scripts/seed-admin.ts`, `apps/admin/package.json`, `pnpm-lock.yaml`
Verify: `pnpm --filter @idcr/admin seed:admin -- --help` style paths exercised manually —
`CI=1 … seed:admin` exits 2; no `--email` exits 2; `--dry-run` against a **`ministry-admin-test`**
URI writes nothing; `MONGODB_URI` pointed at a `website*` name exits 2. `pnpm type-check` covers the
script. Confirm `turbo.json`/workflows untouched.
Commit: `feat(ICR-155): add seed:admin CLI entrypoint`

**CP5 — Runbook + doc index + changeset**
Files: `docs/architecture/admin-bootstrap.md`, `docs/architecture/admin-rbac.md`, `CLAUDE.md`,
`.changeset/*.md`
Verify: `grep -rn '@idcredentor\.org'` over the diff returns hits **only** in
`docs/architecture/admin-bootstrap.md`; `pnpm format:check` on touched files.
Commit: `docs(ICR-155): add the admin bootstrap runbook`

Five checkpoints — under the >8 split threshold.

---

## 12. Open Questions

1. **Two Jira ACs need correcting** (I will apply these, per §0):
   - _"the second run reports `reused: true`"_ → **`refreshed: true`**.
   - The 🔴 expired-invite AC's demand that the **script** own refresh semantics + `--ttl-days` →
     restate as: the script inherits `createInvite`'s upsert-refresh; a re-run after expiry reports
     `refreshed: true` and the invite is claimable; `--ttl-days` is dropped.
     Leaving them would instruct the next agent to rebuild a distinction the data layer cannot make
     (the ICR-148 "fix the artifact, not just the run" rule).

2. **ICR-185** (the same expired-invite root cause for the `/users` UI path) may now be **fully
   resolved** by ICR-128's upsert — worth a premise re-check at its own refinement rather than
   assuming it is still open. Flagged, not actioned here.

3. **Deferred production action.** Running this script against production `ministry-admin` is a manual
   post-deploy step, not something the merge performs. Per the standing rule it needs its own Jira
   ticket unless ICR-141's runbook ticket already covers it — I will check ICR-141/ICR-133 before
   filing, to avoid the duplicate the ICR-136 lesson warns about.
