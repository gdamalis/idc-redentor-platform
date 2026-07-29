# ICR-143 Implementation Plan — trace `browsers.json`, and resolve the database from the URI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sermon-PDF cron function actually render in production by tracing
`playwright-core/browsers.json` into the Vercel Lambda, guard that against regression in CI, and
replace the hardcoded `"website"` database name with a fail-closed, URI-derived resolver.

**Architecture:** Three independent changes. (1) `next.config.ts` pins the file-tracing root to the
monorepo root and adds a one-file `outputFileTracingIncludes` entry for the cron route. (2) A new
Node script asserts the asset is present in the build's `.nft.json` manifest; a new CI job builds
with dummy non-secret env values and runs it. (3) `database.service.ts` gains `getWebsiteDb()`,
which reads the database name from `MONGODB_URI`'s path segment and refuses anything outside a
positive allowlist; all 9 hardcoded call sites move onto it.

**Tech Stack:** Next.js 16.2.11 (App Router), TypeScript strict, pnpm + Turborepo workspace, MongoDB
Node driver, Vitest, GitHub Actions, Changesets.

## Global Constraints

- Package manager is **pnpm**; the site is `@idcr/web` at `apps/web`. Scope commands with
  `pnpm --filter @idcr/web <task>`.
- Type-check script is **hyphenated**: `pnpm type-check`.
- Conventional Commits, header **≤ 100 chars**, every message scoped `(ICR-143)`.
- **Never** use `git commit --no-verify`. The pre-commit hook rejects any staged line matching
  `mongodb(\+srv)?://[^@\s]+@`; assemble any credential-shaped test string from parts so the pattern
  never appears contiguously on one line.
- TypeScript everywhere, strict. Prefer `interface`, `??` over `||`, named exports, no enums.
- Functional-first — no `class` declarations. `throw` is acceptable here **only** for
  misconfiguration at a process boundary, matching the existing `getClient()` in the same file.
- Values in `outputFileTracingIncludes` are globs resolved from the **Next project root**
  (`apps/web`); keys are **route globs**. Keep the include to exactly one file.
- Measured trace budget that must hold after Task 1: **23** manifests, **7694** total traced
  entries, cron route **730**. Baseline was 7693 / 729. Any other delta means stop and investigate.
- Do **not** edit the developer's `apps/web/.env.local` in the main checkout. It is flagged for the
  human in the PR notes.

---

## File Structure

| File                                                                                                | Responsibility                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.ts`                                                                           | Build config: pins the tracing root, includes the one runtime asset.                              |
| `apps/web/scripts/verify-pdf-trace.mjs`                                                             | Pure predicate + CLI that fails when the asset is missing from the build trace.                   |
| `apps/web/scripts/verify-pdf-trace.test.ts`                                                         | Unit test for that predicate.                                                                     |
| `apps/web/src/service/database.service.ts`                                                          | Owns connection **and** database-name resolution — the single place the database name is decided. |
| `apps/web/src/service/{like,contact}.service.ts`, `predica/pdfJobs.ts`, `broadcast/broadcastLog.ts` | Consumers; they stop naming a database entirely.                                                  |
| `.github/workflows/pr.yml`                                                                          | Adds the `trace-guard` job.                                                                       |

---

## Task 1: Trace the runtime asset into the cron function

**Files:**

- Modify: `apps/web/next.config.ts:1-13`

**Interfaces:**

- Consumes: nothing.
- Produces: a build in which
  `.next/server/app/api/predica/regenerate-pdf/cron/route.js.nft.json` contains an entry ending
  `/browsers.json`. Task 2's guard asserts exactly this.

- [ ] **Step 1: Capture the pre-change baseline**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143
pnpm --filter @idcr/web build
cd apps/web
node -p "JSON.parse(require('fs').readFileSync('.next/server/app/api/predica/regenerate-pdf/cron/route.js.nft.json','utf8')).files.filter(f=>f.endsWith('browsers.json')).length"
```

Expected: `0`. This is the failing state — the bug, observed directly.

- [ ] **Step 2: Apply the config change**

In `apps/web/next.config.ts`, add the import as the **first** line:

```ts
import path from "node:path";
```

Then, immediately after the `serverExternalPackages` line, add:

