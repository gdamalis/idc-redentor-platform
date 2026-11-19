# ICR-222 — implementation plan

Spec: `tasks/specs/ICR-222-qa-admin-sign-in.md` (approved 2026-11-19; Q1 = widen previewAdmin
`dbNameAllow`, Q3 = page-status probes, AC2 = Firebase project isolation — staging, previews and
local dev on `idcr-admin-staging`, production on `idcr-admin`; no production contact).

Bootstrap order (orchestrator decision): owner's `seed:admin` on `ministry-admin-staging` → owner
signs in with Google → `qa-account provision --firebase-project idcr-admin-staging` → live sign-in.

Owner addition: `qa-account` reads the Firebase project from its env (`FIREBASE_PROJECT_ID`), never
a hardcoded id, so it can be re-pointed at a separate staging project later.

## Checkpoint 1 — sign-in core (TDD)

- `apps/admin/src/lib/qa-auth/host-gate.ts` + test: exact staging host, preview regex, production
  deny, https only, no port/userinfo, unknown env refused.
- `apps/admin/src/lib/qa-auth/sign-in.ts` + test: contract/env parse, stdin parse (missing or
  placeholder credentials → exit 2), Firebase REST sign-in + session exchange with injected fetch,
  envelope, exit codes 0/1/2/3, no secret in diagnostics.
- `apps/admin/scripts/qa-auth.ts`: process shell.
- Verify: `pnpm --filter @idcr/admin test`, type-check, lint.
- Commit: `chore(ICR-222): add qa-auth sign-in command for the admin app`.

## Checkpoint 2 — provisioning script (TDD)

- `apps/admin/src/lib/qa-auth/qa-account.ts` + test: arg parse, exact DB guard
  (`ministry-admin-staging`), password generation, qa-env merge, provision/rotate orchestration
  with injected deps.
- `apps/admin/scripts/qa-account.ts`: process shell, firebase-admin initialised from env.
- Commit: `chore(ICR-222): add guarded qa-account provisioning script`.

## Checkpoint 3 — config

- `.claude/config.json`: `qa.auth`, `qa.env.{previewAdmin,stagingAdmin}.auth`, both
  `liveIntegrationNote`s, previewAdmin `dbNameAllow` widened + note. Validate with the canon schema.
- Commit: `chore(ICR-222): declare admin qa sign-in in qa config`.

## Checkpoint 4 — docs

- `docs/architecture/admin-qa-account.md`; link from `admin-auth.md` and `CLAUDE.md`.
- Commit: `docs(ICR-222): document the admin QA account and password rotation`.

## Checkpoint 5 — external writes (approved)

- Pull staging env to a 0600 scratch file; `qa-account provision`; shred.
- Live sign-in on the current admin preview and on staging; probes; sign out.

## Then

- Draft PR with AC2 marked pending.
