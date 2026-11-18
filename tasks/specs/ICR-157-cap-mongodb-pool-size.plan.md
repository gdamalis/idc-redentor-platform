# ICR-157 Cap the website Mongo pool — Implementation Plan

> **For agentic workers:** executed by `yoke:implementer`, one checkpoint (= one task) per dispatch,
> TDD-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bound `apps/web`'s per-instance MongoDB connection pool (`maxPoolSize: 10`,
`maxIdleTimeMS: 60_000`), prove the bound with a guarded, re-runnable check script, and document why.

**Architecture:** A one-object change to `MONGODB_OPTIONS` in the cached-client module, now exported so
tests can assert it. A standalone Node ESM script under `apps/web/scripts/` mirrors the pool options,
refuses production, and compares the baseline (driver defaults) with the capped pool using driver CMAP
events. A vitest test keeps the mirrored options in sync with the app.

**Tech Stack:** Next.js 16 app (`apps/web`), `mongodb` 6.21.0, Vitest, Node 22 (`--env-file`), pnpm.

**Spec:** `tasks/specs/ICR-157-cap-mongodb-pool-size.md`

## Global Constraints

- Values: `maxPoolSize: 10`, `maxIdleTimeMS: 60_000`. Do **not** set `minPoolSize` (the default is
  already 0).
- Keep the existing `serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }`
  unchanged.
- No new dependencies. pnpm only. Run commands from `apps/web` (or with `pnpm --filter @idcr/web`).
- The check script takes the URI **only** from `process.env.MONGODB_URI`, never from argv. It refuses any
  DB not matching `^website-(staging|test|qa|e2e)$`.
- Functional style, no classes, `??` over `||`, named exports. Commit headers ≤ 100 chars, conventional,
  scoped `ICR-157`.
- Never print the URI or its credentials in any output.

## Review Focus

1. **The URI points at production `website`:** the script must exit 2 **before** any connect. Test:
   `isNonProdWebsiteDb("website") === false` (Task 2).
2. **The URI has no DB path (the driver resolves `test`):** refused. Test: `isNonProdWebsiteDb("test")`
   and `isNonProdWebsiteDb("")` are false (Task 2).
3. **The options drift (someone edits the app but not the script):** the sync test fails (Task 2).
4. **A connection error mid-run:** clients still close and the exit code is 1. This is covered by the
   `try/finally` structure in `main()`; it is not unit-tested, because it needs a live server.
5. **A connection closes during the run:** the tracker's "peak open" must count down on
   `connectionClosed`, or the peak is overstated. Test: the tracker sequence with a close (Task 2).

---

### Task 1: Pool options on the cached client

**Files:**
- Modify: `apps/web/src/service/database.service.ts:4-10`
- Test: `apps/web/src/service/database.service.test.ts`

**Interfaces:**
- Produces: `export const MONGODB_OPTIONS` with `{ serverApi: {...unchanged}, maxPoolSize: 10,
  maxIdleTimeMS: 60_000 }`, typed `satisfies MongoClientOptions` (type import from `mongodb`).

- [ ] **Step 1: Write the failing test** in `database.service.test.ts` (new `describe("MONGODB_OPTIONS")`):

```ts
it("caps the pool and releases idle connections (ICR-157)", async () => {
  const { connect } = await loadService();
  await connect();
  expect(MongoClientMock).toHaveBeenCalledWith(
    "mongodb://localhost:27017/website",
    expect.objectContaining({ maxPoolSize: 10, maxIdleTimeMS: 60_000 }),
  );
  expect(MongoClientMock.mock.calls[0][1]).not.toHaveProperty("minPoolSize");
});
```

- [ ] **Step 2: Run it and confirm it fails.** `pnpm --filter @idcr/web test -- src/service/database.service.test.ts`.
  Expected: FAIL (the options object lacks `maxPoolSize`).
- [ ] **Step 3: Implement.** Export `MONGODB_OPTIONS` and add the two fields. Above them, add a short
  comment: M0 = 500 connections cluster-wide, shared with `apps/admin`; each warm Vercel instance holds
  its own pool; the driver default is 100 per server; `maxIdleTimeMS` per Atlas serverless guidance;
  `minPoolSize` is deliberately unset (default 0); "Do not remove — see
  docs/architecture/likes-and-mongodb.md § Connection pool cap".
- [ ] **Step 4: Run tests + type-check.** `pnpm --filter @idcr/web test` and
  `pnpm --filter @idcr/web type-check`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(ICR-157): cap the website Mongo pool at 10 connections`.

### Task 2: Guarded pool-check script

**Files:**
- Create: `apps/web/scripts/check-mongo-pool.mjs`
- Create: `apps/web/scripts/check-mongo-pool.test.mjs` (first line `// @vitest-environment node`)
- Modify: `apps/web/package.json` (scripts)

**Interfaces:**
- Consumes: `MONGODB_OPTIONS` from `src/service/database.service.ts` (test only; mock `@sentry/nextjs`
  in the test with `vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))`).