```ts
  // playwright-core loads browsers.json through a RUNTIME-computed require
  // (lib/coreBundle.js: `require(path.join(packageRoot, "browsers.json"))`), which
  // @vercel/nft's static analysis cannot see — so it never lands in the Lambda and the
  // sermon-PDF cron fails forever with "Cannot find module …/browsers.json" (ICR-143).
  // The package resolves to the REPO-ROOT pnpm store, outside apps/web, so the tracing
  // root must be pinned to the monorepo root as well. Pinning it also silences Next's
  // "inferred your workspace root, but it may not be correct" multi-lockfile warning.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/api/predica/regenerate-pdf/cron": [
      "../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
```

Do **not** add an entry for `/api/predica/regenerate-pdf` — that route never launches Chromium.

- [ ] **Step 3: Rebuild and verify the asset is traced**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143
pnpm --filter @idcr/web build
cd apps/web
node -p "JSON.parse(require('fs').readFileSync('.next/server/app/api/predica/regenerate-pdf/cron/route.js.nft.json','utf8')).files.filter(f=>f.endsWith('browsers.json')).join('\n')"
```

Expected: one line ending
`node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/browsers.json`.

- [ ] **Step 4: Verify the blast radius is exactly +1 entry**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143/apps/web
node -e '
const fs=require("fs"),path=require("path");
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p,a):e.name.endsWith(".nft.json")&&a.push(p);}return a;}
const f=walk(".next/server");let t=0;for(const x of f)t+=JSON.parse(fs.readFileSync(x,"utf8")).files.length;
console.log("manifests:",f.length,"total:",t);
'
```

Expected exactly: `manifests: 23 total: 7694`. If any other number appears, STOP — the tracing root
changed something unintended; report it rather than proceeding.

- [ ] **Step 5: Verify the workspace-root warning is gone**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143
pnpm --filter @idcr/web build 2>&1 | grep -i "inferred your workspace root" && echo "STILL PRESENT" || echo "warning gone (expected)"
```

Expected: `warning gone (expected)`.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "fix(ICR-143): trace playwright-core browsers.json into the sermon PDF cron function"
```

---

## Task 2: Regression guard — script, unit test, CI job

**Files:**

- Create: `apps/web/scripts/verify-pdf-trace.mjs`
- Create: `apps/web/scripts/verify-pdf-trace.test.ts`
- Modify: `apps/web/package.json` (scripts block)
- Modify: `.github/workflows/pr.yml`

**Interfaces:**

- Consumes: the build artifact produced by Task 1.
- Produces: `hasTracedAsset(files: string[], basename: string): boolean`, exported from
  `verify-pdf-trace.mjs`; and the `verify:trace` package script.

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/verify-pdf-trace.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { hasTracedAsset } from "./verify-pdf-trace.mjs";

