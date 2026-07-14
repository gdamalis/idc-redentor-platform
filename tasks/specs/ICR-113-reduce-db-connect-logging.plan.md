# ICR-113 — Reduce noisy `database.service` connect logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development with
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Stop `connect()` from emitting an info log and issuing an `admin` ping on every database
call, make connection failures reach Sentry, and delete dead code — without changing the
`MongoClient | undefined` return contract that ICR-111's fail-soft likes depend on.

**Architecture:** Delete-only, plus one added Sentry capture. The mongodb driver (v6.21.0) already
de-dupes concurrent `connect()` calls via an internal `connectionLock`, already early-returns on a
warm topology (`_connect()` checks `topology.isConnected()`), and already releases the lock and closes
the topology on failure so retries are clean. We therefore add **no** memoization of our own — the
per-call cost is entirely the `admin` ping and the `console.log`, and removing them is sufficient.

**Tech Stack:** TypeScript (strict), `mongodb@^6.20.0` (resolved 6.21.0), `@sentry/nextjs`, Vitest
(jsdom, `globals: true`).

**Spec:** `tasks/specs/ICR-113-reduce-db-connect-logging.md`

## Global Constraints

- **Worktree:** `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-113` ·
  **Branch:** `chore/ICR-113-reduce-db-connect-logging`. All commands run from the worktree root.
- **Do NOT modify any consumer:** `like.service.ts`, `contact.service.ts`, `predica/pdfJobs.ts`,
  `broadcast/broadcastLog.ts` — nor their test files. Their existing
  `vi.mock("./database.service", () => ({ connect: vi.fn() }))` mocks must keep passing **unmodified**;
  that is the regression guard for the return contract.
- **Return contract is frozen:** `connect()` resolves to the `MongoClient` on success and to
  `undefined` on failure. It never throws and never rejects.
- **No logger library.** `console.*` only.
- **Log prefix:** `[db]` — matching `[subscribe]` (`subscribe.service.ts:37`) and
  `[predica/contentfulWriteBack]`.
- **No memoization, no ping.** Zero `admin` commands. Zero `console.log`.
- **Commands** (run from the worktree root): `pnpm test`, `pnpm type-check`, `pnpm lint`, `pnpm build`.
- Scoped test run: `pnpm --filter @idcr/web exec vitest run src/service/database.service.test.ts`

---

### Task 1: Rewrite `database.service.ts` and add its unit tests

**Files:**
- Create: `apps/web/src/service/database.service.test.ts`
- Modify: `apps/web/src/service/database.service.ts` (lines 37–56 — `connect()` and `disconnect()`)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the only task).
- Produces: `export async function connect(): Promise<MongoClient | undefined>` — the sole export.
  `disconnect()` is **removed**. The four consumers already call `connect()` and branch on a falsy
  result; their call sites and mocks are unchanged.

#### Implementation notes the engineer needs before starting

1. **`client` is module-level mutable state.** `database.service.ts` caches the `MongoClient` in a
   module-scoped `let client`. Tests must therefore reset the module between cases with
   `vi.resetModules()` and re-`import()` the module inside each test, or state leaks across tests.

2. **`vi.mock` factories are hoisted above `const` declarations.** Vitest lifts `vi.mock(...)` calls to
   the top of the file — above any `const` you declare. A factory that closes over an outer `const`
   therefore throws `Cannot access '<var>' before initialization`. The existing
   `like.service.test.ts` gets away with a plain factory only because its factory references nothing
   outside itself. Ours must reference our spies, so it **must** use `vi.hoisted()`. This is the single
   most likely thing to go wrong in this task.

3. **`new MongoClient(uri, opts)` against a `vi.fn()`** works: a constructor that returns an object
   overrides `this`, so `vi.fn(() => ({ connect, db }))` is a valid fake constructor.

4. **`NODE_ENV` is `"test"` under Vitest**, so `getClient()` takes the `else` branch (a plain
   `new MongoClient(...)`, no `globalThis` caching). Do not try to exercise the dev-HMR branch.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/service/database.service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectFn, dbFn, MongoClientMock, captureException } = vi.hoisted(() => {
  const connectFn = vi.fn();
  const dbFn = vi.fn();
  const MongoClientMock = vi.fn(() => ({ connect: connectFn, db: dbFn }));
  const captureException = vi.fn();
  return { connectFn, dbFn, MongoClientMock, captureException };
});

