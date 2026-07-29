# Admin bootstrap — the one-time `seed:admin` script

`apps/admin` is invite-only (`docs/architecture/admin-auth.md`), and only a holder of
`users:manage` can create an invite (`docs/architecture/admin-rbac.md`). A fresh
`ministry-admin*` database has no roles and no users — so on day one there is no
account in the system that can invite the first one. `seed:admin` (ICR-155) exists to
break that chicken-and-egg: it writes the system roles and one pending Admin invite
directly to Mongo, so a human can walk through the front door once and never needs
this script again for that database.

It is a **human-run, one-off CLI**, not a service. It has no route, no schedule, no
CI wiring (verified: absent from `turbo.json`, every `.github/workflows/*` file, and
`apps/admin/package.json`'s `postinstall`/`prepare` hooks), and it actively refuses to
run when `CI` is set.

## What it does — and does not do

`seed:admin` writes **Mongo only**, and only two things:

1. **Seeds the three system roles** (`seedSystemRoles()` — upsert by the immutable
   `Role.key`, so re-running is harmless).
2. **Creates one pending `Admin` invite** for the address you pass, via the same
   `createInvite()` upsert the `/users` UI uses (`docs/architecture/admin-rbac.md` §
   "`createInvite` — upsert-refresh semantics").

It does **not**:

- Create a Firebase user. The invite is claimed at first sign-in — `firebaseUid` is
  only knowable then (`docs/architecture/admin-auth.md`).
- Write an `AdminUser` document. Same reason: that document is created by
  `resolveOrProvision` on the first successful sign-in, not by this script.
- Need any Firebase credential. The whole call chain (`getAdminDb` →
  `role`/`invite`/`user.service.ts` → `lib/rbac/*`) is plain Mongo TypeScript; nothing
  in it imports `lib/firebase/admin.ts`.

Every guard it enforces delegates to an already-shipped function — the script
orchestrates, it never reimplements a check. See `apps/admin/src/lib/rbac/seed-admin.ts`
(`seedAdmin()`, `parseSeedArgs()`, `exitCodeFor()`, `redactMongoHost()`) and the thin
process shell at `apps/admin/scripts/seed-admin.ts`.

## The database rides in the `MONGODB_URI` path — there is no DB-name variable

Same rule as the rest of the admin Mongo model (`docs/architecture/admin-database.md`):
`getAdminDb()` is the **only** database resolution the script performs, and it reads the
path segment of `MONGODB_URI`. There is no separate `ADMIN_DB_NAME`-style variable to
set, and the script never re-derives or second-guesses the name.

This has one sharp edge: a `MONGODB_URI` with **no path database** (e.g.
`mongodb://host:27017` with nothing after the port) makes the driver silently resolve
`test` as the database name — which fails `getAdminDb()`'s allowlist
(`/^ministry-admin(-staging|-test|-qa|-e2e)?$/`) and the script refuses with `db-guard`.
That refusal is the safe outcome; the trap is assuming an empty-looking URI is somehow
inert. **Always run with `--dry-run` first and read the printed database name** before
running for real — the banner prints the _resolved_ name, not the URI, so a wrong
target is visible before anything is written.

`WEBSITE_MONGODB_URI` must stay **unset** for this script. It only ever touches the
admin connection; setting the website variable does nothing for it but is a sign the
environment is misconfigured for this run.

## Invocation

Three supported forms. **Do not put a `--` separator before the flags in the `pnpm`
forms** — pnpm 10 forwards that literal `--` token straight into `argv`, and
`parseSeedArgs` correctly rejects it as `Unknown argument: --`. (This bit the first
draft of this script: its own `USAGE` banner documented the `--` form and was
therefore self-defeating — see the `fix(ICR-155)` commit that corrected it.)

```bash
# 1. Human at a terminal (the normal case). Prompts for confirmation.
MONGODB_URI='...' pnpm --filter @idcr/admin seed:admin --email <address> --dry-run

# 2. Machine-readable — stdout is EXACTLY the one JSON line, no pnpm banner.
MONGODB_URI='...' pnpm --filter @idcr/admin exec tsx scripts/seed-admin.ts \
  --email <address> --dry-run

# 3. From a local env file (node --env-file, Node >= 20.6; this repo pins 22.14.0).
#    MUST run with apps/admin as the working directory — see the note below.
cd apps/admin && node --env-file=.env.local --import tsx scripts/seed-admin.ts \
  --email <address> --dry-run
```

> **Two path traps, both verified the hard way.**
>
> **The working directory must be `apps/admin` for any direct `tsx` invocation.** tsx
> resolves tsconfig `paths` relative to the **cwd**, not to the script file, so running
> `tsx apps/admin/scripts/seed-admin.ts` from the repo root dies with
> `Cannot find module '@src/service/database.service'`. Form 2 above sidesteps this
> because `pnpm --filter … exec` already runs inside the package directory.
>
> **There is no `tsx` at the workspace root.** It is an `apps/admin` devDependency and
> this repo sets `shamefully-hoist=false`, so `./node_modules/.bin/tsx` does not exist
> at the root — only `apps/admin/node_modules/.bin/tsx` does. And that shim is a _shell
> script_, so `node --env-file=… ./node_modules/.bin/tsx …` cannot execute it either;
> form 3 uses `node --import tsx` instead, which is tsx's supported loader entry point.

**Always run with `--dry-run` first**, and read the `database` line the script prints to
stderr. Only once that name is the one you intend, drop `--dry-run` (and add `--yes` for
a non-interactive run, or answer the interactive confirmation prompt) to write for real.

**`--yes` is mandatory whenever stdin is not a terminal** — in a pipeline, a CI-style
runner, a `ssh host '…'` one-liner, or anything reading from `/dev/null`. Without a TTY
the script refuses with exit `2` rather than prompting, because a `readline` question
never settles on EOF and the process would otherwise drain the event loop and exit **0**
having written nothing: a silent no-op that a caller reads as success.

### What `--dry-run` does and does not touch

`--dry-run` writes **no documents** — no role, no invite, no user. Verified against a
real database: after a dry run on an empty `ministry-admin-test`, all three collections
hold `0` documents.

It is not, however, a pure no-op at the _collection_ level. Guard 2 has to read the
current users and roles to evaluate administrability, and `listUsers()` / `listRoles()`
call `ensureAuthIndexes()` / `ensureRbacIndexes()` on the way in. `createIndex`
implicitly creates its collection, so a dry run against a **fresh** database leaves
behind three empty collections and their indexes:

```
invites: docs=0  indexes=[_id_, email_1_status_1, expiresAt_1, email_1]
roles:   docs=0  indexes=[_id_, key_1, name_1]
users:   docs=0  indexes=[_id_, email_1, firebaseUid_1]
```

This is harmless and idempotent — they are exactly the indexes the admin app creates
the first time anyone loads `/users` — but it is worth knowing before you dry-run
against production and watch three collections appear. Reaching a genuinely
zero-side-effect dry run would mean bypassing the shared service layer and
re-implementing its reads, which is precisely the drift this script exists to avoid.

## 🔴 The bootstrap address must sign in with Google, not email/password

`provision.ts` refuses a first sign-in whose decoded token lacks
`email_verified: true` (`docs/architecture/admin-auth.md`). Firebase email/password
signup starts **unverified**, and this app never sends Firebase's verification email —
so an address that signs up with the email/password form can never clear that gate.
Google sign-in tokens always carry `email_verified: true`, so **the bootstrap invite
must be claimed with the Google button**.

The first Admin is `gabriel@idcredentor.org` — a Google Workspace address
(`idcredentor.org`'s MX record is `1 smtp.google.com`), so its Google sign-in token is
always verified. **This file is the only place in the entire repo where that address
may appear.** It is an argument a human types at the command line when running the
script for real — never a default parameter, fallback constant, test fixture, or any
other code value. (Verified in review: `git diff origin/main...HEAD | grep
'@idcredentor\.org'` returns hits only inside this file.)

## Re-running is safe

Both writes are idempotent, inherited from already-shipped upserts — the script adds
no idempotency logic of its own:

- **Roles** upsert by the immutable `Role.key` (`$setOnInsert`), so re-seeding never
  duplicates or overwrites a hand-edited role.
- **The invite** is `createInvite()`'s single atomic upsert on
  `{ email, status: "pending" }`. A second run for the same address reports
  `refreshed: true` instead of creating a duplicate.

**A lapsed 7-day invite window needs no special handling — just re-run the script.**
`createInvite`'s upsert filter has no `expiresAt` clause, so it matches a long-expired
_pending_ invite the same as a live one and refreshes `expiresAt` in place
(`docs/architecture/admin-rbac.md` § "`createInvite` — upsert-refresh semantics"). This
is exactly why `seed:admin` ships with **no `--ttl-days` flag** — there is nothing for
one to configure; the underlying upsert already recovers from an expired window by
being re-run.

## "Already administrable" and `--force`

Before writing anything, the script checks whether the panel is already
self-administrable: an **active** user holding **both** `users:manage` and
`roles:manage` (the same `retainsAdministrability()` predicate documented in
`docs/architecture/admin-rbac.md` § "The last-admin invariant"). If that's true, the
script refuses with `admin-exists` and performs **zero writes** — not even
`seedSystemRoles()`.

`--force` overrides that refusal. It exists for a genuine lockout only (e.g. every
admin account was disabled and nobody can invite a replacement) — **it never relaxes
the database guard**. A bad `MONGODB_URI` still refuses with `db-guard` whether or not
`--force` is passed; the two guards are independent and `--force` only ever touches
the second one.

## The target must not already have an account (`user-exists`)

If an `AdminUser` already exists for the address you pass, the script refuses with
`user-exists` and writes nothing — and **`--force` does not override this one either**.

The reason is that an invite simply cannot elevate an existing account.
`resolveOrProvision()` returns on `findUserByFirebaseUid()` **before** it ever reaches
`claimPendingInvite()` (`docs/architecture/admin-auth.md`), so once a person has signed
in even once, any pending invite for them sits unclaimed forever. Seeding one would
report success and change nothing.

That trap lands hardest on exactly the case `--force` exists for: the sole admin got
**disabled**, so the panel is no longer self-administrable and a re-bootstrap looks
like the fix — but that person already has an `AdminUser`, so the invite is inert.
Refusing loudly is the honest outcome. Recovery options, in order of preference:

1. If any account can still reach `/users`, grant the role there.
2. Seed a **different** Google-capable address that has never signed in, and use that
   account to repair the first one.
3. As a last resort, fix the existing user document directly (re-enable it, or attach
   the Admin role id) — a deliberate, auditable manual step, not something this
   bootstrap performs on your behalf.

Re-roling or re-enabling an existing account is a different privilege operation with
its own design questions; this script is a bootstrap and deliberately stops short of it.

## Exit codes and the stdout contract

```
Exit: 0 success · 1 operation failure (write-failed) · 2 usage/guard refusal
```

`0`/`1`/`2` map onto `SeedAdminResult`/`parseSeedArgs` failures via `exitCodeFor()` —
guard and usage refusals (`db-guard`, `admin-exists`, `user-exists`, `invalid-email`,
`usage`, a declined confirmation, or `CI` being set) are `2`; a genuine operational
failure (`write-failed` — the insert-race retry was exhausted, or the database was
unreachable) is `1`.

stdout carries **exactly one JSON line**, always the machine-readable result:

```json
{"ok":true,"dryRun":false,"roleIds":["<hex>","<hex>","<hex>"],"inviteId":"<hex>","refreshed":false}
{"ok":true,"dryRun":true}
{"ok":false,"reason":"admin-exists","message":"The panel is already self-administrable…"}
{"ok":false,"reason":"write-failed","message":"The seed failed: Topology is closed"}
```

That holds for **unexpected** failures too, not just the guards: if Mongo is
unreachable or authentication fails partway through, the error is converted into a
`write-failed` result and emitted on stdout rather than escaping as a bare stack trace.
"The database was down" is the most likely real-world failure, and a caller parsing the
result channel must not get an empty stream for it.

All human narration — the database/cluster/mode banner, the confirmation prompt, error
text and stack traces — goes to **stderr**, so a caller can safely pipe or parse stdout
alone. The script writes that one line with a synchronous `writeSync(1, …)` before
calling `process.exit()`, so it can never be truncated by an early exit on a piped
stdout.

> **Parsing stdout? Use form 2 above.** `pnpm run` prints its own banner (and, on
> failure, an `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` block) to stdout around your script's
> output, so form 1 is fine for a human at a terminal but not for a machine.
> `pnpm --filter @idcr/admin exec tsx scripts/seed-admin.ts …` emits exactly the one
> line — `exec` runs inside the package, so the tsconfig `paths` resolve and no banner
> is added.

There is deliberately **no invite-email flag**. An earlier draft carried an opt-in
`--send-email`; it was removed because it could never work. The templates render
through `next-intl/server`'s `getTranslations`, which resolves via the
`next-intl/config` alias that `next-intl/plugin` installs during a **Next.js build** —
so from a standalone `tsx` process it throws (`getTranslations is not supported in
Client Components`) on every attempt. Keeping it would have shipped a flag whose only
observable behaviour was reporting a failed send.

Nothing is lost: the bootstrap invitee is the operator running the command, the invite
URL carries no token (`${NEXT_PUBLIC_ADMIN_BASE_URL}/${locale}/login`), and the ticket
always classed the mail as a courtesy rather than a security artifact. Removing it also
makes the script's required environment genuinely just `MONGODB_URI` — which was the
stated reason for making it opt-in in the first place. Invite from `/users` if you want
the email.

## After the run

1. Sign in to the admin panel with **Google**, using the address you seeded.
2. Confirm `/users` and `/roles` render for that account.
3. From here on, provision every other person from the admin UI — the `/users` invite
   flow, not this script. `seed:admin` is a one-time bootstrap for the very first
   Admin on a database that has none, not a general role-management tool.

## Related docs

- `docs/architecture/admin-rbac.md` — the RBAC model this script seeds into: the
  permission registry, `retainsAdministrability()`, and `createInvite`'s
  upsert-refresh semantics this script inherits rather than reimplements. See its §
  Known limitations for the cross-link back to this doc.
- `docs/architecture/admin-database.md` — the `MONGODB_URI`-path database resolution
  and the `getAdminDb()` allowlist this script's only database guard is built on.
- `docs/architecture/admin-auth.md` — the invite-claim and Google-sign-in-verification
  flow the seeded invite is claimed through.