describe("hasTracedAsset", () => {
  it("finds the asset when a traced path ends with it", () => {
    const files = [
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/lib/coreBundle.js",
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/browsers.json",
    ];
    expect(hasTracedAsset(files, "browsers.json")).toBe(true);
  });

  it("returns false when only the JS is traced (the ICR-143 bug state)", () => {
    const files = [
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/lib/coreBundle.js",
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/package.json",
    ];
    expect(hasTracedAsset(files, "browsers.json")).toBe(false);
  });

  it("does not match a filename that merely ends with the same suffix", () => {
    expect(hasTracedAsset(["a/not-browsers.json"], "browsers.json")).toBe(
      false,
    );
  });

  it("returns false for an empty trace", () => {
    expect(hasTracedAsset([], "browsers.json")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @idcr/web test -- verify-pdf-trace`
Expected: FAIL — cannot resolve `./verify-pdf-trace.mjs`.

- [ ] **Step 3: Write the script**

Create `apps/web/scripts/verify-pdf-trace.mjs`:

```js
// Guards ICR-143: playwright-core loads browsers.json via a runtime-computed require that
// @vercel/nft cannot see, so it only reaches the Lambda because next.config.ts lists it in
// outputFileTracingIncludes. If that entry is removed — or a playwright-core upgrade moves the
// file — the sermon-PDF cron fails in production and retries forever. Fail the build instead.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MANIFEST =
  ".next/server/app/api/predica/regenerate-pdf/cron/route.js.nft.json";
const REQUIRED_ASSET = "browsers.json";

/** True when some traced path is exactly, or ends with a path segment equal to, `basename`. */
export function hasTracedAsset(files, basename) {
  return files.some(
    (file) => file === basename || file.endsWith(`/${basename}`),
  );
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    console.error(
      `[verify:trace] Could not read ${MANIFEST}.\n` +
        `Run the production build first: pnpm --filter @idcr/web build`,
    );
    process.exit(1);
  }

  const files = manifest.files ?? [];
  if (!hasTracedAsset(files, REQUIRED_ASSET)) {
    console.error(
      `[verify:trace] ${REQUIRED_ASSET} is NOT traced into the sermon PDF cron function.\n` +
        `The Chromium render will fail in production with "Cannot find module …/${REQUIRED_ASSET}".\n` +
        `Fix: restore the outputFileTracingIncludes entry for ` +
        `"/api/predica/regenerate-pdf/cron" in apps/web/next.config.ts (ICR-143).`,
    );
    process.exit(1);
  }

  const match = files.find((file) => file.endsWith(`/${REQUIRED_ASSET}`));
  console.log(`[verify:trace] OK — ${REQUIRED_ASSET} is traced: ${match}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @idcr/web test -- verify-pdf-trace`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the package script**

In `apps/web/package.json`, add to `"scripts"`:

```json
"verify:trace": "node scripts/verify-pdf-trace.mjs"
```

- [ ] **Step 6: Prove the guard passes on a good build AND fails on a bad one**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143
pnpm --filter @idcr/web verify:trace; echo "good-build exit=$?"
```

Expected: `OK — browsers.json is traced: …`, `good-build exit=0`.

Now prove it can actually fail (a guard that cannot fail is worthless):

```bash
cd apps/web
cp next.config.ts /tmp/icr143-next.config.ts.bak
# temporarily strip the include block
node -e '
const fs=require("fs");let s=fs.readFileSync("next.config.ts","utf8");
s=s.replace(/\n  outputFileTracingIncludes: \{[\s\S]*?\n  \},/,"");
fs.writeFileSync("next.config.ts",s);'
cd .. && pnpm --filter @idcr/web build >/dev/null 2>&1
pnpm --filter @idcr/web verify:trace; echo "bad-build exit=$? (expect 1)"
cp /tmp/icr143-next.config.ts.bak apps/web/next.config.ts
pnpm --filter @idcr/web build >/dev/null 2>&1
pnpm --filter @idcr/web verify:trace; echo "restored exit=$? (expect 0)"
```

Expected: the middle run prints the "NOT traced" error and exits `1`; the restored run exits `0`.
Confirm `git diff apps/web/next.config.ts` is empty afterwards.

- [ ] **Step 7: Add the CI job**

In `.github/workflows/pr.yml`, append a new job at the same indent level as `eslint-tsc`:

```yaml
trace-guard:
  runs-on: ubuntu-latest

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Install pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: "22.x"
        cache: "pnpm"

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    # Dummy, non-secret values only. The build reaches Contentful and logs auth
    # failures, but completes and still emits the .nft.json trace manifests — file
    # tracing does not depend on data fetching. This deliberately keeps real
    # credentials out of GitHub Actions; they live only in Vercel.
    - name: Build
      run: pnpm --filter @idcr/web build
      env:
        NEXT_PUBLIC_BASE_URL: https://example.com
        CONTENTFUL_SPACE_ID: dummyspace
        CONTENTFUL_ACCESS_TOKEN: dummytoken
        CONTENTFUL_PREVIEW_ACCESS_TOKEN: dummypreview

    - name: Verify the PDF cron function traces browsers.json
      run: pnpm --filter @idcr/web verify:trace
```

- [ ] **Step 8: Validate the workflow YAML parses**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pr.yml')); print('pr.yml parses OK')"
```

Expected: `pr.yml parses OK`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/scripts/verify-pdf-trace.mjs apps/web/scripts/verify-pdf-trace.test.ts \
        apps/web/package.json .github/workflows/pr.yml
git commit -m "test(ICR-143): assert the PDF cron function traces playwright browsers.json"
```

---

## Task 3: URI-derived database resolver across all 9 call sites

**Files:**

- Modify: `apps/web/src/service/database.service.ts`
- Modify: `apps/web/src/service/database.service.test.ts`
- Modify: `apps/web/src/service/like.service.ts:41,69` and `like.service.test.ts:8`
- Modify: `apps/web/src/service/contact.service.ts:11,42`
- Modify: `apps/web/src/service/predica/pdfJobs.ts:17,81` and `pdfJobs.test.ts:139`
- Modify: `apps/web/src/service/broadcast/broadcastLog.ts:19,68,91,106` and `broadcastLog.test.ts:8`

**Interfaces:**

- Produces, both exported from `database.service.ts`:
  - `isAllowedWebsiteDbName(name: string): boolean`
  - `getWebsiteDb(client: MongoClient): Db`
- Consumers call `getWebsiteDb(client)` and never name a database.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/service/database.service.test.ts`:

```ts
describe("isAllowedWebsiteDbName", () => {
  it.each([
    "website",
    "website-staging",
    "website-test",
    "website-qa",
    "website-e2e",
  ])("accepts %s", async (name) => {
    const { isAllowedWebsiteDbName } = await loadService();
    expect(isAllowedWebsiteDbName(name)).toBe(true);
  });

  // "test" is the driver's SILENT fallback when the URI carries no database path —
  // the single most dangerous value, so it gets its own assertion.
  it.each([
    "test",
    "admin",
    "local",
    "config",
    "",
    "websiteX",
    "website-prod",
    "Website",
  ])("rejects %s", async (name) => {
    const { isAllowedWebsiteDbName } = await loadService();
    expect(isAllowedWebsiteDbName(name)).toBe(false);
  });
});

describe("getWebsiteDb", () => {
  it("returns the database named in the URI", async () => {
    const { getWebsiteDb } = await loadService();
    const fakeDb = { databaseName: "website-staging" };
    const client = { db: vi.fn(() => fakeDb) };

    expect(getWebsiteDb(client as never)).toBe(fakeDb);
    // no argument => resolved from MONGODB_URI's path segment
    expect(client.db).toHaveBeenCalledWith();
  });

  it("throws when the driver fell back to the test database", async () => {
    const { getWebsiteDb } = await loadService();
    const client = { db: vi.fn(() => ({ databaseName: "test" })) };

    expect(() => getWebsiteDb(client as never)).toThrow(
      /MONGODB_URI must include a database path/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @idcr/web test -- database.service`
Expected: FAIL — `isAllowedWebsiteDbName is not a function`.

- [ ] **Step 3: Implement the resolver**

In `apps/web/src/service/database.service.ts`, change the mongodb import to include the `Db` type:

```ts
import { type Db, MongoClient, ServerApiVersion } from "mongodb";
```

Then append at the end of the file:

```ts
/**
 * Positive allowlist for this app's database. Bare `website` is production; the suffixed
 * forms are staging and the QA environments. Anything else — including the driver's silent
 * `test` fallback and the reserved `admin`/`local`/`config` — is refused.
 */
const WEBSITE_DB_PATTERN = /^website(-(staging|test|qa|e2e))?$/;

export function isAllowedWebsiteDbName(name: string): boolean {
  return WEBSITE_DB_PATTERN.test(name);
}

/**
 * The single place this app decides which database it talks to.
 *
 * The name comes from `MONGODB_URI`'s path segment (`client.db()` with no argument), never
 * from a literal — so one connection string fully determines the target, matching the
 * apps/admin model in docs/architecture/admin-database.md.
 *
 * Fails CLOSED: when the URI carries no path the driver silently resolves `test`, which would
 * otherwise write real data into a scratch database. See docs/architecture/likes-and-mongodb.md.
 */
export function getWebsiteDb(client: MongoClient): Db {
  const db = client.db();
  if (!isAllowedWebsiteDbName(db.databaseName)) {
    throw new Error(
      `[db] Refusing to use database "${db.databaseName}". MONGODB_URI must include a database ` +
        `path matching ${WEBSITE_DB_PATTERN}. When the URI has no path segment the MongoDB ` +
        `driver silently falls back to "test".`,
    );
  }
  return db;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @idcr/web test -- database.service`
Expected: PASS.

- [ ] **Step 5: Update the three test mocks BEFORE touching consumers**

Each of these currently mocks the module as `{ connect: vi.fn() }`; importing `getWebsiteDb` from it
would otherwise throw `getWebsiteDb is not a function`.

`src/service/like.service.test.ts:8` — replace that single line with:

```ts
vi.mock("./database.service", () => ({
  connect: vi.fn(),
  getWebsiteDb: vi.fn(() => ({ collection })),
}));
```

`src/service/predica/pdfJobs.test.ts:139` — replace with:

```ts
vi.mock("../database.service", () => ({
  connect: vi.fn(),
  getWebsiteDb: vi.fn(() => ({ collection })),
}));
```

`src/service/broadcast/broadcastLog.test.ts:8` — replace with:

```ts
vi.mock("../database.service", () => ({
  connect: vi.fn(),
  getWebsiteDb: vi.fn(() => ({ collection })),
}));
```

In each file, confirm the `collection` mock is declared **above** the `vi.mock` call (Vitest hoists
`vi.mock`; if `collection` is defined with `const` below it, wrap it in `vi.hoisted(...)` following
the pattern already used in `database.service.test.ts`). Run each suite after editing.

- [ ] **Step 6: Move the consumers onto the resolver**

`src/service/like.service.ts` — line 1 import, then both call sites:

```ts
import { connect, getWebsiteDb } from "./database.service";
```

Replace **both** occurrences of `const db = client.db("website");` with:

```ts
const db = getWebsiteDb(client);
```

`src/service/contact.service.ts` — line 2 import, then both call sites:

```ts
import { connect, getWebsiteDb } from "./database.service";
```

Replace **both** occurrences of `const db = client.db("website");` with:

```ts
const db = getWebsiteDb(client);
```

`src/service/predica/pdfJobs.ts` — update the import, delete the `DB_NAME` constant (line 17), and
change the one use (line 81):

```ts
import { connect, getWebsiteDb } from "../database.service";
```

```ts
const col = getWebsiteDb(client).collection<PdfJob>(COLLECTION);
```

`src/service/broadcast/broadcastLog.ts` — update the import, delete the `DB_NAME` constant (line 19),
and change **all three** uses (lines 68, 91, 106):

```ts
import { connect, getWebsiteDb } from "../database.service";
```

```ts
const col = getWebsiteDb(client).collection<BroadcastLogDocument>(COLLECTION);
```

- [ ] **Step 7: Verify no hardcoded database name survives**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-143/apps/web
grep -rn --include="*.ts" -E 'DB_NAME|\.db\("website"\)' src && echo "STILL PRESENT — fix" || echo "clean (expected)"
```

Expected: `clean (expected)`.

- [ ] **Step 8: Run the whole suite plus type-check and lint**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all green, no suite skipped. If a mocked `db` object now needs a `databaseName`, that means
a consumer is calling the real `getWebsiteDb` — re-check Step 5 for that file.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/service
git commit -m "fix(ICR-143): resolve the website database from MONGODB_URI with a fail-closed allowlist"
```

---

## Task 4: Docs, env template, changeset

**Files:**

- Modify: `apps/web/.env.example`
- Modify: `docs/architecture/likes-and-mongodb.md`
- Create: `.changeset/icr-143-pdf-trace-and-db-resolver.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Document the URI requirement in the env template**

In `apps/web/.env.example`, replace the `MONGODB_URI=` line with:

```bash
# MUST include the database path segment — e.g. .../website (production),
# .../website-staging (staging). The app resolves the database name from this path
# (src/service/database.service.ts#getWebsiteDb) and REFUSES to run without it:
# a URI with no path makes the MongoDB driver silently fall back to "test".
MONGODB_URI=
```

- [ ] **Step 2: Document the resolver and the deploy ordering**

Append to `docs/architecture/likes-and-mongodb.md`:

```markdown
## Which database, and why it is not a literal

`src/service/database.service.ts#getWebsiteDb(client)` is the only place this app decides which
database it talks to. It calls `client.db()` with **no argument**, so the name comes from the path
segment of `MONGODB_URI`, then asserts it against `^website(-(staging|test|qa|e2e))?$` and throws
otherwise.

Two reasons it works this way:

1. **The literal was wrong outside production.** Until ICR-143 the name `"website"` was hardcoded at
   9 call sites across `like.service.ts`, `contact.service.ts`, `predica/pdfJobs.ts` and
   `broadcast/broadcastLog.ts`. The staging cluster contains only `website-staging`, so every one of
   those sites targeted a database that does not exist there. It surfaced first in `pdf_jobs` purely
   because that is the only path calling `createIndex`, which fails loudly.
2. **The driver fails silently, so the check must fail loudly.** With no path segment in the URI,
   `client.db().databaseName` is `"test"` — a real database the driver will happily write to. The
   allowlist rejects `test`, the reserved `admin`/`local`/`config`, and near-misses like
   `website-prod`.

This mirrors `apps/admin` (see [admin-database.md](./admin-database.md)): one connection string
fully determines its target database, with a positive-allowlist assertion on top.

### Deploy ordering (important)

`getWebsiteDb` fails closed, so **the connection string must carry a database path before this code
runs**, or likes, contact, the sermon-PDF job queue and the broadcast log all stop working.

Appending the path is a **no-op for older code**, which passed an explicit `client.db("website")` and
ignored the URI path. So the safe order is always:

1. Append the database path to `MONGODB_URI` in Vercel (Production → `/website`,
   Preview/staging → `/website-staging`).
2. Confirm the running site still serves likes and the contact form.
3. Only then deploy the code that calls `getWebsiteDb`.

Local development needs the same path appended in `apps/web/.env.local`.
```

- [ ] **Step 3: Document why the tracing config exists**

This belongs with the sermon pipeline, not the database doc. Append to the existing
`docs/architecture/predica-rerun-idempotency.md`:

```markdown
## Why next.config.ts pins the file-tracing root (ICR-143)

The cron route renders PDFs with Chromium via `playwright-core`. That package reads its
`browsers.json` through a **runtime-computed** require —
`require(path.join(packageRoot, "browsers.json"))` in `lib/coreBundle.js` — which `@vercel/nft`'s
static analysis cannot see. The file therefore never entered the Lambda, and the every-minute cron
failed forever with `Cannot find module …/browsers.json` while the job stayed renderable.

`apps/web/next.config.ts` fixes this with two settings:

- `outputFileTracingRoot: path.join(__dirname, "../../")` — `playwright-core` resolves to the
  **repo-root** pnpm store, outside `apps/web`. Pinning the root also silences Next's
  "inferred your workspace root, but it may not be correct" multi-lockfile warning; the deployment
  must not depend on that heuristic.
- `outputFileTracingIncludes` — one file, keyed to `/api/predica/regenerate-pdf/cron` only. The
  webhook route never launches Chromium and must not get the include.

`pnpm --filter @idcr/web verify:trace` (CI job `trace-guard` in `.github/workflows/pr.yml`) asserts
the asset is still traced, so a `playwright-core` upgrade that moves the file fails the build instead
of silently breaking production. Do not "tidy away" either setting.
```

- [ ] **Step 4: Add the changeset**

Create `.changeset/icr-143-pdf-trace-and-db-resolver.md`:

```markdown
---
"@idcr/web": patch
---

Trace `playwright-core`'s `browsers.json` into the sermon-PDF cron function so production renders
instead of retrying forever, guard it in CI, and resolve the MongoDB database name from
`MONGODB_URI` with a fail-closed allowlist instead of a hardcoded literal.
```

- [ ] **Step 5: Format check**

Run: `pnpm format:check`
Expected: clean. If it fails, run `pnpm format` and re-stage.

- [ ] **Step 6: Commit**

```bash
git add apps/web/.env.example docs/architecture .changeset
git commit -m "docs(ICR-143): document the URI-derived database resolver and deploy ordering"
```

---

## Self-Review

**Spec coverage:** R1 → Task 1 Step 2. R2 → Task 1 Step 2 (+ budget check Step 4). R3 → Task 2
(script, test, package script, CI job, and a proof the guard can fail). R4 → Task 3. R5 → documented
in Task 4 Step 2 and carried into the PR Release Notes + its own Jira issue (orchestrator-owned, see
below). R6 → Task 4.

**Placeholder scan:** none — every step carries runnable commands or complete code.

**Type consistency:** `getWebsiteDb(client: MongoClient): Db` and `isAllowedWebsiteDbName(name:
string): boolean` are defined in Task 3 Step 3 and used under those exact names in Steps 1, 5 and 6.
`hasTracedAsset(files, basename)` is defined in Task 2 Step 3 and used under that name in Step 1.

**Outside these tasks (orchestrator, before PR-ready):** file the Vercel `MONGODB_URI` env change as
its own Jira issue linked to ICR-143 and ICR-133, with an explicit do-not-deploy-until guard.
