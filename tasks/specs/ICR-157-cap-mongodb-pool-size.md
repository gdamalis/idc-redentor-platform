# ICR-157 — Cap MongoDB pool size on the website's cached client

**Type:** fix · **QA depth:** standard · **Sensitive area:** `likes-mongo` (shared Mongo write path)

## Intent

The website keeps one cached `MongoClient` per warm Vercel instance and inherits the driver's default
pool of 100 connections per server. The Atlas M0 cluster allows 500 connections in total, and it will
soon be shared with `apps/admin`. Bound and document the website's footprint now: make it a small
explicit cap, have idle instances hand their connections back, and prove the cap holds under
concurrency.

- **Goals:** explicit, justified pool limits; reproducible evidence that the pool stays within them;
  no regression in likes or the contact form.
- **Non-goals:** `apps/admin`'s client (ICR-124); DB names, `MONGODB_URI` shape, Atlas users; a tier
  upgrade.
- **Anti-goals:** a cap so tight that likes or contact requests queue visibly; a check that can be
  pointed at production.

## Approaches (decided)

1. **Committed check script + one manual run against a non-prod Atlas DB** (**picked**). It gives
   evidence anyone can reproduce, and ICR-124 can re-run it for the admin app. Its cost is that the
   script mirrors the option values, so a test keeps the two in sync.
2. One-off run with no committed script: less code, but nothing to re-run later.
3. CI test with `mongodb-memory-server`: automatic, but it adds a heavy dependency (~100MB mongod
   download in CI) for a one-line fix.

Gabriel approved approach 1, and approved running the check against a non-production Atlas database
taken from local `.env.local`.

## 1. Dependencies Check

- `mongodb` 6.21.0 is installed in `apps/web` (`^6.20.0`). No new dependency.
- Vitest already includes `scripts/**/*.{test,spec}.mjs`, and `apps/web/scripts/` already holds
  standalone `.mjs` scripts.
- The existing `src/service/database.service.test.ts` mocks `MongoClient`.

## 2. Requirements

1. `MONGODB_OPTIONS` in `apps/web/src/service/database.service.ts` gains `maxPoolSize: 10` and
   `maxIdleTimeMS: 60_000`. A code comment gives the reason: M0 has a 500-connection cluster-wide
   budget shared with `apps/admin`, and each warm instance holds its own pool. It points to the docs.
   `minPoolSize` is **not** set, because its default is already 0; the comment says so.
2. `MONGODB_OPTIONS` is exported (`export const`), so tests can assert it.
3. The verified driver facts are recorded in the docs and the PR: driver 6.21.0, `maxPoolSize`
   default 100 (per server, per client), `minPoolSize` default 0, `maxIdleTimeMS` default 0, an
   unbounded wait queue when the pool is full (`waitQueueTimeoutMS` default 0), and up to 2 monitoring
   sockets per server outside the pool. Sources: the MongoDB Node driver docs "Connection Pools" and
   "Connection Options" pages (current v7.x docs; the v6 API reference gives no defaults), and
   Atlas's "Manage Connections with AWS Lambda" page for `maxIdleTimeMS: 60000`.
4. New `apps/web/scripts/check-mongo-pool.mjs`:
   - reads `MONGODB_URI` from the environment only (never from argv, so the secret never lands in
     shell history);
   - **refuses** unless the URI's database is non-production: `^website-(staging|test|qa|e2e)$`.
     Bare `website` and any other name exit with code 2 before connecting;
   - runs two phases on fresh clients: **baseline** (driver defaults, plus `serverApi`) and
     **capped** (the `POOL_OPTIONS` that mirror `MONGODB_OPTIONS`). Each fires `N` concurrent
     `ping` commands (default 200, `--concurrency <n>` overrides), listening to `connectionCreated`,
     `connectionClosed`, `connectionCheckedOut` and `connectionCheckedIn`;
   - prints a small table per phase: connections created, peak open, peak checked out, cap, and
     elapsed ms. It also prints the driver version;
   - exits 0 when the capped phase's peak open connections is ≤ `maxPoolSize`, and 1 otherwise. The
     baseline phase is informational: it shows that demand really exceeds the cap;
   - closes both clients in `finally`;
   - exports pure helpers (`isNonProdWebsiteDb(name)`, `createPoolTracker()` /
     `tracker.record(event)` / `tracker.summary()`) and `POOL_OPTIONS`, and runs `main()` only when
     invoked directly.
