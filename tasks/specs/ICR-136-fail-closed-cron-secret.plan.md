# ICR-136 — Fail-Closed Shared Secret: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` +
> `superpowers:executing-plans` to implement this plan checkpoint-by-checkpoint. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Make every shared-secret guard in `apps/web` fail **closed** when its environment variable is
unset — fixing the `Bearer undefined` authentication bypass on `GET /api/predica/regenerate-pdf/cron`.

**Architecture:** One new pure helper module, `apps/web/src/utils/auth/secret.ts`, exporting
`isAuthorizedSecret()` (fail-closed + constant-time) and `extractBearerToken()`. The four route handlers
that compare a shared secret each extract their own candidate value and delegate the comparison to the
helper. No route changes its status code, response body, header name, or query param.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router route handlers (Node.js runtime),
`node:crypto`, Vitest 4, Playwright.

**Spec:** `tasks/specs/ICR-136-fail-closed-cron-secret.md` — read it first.

## Global Constraints

- **Functional-first.** No `class`. No custom `Error` subclass, no throwing for control flow. The helper
  returns a `boolean`.
- **Prefer `??` over `||`.** Prefer `interface` over `type` for object shapes.
- **Do not change any route's observable contract.** Status codes and response bodies stay
  byte-identical: cron → `{ message: "Unauthorized" }` / 401; regenerate-pdf → `{ message: "Invalid
secret" }` / 401; revalidate → `{ message: "Invalid secret" }` / 401; draft/enable → plain-text
  `"Invalid token"` / 401 (**not** JSON). The e2e spec asserts these verbatim — do not unify them.
- **Never print, log, or interpolate a secret value** into a message, error, or test name. Reference
  variable _names_ only.
- **Verified against the installed `.d.ts`:** vitest 4.1.9 types `stubEnv` as
  `(name: T, value: string | undefined) => VitestUtils` — so `vi.stubEnv("CRON_SECRET", undefined)`
  is valid and **deletes** the variable. Use it; do not assign `process.env.X` directly in new tests.
- **Commit messages:** Conventional Commits, header ≤ 100 chars, scoped `(ICR-136)`.
- Run all commands from the **worktree root** (`.claude/worktrees/ICR-136`). `pnpm` only, never npm/yarn.

## File Structure

| File                                                        | Responsibility                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/utils/auth/secret.ts`                         | **NEW.** The only place that decides whether a candidate secret is valid. Pure, no I/O. |
| `apps/web/src/utils/auth/secret.test.ts`                    | **NEW.** Exhaustive unit tests for the helper — the primary evidence for every AC.      |
| `apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts` | The fail-open bug. Rewire to the helper.                                                |
| `apps/web/src/app/api/predica/regenerate-pdf/route.ts`      | Explicit fail-closed guard.                                                             |
| `apps/web/src/app/api/revalidate/route.ts`                  | Explicit fail-closed guard.                                                             |
| `apps/web/src/app/api/draft/enable/route.ts`                | Explicit fail-closed guard (query param, not header).                                   |
| The four colocated `route.test.ts`                          | + unset-secret cases asserting 401 **and** no downstream work.                          |
| `apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts`     | + `Bearer undefined` cases; fix the stale doc comment.                                  |

---

## Checkpoint 1: The fail-closed timing-safe helper (TDD)

**Files:**

- Create: `apps/web/src/utils/auth/secret.ts`
- Test: `apps/web/src/utils/auth/secret.test.ts`

**Interfaces:**

- Consumes: nothing (leaf module).
- Produces — every later checkpoint depends on these exact signatures:

  ```ts
  export function isAuthorizedSecret(
    candidate: string | null | undefined,
    expected: string | undefined,
  ): boolean;

  export function extractBearerToken(header: string | null): string | null;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/utils/auth/secret.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { extractBearerToken, isAuthorizedSecret } from "./secret";

const SECRET = "s3cret-cron-value";

