# ICR-113 — Reduce noisy `database.service` connect logging (and drop the per-call admin ping)

**Jira:** [ICR-113](https://divinelab.atlassian.net/browse/ICR-113) · Task (→ commit type `chore`) · Epic ICR-9 · Priority Low
**QA depth:** standard · **QA type:** api
**Sensitive area:** `likes-mongo` — `apps/web/src/service/**` is the shared Mongo client behind every DB read/write.

## Context

`apps/web/src/service/database.service.ts` is the single cached Mongo client for the whole app. Its
`connect()` does three things on **every call**:

1. `await mongoClient.connect()`
2. `await mongoClient.db("admin").command({ ping: 1 })` — a real network round-trip
3. `console.log("Connected to database")` — unconditional, info-level

`connect()` has **four** consumers — `like.service.ts`, `contact.service.ts`, `predica/pdfJobs.ts`,
and `broadcast/broadcastLog.ts` — so every likes read, likes toggle, contact submit, PDF-regen job
poll, and broadcast-log write pays for the ping and emits the log line.

### What the driver actually does (verified against the installed source, not from memory)

Read from `node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb/lib/mongo_client.js`:

```js
async connect() {
  if (this.connectionLock) return await this.connectionLock;   // concurrent callers share one promise
  try { this.connectionLock = this._connect(); await this.connectionLock; }
  finally { this.connectionLock = undefined; }                  // released on success AND failure
  return this;
}

async _connect() {
  if (this.topology && this.topology.isConnected()) return this;  // warm no-op, zero network I/O
  …
  const topologyConnect = async () => {
    try { await this.topology?.connect(options); }
    catch (error) { this.topology?.close(); throw error; }        // failed topology is torn down
  };
  …
}
```

Three consequences that shape this design:

1. **`connect()` already de-dupes concurrent callers** (`connectionLock`) — there is no connection
   race for us to guard against.
2. **A repeat `connect()` on a warm client is already a genuine no-op** — `_connect()` early-returns
   when the topology is connected. It costs nothing.
3. **A failed connect leaves no poisoned state** — the lock is released in `finally` and the topology
   is closed, so the next call retries cleanly.

**Therefore the entire per-call cost is the admin ping + the `console.log`.** Deleting both is
sufficient. No memoization is required.

### Why NOT memoize the connection promise (the ticket's suggested approach)

The ticket suggests memoizing the connection promise so the ping runs at most once per process. Given
(1)–(3) above, that would add module state we don't need — and it would **introduce a bug the driver
does not have**: a memoized promise that rejects stays rejected. One transient connect failure would
be cached, and every subsequent request in that warm lambda would receive the rejected promise even
after Mongo recovered, unless we carefully null the cache on failure. The driver's `finally`-released
lock already handles exactly this. We take the driver's semantics instead of re-implementing them.

### Why the admin ping is not worth keeping

- `mongoClient.connect()` performs server selection **and** the auth handshake, so it already fails
  eagerly on an unreachable host or bad credentials. The ping adds no failure signal the connect
  doesn't already give.
- **ICR-111 proved the ping's health signal is misleading:** on the preview deployment the admin ping
  *succeeded* (and duly logged "Connected to database") while the actual `find` on `website.likes`
  threw `MongoServerError: user is not allowed to do action [find]`. The ping certified a connection
  that could not serve a single query.
- Per **ICR-153**, issuing a command against the `admin` database is a latent hazard with
  least-privilege Atlas users — the least-privilege direction we want to move in.

## Requirements

1. **R1 — Remove the per-call admin ping.** Delete `await mongoClient.db("admin").command({ ping: 1 })`
   from `connect()`. No replacement ping, memoized or otherwise. (AC2, via its "or none" branch.)
2. **R2 — Remove the info-level logs.** Delete `console.log("Connected to database")`. (AC1.)
   Not gated behind `NODE_ENV` — deleted outright, so AC1 holds unconditionally rather than depending
   on the env var being correct in every runtime.
3. **R3 — Preserve the return contract exactly.** `connect()` still resolves to the `MongoClient` on
   success and to `undefined` on failure, still swallowing the error. Add an **explicit return type**
   `Promise<MongoClient | undefined>` (today it is inferred) so the contract ICR-111's fail-soft likes
   depend on is enforced by the type-checker rather than by accident. (AC3.)
4. **R4 — Error logging + Sentry.** Rename the failure log to the repo's bracketed-prefix convention
   (`[db] …`, matching `[subscribe]` in `subscribe.service.ts:37` and
   `[predica/contentfulWriteBack]`), and add an explicit `Sentry.captureException(error)` in the catch
   block. (AC4 — see below; this is new behavior.)
5. **R5 — Delete dead `disconnect()`.** Zero callers anywhere (confirmed by `graphify explain
   "connect()"` and by Grep across `src/`, tests, scripts, and API routes). Removing it also removes
   the second `console.log` for free.
6. **R6 — No changes to any consumer.** `like.service.ts`, `contact.service.ts`, `predica/pdfJobs.ts`,
   and `broadcast/broadcastLog.ts` are untouched.

### R4 in detail — AC4 is currently false, and this is the only requirement that adds behavior

The ticket's AC4 says connection failures must "still be logged at error level and reach Sentry". The
first half is true today; **the second half is not, via any path.** Sentry's automatic server-side
capture is `onRequestError = Sentry.captureRequestError` (`apps/web/src/instrumentation.ts:14`), which
only fires for errors **thrown and left uncaught** through a Route Handler / Server Component / proxy.
`connect()` catches its error and returns `undefined` — it never rethrows — so a Mongo connection
failure reaches Sentry through no mechanism at all.

This matters more after ICR-111: the likes path now **fails soft**, so a dead Mongo degrades quietly
(the page renders, likes silently return `DB_UNAVAILABLE`) instead of throwing a 500. Without an
explicit capture, a total database outage is now invisible in Sentry *and* produces no user-visible
error. The explicit `Sentry.captureException(error)` is what makes the outage observable.

`Sentry.captureException` is already used at `apps/web/src/app/global-error.tsx:23`, and the server SDK
is initialized via `sentry.server.config.ts` (loaded by `instrumentation.ts`), so a server-side capture
in a service module works and is idiomatic. This is the first `@sentry/nextjs` import inside
`src/service/`; `database.service.ts` is server-only (never reachable from a client bundle), so the
import is safe.

**Contract note:** capturing the exception does **not** change `connect()`'s return contract. It still
resolves to `undefined` on failure. ICR-111's `if (!client) return DB_UNAVAILABLE` path is unchanged
and still reached.

## Data Model Changes

None. No schema, collection, index, or Contentful content-model change. The `admin` database is no
longer touched at all.

## API Changes

None. No route handler, request/response contract, or Zod schema changes.

The only signature change is internal and is a **tightening**, not a break:

```ts
// before (inferred)
export async function connect() { … }              // Promise<MongoClient | undefined>

// after (explicit — same type, now enforced)
export async function connect(): Promise<MongoClient | undefined> { … }
```

`export async function disconnect()` is **removed** (zero callers).

## New / Modified Files

| File | Change |
| --- | --- |
| `apps/web/src/service/database.service.ts` | Drop the admin ping; drop both `console.log`s; delete `disconnect()`; rename the error log to `[db]`; add `Sentry.captureException`; add the explicit return type. |
| `apps/web/src/service/database.service.test.ts` | **New.** Unit tests for the connect contract, the absence of the ping, the absence of info logs, and the error/Sentry path. |

No other file is touched.

### Target source (the whole file after the change)

```ts
import * as Sentry from "@sentry/nextjs";
import { MongoClient, ServerApiVersion } from "mongodb";

const MONGODB_OPTIONS = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient | null = null;

function getClient(): MongoClient {
  if (client) return client;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }

  // In development, cache on globalThis to survive HMR
  if (process.env.NODE_ENV === "development") {
    const globalWithMongo = globalThis as typeof globalThis & {
      _mongoClient?: MongoClient;
    };
    if (!globalWithMongo._mongoClient) {
      globalWithMongo._mongoClient = new MongoClient(uri, MONGODB_OPTIONS);
    }
    client = globalWithMongo._mongoClient;
  } else {
    client = new MongoClient(uri, MONGODB_OPTIONS);
  }

  return client;
}

export async function connect(): Promise<MongoClient | undefined> {
  try {
    const mongoClient = getClient();
    await mongoClient.connect();
    return mongoClient;
  } catch (error) {
    console.error("[db] Failed to connect to MongoDB", error);
    Sentry.captureException(error);
  }
}
```

`getClient()` is unchanged. Note it stays **inside** the `try`, so a missing `MONGODB_URI` (which makes
it throw) is still swallowed into `undefined` — preserving the fail-soft path ICR-111 relies on.

## Component Hierarchy

Not applicable — no UI.

## Edge Cases

1. **`MONGODB_URI` unset** → `getClient()` throws inside the `try` → logged `[db]` + captured to Sentry
   → resolves `undefined` → consumers take their existing `if (!client)` branch. Unchanged from today
   apart from the log prefix and the capture.
2. **Mongo unreachable / bad credentials** → `mongoClient.connect()` rejects (server selection or auth
   handshake) → same catch path as (1). Eager failure is preserved without the ping.
3. **Concurrent first calls** → the driver's `connectionLock` makes all callers await one in-flight
   `_connect()`. No double-connect, no race. We add no state of our own, so we add no race of our own.
4. **Repeat calls on a warm client** → `_connect()` early-returns on `topology.isConnected()`. Zero
   network I/O, zero logs. This is the case that used to cost a ping on every request.
5. **Transient failure, then recovery** → the driver releases `connectionLock` in `finally` and closes
   the failed topology, so the next `connect()` builds a fresh topology and succeeds. No poisoned
   cache. (This is precisely the failure mode a hand-rolled memoized promise would have introduced.)
6. **Connected but unauthorized** (the ICR-111 / ICR-153 situation: connect succeeds, the *query* is
   denied) → out of scope here and unchanged; the consumers' own `try/catch` fail-soft handles it.
   Removing the ping does not affect this — the ping never caught it either.
7. **Dev HMR** → `getClient()`'s `globalThis._mongoClient` cache is untouched; the client still
   survives hot reloads.

## i18n

Not applicable — no user-facing strings. The `[db]` log is server-side and English-only, consistent
with `[subscribe]` / `[broadcast]`.

## Testing Strategy

### Unit — `apps/web/src/service/database.service.test.ts` (new)

Mock `mongodb` (so `new MongoClient()` returns a fake with `connect`/`db` spies) and `@sentry/nextjs`.
Because `client` is module-level state, use `vi.resetModules()` + a dynamic `import()` per test so each
case starts from a cold module.

| # | Test | Guards |
| --- | --- | --- |
| 1 | Resolves to the `MongoClient` on success | AC3 |
| 2 | **Never calls `db("admin")` / `.command()`** — the `db` spy is not called at all | AC2, R1 |
| 3 | Emits **no** `console.log` on a successful connect | AC1, R2 |
| 4 | Resolves to `undefined` when `mongoClient.connect()` rejects | AC3 |
| 5 | Resolves to `undefined` when `MONGODB_URI` is unset | AC3, edge case 1 |
| 6 | On failure: `console.error` called with a `[db]`-prefixed message **and** `Sentry.captureException` called with the error | AC4 |
| 7 | Repeat `connect()` calls construct the `MongoClient` **once** (module-level cache holds) | edge case 4 |
| 8 | The module exports no `disconnect` | R5 |

The existing consumer tests (`like.service.test.ts`, `pdfJobs.test.ts`, `broadcastLog.test.ts`) all
mock `./database.service` as `{ connect: vi.fn() }`. Keeping `connect` a single exported async function
with an unchanged resolved-value contract means **those mocks keep working untouched** — which is
itself the regression guard for AC3. Any design that changed `connect`'s shape would have broken all
three; this one does not.

### Verification (standard depth)

`pnpm type-check` · `pnpm lint` · `pnpm test` · `pnpm build`.

### Manual / QA smoke (api type)

Against the PR's Vercel preview: exercise `GET /api/likes` and confirm a 200 with the fail-soft
response, then read the Vercel **runtime logs** for that deployment and confirm **no**
`"Connected to database"` line appears for those requests (this is the direct observation of AC1 — see
the ICR-111 lesson: runtime logs are the cheap way to prove a server-side log claim on preview).

**Known env limits, stated up front rather than discovered at QA time:**

- A healthy end-to-end likes read/toggle **cannot** be exercised on the preview *or* on staging — the
  Atlas user is denied `find` on `website.likes` in both (ICR-111 post-merge QA; ICR-153). Do not plan
  to "defer it to staging" — staging cannot test it either. Healthy-path likes coverage is unit tests
  plus production.
- Happy-path `POST /api/contact` is forbidden on staging (live mail) and unavailable on preview.

This is not a regression introduced here — it is the standing environment limitation. AC5's "likes +
contact still work" is therefore satisfied by: unchanged consumer code (R6), the untouched consumer
test suites, and the new unit tests.

## Implementation Checkpoints

### Checkpoint 1 — Rewrite `database.service.ts` and add its tests

- **Files:** `apps/web/src/service/database.service.ts`,
  `apps/web/src/service/database.service.test.ts` (new)
- **Do:** R1–R5 exactly as in "Target source" above; write the 8 unit tests above (TDD: write the
  tests first, watch 2/3/6/8 fail against the current source, then make them pass).
- **Verify:** `pnpm test` (new suite green; `like.service.test.ts`, `pdfJobs.test.ts`,
  `broadcastLog.test.ts` still green and **unmodified**) · `pnpm type-check` · `pnpm lint` ·
  `pnpm build`.
- **Commit:** `chore(ICR-113): drop per-call admin ping and noisy connect logging`

One checkpoint — the change is a single small file plus its test.

## Open Questions

None. The four design decisions (drop the ping entirely; delete the info logs outright; add the
explicit `Sentry.captureException`; delete dead `disconnect()`) were taken at the design gate.

Deferred, already tracked elsewhere — **not** in scope here:

- **ICR-153** — every Mongo service hardcodes `client.db("website")`, so preview/staging point at the
  **production** database and are protected only by the Atlas permission denial. Dropping the `admin`
  command here moves in the least-privilege direction but does not fix that.
