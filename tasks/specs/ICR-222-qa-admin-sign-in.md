# ICR-222 — QA agents sign in to the admin panel on preview and staging

Status: **approved 2026-11-19**, amended the same day (see § 13). Commit type `chore`, QA depth
`standard`, sensitive areas: **auth**, **env-secrets**, **QA config**.

> **Firebase topology (target state).** Staging, admin previews and local development use the
> Firebase project **`idcr-admin-staging`**; production uses **`idcr-admin`**. The QA account exists
> only in `idcr-admin-staging`, so production refuses it by **project isolation** (AC2), with the
> invite gate as a second layer. § 13 records how the design reached this state.

## 0. Facts established in explore

| Question                                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                              | How it was established                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Firebase project per environment             | **Target:** staging, admin previews and local dev → **`idcr-admin-staging`**; production → **`idcr-admin`**. On Vercel (`idc-redentor-admin`) the `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_*` variables are set per target (owner re-pointing Preview + staging; § 13).                                                                                                                                               | owner decision 2026-11-19; `vercel env ls` (names and targets only)                       |
| Consequence                                  | Production refuses the QA account by **project isolation**: the account is never created in `idcr-admin`, and production verifies ID tokens for `idcr-admin` only. Second layer: production's `ministry-admin` holds no invite and no `AdminUser` for it.                                                                                                                                                           | —                                                                                         |
| Admin DB on preview and staging              | `MONGODB_URI` is one variable for **Preview + staging** → path DB **`ministry-admin-staging`**; `WEBSITE_MONGODB_URI` → **`website-staging`**. Production has its own `MONGODB_URI`.                                                                                                                                                                                                                                | `vercel env pull` to a 0600 scratch file, DB name parsed from the URI path, file shredded |
| `qa.env.previewAdmin.dbNameAllow` vs reality | **MISMATCH (finding).** Config allows `^(website\|ministry-admin)-(test\|qa\|e2e)$`; admin previews actually run on `ministry-admin-staging` / `website-staging`, the same data as `stagingAdmin`. Any QA DB read on `previewAdmin` is refused today, and a "QA " role created on a preview lands in the staging DB. See Open Question 1.                                                                           | as above                                                                                  |
| Admin preview host shape                     | `idc-redentor-admin-<hash>-divine-lab.vercel.app` (GitHub deployment environment `Preview – idc-redentor-admin`); staging deployment environment is `staging – idc-redentor-admin`. No Vercel deployment protection on previews (anonymous GET → 307 to `/login`).                                                                                                                                                  | GitHub Deployments API + anonymous `curl`                                                 |
| Gated-route behaviour (anonymous)            | `GET /es-AR` and `GET /es-AR/roles` → **307** to `/es-AR/login?callbackUrl=…` on both preview and staging.                                                                                                                                                                                                                                                                                                          | anonymous `curl -o /dev/null -w`                                                          |
| Sign-in endpoint                             | `POST /api/auth/session { idToken }` — no Origin/CSRF check; 200 + `Set-Cookie: __session` (httpOnly, 5 days); 401 `invalid-token`/`stale-token` (auth_time > 5 min); 403 `no-invite`/`disabled`/`email-unverified`; 409 `provisioning-conflict`. `DELETE` signs out and **revokes every refresh token of the uid**.                                                                                                | `apps/admin/src/app/api/auth/session/route.ts`, `docs/architecture/admin-auth.md`         |
| Invite gate                                  | First sign-in with `email_verified: true` atomically claims a pending, unexpired `Invite` for the normalized email and creates the `AdminUser` with the invite's `roleIds`.                                                                                                                                                                                                                                         | `src/lib/auth/provision.ts`                                                               |
| Existing invite tooling                      | `seed:admin` seeds the system roles and writes a pending Admin invite through `createInvite()`; its DB guard (`getAdminDb()`) also accepts production `ministry-admin`. It is the right tool for the one-time **human** bootstrap of `ministry-admin-staging` (which turned out to be empty, § 13), not for the QA account: `qa-account` adds the exact staging-only guard, the Firebase user and the qa-env write. | `src/lib/rbac/seed-admin.ts`, `docs/architecture/admin-bootstrap.md`                      |
| System roles                                 | `admin`, `leader`, `member` (`isSystem: true`).                                                                                                                                                                                                                                                                                                                                                                     | `src/service/role.service.ts`                                                             |
| Identity probe candidate                     | `GET /es-AR/roles` (`requirePermission("roles:read")`): 200 for an active, provisioned `AdminUser`; 307 to `/no-access` or `/login` when unprovisioned, disabled or unauthenticated (note: `forbidden` renders `<PermissionDenied />` with HTTP 200, so status alone proves provisioning rather than permissions). No JSON "who am I" endpoint exists, and adding one would change admin auth code (out of scope).  | route source + anonymous probe                                                            |