- Produces (named exports from `check-mongo-pool.mjs`):
  - `POOL_OPTIONS = { maxPoolSize: 10, maxIdleTimeMS: 60_000 }`
  - `isNonProdWebsiteDb(name: string): boolean` matches `/^website-(staging|test|qa|e2e)$/`
  - `createPoolTracker(): { record(eventName: string): void, summary(): { created: number,
    peakOpen: number, peakCheckedOut: number } }`. Event names handled: `connectionCreated` (+open,
    +created), `connectionClosed` (−open), `connectionCheckedOut` (+out), `connectionCheckedIn`
    (−out). Peaks are maxima over time.
  - `main()` runs only when `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [ ] **Step 1: Write failing tests:**
  - `isNonProdWebsiteDb`: true for `website-staging`, `website-test`, `website-qa`, `website-e2e`; false
    for `website`, `test`, `admin`, `""` and `website-prod`.
  - Tracker: the sequence `created, created, out, out, in, closed, created, out` gives
    `{ created: 3, peakOpen: 2, peakCheckedOut: 2 }`.
  - Sync: `expect({ maxPoolSize: MONGODB_OPTIONS.maxPoolSize, maxIdleTimeMS:
    MONGODB_OPTIONS.maxIdleTimeMS }).toEqual(POOL_OPTIONS)`.
- [ ] **Step 2: Run them and confirm they fail** (module missing).
  `pnpm --filter @idcr/web test -- scripts/check-mongo-pool.test.mjs`.
- [ ] **Step 3: Implement the exports and `main()`:**
  - Parse `--concurrency <n>` (default 200).
  - Read `process.env.MONGODB_URI`; if it is missing → stderr message, exit 2.
  - Derive the DB name with `new MongoClient(uri).db().databaseName` (no connect needed) and guard it
    with `isNonProdWebsiteDb`; on failure exit 2 and print only the DB name.
  - Phase helper `runPhase(label, extraOptions)`: build a fresh `MongoClient(uri, { serverApi: {
    version: ServerApiVersion.v1, strict: true, deprecationErrors: true }, ...extraOptions })`, attach
    the tracker to the four events, `await client.connect()`, then `Promise.all` of N
    `client.db().command({ ping: 1 })`, time it, and `close()` in `finally`. Return the summary +
    elapsed ms.
  - Run `baseline` (`{}`) then `capped` (`POOL_OPTIONS`).
  - Print the driver version (read the `mongodb/package.json` version via `createRequire`), concurrency,
    a `console.table` of both phases, and a note that monitoring sockets are not counted.
  - Exit 0 if `capped.peakOpen <= POOL_OPTIONS.maxPoolSize`, else 1. On any thrown error, print
    `error.message` (never the URI) and exit 1.
- [ ] **Step 4: Add the package script** `"mongo:pool-check": "node --env-file=.env.local
  scripts/check-mongo-pool.mjs"`.
- [ ] **Step 5: Run tests + lint.** `pnpm --filter @idcr/web test` and `pnpm --filter @idcr/web lint`.
  Expected: PASS.
- [ ] **Step 6: Live evidence run (AC3).** From the **main checkout's** `apps/web` env (copy nothing):
  `node --env-file=<MAIN_REPO_ROOT>/apps/web/.env.local scripts/check-mongo-pool.mjs`. If `.env.local`
  points at bare `website` (production), the script refuses. In that case **stop and report**, and do
  not edit `.env.local`. Save the stdout to `<MAIN_REPO_ROOT>/tasks/qa-evidence/ICR-157/pool-check.txt`.
  Expected: exit 0, with a capped `peakOpen` ≤ 10 and a baseline `peakOpen` > 10.
- [ ] **Step 7: Commit** `test(ICR-157): add a guarded Mongo connection-pool check script`.

### Task 3: Docs + changeset

**Files:**
- Modify: `docs/architecture/likes-and-mongodb.md` (the code excerpt near lines 95–115, the
  `MONGODB_OPTIONS` bullet near line 123, plus a new section)
- Create: `.changeset/icr-157-mongo-pool-cap.md`

**Interfaces:** consumes Task 1's values and Task 2's command name.

- [ ] **Step 1: Update the excerpt + bullet** so `MONGODB_OPTIONS` shows `maxPoolSize: 10`,
  `maxIdleTimeMS: 60_000`.
- [ ] **Step 2: Add `## Connection pool cap (ICR-157)`** covering:
  - the M0 cluster-wide 500-connection budget, shared with `apps/admin`;
  - per-instance pools, with the arithmetic: the old default was 100 per instance, so 5 warm instances
    could exhaust M0; the cap is 10 per instance;
  - the driver facts (6.21.0; defaults `maxPoolSize` 100 per server, `minPoolSize` 0, `maxIdleTimeMS`
    0, an unbounded wait queue; up to 2 monitoring sockets per server outside the pool), with source
    URLs: https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/
    and https://www.mongodb.com/docs/atlas/manage-connections-aws-lambda/ (the docs are v7.x current;
    the v6 API reference lists no defaults);
  - the queueing behavior and why `waitQueueTimeoutMS` stays unset;
  - how to run `pnpm --filter @idcr/web mongo:pool-check` (non-prod only);
  - "do not remove; ICR-124 applies the same to apps/admin and re-checks the budget".
- [ ] **Step 3: Write the changeset:** `'@idcr/web': patch` — "Cap the MongoDB connection pool (10 per
  instance) and release idle connections after 60s."
- [ ] **Step 4: Verify:** `pnpm format:check` (or prettier on the two files). Expected: clean.
- [ ] **Step 5: Commit** `docs(ICR-157): explain the website Mongo pool cap`.