vi.mock("mongodb", () => ({
  MongoClient: MongoClientMock,
  ServerApiVersion: { v1: "1" },
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

const ORIGINAL_URI = process.env.MONGODB_URI;

/** Re-imports the module with fresh module-level state (the cached `client`). */
async function loadService() {
  vi.resetModules();
  return import("./database.service");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONGODB_URI = "mongodb://localhost:27017/website";
  connectFn.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_URI === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = ORIGINAL_URI;
});

describe("connect", () => {
  it("resolves to the MongoClient on success", async () => {
    const { connect } = await loadService();

    const client = await connect();

    expect(client).toBeDefined();
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it("never issues an admin ping (no db() call at all)", async () => {
    const { connect } = await loadService();

    await connect();

    expect(dbFn).not.toHaveBeenCalled();
  });

  it("logs nothing at info level on a successful connect", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const { connect } = await loadService();

    await connect();

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("resolves to undefined when the driver fails to connect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectFn.mockRejectedValueOnce(new Error("server selection timed out"));
    const { connect } = await loadService();

    await expect(connect()).resolves.toBeUndefined();
  });

  it("resolves to undefined when MONGODB_URI is not set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.MONGODB_URI;
    const { connect } = await loadService();

    await expect(connect()).resolves.toBeUndefined();
  });

  it("logs the failure with a [db] prefix and reports it to Sentry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("bad auth");
    connectFn.mockRejectedValueOnce(failure);
    const { connect } = await loadService();

    await connect();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[db]"),
      failure,
    );
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("constructs the MongoClient once across repeated calls", async () => {
    const { connect } = await loadService();

    await connect();
    await connect();

    expect(MongoClientMock).toHaveBeenCalledTimes(1);
  });
});

describe("module surface", () => {
  it("no longer exports disconnect", async () => {
    const service = await loadService();

    expect(service).not.toHaveProperty("disconnect");
  });
});
```

- [ ] **Step 2: Run the tests and confirm the RIGHT ones fail**

Run:

```bash
pnpm --filter @idcr/web exec vitest run src/service/database.service.test.ts
```

Expected: **4 failures, 4 passes.** Confirm each failure is the one you expect — a test that passes for
the wrong reason is worse than one that fails:

| Test | Expected now | Why |
| --- | --- | --- |
| resolves to the MongoClient | PASS | already true |
| **never issues an admin ping** | **FAIL** | current code calls `db("admin").command(...)` |
| **logs nothing at info level** | **FAIL** | current code logs `"Connected to database"` |
| resolves to undefined on connect failure | PASS | already true |
| resolves to undefined with no URI | PASS | already true |
| **[db] prefix + Sentry** | **FAIL** | log says `"Error connecting to database"`; no Sentry call |
| constructs the MongoClient once | PASS | already true |
| **no longer exports disconnect** | **FAIL** | `disconnect` is still exported |

> If "never issues an admin ping" **passes** at this step, your `mongodb` mock is not being applied —
> fix the mock before going further, or the test is worthless.

- [ ] **Step 3: Rewrite `database.service.ts`**

Replace the file's contents from line 37 to the end (i.e. `connect()` and `disconnect()`), and add the
Sentry import at the top. `MONGODB_OPTIONS` and `getClient()` are **unchanged**.

The complete file after the edit:

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

// The driver de-dupes concurrent connect() calls internally (connectionLock) and
// no-ops on a warm topology, so repeat calls are free — no memoization needed here.
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

Three things to get exactly right:
- `getClient()` stays **inside** the `try` — a missing `MONGODB_URI` must be swallowed into `undefined`,
  not thrown, or ICR-111's fail-soft breaks.
- The `catch` block has **no `return`** — falling off the end resolves to `undefined`. Do not
  `return undefined` explicitly and do not rethrow.
- `disconnect()` is gone entirely — do not leave a stub.

- [ ] **Step 4: Run the new tests and confirm all 8 pass**

Run:

```bash
pnpm --filter @idcr/web exec vitest run src/service/database.service.test.ts
```

Expected: `Test Files 1 passed`, `Tests 8 passed`.

- [ ] **Step 5: Run the full suite — the consumer tests are the real regression guard**

Run:

```bash
pnpm test
```

Expected: all green. Specifically `like.service.test.ts`, `pdfJobs.test.ts`, and
`broadcastLog.test.ts` must pass **without being edited** — `git status` must show no changes to them.
If any of those three needed a change, the return contract was broken: stop and re-read the spec's
"Requirements → R3".

- [ ] **Step 6: Verify the stack**

Run:

```bash
pnpm type-check && pnpm lint && pnpm build
```

Expected: all three clean. `type-check` is the gate that proves the explicit
`Promise<MongoClient | undefined>` return type is honored at all four call sites.

- [ ] **Step 7: Confirm the deletions actually landed**

Run:

```bash
grep -rn "Connected to database\|Disconnected from database\|db(\"admin\")\|disconnect" apps/web/src/service/database.service.ts
```

Expected: **no output** (exit 1). Any hit means a deletion was missed.

> Per the ICR-144 lesson — a `grep -q … || echo PASS` idiom reports success when the tool never ran.
> Read the actual output here rather than trusting an `||` branch.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/service/database.service.ts apps/web/src/service/database.service.test.ts
git commit -m "chore(ICR-113): drop per-call admin ping and noisy connect logging"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task 1 step |
| --- | --- |
| R1 — remove the admin ping | Step 3 (code) · Step 1 test 2 · Step 7 grep |
| R2 — remove the info logs | Step 3 (code) · Step 1 test 3 · Step 7 grep |
| R3 — preserve the return contract + explicit return type | Step 3 (code) · Step 1 tests 1/4/5 · Step 5 (consumer tests) · Step 6 (`type-check`) |
| R4 — `[db]` prefix + `Sentry.captureException` | Step 3 (code) · Step 1 test 6 |
| R5 — delete dead `disconnect()` | Step 3 (code) · Step 1 test 8 · Step 7 grep |
| R6 — no consumer changes | Step 5 (they pass unmodified; `git status` check) |
| Edge case 4 (warm client reuse) | Step 1 test 7 |
| AC5 (test/type-check/lint/build green) | Steps 5–6 |

Every spec requirement maps to a step. No gaps.

**Placeholders:** none — every code step contains complete, runnable code.

**Type consistency:** the only exported symbol is `connect(): Promise<MongoClient | undefined>`, used
consistently in the spec, the plan, and all four (unmodified) consumers.

**Not covered by unit tests, by design:** AC1's "no info log **in a production build**" is proven at QA
time by reading the Vercel runtime logs for the preview deployment after hitting `/api/likes` — the
unit test proves the `console.log` is gone from the source, and the runtime log proves it in a real
`NODE_ENV=production` build. Healthy-path likes cannot be exercised on preview or staging (Atlas denies
`find` on `website.likes` in both — ICR-153); that limit is stated in the spec's Testing Strategy and
is not introduced by this change.