## 1. Dependencies Check

- yoke harness with `qa.auth` (contract `yoke/qa-auth@1`) — present in the installed plugin's canon schema.
- `apps/admin` deps already present: `firebase-admin`, `mongodb`, `zod`, `tsx` (devDep), `vitest`.
- Vercel CLI access to `idc-redentor-admin` (team `divine-lab`) for pulling the **staging** env at
  provisioning time — verified working.
- Firebase Email/Password provider enabled on `idcr-admin-staging` — to be confirmed after the
  Vercel re-point, via a refused sign-in for a non-existent address, which must answer
  `EMAIL_NOT_FOUND`/`INVALID_LOGIN_CREDENTIALS`, not `OPERATION_NOT_ALLOWED`.

## 2. Requirements

R1. **Sign-in command** `apps/admin/scripts/qa-auth.ts` implementing `yoke/qa-auth@1` verb
`sign-in` only. Declared as
`pnpm --silent --filter @idcr/admin exec tsx scripts/qa-auth.ts sign-in`.

- Reads `YOKE_QA_AUTH_CONTRACT` (must equal `yoke/qa-auth@1`, else exit 2), `YOKE_QA_AUTH_ENV`,
  `YOKE_QA_AUTH_BASE_URL`, optional `YOKE_QA_AUTH_ROLE` (only `admin`; anything else → exit 3).
- Reads exactly one JSON object from **stdin**:
  `{ contract, credentials: { email, password, firebaseApiKey } }`. Missing/empty/`<…>` placeholder
  field → exit 2, `ok:false`, diagnostic names the missing **field name** (never a value).
