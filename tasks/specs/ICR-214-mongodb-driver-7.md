# ICR-214 — Upgrade the MongoDB Node driver to 7.9.x in both apps

Status: draft for spec review · Branch `chore/ICR-214-mongodb-driver-7` · Worktree
`.claude/worktrees/ICR-214` (from `origin/main` @ 8647798, includes ICR-157's pool cap)

Sensitive area: **likes-mongo / db-write-path** (the shared database client of both apps).
env-secrets not touched: no connection string or env change; no values printed.

## 1. Dependencies check

| Fact                                                                                                                                                                        | Evidence (read 2026-11-19)                                                                                                                                    | OK                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Latest 7.x on npm is **7.9.0** (`latest` dist-tag)                                                                                                                          | `npm view mongodb dist-tags`                                                                                                                                  | yes                       |
| Driver 7.6–7.9 vs server: 9.0 ✓, 8.0 ✓, 7.0 ✓, 6.0 ✓, 5.0 ✓, 4.4 ✓, 4.2 blank (untested). ✓ = "All features are supported."                                                 | https://www.mongodb.com/docs/drivers/compatibility/ (markdown copy `compatibility.md`), Node.js table row `\| 7.6 to 7.9 \| ✓ \| ✓ \| ✓ \| ✓ \| ✓ \| ✓ \| \|` | yes                       |
| **Staging** cluster server version **8.0.37** (maxWireVersion 25, replica set). Production is a separate cluster, not measured (owner accepted the same free-tier version). | `buildInfo` read-only command via the gitignored non-prod `apps/web/.env.pool-check` (database `website-staging`). See gap below.                             | yes (8.0 ✓); prod assumed |
| Driver 7.x requires Node ≥ 20.19.0; Node 24/22/20 ✓                                                                                                                         | compatibility page, Node.js runtime table. Repo `.nvmrc` 22.14.0, CI `node-version: 22.x`                                                                     | yes                       |
| Driver 7.x pairs with `bson ^7.0.0`; 7.9.0's own `package.json` pins `bson ^7.3.2`, engines `node >=20.19.0`                                                                | compatibility page component table; `mongodb-7.9.0.tgz`                                                                                                       | yes                       |
| No other workspace package depends on `mongodb` (lockfile holds only `mongodb@6.21.0`, importers `apps/web` + `apps/admin`)                                                 | `pnpm-lock.yaml`                                                                                                                                              | yes                       |

**AC2 gap — "read from Atlas":** the Atlas MCP is refused for both Atlas orgs ("MCP access is
disabled for every MongoDB Atlas organization this user belongs to"; an Org Owner must enable AI
client access). There is no `atlas` CLI on steelhaven. The version above came from the server
itself (`buildInfo`), and only for the staging cluster. **Owner decision (2026-11-19, final):** accept
the server's own `buildInfo` answer (8.0.37, staging cluster) for AC2. The production cluster is not
measured separately and is assumed to run the same free-tier version (owner accepted). No further
`buildInfo` reads.

## 2. Requirements

1. `apps/web/package.json` and `apps/admin/package.json`: `"mongodb": "^6.20.0"` → `"^7.9.0"`.
   `pnpm install` updates `pnpm-lock.yaml`; afterwards `pnpm why -r mongodb` and the lockfile show
   only `mongodb@7.9.x`, `bson@7.x`, `mongodb-connection-string-url@7.x` (no 6.x copy).
2. **No change** to `MONGODB_OPTIONS` in either app (`serverApi` v1 strict + deprecationErrors,
   `maxPoolSize: 10`, `maxIdleTimeMS: 60_000` on web), to `POOL_OPTIONS` in
   `apps/web/scripts/check-mongo-pool.mjs`, or to the DB-name allowlists/assertions.
3. New **driver-contract tests** (real driver, no network — `new MongoClient(uri).db()` only parses
   the URI) that pin the behaviours our fail-closed code relies on, so a future driver bump that
   changes them fails CI instead of silently writing to `test`:
   - web: a URI with no path resolves `databaseName === "test"`, and the real `getWebsiteDb()`
     refuses it; a `/website-staging` path resolves and is accepted.
   - admin: same pair for `assertAdminDbName` / `assertWebsiteDbName` with the real driver
     (`getAdminDb()` / `getContentDb()` through stubbed env).
   - admin: `ObjectId` round-trip and JSON shape our code depends on: `new ObjectId(hex).toHexString()
=== hex`, `JSON.stringify({ id })` → the 24-hex string, `ObjectId.isValid` on a bad string is false.
     Written and run green on 6.21.0 first (characterisation), then must stay green on 7.9.0.
4. Refresh driver source references in comments and docs from 6.21.0 to 7.9.0 lines
   (`connection_string.js:339-346` authSource inheritance, `:366-368` `test` fallback;
   `mongodb.d.ts:2385-2390` parallel ops / un-sessioned ops, `:2396` manual abort does not throw).
   Comment-only in code; no logic change.
5. Two changesets (`patch`): `@idcr/web`, `@idcr/admin` — "Upgrade MongoDB Node driver to 7.9".

## 3. Data model changes — none. 4. API changes — none.

## 5. Breaking-change audit (7.0 upgrade notes + v7.0.0 release notes; goes in the PR body, AC7)

Sources: https://www.mongodb.com/docs/drivers/node/current/reference/upgrade/ ·
https://github.com/mongodb/node-mongodb-native/releases/tag/v7.0.0 · bson
https://github.com/mongodb/js-bson/releases/tag/v7.0.0

| #           | Breaking change                                                                                                                                                                                                                                                                                                                     | Our code                                                                      | Outcome                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| 1           | Node ≥ 20.19.0; TS target ES2023                                                                                                                                                                                                                                                                                                    | Node 22.14 local, 22.x CI/Vercel                                              | OK                               |
| 2           | `bson` / `mongodb-connection-string-url` → 7.0                                                                                                                                                                                                                                                                                      | no direct `bson` import; types via `mongodb`                                  | OK (lockfile)                    |
| 3–5         | Optional peers `mongodb-client-encryption`, `kerberos`, `@mongodb-js/zstd` ≥ 7                                                                                                                                                                                                                                                      | none installed                                                                | N/A                              |
| 6           | Peer ranges: `@aws-sdk/credential-providers`, `gcp-metadata`, `socks`                                                                                                                                                                                                                                                               | none installed                                                                | N/A                              |
| 7–9         | MONGODB-AWS: SDK required, provider precedence, no creds in URI                                                                                                                                                                                                                                                                     | SCRAM via Atlas users                                                         | N/A                              |
| 10          | `watch()` passes `$changeStream` options through                                                                                                                                                                                                                                                                                    | no `watch()`                                                                  | N/A                              |
| 11          | No default `batchSize` 1000 on `getMore`                                                                                                                                                                                                                                                                                            | no explicit batchSize; result sets are small (likes, roles, users)            | OK (no behaviour dependency)     |
| 12          | `stream({ transform })` removed                                                                                                                                                                                                                                                                                                     | no `.stream()`                                                                | N/A                              |
| 13          | `MONGODB-CR` removed                                                                                                                                                                                                                                                                                                                | not used                                                                      | N/A                              |
| 14–16       | CSFLE/QE error classes and path typing                                                                                                                                                                                                                                                                                              | no client-side encryption                                                     | N/A                              |
| 17          | aggregate `writeConcern` + `explain` throws server-side                                                                                                                                                                                                                                                                             | not used                                                                      | N/A                              |
| 18          | Label `PoolRequstedRetry` → `PoolRequestedRetry`                                                                                                                                                                                                                                                                                    | not referenced                                                                | N/A                              |
| 19          | `drop()` of a missing namespace returns `false`                                                                                                                                                                                                                                                                                     | no `drop()`                                                                   | N/A                              |
| 20          | `CommandOptions.noResponse` removed                                                                                                                                                                                                                                                                                                 | not used                                                                      | N/A                              |
| 21          | Public `ClientMetadata` option properties removed                                                                                                                                                                                                                                                                                   | not used                                                                      | N/A                              |
| 22          | `beta` namespace removed                                                                                                                                                                                                                                                                                                            | not used                                                                      | N/A                              |
| 23          | Removed types/options: `useNewUrlParser`, `useUnifiedTopology`, `autoIndexId`, generic `FindOptions<T>`, `FindOneOptions.batchSize/limit/noCursorTimeout`, `CommandOperationOptions.retryWrites`, `ClientSession.transaction`, `Transaction`, `CancellationToken`, GridFS `contentType/aliases`, `CloseOptions`, `ResumeOptions`, … | grep: none used                                                               | N/A — `pnpm type-check` confirms |
| bson-5      | `ObjectId` constructor no longer accepts a number                                                                                                                                                                                                                                                                                   | all `new ObjectId(x)` take hex strings (`role.service.ts`, `user.service.ts`) | OK                               |
| bson-1..4,6 | Node/BigInt/`globalThis.crypto`/RN/Binary subtype 2                                                                                                                                                                                                                                                                                 | not used                                                                      | N/A                              |

## 6. Edge cases (ticket 1–6)

1. **Default database.** Verified in 7.9.0 `lib/connection_string.js:366-368`: no path → `dbName =
'test'` (unchanged). Web's `/^website(-…)?$/` and admin's two allowlists still reject `test`.
   Pinned by the new real-driver tests (req 3).
2. **Sessions across clients.** 7.9.0 `lib/operations/execute_operation.js:63` still throws
   `MongoInvalidArgumentError('ClientSession must be from the same MongoClient')`. Admin's
   `withAdminTransaction` starts its session on the admin client only. Unchanged.
3. **Transaction retries / abort-to-refuse.** 7.9.0 `ClientSession.withTransaction` still retries on
   `TransientTransactionError` / `UnknownTransactionCommitResult` within a 120 s budget (now with
   backoff between attempts — non-breaking), still aborts and rethrows a non-transient callback
   error, and still returns without throwing when the callback aborts manually (`sessions.js`
   ~L531-536; `.d.ts:2396`). `seed-admin.ts:213` and `roles/actions.ts:172` rely on the latter.
   Covered by existing `role.service`/`rbac-*` unit tests + staging role-change QA (AC4).
4. **BSON 7.** Only constructor-from-number removed; `toHexString`, `equals`, `toJSON` unchanged.
   Dates are native `Date`. Pinned by req 3's ObjectId test.
5. **Serverless bundling.** `mongodb` is not in `serverExternalPackages`; Next bundles/traces it as
   today. Proven by `pnpm build` + the Vercel preview builds for both apps. The `trace-guard` CI job
   stays red on web PRs (ICR-210, owner-accepted) — noted in the PR as a known red check.
6. **Two copies.** `pnpm why -r mongodb` + lockfile grep after install (AC1).

## 7. New / modified files

| File                                                                           | Change                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `apps/web/package.json`, `apps/admin/package.json`                             | `mongodb` → `^7.9.0`                                                 |
| `pnpm-lock.yaml`                                                               | regenerated                                                          |
| `apps/web/src/service/database.driver-contract.test.ts`                        | **new** — real-driver DB-name contract                               |
| `apps/admin/src/service/database.driver-contract.test.ts`                      | **new** — real-driver DB-name + ObjectId contract                    |
| `apps/admin/src/service/database.service.ts`                                   | comment line refs → 7.9.0                                            |
| `apps/admin/src/service/database.service.test.ts`                              | comment line ref only                                                |
| `apps/admin/src/app/[locale]/(app)/users/actions.ts`, `…/roles/actions.ts`     | comment line refs only                                               |
| `docs/architecture/admin-database.md`, `likes-and-mongodb.md`, `admin-rbac.md` | "driver facts" → 7.9.0 refs; note the pool measurement was on 6.21.0 |
| `.changeset/icr-214-mongodb-driver-7-web.md`, `…-admin.md`                     | patch bump, one file per app                                         |

## 8. i18n — none.

## 9. Testing strategy

- New contract tests (req 3) red/green: run on 6.21.0 → green; bump → green.
- Existing suites unchanged and green: both `database.service.test.ts`, `role`, `user`, `invite`,
  `rbac-audit`, `rbac-guard`, `like.service`, `check-mongo-pool.test.mjs` (its sync test keeps
  `POOL_OPTIONS` equal to `MONGODB_OPTIONS`).
- Full stack at root: `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build` (link main
  `apps/*/.env.local` into the worktree for build, per lessons).
- Optional live check: `pnpm --filter @idcr/web mongo:pool-check` against `website-staging` on 7.9
  (non-prod guard) — confirms connect + pool cap hold on the real cluster.
- Post-PR (orchestrator QA): staging like, contact message, admin sign-in, role change + audit (AC4).

## 10. Implementation checkpoints

1. **Contract tests on 6.21.0** — add both `*.driver-contract.test.ts`; `pnpm test` green.
   `test(ICR-214): pin driver default-database and ObjectId contracts`
2. **Bump** — both `package.json`, `pnpm install`, lockfile check, `pnpm why -r mongodb`; full
   verify stack. `chore(ICR-214): upgrade mongodb driver to 7.9 in web and admin`
3. **Refs, docs, changeset** — comment/doc line refs to 7.9.0, changeset.
   `docs(ICR-214): point driver facts at mongodb 7.9.0`

## 11. Open questions

1. ~~AC2 source~~ — resolved: owner accepted `buildInfo` 8.0.37 (option a).
