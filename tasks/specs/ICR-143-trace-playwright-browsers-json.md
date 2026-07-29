# ICR-143 — Trace `playwright-core/browsers.json` into the Vercel function, and resolve the Mongo database from the URI

**Type:** Bug · **Priority:** Highest · **Commit type:** `fix` · **QA depth:** standard
**Branch:** `fix/ICR-143-trace-playwright-browsers-json`
**Jira:** https://divinelab.atlassian.net/browse/ICR-143

> **Sensitive areas touched:** build/bundling config (`next.config.ts` — tracing affects every
> route) and `likes-mongo` (the database resolver is shared by `likes` + `contact` + the predica
> job queue + the broadcast log).

---

## 0. Ticket corrections (verified against `main`, 2026-07-29)

The ticket was written 2026-07-12. Three of its claims no longer hold or were incomplete; the
requirements below supersede them.

| Ticket claim                                                                   | Verified reality                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "**ICR-136** — cron auth fails open when `CRON_SECRET` is unset"               | **Stale — already fixed.** `src/utils/auth/secret.ts#isAuthorizedSecret` returns `false` when the expected secret is absent. No work needed.                                                                                                                |
| "`pdfJobs.ts:17` hardcodes `DB_NAME = "website"`" (framed as one site)         | **Incomplete.** The literal `"website"` is hardcoded in **4 modules / 9 call sites**: `like.service.ts` (2), `contact.service.ts` (2), `predica/pdfJobs.ts` (2), `broadcast/broadcastLog.ts` (4). Fixing only `pdfJobs.ts` would leave staging split-brain. |
| "Cannot be verified by unit tests — only manifests in a built Vercel function" | **False in part.** `next build` emits `.nft.json` trace manifests. The missing asset is directly observable in the build output, so the tracing fix is verifiable pre-merge and guardable in CI.                                                            |

**Root cause confirmed, not inferred.** The pre-fix trace for the cron route
(`.next/server/app/api/predica/regenerate-pdf/cron/route.js.nft.json`) contains 729 entries
including `playwright-core/package.json`, `index.js`, `index.mjs` and ~50 `lib/*` files — and
**zero** occurrences of `browsers.json`. `playwright-core/lib/coreBundle.js:29400` loads it via
`require(path.join(packageRoot, "browsers.json"))` — a **runtime-computed** path that
`@vercel/nft`'s static analysis cannot see.

---

## 1. Dependencies Check

Everything required already exists; no new runtime dependency is introduced.

| Needs to exist                                                 | Status                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.ts` with `serverExternalPackages`        | ✅ present (line 13)                                                                                                               |
| `playwright-core@1.61.0` resolving to the repo-root pnpm store | ✅ `apps/web/node_modules/playwright-core` → symlink → `<repo>/node_modules/.pnpm/playwright-core@1.61.0/…`                        |
| `browsers.json` in that package                                | ✅ 1939 bytes                                                                                                                      |
| Cron route at `/api/predica/regenerate-pdf/cron`               | ✅ `src/app/api/predica/regenerate-pdf/cron/route.ts`                                                                              |
| `database.service.ts#connect()` returning a `MongoClient`      | ✅                                                                                                                                 |
| Next.js ≥ 15 (stable `outputFileTracing*` keys)                | ✅ **16.2.11** (docs verified against 16.2.12)                                                                                     |
| CI workflow able to run a build step                           | ⚠️ **none exists** — `pr.yml` runs lint/type-check/test/predica-smoke only. A new job is added (R3); verified it needs no secrets. |

**API verified against official docs** (`nextjs.org/docs/app/api-reference/config/next-config-js/output`,
version 16.2.12): `outputFileTracingRoot` / `outputFileTracingIncludes` are **stable top-level**
config keys (no longer `experimental`). Keys are **route globs** matched with picomatch against the
route path. Values are **globs resolved from the Next project root** (`apps/web`). The documented
monorepo pattern is exactly `outputFileTracingRoot: path.join(__dirname, '../../')` combined with
`'../…'` include values.

---

## 2. Requirements

### R1 — Pin the file-tracing root (build config)

