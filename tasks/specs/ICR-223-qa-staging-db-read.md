# ICR-223 — QA agents can read the staging databases (read-only)

- **Branch:** `chore/ICR-223-qa-staging-db-read` · **Commit type:** `chore` · **QA depth:** standard
- **Sensitive areas:** `env-secrets`, QA config, congregant PII (design gate: brainstorm RESOLVED, Option B + PM changes)

## 1. Requirements

1. **R1 — Command.** `apps/admin/scripts/qa-db-read.ts` (logic in `apps/admin/src/lib/qa-db/`), run like qa-auth:
   `sh -c 'cd apps/admin && exec node --import tsx scripts/qa-db-read.ts read --db <name> --collection <c> [--filter <json>] [--project <json>] [--sort <json>] [--limit n]'`
   Never via `pnpm run/exec` (exit codes 2/3 must survive). Exit 0 ok, 2 refused, 1 unexpected. Contract id `yoke/qa-db-read@1`.
   Verbs: `read` (find) and `count`, `aggregate` (`--pipeline <json>`). Any other verb → refused.
2. **R2 — Db guard (before any connect).** Env `YOKE_QA_DB_ENV` ∈ {preview, previewAdmin, staging, stagingAdmin} selects the allowlist regex (preview: `^(website|ministry-admin)-(test|qa|e2e)$`; others `-(staging|test|qa|e2e)`). Compare `--db` against an **exact anchored regex plus own-property lookup** (reject `constructor`, `__proto__`, `prototype`, `toString`, anything non-string, whitespace/case variants). Bare `website`, `ministry-admin`, `test`, `admin`, `local`, `config` hard-refused first.
3. **R3 — URI handling.** URI only from `MONGODB_URI` / `WEBSITE_MONGODB_URI` env (stdin not needed); never argv, never printed. Parse the db path: if present it must pass the allowlist **and** equal `--db`; if absent (admin-staging has empty path) an explicit allowlisted `--db` is required; never fall back to `test`. Refuse if no `--db`.
4. **R4 — Read-only by construction.** The module exposes only `find`/`countDocuments`/`aggregate` on a wrapper; no write method reachable. Pipeline: strict stage allowlist (`$match $project $sort $limit $skip $count $group $unwind $addFields $set`-no; final list in code: `$match,$project,$sort,$limit,$skip,$count,$group,$unwind` plus a restricted `$lookup` (no `$facet`/`$set`/`$addFields`).
5. **R5 — Output scrub.** Envelope `{contract, ok, db, collection, observedVia:"DB", count, docs, masked:[...]}` on stdout; diagnostics on stderr. Scrubber: recursively masks values for denylisted keys (`email`, `*Email`, `password*`, `token*`, `secret*`, `uid`, `ip*`, `phone*`, `address*`, `name` on user-ish collections, `actor*` identity fields except role/id hashes) → `"[masked]"`; a regex pass masks any email, `mongodb(+srv)://` URI, JWT-like token in any string (including keys and error messages). Errors are fixed strings; driver messages never emitted.
6. **R6 — Config.** In `.claude/config.json`: remove `mongoMcp: "mongodb-localhost"` from all four `qa.env.*` (keep `dbNameAllow` + notes). Shared schema is NOT changed: `qa.env.<name>` and `commands` are `additionalProperties:false`, root is open, so add a root block `qaDb` = `{ contract, command, envVar, readOnly:true, collections allow, note }`. Proof: ajv + `validate-config.mjs` → `0 errors`. Follow-up (Linear): first-class `qa.db` field in canon schema.
7. **R7 — Docs.** `docs/architecture/admin-qa-account.md` + new section/`docs/architecture/qa-db-read.md`: which command, allowed dbs, env pull must name target explicitly (`vercel env pull … --environment preview|staging`, per ICR-192 ops: web Preview+staging have `/website-staging` path, admin URI path empty → `--db` mandatory), shred file, PII handling in evidence, **do not use locally registered write-capable Mongo MCP servers** (`mongodb-idcr-*` with `MDB_MCP_READ_ONLY=false`).
8. **R8 — Live proof.** On previewAdmin: QA role change on a `"QA "` user, then `read --db ministry-admin-staging --collection rbacAudit --filter …` returns the entry, QA records `observedVia:"DB"`. Needs the QA slot from coordinator.

## 2. Tests (vitest, `apps/admin/src/lib/qa-db/*.test.ts`) — each with red proof (revert guard → fails)

| #   | Case                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | refuses `ministry-admin`, `website`, `test`, `admin`, `local`, `config`, `ministry-admin-prod`, `xministry-admin-staging`, case/space variants before `connect` is called (spy)                           |
| 2   | preview env refuses `-staging` names; allows `-test/-qa/-e2e`                                                                                                                                             |
| 3   | URI w/o path + no `--db` → refused; w/o path + valid `--db` → ok; URI path ≠ `--db` → refused; URI path non-allowlisted → refused; never `test`                                                           |
| 4   | prototype keys `constructor`, `__proto__`, `hasOwnProperty` as db/collection/env → refused                                                                                                                |
| 5   | write verbs `insertOne/updateOne/deleteMany/drop/bulkWrite` unknown → refused; wrapper has no such methods                                                                                                |
| 6   | pipeline stages `$out,$merge,$unionWith,$graphLookup,$documents,$currentOp,$collStats,$function` refused, incl. nested inside `$facet`/`$lookup` pipeline; `$where`, nested `$function` in filter refused |
| 7   | `$lookup` to non-allowlisted collection refused                                                                                                                                                           |
| 8   | limit clamp, maxTimeMS set                                                                                                                                                                                |
| 9   | scrubber: emails, connection-string URIs (plain and srv), JWT, denylisted keys masked recursively and inside arrays; error from fake driver containing a URI is not echoed                                |
| 10  | contract: stdout is exactly one JSON object; stderr/stdout never contain env URI value; exit codes 0/2/1                                                                                                  |
| 11  | `validate-config.mjs` + ajv: `0 errors`, `qaDb` present, no `mongoMcp` remaining                                                                                                                          |

## 3. Checkpoints

1. Guard + parser + tests (red→green). 2. Wrapper + stage scan + tests. 3. Scrubber + CLI + contract tests. 4. Config + validation. 5. Docs. 6. type-check/lint/test/build, security review. 7. PR (draft→ready), then QA slot for live proof.

## 4. Out of scope

Writes, production reads, changing canon schema, Atlas MCP, owner-batch items (set `MDB_MCP_READ_ONLY=true` on local MCPs; optional read-only Atlas user).
