# Admin QA account — how automated QA signs in to the admin panel

Automated QA (the yoke harness's `qa-acceptance` / `qa-runner` agents) signs in to the admin
panel on **admin previews and admin staging** as one standing test account. This doc covers what
the account is, where its credentials live, the sign-in command, and how to rotate or remove it.
Design record: `tasks/specs/ICR-222-qa-admin-sign-in.md`.

## The account

| Fact        | Value                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kind        | Firebase **email/password** user, `emailVerified: true`                                                                                                                   |
| Address     | a plus-address on the owner's Gmail. **Recorded only in the git-ignored `qa-env.json`** — never in a committed file, PR, ticket or report. Docs call it "the QA account". |
| Role        | `admin` system role, **in `ministry-admin-staging` only**                                                                                                                 |
| Production  | **No invite and no `AdminUser`** in production `ministry-admin`, so production refuses it with `403 no-invite`                                                            |
| Credentials | `qa-env.json` → `adminQa.users.admin` = `{ email, password, firebaseApiKey }` (mode 600)                                                                                  |

### Why one Firebase project matters

As of 2026-11-19, the admin app uses **one Firebase project for every environment** (Development,
Preview, staging and Production share one `NEXT_PUBLIC_FIREBASE_PROJECT_ID` /
`FIREBASE_PROJECT_ID` value on Vercel; only the service-account key is split). So the QA
account's Firebase credential is valid against production's Firebase project too.

What keeps it out of production is the **invite gate** (`docs/architecture/admin-auth.md`): a
Firebase credential grants nothing until it matches an invite or an `AdminUser` in the app's own
database, and production's database holds neither for this address. Two more layers sit in front:

1. the harness's host gates (`qa.env.<env>.baseUrlHostAllow`, `productionHostDeny`,
   `requirePreviewEnvironment`);
2. the sign-in command's own exact host allowlist (below), which refuses every production host
   before any network call.

The provisioning script reads the Firebase project from its environment, never from code, so if
staging later gets its own Firebase project, re-pointing the account is a re-run of `provision`
against the new env — no code change.

### Admin previews share the staging databases

Admin previews have **no databases of their own**: on Vercel, `MONGODB_URI` and
`WEBSITE_MONGODB_URI` are each one variable targeting Preview **and** staging
(`ministry-admin-staging`, `website-staging`). Consequences:

- the one invite / `AdminUser` in `ministry-admin-staging` makes the account an Admin on every
  admin preview **and** on admin staging;
- a `"QA "` role created on a preview exists on staging too;
- `qa.env.previewAdmin.dbNameAllow` includes `-staging` for this reason (ICR-222).

## What QA may do with it

Set in `.claude/config.json` → `qa.env.{previewAdmin,stagingAdmin}.liveIntegrationNote` (owner
decision, 2026-11-19):

- **Allowed:** sign in, sign out, read-side QA, and **create, edit and delete roles whose name
  starts with `"QA "`** (including their permissions — which writes the RBAC audit entry).
- **Forbidden:** any change to the `admin` / `leader` / `member` system roles or any other role;
  assigning roles to users; any user change (invite, disable, delete) — the QA account included;
  any invite (it sends a real email); any congregant-PII write; any real email.

## The sign-in command (`yoke/qa-auth@1`)

Declared at `qa.auth.commands.signIn`:

```bash
sh -c 'cd apps/admin && exec node --import tsx scripts/qa-auth.ts sign-in'
```

- **Inputs:** `YOKE_QA_AUTH_CONTRACT`, `YOKE_QA_AUTH_ENV`, `YOKE_QA_AUTH_BASE_URL` (and an
  optional `YOKE_QA_AUTH_ROLE`, only `admin`) as environment variables; the credentials as
  `{ "contract": "yoke/qa-auth@1", "credentials": { … } }` on **stdin** only.
- **Flow:** the same path a person takes on `/login` — Firebase `signInWithPassword` (REST), then
  the app's own `POST /api/auth/session` exchange. The invite gate and every server check run
  unchanged; no admin auth code was changed for QA.
- **Output:** exactly one JSON object on stdout, carrying the `__session` cookie. It is a live
  session — callers must never echo it. Exit `0` ok · `1` tried and failed (Firebase or the app
  refused) · `2` refused input (production or unknown host, missing credentials, wrong contract)
  · `3` declined (a role it does not offer).