`apps/web/next.config.ts` MUST set `outputFileTracingRoot` to the monorepo root:

```ts
import path from "node:path";
// …
outputFileTracingRoot: path.join(__dirname, "../../"),
```

**Why pin rather than rely on inference.** Without it, the build emits:

> ⚠ Warning: Next.js inferred your workspace root, but it may not be correct. We detected multiple
> lockfiles and selected the directory of `<repo>/pnpm-workspace.yaml` as the root directory.

Setting the key explicitly **silences that warning** (verified: present in the includes-only build,
absent once the root is set). The failure being fixed is only observable in production, so the
correctness of the deployment must not rest on a heuristic Next itself flags as possibly wrong.

`__dirname` is available in this `next.config.ts` under Next 16.2.11 — **verified** by a clean build
(exit 0, no `__dirname is not defined`).

### R2 — Include the runtime asset, narrowly (build config)

```ts
outputFileTracingIncludes: {
  "/api/predica/regenerate-pdf/cron": [
    "../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
  ],
},
```

- Keyed to the **cron route only**. The webhook route (`/api/predica/regenerate-pdf`) never launches
  Chromium and MUST NOT get the include.
- The `@*` segment absorbs a `playwright-core` version bump without a config edit.
- Exactly one file — **not** the package, **not** the repo root.
- `browsers.json` is the only asset to add: `package.json` is already traced (confirmed in the
  pre-fix manifest), and the other runtime-computed requires in `coreBundle.js`
  (`api.json`, `tools/cli-client/help.json`) belong to code paths this app never executes —
  `api.json` does not even exist in `playwright-core`.

**Measured blast radius (required to stay within these bounds):** 23 trace manifests, total traced
entries **7693 → 7694 (+1)**, cron route **729 → 730 (+1)**. The single added entry is
`browsers.json`. No other route's trace changes.

### R3 — Regression guard (new script + CI)

A standalone script MUST assert the asset is traced, and CI MUST run it after the build.

- `apps/web/scripts/verify-pdf-trace.mjs` — reads the cron route's `.nft.json` and exits non-zero
  when no traced entry ends in `/browsers.json`.
- Exits non-zero with an actionable message when the manifest is **absent** (build not run) — a
  missing manifest must never read as a pass.
- Wired as `pnpm --filter @idcr/web verify:trace` and invoked in CI after `build`.

**CI wiring — resolved, and it needs no secrets.** `pr.yml` currently runs **no build** (only
lint / type-check / Vitest / predica-smoke), so a new job is required. A build with real credentials
would mean distributing Contentful + Mongo secrets to GitHub Actions — a new secret surface this repo
deliberately avoids (all secrets live in Vercel). **Verified empirically:**

| Build env               | Result                                                          |
| ----------------------- | --------------------------------------------------------------- |
| no env at all           | ❌ exit 1 — `TypeError: Invalid URL, input: 'undefined'`        |
| dummy non-secret values | ✅ **exit 0**, trace manifests emitted, `browsers.json` present |

`NEXT_PUBLIC_BASE_URL=https://example.com` plus placeholder Contentful IDs are enough. Contentful
auth failures are logged and handled gracefully; static generation completes; the `.nft.json`
manifests are produced regardless, because tracing does not depend on data fetching. The new job
therefore uses **inline dummy values only — no GitHub secrets.**

This converts a silent, production-only, infinitely-retrying failure into a build-time failure —
the specific regression risk being a future `playwright-core` bump that moves the file.

### R4 — Resolve the Mongo database from the connection URI (runtime)

Replace all 9 hardcoded `"website"` database references with one shared, fail-closed resolver in
`src/service/database.service.ts`, mirroring the documented `apps/admin` pattern
(`docs/architecture/admin-database.md`: derive the name from the URI, assert it against a positive
allowlist).

