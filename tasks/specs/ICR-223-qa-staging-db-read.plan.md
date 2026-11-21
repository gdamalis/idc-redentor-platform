# ICR-223 — implementation plan

Spec: `tasks/specs/ICR-223-qa-staging-db-read.md` (brainstorm + spec gates resolved 2026-11-21;
Option B — committed read-only query command mirroring `qa-auth`, no shared canon schema change).

## Checkpoint 1 — policy & URI guards (TDD)

- `apps/admin/src/lib/qa-db/policy.ts`: `QA_DB_CONTRACT` (`yoke/qa-db-read@1`), per-env `DB_NAME_ALLOW`
  matching `.claude/config.json`, default-deny `COLLECTION_ALLOW` (admin + website + Wave 1–4 content
  collections), `resolveEnv`, `checkDbName`, `checkCollection`, `uriVariableFor` (prefix-routed, no
  fallback), `uriDbPath` / `checkUriPath` (empty path allowed only with explicit allowlisted `--db`;
  present path must equal `--db`; never `test`).
- Unit tests with red proofs: bare prod names, system names, case/space variants, prototype keys,
  `preview` rejecting `-staging`, unset/unknown env, URI path mismatches, no cross-variable fallback.

## Checkpoint 2 — query validation & read-only driver adapter (TDD)

- `apps/admin/src/lib/qa-db/query.ts`: recursive `$`-operator scan with per-position allowlist,
  strict stage allowlist (`$match`, `$project`, `$sort`, `$limit`, `$skip`, `$count`, `$group`,
  `$unwind`, plus plain-collection allowlisted `$lookup`), strict `0|1|true|false` projections,
  PII field-reference guard in `$group`, `MAX_TIME_MS = 5000`, `RESULT_CAP = 50`.
- `apps/admin/src/lib/qa-db/driver.ts`: `connectReadOnly` returning ONLY `find`/`count`/`aggregate`/`close`
  with `retryWrites: false`, `readPreference: "secondaryPreferred"`, `allowDiskUse: false`.
- Unit tests with red proofs for forbidden verbs, stages, nested JS operators, PII projection/group
  bypasses, and limit/timeout enforcement.

## Checkpoint 3 — output scrubber, runner & CLI shell (TDD)

- `apps/admin/src/lib/qa-db/scrub.ts`: recursive key denylist (English + Spanish + snake_case),
  `name` masking on person/contact/lookup outputs (preserving `"QA "` test identities and system
  role names on `roles`/`rbacAudit`), string + key regex scrubbing for emails/URIs/JWTs/auth headers.
- `apps/admin/src/lib/qa-db/run.ts` + `apps/admin/scripts/qa-db-read.ts`: ordered guard chain,
  verb-specific flags, exit codes `0` ok / `2` refused / `1` unexpected (fixed message, no driver text),
  single-line JSON envelope (`observedVia: "DB"`) on stdout, diagnostics on stderr.
- Subprocess contract test asserting exit 2, single-line JSON, and zero env URI leakage.

## Checkpoint 4 — QA config & documentation

- `.claude/config.json`: remove nonexistent `mongoMcp: "mongodb-localhost"` from all 4 `qa.env.*`
  blocks; add per-env `dbReadNote` pointing to the command + doc; add top-level `qaDb` block.
- Prove `0 errors, 0 warnings` via `validate-config.mjs --strict` and sync tests against `DB_NAME_ALLOW`
  and `COLLECTION_ALLOW`.
- `docs/architecture/qa-db-read.md` + link from `docs/architecture/admin-qa-account.md` (avoiding
  `CLAUDE.md`/`AGENTS.md` merge conflicts).

## Checkpoint 5 — verification & live previewAdmin proof

- Local `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`, mutation red proofs, draft PR CI green.
- Wait for `@coordinator` QA slot → live `previewAdmin` QA creating/updating a `"QA "` role and reading
  the resulting `rbacAudit` entry via `scripts/qa-db-read.ts` (`observedVia: "DB"`), shredding the
  pulled 0600 staging env immediately after.
- Mark PR ready + list canon schema follow-up (`qa.db` first-class env field).