describe("isAuthorizedSecret", () => {
  // --- The ICR-136 vulnerability: unset config must authenticate NOBODY. ---
  it("rejects the literal string 'undefined' when the expected secret is unset", () => {
    expect(isAuthorizedSecret("undefined", undefined)).toBe(false);
  });

  it("rejects every candidate when the expected secret is unset", () => {
    for (const candidate of ["undefined", "null", "", "anything", SECRET]) {
      expect(isAuthorizedSecret(candidate, undefined)).toBe(false);
    }
    expect(isAuthorizedSecret(null, undefined)).toBe(false);
    expect(isAuthorizedSecret(undefined, undefined)).toBe(false);
  });

  it("treats an empty-string expected secret as unset (misconfiguration, not a credential)", () => {
    expect(isAuthorizedSecret("", "")).toBe(false);
    expect(isAuthorizedSecret("anything", "")).toBe(false);
  });

  // --- Normal comparison, secret configured. ---
  it("accepts an exact match", () => {
    expect(isAuthorizedSecret(SECRET, SECRET)).toBe(true);
  });

  it("rejects a missing candidate", () => {
    expect(isAuthorizedSecret(null, SECRET)).toBe(false);
    expect(isAuthorizedSecret(undefined, SECRET)).toBe(false);
    expect(isAuthorizedSecret("", SECRET)).toBe(false);
  });

  it("rejects a same-length mismatch", () => {
    const sameLength = "S3CRET-CRON-VALUE";
    expect(sameLength).toHaveLength(SECRET.length);
    expect(isAuthorizedSecret(sameLength, SECRET)).toBe(false);
  });

  it("rejects a prefix of the secret without throwing (timingSafeEqual needs equal lengths)", () => {
    expect(() => isAuthorizedSecret("s3cret", SECRET)).not.toThrow();
    expect(isAuthorizedSecret("s3cret", SECRET)).toBe(false);
  });

  it("rejects a longer candidate that starts with the secret", () => {
    expect(isAuthorizedSecret(`${SECRET}-extra`, SECRET)).toBe(false);
  });

  it("compares multi-byte UTF-8 by bytes without throwing", () => {
    expect(isAuthorizedSecret("clavé-ñ", "clavé-ñ")).toBe(true);
    expect(isAuthorizedSecret("clave-n", "clavé-ñ")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken(`Bearer ${SECRET}`)).toBe(SECRET);
  });

  it("returns null for a missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null for a malformed header", () => {
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken(`Bearer${SECRET}`)).toBeNull();
    expect(extractBearerToken(SECRET)).toBeNull();
  });

  it("requires the exact 'Bearer ' scheme prefix (matches the pre-fix behaviour)", () => {
    expect(extractBearerToken(`bearer ${SECRET}`)).toBeNull();
    expect(extractBearerToken(`BEARER ${SECRET}`)).toBeNull();
  });

  // The end-to-end shape of the bug: an unset CRON_SECRET + this header used to authenticate.
  it("yields a token that does NOT authenticate against an unset secret", () => {
    const token = extractBearerToken("Bearer undefined");
    expect(token).toBe("undefined");
    expect(isAuthorizedSecret(token, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/auth/secret.test.ts
```

Expected: FAIL — `Failed to resolve import "./secret"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/utils/auth/secret.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time shared-secret check that FAILS CLOSED on missing configuration (ICR-136).
 *
 * The `!expected` guard is the fix: the previous `authHeader !== `Bearer ${process.env.CRON_SECRET}``
 * interpolated an unset variable into the literal string "Bearer undefined", which any caller could
 * then send to authenticate. An unset — or empty — secret must authenticate nobody.
 *
 * Requires the Node.js runtime (`node:crypto`). Every caller is a Node route handler; Next's App
 * Router defaults route handlers to the Node runtime and none of them opts into edge.
 */
export function isAuthorizedSecret(
  candidate: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!candidate) return false;

  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  // `timingSafeEqual` throws on unequal lengths, so the length must be checked first. This leaks
  // the secret's LENGTH — the accepted tradeoff of every timing-safe comparison.
  if (candidateBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Extracts `<token>` from an `Authorization: Bearer <token>` header, or null if absent/malformed.
 *
 * The `"Bearer "` prefix is matched exactly (capital B, single space), preserving the behaviour the
 * pre-ICR-136 template literal implied. RFC 7235 makes the scheme case-insensitive; loosening it is
 * deliberately out of scope.
 */
export function extractBearerToken(header: string | null): string | null {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return null;

  const token = header.slice(prefix.length);
  return token.length > 0 ? token : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/auth/secret.test.ts
```

Expected: PASS. **Confirm the file name appears in the vitest output with a non-zero test count** —
ICR-21 lesson: a test file outside `vitest.config.ts`'s `include` globs is _silently skipped_, showing
green. `src/**/*.{test,spec}.{ts,tsx}` covers this path, so it must appear. If it does not, stop.

- [ ] **Step 5: Full verify**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green; the pre-existing 438 tests still pass, plus the new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/auth/secret.ts apps/web/src/utils/auth/secret.test.ts
git commit -m "fix(ICR-136): add fail-closed timing-safe shared-secret helper"
```

---

## Checkpoint 2: Wire the four routes

**Files:**

- Modify: `apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts:49-53`
- Modify: `apps/web/src/app/api/predica/regenerate-pdf/route.ts:14-18`
- Modify: `apps/web/src/app/api/revalidate/route.ts:5-10`
- Modify: `apps/web/src/app/api/draft/enable/route.ts:5-12`
- Test: the four colocated `route.test.ts` files

**Interfaces:**

- Consumes: `isAuthorizedSecret`, `extractBearerToken` from Checkpoint 1 (signatures above).
- Produces: nothing new. Route contracts are unchanged.

- [ ] **Step 1: Write the failing route tests**

**(a) `apps/web/src/app/api/predica/regenerate-pdf/cron/route.test.ts`** — the existing `beforeEach`
sets `process.env.CRON_SECRET = SECRET` directly. Replace _that one line_ with
`vi.stubEnv("CRON_SECRET", SECRET);`, add `afterEach(() => { vi.unstubAllEnvs(); });`, and import
`afterEach` from vitest. Then append inside the existing `describe("GET /api/predica/regenerate-pdf/cron")`:

```ts
// --- ICR-136: the guard must fail CLOSED when CRON_SECRET is unset. ---
it("401s on 'Bearer undefined' when CRON_SECRET is unset, without querying jobs", async () => {
  vi.stubEnv("CRON_SECRET", undefined);

  const res = await GET(req("Bearer undefined"));

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ message: "Unauthorized" });
  expect(selectRenderableJobs).not.toHaveBeenCalled();
  expect(claimJob).not.toHaveBeenCalled();
});

it("401s on a missing Authorization header when CRON_SECRET is unset", async () => {
  vi.stubEnv("CRON_SECRET", undefined);

  const res = await GET(req(null));

  expect(res.status).toBe(401);
  expect(selectRenderableJobs).not.toHaveBeenCalled();
  expect(claimJob).not.toHaveBeenCalled();
});

it("401s on 'Bearer ' + the empty string when CRON_SECRET is unset", async () => {
  vi.stubEnv("CRON_SECRET", undefined);

  const res = await GET(req("Bearer "));

  expect(res.status).toBe(401);
  expect(selectRenderableJobs).not.toHaveBeenCalled();
});
```

**(b) `apps/web/src/app/api/predica/regenerate-pdf/route.test.ts`** — same `vi.stubEnv` /
`vi.unstubAllEnvs` conversion for `PREDICA_REGEN_SECRET`, then append inside its `describe`:

```ts
// --- ICR-136: fail closed, by intent rather than by type-coercion accident. ---
it("401s for every x-predica-regen-key value when PREDICA_REGEN_SECRET is unset", async () => {
  vi.stubEnv("PREDICA_REGEN_SECRET", undefined);

  for (const key of ["undefined", "", "anything"]) {
    const res = await POST(req(sermonPayload("e1"), key));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Invalid secret" });
  }

  const noHeader = await POST(req(sermonPayload("e1"), null));
  expect(noHeader.status).toBe(401);

  expect(markDirty).not.toHaveBeenCalled();
  expect(getSermonById).not.toHaveBeenCalled();
});
```

**(c) `apps/web/src/app/api/revalidate/route.test.ts`** — it already uses `vi.stubEnv`. Append:

```ts
it("401s when CONTENTFUL_REVALIDATE_SECRET is unset, without revalidating or notifying", async () => {
  vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", undefined);

  for (const secret of ["undefined", "", "anything"]) {
    const res = await POST(req({}, secret));
    expect(res.status).toBe(401);
  }

  expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled();
  expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
});
```

**(d) `apps/web/src/app/api/draft/enable/route.test.ts`** — its `beforeEach` assigns
`process.env.CONTENTFUL_PREVIEW_SECRET = SECRET` directly. Convert to
`vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", SECRET);`, add `afterEach(() => { vi.unstubAllEnvs(); });`,
then append:

```ts
it("401s when CONTENTFUL_PREVIEW_SECRET is unset, without enabling draft mode", async () => {
  vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", undefined);

  for (const secret of ["undefined", "anything"]) {
    const res = await GET(makeRequest({ secret, locale: "es-AR" }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid token");
  }

  expect(enable).not.toHaveBeenCalled();
  expect(mockRedirect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

```bash
pnpm --filter @idcr/web exec vitest run src/app/api
```

Expected: the four new tests FAIL. The cron's `Bearer undefined` case fails with **`expected 200 to be
401`** — that failure _is_ the reproduction of the vulnerability. (The other three routes already fail
closed by accident, so their new tests may pass immediately; that is expected and fine — they are
regression locks.)

- [ ] **Step 3: Rewire `cron/route.ts` — the bug fix**

Add the import alongside the existing `@src/...` imports:

```ts
import { extractBearerToken, isAuthorizedSecret } from "@src/utils/auth/secret";
```

Replace lines 50–53:

```ts
const token = extractBearerToken(request.headers.get("authorization"));
if (!isAuthorizedSecret(token, process.env.CRON_SECRET)) {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}
```

- [ ] **Step 4: Rewire `regenerate-pdf/route.ts`**

Add `import { isAuthorizedSecret } from "@src/utils/auth/secret";` and replace lines 15–18:

```ts
const key = request.headers.get("x-predica-regen-key");
if (!isAuthorizedSecret(key, process.env.PREDICA_REGEN_SECRET)) {
  return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
}
```

- [ ] **Step 5: Rewire `revalidate/route.ts`**

Add `import { isAuthorizedSecret } from "@src/utils/auth/secret";` and replace lines 6–10:

```ts
const secret = request.headers.get("x-vercel-reval-key");

if (!isAuthorizedSecret(secret, process.env.CONTENTFUL_REVALIDATE_SECRET)) {
  return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
}
```

- [ ] **Step 6: Rewire `draft/enable/route.ts`**

Add `import { isAuthorizedSecret } from "@src/utils/auth/secret";` and replace line 10's condition.
The response stays a **plain-text** `Response`, not JSON:

```ts
if (!isAuthorizedSecret(secret, process.env.CONTENTFUL_PREVIEW_SECRET)) {
  return new Response("Invalid token", { status: 401 });
}
```

- [ ] **Step 7: Run the route tests to verify they pass**

```bash
pnpm --filter @idcr/web exec vitest run src/app/api
```

Expected: PASS, including every pre-existing test in those four files (the happy paths prove the
secret-IS-set behaviour is unchanged).

- [ ] **Step 8: Full verify, including the build**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Expected: all green. If `pnpm build` fails with `ERR_INVALID_URL` / `input: 'undefined'`, that is the
known missing-`.env.local` environmental failure (ICR-39 lesson), **not** a code defect — the file has
already been copied to the worktree root, so this should not occur.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api
git commit -m "fix(ICR-136): fail closed when a route's shared secret is unset"
```

---

## Checkpoint 3: E2E spec + the stale doc comment

**Files:**

- Modify: `apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts`

**Interfaces:** none — Playwright specs are leaves. They run against the PR's **Vercel preview** during
QA (`BASE_URL`), never locally. Preview has **no** `CRON_SECRET`, which is exactly why the
`Bearer undefined` case is a meaningful live regression test there.

- [ ] **Step 1: Correct the file's doc comment**

Replace the existing header comment (lines 1–12). It currently claims these routes fail closed on
preview — the precise thing that was false for the cron. It documented the bug as the guarantee:

```ts
/**
 * ICR-114 / ICR-136: E2E spec for the predica PDF-regen webhook + cron AUTH BOUNDARY ONLY.
 *
 * Safety note: PREDICA_REGEN_SECRET / CRON_SECRET / CONTENTFUL_MANAGEMENT_ACCESS_TOKEN /
 * MONGODB_URI are NOT set on preview deployments (env-limited, see ICR-44 lesson + the cron
 * route's own doc comment: Vercel Cron only ever invokes production, never a preview). These
 * tests therefore exercise ONLY the fail-closed auth rejection — they never send a valid secret
 * and never reach the mark-dirty/render/write-back path. The happy path is BLOCKED on preview and
 * deferred to post-merge staging QA, where the secrets exist.
 *
 * ICR-136: an unset secret used to authenticate the CALLER rather than reject them. The cron
 * interpolated `process.env.CRON_SECRET` into a template literal, so with the variable unset the
 * expected value became the literal string "Bearer undefined" — and anyone sending that header was
 * let in (confirmed 200 against staging on 2026-07-10). Because preview is an environment WITHOUT
 * CRON_SECRET, the `Bearer undefined` tests below are a live regression check on exactly the
 * environment that was vulnerable. They must return 401.
 */
```

- [ ] **Step 2: Add the cron `Bearer undefined` regression test**

Append inside `test.describe("/api/predica/regenerate-pdf/cron auth boundary")`:

```ts
test("returns 401 for 'Bearer undefined' — the ICR-136 unset-secret bypass", async ({
  request,
}) => {
  const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`, {
    headers: { Authorization: "Bearer undefined" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toEqual({ message: "Unauthorized" });
});
```

- [ ] **Step 3: Add the webhook's matching regression lock**

Append inside `test.describe("/api/predica/regenerate-pdf webhook auth boundary")`:

```ts
test("returns 401 for the literal 'undefined' x-predica-regen-key (ICR-136 lock)", async ({
  request,
}) => {
  const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
    data: {
      sys: { id: "qa-icr136-test", contentType: { sys: { id: "sermon" } } },
    },
    headers: {
      "Content-Type": "application/json",
      "x-predica-regen-key": "undefined",
    },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toEqual({ message: "Invalid secret" });
});
```

- [ ] **Step 4: Verify**

```bash
pnpm type-check && pnpm lint
```

Expected: green. Do **not** run `pnpm e2e` locally — the spec targets `BASE_URL` (the Vercel preview);
the `qa-runner` executes it during preview QA.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts
git commit -m "test(ICR-136): cover the Bearer undefined bypass in the auth e2e spec"
```

---

## Definition of done

Every acceptance criterion on ICR-136, mapped to its evidence:

| AC                                                                               | Evidence                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `CRON_SECRET` unset + `Bearer undefined` → 401                                   | CP1 helper unit test + CP2 cron route test + CP3 e2e spec                    |
| `CRON_SECRET` unset + no `Authorization` → never 200, never selects/claims a job | CP2 cron route test asserts `selectRenderableJobs` / `claimJob` never called |
| `CRON_SECRET` set → 200, jobs processed, behaviour unchanged                     | The pre-existing cron happy-path tests still pass                            |
| `PREDICA_REGEN_SECRET` unset → 401 for every key value, incl. absent             | CP2 webhook route test                                                       |
| `pnpm type-check`, `pnpm lint`, `pnpm test` green                                | CP1 Step 5, CP2 Step 8                                                       |

Docs are evaluated separately at `/work` step 13.5, after QA passes.