```ts
/**
 * Positive allowlist for this app's database. Bare `website` is production; the
 * suffixed forms are staging and the QA environments.
 */
const WEBSITE_DB_PATTERN = /^website(-(staging|test|qa|e2e))?$/;

export function getWebsiteDb(client: MongoClient): Db {
  // No argument => the database named in MONGODB_URI's path segment.
  const db = client.db();
  if (!WEBSITE_DB_PATTERN.test(db.databaseName)) {
    throw new Error(
      `[db] Refusing to use database "${db.databaseName}". MONGODB_URI must include a database ` +
        `path matching ${WEBSITE_DB_PATTERN}. Note: when the URI has no path segment the MongoDB ` +
        `driver silently falls back to "test".`,
    );
  }
  return db;
}
```

Throwing (rather than returning a result union) matches the existing convention in this exact file —
`getClient()` already throws on a missing `MONGODB_URI`. This is misconfiguration detection at a
process boundary, not control flow.

**Driver behaviour verified empirically** (Node driver, this repo's version):

| `MONGODB_URI` shape                  | `client.db().databaseName`                            |
| ------------------------------------ | ----------------------------------------------------- |
| no path segment                      | `"test"` ← the silent fallback, refused by R4         |
| `…/website`                          | `"website"`                                           |
| `…/website-staging?retryWrites=true` | `"website-staging"` (query string correctly excluded) |

**Why this matters beyond the ticket:** the staging cluster contains **only** `website-staging` —
there is no `website` database there (verified live). Every one of the 9 call sites is therefore
wrong on staging today; `pdf_jobs` merely fails _loudly_ because it is the only one calling
`createIndex`.

### R5 — Deployment ordering (MANDATORY, and the main risk in this change)

R4 fails closed. If the code deploys while `MONGODB_URI` still lacks a database path, **likes,
contact, the sermon job queue and the broadcast log all stop working** — a larger outage than the
bug being fixed.

The env change is **backwards-compatible with the currently deployed code**, which passes an
explicit `client.db("website")` and ignores the URI path entirely. It can therefore be applied
safely _first_, with no coordination window:

1. Append the database path to `MONGODB_URI` in Vercel — **Production** (`/website`) and
   **Preview/staging** (`/website-staging`). _(No-op for the code currently in production.)_
2. Confirm the site still serves likes/contact normally.
3. Only then merge and deploy ICR-143.

This is a **deferred production action** and MUST be filed as its own Jira issue per the standing
rules, linked to ICR-143 and to ICR-133, carrying an explicit _do-not-deploy-ICR-143-until_ guard.
It must also appear in the PR's Release Notes.

Local developers must likewise append `/website` to `MONGODB_URI` in `apps/web/.env.local`;
`.env.example` documents the requirement (R6).

### R6 — Documentation

- `apps/web/.env.example` — state that `MONGODB_URI` must carry a database path, and why.
- `docs/architecture/likes-and-mongodb.md` — document `getWebsiteDb()`, the allowlist, the `test`
  fallback trap, and the ordering rule from R5.
- `docs/architecture/predica-*` / build notes — record why `outputFileTracingRoot` is pinned and why
  the include exists, so a future reader does not "tidy them away".
- A Changeset for `@idcr/web` (patch).

---

## 3. Data Model Changes

**No Contentful content-model change** — the Contentful model gate does not apply. No new
collection, field, or index. `PdfJob`, `likes`, `contact` and the broadcast-log shapes are all
untouched.

The only change is _which database name_ the client resolves — from a hardcoded literal to the URI's
path segment, constrained by `WEBSITE_DB_PATTERN`.

```ts
// unchanged, for reference
export interface PdfJob {
  entryId: string; // Contentful sermon entry id — UNIQUE key
  dirtyAt: Date;
  contentHash: string;
  lastRenderedHash?: string;
  version: number;
  status: "idle" | "rendering";
  lockedAt?: Date;
  lastRenderedAt?: Date;
  lastError?: string;
}
```

---

## 4. API Changes

**None.** No route handler signature, request shape, response shape or status code changes. No new
Zod schema. `/api/predica/regenerate-pdf/cron` keeps its existing `Authorization: Bearer` contract.

---

## 5. New / Modified Files

### New

| File                                        | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web/scripts/verify-pdf-trace.mjs`     | Asserts `browsers.json` is in the cron route's build trace; exits non-zero otherwise (R3). |
| `apps/web/scripts/verify-pdf-trace.test.ts` | Unit test for the pure predicate behind the guard.                                         |
| `.changeset/*.md`                           | Patch bump for `@idcr/web`.                                                                |

### Modified

| File                                             | Change                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.ts`                        | Add `import path from "node:path"`, `outputFileTracingRoot`, `outputFileTracingIncludes` (R1, R2). |
| `apps/web/package.json`                          | Add `"verify:trace"` script (R3).                                                                  |
| `.github/workflows/pr.yml`                       | New `trace-guard` job: install → build with dummy env → `verify:trace` (R3). No secrets.           |
| `apps/web/src/service/database.service.ts`       | Add `getWebsiteDb()` + `WEBSITE_DB_PATTERN` + exported predicate (R4).                             |
| `apps/web/src/service/database.service.test.ts`  | Tests for the allowlist predicate (new or extended).                                               |
| `apps/web/src/service/like.service.ts`           | 2 sites → `getWebsiteDb(client)`.                                                                  |
| `apps/web/src/service/contact.service.ts`        | 2 sites → `getWebsiteDb(client)`.                                                                  |
| `apps/web/src/service/predica/pdfJobs.ts`        | Drop `DB_NAME`; 1 use → `getWebsiteDb(client)`.                                                    |
| `apps/web/src/service/broadcast/broadcastLog.ts` | Drop `DB_NAME`; 3 uses → `getWebsiteDb(client)`.                                                   |
| `apps/web/.env.example`                          | Document the required database path (R6).                                                          |
| `docs/architecture/likes-and-mongodb.md`         | Document the resolver + ordering rule (R6).                                                        |

---

## 6. Component Hierarchy

**Not applicable** — no UI. This change touches build configuration, one service helper, and a CI
script. No React component is added or modified, and no locale-visible surface changes.

---

## 7. Edge Cases

1. **`MONGODB_URI` has no path segment** → driver yields `"test"` → `getWebsiteDb` throws with a
   message naming the cause and the fix. _(Refuse loudly rather than write to the wrong database.)_
2. **URI carries a query string** (`/website-staging?retryWrites=true`) → `databaseName` is
   `website-staging`; the query is excluded. Verified.
3. **URI points at a reserved database** (`admin`, `local`, `config`) → rejected by the allowlist.
4. **URI points at `websiteX` or `website-prod`** → rejected; the pattern anchors both ends and
   enumerates the permitted suffixes.
5. **`playwright-core` version bump** → the `@*` glob still matches. If upstream _moves_ the file,
   `verify:trace` fails the CI build instead of the cron failing silently in production.
6. **Guard script run before a build** → manifest absent → exit non-zero with "run the build first",
   never a false pass.
7. **A second route later needs Chromium** → the include is route-keyed, so that route needs its own
   entry; the guard covers only the cron route and would not notice. Documented, not solved here.
8. **`outputFileTracingRoot` regressing other routes** → measured: +1 entry total across all 23
   manifests, attributable entirely to `browsers.json`. Re-measure at Checkpoint 1 and stop if it
   drifts.
9. **Deploy ordering violated (R5)** → all Mongo-backed features fail closed. Mitigated by
   sequencing, the linked Jira issue, and the PR Release Notes.
10. **The stuck production job** (`3x35gLRIyOIo9xLNP2qEeD`) is deliberately left in `pdf_jobs`; after
    deploy the next tick should render it, providing the end-to-end confirmation.

---

## 8. i18n

**Not applicable.** No user-facing string is added or changed, so
`public/locales/{es-AR,en-US}.json` are untouched. The error message in R4 is an operator-facing
server log, deliberately English, consistent with the existing `[db]` / `[predica/pdfJobs]` logs.

---

## 9. Testing Strategy

**Unit (Vitest)**

- `WEBSITE_DB_PATTERN` predicate: accepts `website`, `website-staging`, `website-test`,
  `website-qa`, `website-e2e`; rejects `test`, `admin`, `local`, `config`, `""`, `websiteX`,
  `website-prod`, `Website`.
- Guard predicate: given a `files` array containing `…/browsers.json` → pass; without it → fail.
- These are meaningful (they encode the two traps this ticket exists to close), not coverage filler.

**Build-artifact verification (the real proof for R1/R2)**

- `pnpm --filter @idcr/web build`, then assert `browsers.json` is present in the cron manifest.
- Re-measure the trace totals against the baseline (7693 → 7694; cron 729 → 730) and confirm no
  other route moved.
- Confirm the workspace-root warning is gone from the build log.
- Per the ICR-155 lesson, force the build (`--force`) when the result is load-bearing so a Turbo
  cache replay is never mistaken for a compile; report the `Cached:` line.

**Not covered pre-merge, by construction**

Acceptance criteria 1–3 require a real Chromium render triggered by Vercel cron, which only ever
invokes the **production** deployment. Manually invoking the cron on a preview would write to
**production** Contentful (`CONTENTFUL_ENVIRONMENT` is unset → `resolveCmaEnvironment()` defaults to
`"production"`) and to the production `website` database. Pre-merge QA therefore verifies the
**build artifact**; the human confirms the render post-deploy using the deliberately-preserved stuck
job. This boundary is stated plainly rather than papered over.

**Playwright:** no suite applies (`config.playwrightProjectMap` has no entry for these paths, and
Phase 1 ships no specs).

---

## 10. Implementation Checkpoints

### Checkpoint 1 — Tracing fix

- **Files:** `apps/web/next.config.ts`
- **Verify:** build succeeds; `browsers.json` present in the cron manifest; trace totals 7694 / cron
  730; no workspace-root warning; `pnpm type-check` + `pnpm lint` clean.
- **Commit:** `fix(ICR-143): trace playwright-core browsers.json into the sermon PDF cron function`

### Checkpoint 2 — Regression guard + CI

- **Files:** `apps/web/scripts/verify-pdf-trace.mjs`, `apps/web/scripts/verify-pdf-trace.test.ts`,
  `apps/web/package.json`, CI workflow
- **Verify:** guard passes on the fixed build; guard **fails** when the include is temporarily
  removed (prove it can fail — a test that cannot fail is worthless); guard fails cleanly with no
  build present; new unit test green.
- **Commit:** `test(ICR-143): assert the PDF cron function traces playwright browsers.json`

### Checkpoint 3 — URI-derived database resolver

- **Files:** `database.service.ts` (+test), `like.service.ts`, `contact.service.ts`,
  `predica/pdfJobs.ts`, `broadcast/broadcastLog.ts`
- **Verify:** zero remaining `client.db("website")` / `DB_NAME` occurrences
  (`grep -rn --include="*.ts" -E 'DB_NAME|\.db\("website"\)' src` returns nothing); allowlist tests
  green; full suite green; type-check + lint clean.
- **Commit:** `fix(ICR-143): resolve the website database from MONGODB_URI with a fail-closed allowlist`

### Checkpoint 4 — Docs, env template, changeset

- **Files:** `apps/web/.env.example`, `docs/architecture/likes-and-mongodb.md`, `.changeset/*.md`
- **Verify:** `pnpm format:check` clean; docs state the R5 ordering rule; changeset present.
- **Commit:** `docs(ICR-143): document the URI-derived database resolver and deploy ordering`

---

## 11. Open Questions

1. ~~Which CI workflow runs the build?~~ **Resolved.** None did; `pr.yml` gains a `trace-guard` job
   that builds with dummy non-secret env values (verified exit 0) and runs `verify:trace`. No
   GitHub secrets are introduced.
2. **Local `.env.local` edit.** The main checkout's `apps/web/.env.local` needs `/website` appended
   for local development after this change. It is the developer's own gitignored file — flagged for
   the human to apply, **not** edited silently by the implementer.
3. **Whether the Vercel env change is done by the human before merge.** R5 is a hard precondition;
   the ticket for it must exist and be linked before this PR is marked ready.
4. **`api.json` / `help.json`.** Not included: `api.json` does not exist in `playwright-core`, and
   `help.json` is CLI-only. If a future production stack trace names either, widen the include by
   exactly that file — the guard script is the place to encode it.
