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
| Firebase    | project **`idcr-admin-staging`** only (staging and previews); production's project `idcr-admin` has no such user                                                          |
| Production  | refused by project isolation, and production `ministry-admin` holds no invite and no `AdminUser` for it                                                                   |
| Credentials | `qa-env.json` → `adminQa.users.admin` = `{ email, password, firebaseApiKey }` (mode 600)                                                                                  |

### Two Firebase projects: why production refuses the account

Staging, admin previews and local development use their **own Firebase project,
`idcr-admin-staging`**; production uses **`idcr-admin`**. On Vercel (`idc-redentor-admin`), the
`NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_*` variables are set per target: Development, Preview and
staging point at `idcr-admin-staging`, Production at `idcr-admin`. A local `apps/admin/.env.local`
points at `idcr-admin-staging` too.

`NEXT_PUBLIC_FIREBASE_*` values are inlined at build time, so a change to them reaches a
deployment only when it is rebuilt: redeploy staging, and rely on fresh previews, after any
change.

The QA account exists **only in `idcr-admin-staging`**. Production's refusal therefore holds by
**project isolation**: production's login page signs in against `idcr-admin`, where the account
does not exist, and production's server verifies ID tokens for `idcr-admin`, so a token minted by
the staging project is rejected (`401 invalid-token`) even if one were replayed there. Behind that:

1. **the invite gate** (`docs/architecture/admin-auth.md`) — production's `ministry-admin`
   database holds no invite and no `AdminUser` for the address;
2. the harness's host gates (`qa.env.<env>.baseUrlHostAllow`, `productionHostDeny`,
   `requirePreviewEnvironment`);
3. the sign-in command's own exact host allowlist (below), which refuses every production host
   before any network call.

No project id is hardcoded in code: the sign-in command uses the web API key stored with the
credentials, and the provisioning script reads the project from its environment and refuses unless
it equals the `--firebase-project` the operator names. Pointing a staging env file at the
production project, by mistake, therefore refuses before any write.

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
  --email <the QA address> --firebase-project idcr-admin-staging --qa-env <repo root>/qa-env.json
```

`--firebase-project` is your statement of the project you mean to write to; the run refuses
(`project-mismatch`, exit 2) unless it equals the env's `FIREBASE_PROJECT_ID`.

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
  --firebase-project idcr-admin-staging --qa-env <repo root>/qa-env.json
```

Generates a new password, sets it on the Firebase user, writes it into `qa-env.json`, and revokes
every existing session. Rotate when the password may have leaked, when someone with access to
`qa-env.json` leaves, or on a schedule you choose. `qa-env.json` is per-machine: copy the new
file to the other workstation (never through git).

### Decommission

1. In the staging admin panel (`/users`), as a human Admin, disable or delete the QA account's
   user. (QA itself is forbidden from touching users.)
2. Delete the Firebase user in the Firebase console (project `idcr-admin-staging`).
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