5. Tests:
   - `database.service.test.ts`: the `MongoClient` constructor receives `maxPoolSize: 10` and
     `maxIdleTimeMS: 60000` (alongside `serverApi`).
   - `scripts/check-mongo-pool.test.mjs`: the DB-name guard (accepts the suffixed names, rejects bare
     `website`, `test` and `admin`); the tracker's peak/created arithmetic over a synthetic event
     sequence; and **`POOL_OPTIONS` deep-equals the pool fields of `MONGODB_OPTIONS`** (the sync
     guard).
6. Docs: `docs/architecture/likes-and-mongodb.md` gets a "Connection pool cap (ICR-157)" subsection
   (the why, the numbers, the arithmetic, the queueing behavior, how to run the check, and a
   do-not-remove note pointing at ICR-124). The code excerpt and the `MONGODB_OPTIONS` bullet in that
   doc are updated to match.
7. A script entry is added to `apps/web/package.json`: `"mongo:pool-check": "node --env-file=.env.local
   scripts/check-mongo-pool.mjs"`. Node 22 supports `--env-file`.

## 3. Data Model Changes

None.

## 4. API Changes

None. No route or Server Action contract changes.

## 5. New / Modified Files

| File | Change |
|---|---|
| `apps/web/src/service/database.service.ts` | Export `MONGODB_OPTIONS`; add `maxPoolSize`, `maxIdleTimeMS` + comment |
| `apps/web/src/service/database.service.test.ts` | Assert the pool options reach `MongoClient` |
| `apps/web/scripts/check-mongo-pool.mjs` | **New** — guarded concurrency check |
| `apps/web/scripts/check-mongo-pool.test.mjs` | **New** — guard, tracker, options-sync tests |
| `apps/web/package.json` | `mongo:pool-check` script |
| `docs/architecture/likes-and-mongodb.md` | Pool-cap subsection + updated excerpt |
| `.changeset/*.md` | Patch bump for `@idcr/web` (repo uses Changesets) |

## 6. Component Hierarchy

No UI.

## 7. Edge Cases

1. A burst of more than 10 concurrent Mongo ops on one instance: the extra ops wait in the queue
   (unbounded; Vercel's 60s `maxDuration` is the ceiling). At ~1 op per request this is not expected.
2. An instance that sits idle for more than 60s closes its pooled connections. The next request pays a
   reconnect (TLS handshake). That is acceptable for this traffic.
3. The check script is pointed at production (`website`): it refuses with exit 2 before connecting.
4. `MONGODB_URI` is missing or has no DB path: the script refuses (the name is `test` or empty) with
   exit 2.
5. The check script can't connect: it reports the error, exits 1, and still closes the clients.
6. Monitoring sockets are not counted, because they don't emit `connectionCreated`. The script notes
   this in its output.

## 8. i18n

None.

## 9. Testing Strategy

- Unit (vitest): the items in requirement 5.
- Manual evidence (AC3): `pnpm --filter @idcr/web mongo:pool-check` against a non-prod DB from
  `.env.local`; the output goes to the PR and the issue.
- Preview QA (AC4, `api`): likes GET + POST and a contact-form submission on the PR's Vercel preview.
- Verify stack: `type-check`, `lint`, `test`, `build`.

## 10. Implementation Checkpoints

1. **Pool options + unit test** — `database.service.ts`, `database.service.test.ts`. Verify:
   `pnpm --filter @idcr/web test`, `type-check`. Commit: `fix(ICR-157): cap the website Mongo pool at
   10 connections`.
2. **Pool check script + tests + package script** — `scripts/check-mongo-pool.{mjs,test.mjs}`,
   `package.json`. Verify: tests, lint; run the check against non-prod and capture the output. Commit:
   `test(ICR-157): add a guarded Mongo connection-pool check script`.
3. **Docs + changeset** — `docs/architecture/likes-and-mongodb.md`, `.changeset/*.md`. Commit:
   `docs(ICR-157): explain the website Mongo pool cap`.

## 11. Open Questions

- Should `waitQueueTimeoutMS` be set, so a saturated pool fails fast instead of waiting up to 60s?
  **Deferred:** at current traffic, queueing is preferable to failing a like or a contact message.
  Re-check with ICR-124's budget arithmetic.
- ICR-124 should apply the same options to `apps/admin` and re-run the check script against its DB.