- **Host gate before any network call** (pure function `assertQaHost(baseUrl, envName)`):
  - must be `https:`; no userinfo, no port, path ignored;
  - production deny list (exact): `ministerio.idcredentor.org`, `idc-redentor-admin.vercel.app`,
    plus every `qa.env.*.productionHostDeny` entry (copied as a constant; a test asserts the
    constant ⊇ config's lists);
  - exact allowlist per env: `stagingAdmin` → `staging.ministerio.idcredentor.org` only;
    `previewAdmin` → `^idc-redentor-admin-[a-z0-9]+-divine-lab\.vercel\.app$` only;
    any other env name → refuse. Refusal → exit 2, `ok:false`, no network call.
- Flow: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<apiKey>`
  (body `{email,password,returnSecureToken:true}`, `Referer: <baseUrl>/`) → `idToken`;
  then `POST <baseUrl>/api/auth/session {idToken}` with `redirect: "manual"`.
  200 + `__session` cookie → exit 0 with envelope
  `{ contract, ok:true, identity:{ handle:<opaque sha256(uid) prefix>, roles:["admin"] },
session:{ cookies:[{name:"__session", value, domain:<host>, path:"/"}], bearer:null,
expiresAt:<now+5d ISO> }, cleanup:{ handle:null, residual:[] }, diagnostics:[] }`.
  Firebase or session refusal → exit 1 with `ok:false` and a diagnostic carrying only the
  reason code (`INVALID_LOGIN_CREDENTIALS`, `no-invite`, HTTP status…).
- stdout = exactly one JSON object; logs to stderr; never prints password, idToken or cookie except
  the cookie inside the stdout envelope (the contract's carrier).
- Logic lives in `apps/admin/src/lib/qa-auth/` as pure, injectable functions (fetch injected) —
  functional-first, discriminated-union results, no throws for control flow.

R2. **Provisioning script** `apps/admin/scripts/qa-account.ts` (human/agent-run one-off, like
`seed:admin`), verbs:

- `provision` — guard: `getAdminDb().databaseName === "ministry-admin-staging"` **exactly**
  (refuses every other name, production included) and `CI` unset. Generates the password in-process
  (`crypto.randomBytes(32).toString("base64url")`, 43 chars), Firebase Admin SDK
  `createUser({ email, password, emailVerified: true })` (or, if the user exists, `updateUser` with
  the same fields), writes `{ email, password, firebaseApiKey }` into `qa-env.json` at
  `adminQa.users.admin` (atomic tmp+rename, chmod 600; preserves every other key), then creates one
  pending Admin invite via the shipped `createInvite()` inside `withAdminTransaction` (roleIds = the
  `admin` system role's id, locale `es-AR`, no inviter). Refuses `user-exists` if an `AdminUser`
  already holds the address (invite would be inert). Sends **no** email.
- `rotate` — same DB guard; new random password → Firebase `updateUser({password})` → qa-env.json;
  calls `revokeRefreshTokens(uid)` so old sessions die.
- Email comes from `--email` argv (it is not a secret, but it is never committed); password never
  touches argv/env/stdout. Output: one JSON line with `{ ok, firebase: created|updated,
invite: created|refreshed, qaEnv: written }` — no email, no uid, no password.
- Env for both verbs: `vercel env pull --environment staging` into a 0600 scratch file, run with
  `node --env-file=<file> --import tsx`, file shredded in the same command.

R3. **Config** (`.claude/config.json`):

- `qa.auth`: `contract: "yoke/qa-auth@1"`, `commands.signIn` (R1), `roles: ["admin"]`,
  `session.cookieName: "__session"`, `probes.session` = `{ path:"/es-AR",
authenticatedWhen:{status:200}, anonymousWhen:{status:307} }`, `probes.identity` =
  `{ path:"/es-AR/roles", readyWhen:{status:200}, notProvisionedWhen:{status:307} }`, with a
  `_note` that probes must be fetched **without following redirects**, `cleanup`
  `{ required:false, when:"after-run", onFailure:"warn" }`-equivalent per schema (standing account,
  nothing to destroy) — exact enum values checked against the schema at implementation.
- `qa.env.previewAdmin.auth` and `qa.env.stagingAdmin.auth`:
  `{ identityStrategy:"standing", credentialsFrom:"adminQa.users", provisioningAllowed:false,
signupsOpen:false }`.
- `liveIntegrationNote` on both envs rewritten: sign-in POST and sign-out DELETE sanctioned;
  agents MAY create, edit and delete roles whose name starts with `"QA "`; FORBIDDEN: any change to
  the `admin`/`leader`/`member` system roles or any other role, any user (invite, disable, delete,
  role assignment), any invite, any congregant PII write, any real email. States that previews
  share the staging admin DB.
- Config must validate against the installed canon schema (ajv) — add a test or run the plugin's
  validator.

R4. **Docs**: new `docs/architecture/admin-qa-account.md` (what the account is, where its
credentials live — the qa-env.json key path, never values —, why production refuses the
account by project isolation, the sign-in command contract, rotation runbook, decommission runbook, the
concurrent-run caveat). Link from `admin-auth.md` § QA verifiability boundary (update that table:
preview no longer blocks email/password sign-in) and from `CLAUDE.md` docs list.

R5. `qa-env.json` holds the only copy of the password. The email lives only there (and in
Firebase/staging Mongo). Neither appears in committed files, PR, ticket or reports.

## 3. Data Model Changes

None to schemas. Runtime data only: one Firebase Auth user (project `idcr-admin-staging`), one `Invite`
(→ `accepted`) and one `AdminUser` in `ministry-admin-staging`. Local gitignored file gains:

```ts
interface QaEnvAdminQa {
  adminQa: {
    users: {
      admin: { email: string; password: string; firebaseApiKey: string };
    };
  };
}
```

## 4. API Changes

None to the app. The command's I/O contract is `yoke/qa-auth@1` (R1). Zod schemas:

```ts
const signInStdinSchema = z.object({
  contract: z.literal("yoke/qa-auth@1"),
  credentials: z.object({
    email: z.string().email(),
    password: z.string().min(24),
    firebaseApiKey: z.string().min(1),
  }),
});
```

## 5. Files

| New                                                       | Purpose                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/admin/src/lib/qa-auth/host-gate.ts` (+ `.test.ts`)  | `assertQaHost()` exact allowlist + production deny                             |
| `apps/admin/src/lib/qa-auth/sign-in.ts` (+ `.test.ts`)    | stdin parse, Firebase REST sign-in, session exchange, envelope; fetch injected |
| `apps/admin/scripts/qa-auth.ts`                           | thin process shell: stdin → `signIn()` → stdout JSON + exit code               |
| `apps/admin/src/lib/qa-auth/qa-account.ts` (+ `.test.ts`) | provision/rotate orchestration, exact DB guard, qa-env.json atomic merge       |
| `apps/admin/scripts/qa-account.ts`                        | thin process shell for R2                                                      |
| `docs/architecture/admin-qa-account.md`                   | R4                                                                             |

| Modified                          | Change                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `.claude/config.json`             | R3                                                                             |
| `docs/architecture/admin-auth.md` | QA boundary table + link                                                       |
| `CLAUDE.md`                       | docs list entry                                                                |
| `.changeset/ICR-222.md`           | `@idcr/admin` patch (scripts only) — if the repo's changeset rules require one |

## 6. Component Hierarchy

No UI.

## 7. Edge Cases

1. Base URL is production (custom domain, `idc-redentor-admin.vercel.app`) → refused, exit 2, no network.
2. Base URL is a production deployment's unique `idc-redentor-admin-<hash>-divine-lab.vercel.app` —
   indistinguishable by host from a preview. The harness's `requirePreviewEnvironment` gate rejects
   it first; if it ever reached the command, production answers `403 no-invite` (second layer, AC2).
3. Missing stdin / bad JSON / missing field / placeholder value → exit 2, field name only.
4. Unknown `YOKE_QA_AUTH_ROLE` → exit 3 (ladder downgrade).
5. Firebase `INVALID_LOGIN_CREDENTIALS` (rotated password not in qa-env.json) → exit 1, reason only.
6. `403 no-invite` (invite expired before first sign-in: 7 days) → exit 1; runbook: re-run `provision`.
7. `401 stale-token` impossible by construction (fresh sign-in), still mapped to exit 1.
8. **Concurrent runs:** sign-out (`DELETE`) revokes every refresh token of the uid, and
   `getCurrentUser` checks revocation — a second QA run's live session dies. Runs on the shared
   account must not overlap; documented, and sign-out is the last step of a run.
9. `provision` re-run after the account is provisioned → `user-exists` refusal for the invite;
   Firebase part updates password (acts like `rotate`).
10. API-key HTTP-referrer restriction → the `Referer` header; if still refused, exit 1 with the
    Google error code, and the fix is documented.

## 8. i18n

None.

## 9. Testing Strategy

- Unit (vitest, `apps/admin`): host gate (every prod host refused, preview/staging accepted, other
  env names refused, http/port/userinfo refused, deny-constant ⊇ config lists); stdin parsing
  (missing credentials, each field missing, placeholder, bad contract → exit 2); sign-in happy path
  and each refusal with a fake fetch (no network); envelope shape; nothing secret in diagnostics.
  qa-account: exact DB guard refuses `ministry-admin`, `ministry-admin-test`; qa-env merge preserves
  other keys and writes mode 600; password length ≥ 24.
- Config validates against the canon schema.
- Live (after approval): run the command against the current admin preview and staging, prove with
  both probes (anonymous control first), sign out, confirm the probe returns 307 again.

## 10. Implementation Checkpoints

1. Host gate + stdin/contract parsing + sign-in core with tests —
   `test(ICR-222): …` / `chore(ICR-222): add qa-auth sign-in command for the admin app`.
2. Provision/rotate script with tests — `chore(ICR-222): add guarded qa-account provisioning script`.
3. Config (`qa.auth`, env `auth`, policy notes) + schema validation —
   `chore(ICR-222): declare admin qa sign-in in qa config`.
4. Docs — `docs(ICR-222): document the admin QA account and password rotation`.
5. **External writes (only after spec approval):** Firebase user + staging invite via `provision`;
   live sign-in on preview and staging; first sign-in provisions the `AdminUser`.
6. AC2 by project isolation (the account exists only in `idcr-admin-staging`; no production contact), then draft PR.

## 11. External writes and rollback

| #   | Write                                                               | Where                                                            | Rollback                                                     |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| W1  | Create Firebase Auth user (email/password, `emailVerified:true`)    | Firebase project `idcr-admin-staging` (isolated from production) | `auth.deleteUser(uid)`                                       |
| W2  | Insert one pending `Invite` (Admin role, es-AR)                     | `ministry-admin-staging.invites`                                 | delete that invite `_id`                                     |
| W3  | (by the app, at first sign-in) invite → `accepted`, new `AdminUser` | `ministry-admin-staging`                                         | delete `AdminUser` + invite; or disable the user in `/users` |
| W4  | Add `adminQa.users.admin`                                           | local gitignored `qa-env.json` (0600)                            | remove the key                                               |

No production DB write. No email sent. No other user, role or invite touched.

## 12. Open Questions (need owner decision)

1. **previewAdmin `dbNameAllow` mismatch.** (a) _Recommended:_ widen `previewAdmin.dbNameAllow` to
   `^(website|ministry-admin)-(staging|test|qa|e2e)$` in this PR, with a note that admin previews
   share staging data — it matches reality and lets QA read the audit entry the Done-when needs.
   (b) Leave it, record the finding, file a follow-up.
2. **AC2 proof — resolved.** Production refuses the QA account by Firebase project isolation
   (§ 0); no production database or environment is read.
3. Identity probe via page status (`/es-AR/roles` 200 vs 307) instead of adding a JSON
   `GET /api/auth/session` — _recommended_ (the ticket puts admin auth code out of scope).

## 13. Amendments after approval (2026-11-19)

**Owner decisions.** Q1: widen `previewAdmin.dbNameAllow` to include `-staging` (done). Q3: page
status probes (done). Q2 (AC2 proof): superseded by project isolation (below); the production-count proof is dropped. No
production env was pulled and no production database was read.

**Separate staging Firebase project.** The owner created `idcr-admin-staging` for staging and
previews and local dev; production keeps `idcr-admin`. The owner is re-pointing Vercel's `NEXT_PUBLIC_FIREBASE_*`
/ `FIREBASE_*` variables per target. Consequences:

- The QA account is created only in `idcr-admin-staging`. Production refuses it by **project
  isolation**: the account does not exist in `idcr-admin`, and production verifies ID tokens for
  `idcr-admin` only. The invite gate stands behind that. AC2's proof changes accordingly.
- `qa-account` gains a required `--firebase-project <id>`. The run refuses (`project-mismatch`)
  unless it equals the loaded env's `FIREBASE_PROJECT_ID`. No project id is hardcoded in code.
- W1 (the Firebase user) now targets `idcr-admin-staging`, after the re-point. Nothing was ever
  created in `idcr-admin`.

**Correction — the provider check hit production's project.** Before the re-point, the Vercel
Preview/staging env still named `idcr-admin`, so the explore-time Email/Password check (a sign-in
for a non-existent address, answered `INVALID_LOGIN_CREDENTIALS`) ran against production's
Firebase Auth, not staging's. Harmless — no account was created or changed — but it does not
prove anything about `idcr-admin-staging`; that check is repeated after the re-point.

**Staging admin DB was never bootstrapped.** The first `provision` run (before the project change)
refused `no-admin-role` before any Firebase or qa-env write: `ministry-admin-staging` held 0
roles, 0 users and 0 invites. The only side effect was the app's own `ensureRbacIndexes()`, which
left an empty `roles` collection with its indexes.

**Bootstrap order (orchestrator decision).** After the re-point and a staging redeploy:

1. `seed:admin` against `ministry-admin-staging` with the **owner's** address (never committed or
   logged) — seeds the three system roles and the owner's Admin invite;
2. the owner signs in with Google on staging and becomes the first human Admin;
3. `qa-account provision --firebase-project idcr-admin-staging` for the QA account, then the live
   sign-in on staging and on a preview built after the re-point, and sign-out.