- **Host gate** (`apps/admin/src/lib/qa-auth/host-gate.ts`): `stagingAdmin` →
  `staging.ministerio.idcredentor.org` only; `previewAdmin` →
  `idc-redentor-admin-<hash>-divine-lab.vercel.app` only; every production host is refused;
  https only, no port, no userinfo. A test keeps its deny list a superset of the config's.
- **Why `node --import tsx`, not `pnpm`:** pnpm rewrites every non-zero exit to `1`, erasing the
  contract's `2` and `3`. The cwd must be `apps/admin` because tsx resolves `@src/*` from it.

**Probes.** The app has no JSON "who am I" endpoint, so both probes are page status checks and
**must be fetched without following redirects**: session `GET /es-AR` (200 signed in, 307 to
`/login` anonymous); identity `GET /es-AR/roles` (200 for a provisioned Admin, 307 otherwise).

**Sign-out revokes every session of the account.** `DELETE /api/auth/session` calls
`revokeRefreshTokens(uid)`, and the `(app)` layout checks revocation on every request. Two QA runs
on this shared account must therefore **never overlap**: when one signs out, the other's session
dies mid-run.

## Runbooks

All of these run from `apps/admin`, with the **staging** env pulled from Vercel into a private
file that is shredded afterwards. Never run them with a production env: the script refuses every
admin database except `ministry-admin-staging`, by exact name.

```bash
umask 077
vercel env pull /tmp/qa-staging.env --environment staging --project idc-redentor-admin --scope divine-lab --yes
cd apps/admin
# … one of the commands below …
shred -u /tmp/qa-staging.env
```

The script prints one JSON line with no address, uid, password or key; exit `0` ok, `1`
operation failure, `2` usage or guard refusal.

### Provision (first time, or after the staging DB was reset)

```bash
node --env-file=/tmp/qa-staging.env --import tsx scripts/qa-account.ts provision \
  --email <the QA address> --qa-env <repo root>/qa-env.json
```

Creates (or updates) the Firebase user with a verified email and a freshly generated 43-character
password, writes `adminQa.users.admin` into `qa-env.json` (mode 600, other keys preserved), and
creates one pending Admin invite through `createInvite()` (no email is sent). The **first QA
sign-in** then claims the invite and creates the `AdminUser` through the normal invite gate.

It refuses `no-admin-role` when the database has no `admin` system role (seed the system roles
first: `seed:admin`, `docs/architecture/admin-bootstrap.md`), and `user-exists` when an
`AdminUser` already holds the address (an invite cannot elevate an existing user — use `rotate`).
The invite expires after 7 days; if the first sign-in comes later, re-run `provision`.

### Rotate the password

```bash
node --env-file=/tmp/qa-staging.env --import tsx scripts/qa-account.ts rotate \
  --qa-env <repo root>/qa-env.json
```

Generates a new password, sets it on the Firebase user, writes it into `qa-env.json`, and revokes
every existing session. Rotate when the password may have leaked, when someone with access to
`qa-env.json` leaves, or on a schedule you choose. `qa-env.json` is per-machine: copy the new
file to the other workstation (never through git).

### Decommission

1. In the staging admin panel (`/users`), as a human Admin, disable or delete the QA account's
   user. (QA itself is forbidden from touching users.)
2. Delete the Firebase user in the Firebase console (project from the staging env).
3. Remove `adminQa` from `qa-env.json`, and remove `qa.auth` and the two `qa.env.*.auth` blocks
   from `.claude/config.json`.

## Code map

| File                                                                         | Role                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/admin/scripts/qa-auth.ts`                                              | process shell of the sign-in verb                                    |
| `apps/admin/src/lib/qa-auth/sign-in.ts`                                      | stdin/contract parsing, Firebase sign-in, session exchange, envelope |
| `apps/admin/src/lib/qa-auth/host-gate.ts`                                    | exact per-env host allowlist, production deny                        |
| `apps/admin/scripts/qa-account.ts`                                           | process shell of `provision` / `rotate`                              |
| `apps/admin/src/lib/qa-auth/qa-account.ts`                                   | DB guard, password generation, qa-env merge, provision/rotate        |
| `.claude/config.json` → `qa.auth`, `qa.env.{previewAdmin,stagingAdmin}.auth` | the harness declaration                                              |
