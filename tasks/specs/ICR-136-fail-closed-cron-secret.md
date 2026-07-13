# ICR-136 — Fail closed when a shared secret is unset

**Type:** Bug (`fix`) · **Priority:** Highest · **Labels:** `predica`, `security`
**Jira:** https://divinelab.atlassian.net/browse/ICR-136
**Sensitive areas:** `env-secrets` (a route that reaches a Contentful **write** token path), public API surface (`apps/web/src/app/api/**`).

## Problem

`GET /api/predica/regenerate-pdf/cron` (added by ICR-114, PR #81, v1.25.0) interpolates its shared
secret into a template literal:

```ts
// apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts:50-51
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  /* 401 */
}
```

When `CRON_SECRET` is unset, `${undefined}` stringifies and the expected value becomes the literal
string `Bearer undefined`. Any unauthenticated caller sending exactly that header passes the check.
Verified live against `staging` on 2026-07-10: `Authorization: Bearer undefined` → `200`.

Impact is bounded today (the `pdf_jobs` collection does not exist yet, and `buildCmaClient()` fails
closed without `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`), but this is a **public, unauthenticated
trigger for a Chromium render + Contentful CMA write path, in a public repository**. The moment
`CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` reaches any environment lacking `CRON_SECRET`, it becomes an
unauthenticated write into the **production** Contentful environment — `resolveCmaEnvironment()`
defaults to `production` when `CONTENTFUL_ENVIRONMENT` is unset.

A shared-secret guard must fail **closed** on missing configuration, never open.

### Audit: every shared-secret comparison in the repo

Read on branch `fix/ICR-136-fail-closed-cron-secret` (off `origin/main` @ a58cd21):

| Route                                     | Current comparison                                     | When env var is unset                                       |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| `predica/regenerate-pdf/cron/route.ts:51` | `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` | **FAILS OPEN** — `Bearer undefined` authenticates           |
| `predica/regenerate-pdf/route.ts:16`      | `key !== process.env.PREDICA_REGEN_SECRET`             | Fails closed — _by accident_ (`string\|null !== undefined`) |
| `revalidate/route.ts:8`                   | `secret !== process.env.CONTENTFUL_REVALIDATE_SECRET`  | Fails closed — _by accident_                                |
| `draft/enable/route.ts:10`                | `secret !== process.env.CONTENTFUL_PREVIEW_SECRET`     | Fails closed — _by accident_                                |

Only the cron is exploitable. The other three are safe purely because a `string | null` never equals
`undefined` — a type-coercion accident, not a decision. Any future refactor into a template literal
silently reintroduces the vulnerability.

## Decisions (locked at the design gate)

1. **Shared helper, applied to all four routes.** Wider than the letter of the ticket (which named
   two), approved by the maintainer. Converts three accidental fail-closeds into intentional ones and
   gives future routes one obvious thing to call.
2. **Timing-safe comparison** (`crypto.timingSafeEqual`) inside the helper. Practical risk over HTTPS
   is low, but this is a security-labelled route guarding a CMA write token and the cost is ~4 lines
   in one place.

## Dependencies check

Everything required already exists — no new packages, no config changes.

- `node:crypto` — Node standard library. All four routes run on the **Node.js runtime**: none declares
  `export const runtime`, and Next's App Router route-handler default is `nodejs`.
- Vitest 4 (`apps/web/vitest.config.ts`), whose `include` already globs `src/**/*.{test,spec}.{ts,tsx}`
  — a new `src/utils/auth/secret.test.ts` is picked up with no config change. (ICR-21 lesson: a test
  file outside the include globs is _silently_ skipped. `src/**` covers this one; verify the file
  actually executes in the vitest output.)
- All four routes already have a colocated `route.test.ts`.
- `apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts` exists (Playwright project `apiForms`).

## Requirements

1. **R1 — New unit: `apps/web/src/utils/auth/secret.ts`.** Two pure, side-effect-free named exports.

   ```ts
   import { timingSafeEqual } from "node:crypto";

   /**
    * Constant-time shared-secret check that FAILS CLOSED on missing configuration.
    * Requires the Node.js runtime (`node:crypto`); every caller is a Node route handler.
    */
   export function isAuthorizedSecret(
     candidate: string | null | undefined,
     expected: string | undefined,
   ): boolean {
     if (!expected) return false; // unset/empty config authenticates NOBODY — the ICR-136 fix
     if (!candidate) return false;

     const candidateBytes = Buffer.from(candidate, "utf8");
     const expectedBytes = Buffer.from(expected, "utf8");
     // timingSafeEqual throws on unequal lengths; the early return leaks only the
     // secret's LENGTH, which is an accepted tradeoff of every timing-safe compare.
     if (candidateBytes.length !== expectedBytes.length) return false;

     return timingSafeEqual(candidateBytes, expectedBytes);
   }

   /** Extracts `<token>` from an `Authorization: Bearer <token>` header. */
   export function extractBearerToken(header: string | null): string | null {
     if (!header?.startsWith("Bearer ")) return null;
     const token = header.slice("Bearer ".length);
     return token.length > 0 ? token : null;
   }
   ```

   - The `!expected` guard runs **before** any comparison. That single line is the fix.
   - An **empty-string** secret (`CRON_SECRET=""`) is treated as unset — `!""` is `true`. Deliberate:
     an empty secret is a misconfiguration, not a credential.
   - `extractBearerToken` keeps the **strict** `"Bearer "` prefix (capital B, single space) that the
     current template literal implies. RFC 7235 says the scheme is case-insensitive, but Vercel sends
     `Bearer` and loosening it here would be a behavior change beyond this ticket's scope.

2. **R2 — `cron/route.ts` (the fail-open fix).** Replace lines 50–53 with:

   ```ts
   const token = extractBearerToken(request.headers.get("authorization"));
   if (!isAuthorizedSecret(token, process.env.CRON_SECRET)) {
     return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
   }
   ```

   Status code (`401`) and body (`{ message: "Unauthorized" }`) unchanged.

3. **R3 — `regenerate-pdf/route.ts`.** Replace lines 15–18:

   ```ts
   const key = request.headers.get("x-predica-regen-key");
   if (!isAuthorizedSecret(key, process.env.PREDICA_REGEN_SECRET)) {
     return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
   }
   ```

   Body stays `{ message: "Invalid secret" }` — do **not** unify it with the cron's message; the e2e
   spec asserts each verbatim.

4. **R4 — `revalidate/route.ts`.** Same shape, guarding `CONTENTFUL_REVALIDATE_SECRET` against the
   `x-vercel-reval-key` header. Body stays `{ message: "Invalid secret" }`. `revalidateTag` must remain
   unreachable for an unauthorized caller.

5. **R5 — `draft/enable/route.ts`.** Same shape, guarding `CONTENTFUL_PREVIEW_SECRET` against the
   `?secret=` **query param** (not a header). Response stays a plain `new Response("Invalid token",
{ status: 401 })` — not JSON.

6. **R6 — No behavior change when the secret IS set.** A correct credential still returns 200 and does
   the work, on every one of the four routes.

## API changes

None. No route gains, loses, or changes a status code, response body, header name, or query param.
This is a pure hardening of four existing guards. No Zod schema changes (the webhook's `bodySchema` is
untouched, and it is only reached _after_ the auth guard).

## Data model changes

None. No Contentful content-model change (so the Contentful model-change gate does **not** apply), no
Mongo schema or index change.

## New / modified files

| File                                                             | Change                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/utils/auth/secret.ts`                              | **NEW** — `isAuthorizedSecret()` + `extractBearerToken()`     |
| `apps/web/src/utils/auth/secret.test.ts`                         | **NEW** — unit tests for the helper (the core of this ticket) |
| `apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts`      | Fail-closed guard (**the bug fix**)                           |
| `apps/web/src/app/api/predica/regenerate-pdf/route.ts`           | Explicit fail-closed guard                                    |
| `apps/web/src/app/api/revalidate/route.ts`                       | Explicit fail-closed guard                                    |
| `apps/web/src/app/api/draft/enable/route.ts`                     | Explicit fail-closed guard                                    |
| `apps/web/src/app/api/predica/regenerate-pdf/cron/route.test.ts` | + unset-secret cases                                          |
| `apps/web/src/app/api/predica/regenerate-pdf/route.test.ts`      | + unset-secret cases                                          |
| `apps/web/src/app/api/revalidate/route.test.ts`                  | + unset-secret case                                           |
| `apps/web/src/app/api/draft/enable/route.test.ts`                | + unset-secret case                                           |
| `apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts`          | + `Bearer undefined` case; correct the stale doc comment      |
| `docs/architecture/forms-and-email.md` _(or nearest)_            | Document the fail-closed invariant (evaluated at step 13.5)   |

No `class` is introduced. The helper is two pure functions returning a `boolean` — consistent with the
repo's functional-first rule (no custom `Error` subclass, no throwing for control flow).

## Component hierarchy

Not applicable — no UI, no components, no i18n strings. Nothing user-facing changes.

```
src/utils/auth/secret.ts
  ├── isAuthorizedSecret()  <-- api/predica/regenerate-pdf/cron/route.ts  (Bearer <CRON_SECRET>)
  │                         <-- api/predica/regenerate-pdf/route.ts       (x-predica-regen-key)
  │                         <-- api/revalidate/route.ts                   (x-vercel-reval-key)
  │                         <-- api/draft/enable/route.ts                 (?secret=)
  └── extractBearerToken()  <-- api/predica/regenerate-pdf/cron/route.ts
```

## Edge cases

| #   | Case                                                                                   | Expected                                                                         |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Secret unset, header `Authorization: Bearer undefined`                                 | **401** — the reported vulnerability                                             |
| 2   | Secret unset, no `Authorization` header at all                                         | 401                                                                              |
| 3   | Secret unset, header `Bearer ` + the correct-for-another-env value                     | 401                                                                              |
| 4   | Secret set to `""` (empty string)                                                      | 401 for every candidate — empty config authenticates nobody                      |
| 5   | Secret set, correct `Bearer <secret>`                                                  | **200**, jobs processed — unchanged behavior                                     |
| 6   | Secret set, candidate is a **prefix** of it (`"abc"` vs `"abcdef"`)                    | 401 via the length check, before `timingSafeEqual` (which would otherwise throw) |
| 7   | Secret set, candidate same length but different                                        | 401 via `timingSafeEqual`                                                        |
| 8   | Header present but malformed: `Bearer` (no token), `Bearerabc`, `bearer x` (lowercase) | `extractBearerToken` → `null` → 401                                              |
| 9   | Candidate contains multi-byte UTF-8                                                    | Compared by **byte** length; no throw                                            |
| 10  | Unauthorized call to the cron                                                          | Never reaches `selectRenderableJobs` / `claimJob` — asserted, not assumed        |
| 11  | Unauthorized call to the webhook                                                       | Never reaches `markDirty`                                                        |
| 12  | Unauthorized call to revalidate                                                        | Never reaches `revalidateTag` / `notifyOnPublish`                                |

## i18n

None. No user-facing strings; the 401 bodies are machine-facing and stay in English, exactly as today.

## Testing strategy

**Unit (`pnpm test`) — the primary evidence for every AC.**

- `secret.test.ts` (new): every row of the Edge Cases table above, driven directly against the helper.
  The keystone assertion: `isAuthorizedSecret("undefined", undefined) === false` — the literal string
  `"undefined"` must not authenticate against unset config.
- The four `route.test.ts` files: add unset-secret cases. Assert **both** the 401 **and** that the
  downstream service was never called (`selectRenderableJobs`, `claimJob`, `markDirty`,
  `revalidateTag`). A 401 alone doesn't prove the route didn't do work.
- **Use `vi.stubEnv`** (the established pattern in `revalidate/route.test.ts` and the mailing/subscribe
  service tests) rather than assigning `process.env.X` directly — the predica route tests currently
  assign directly in `beforeEach`, which makes "unset" awkward and leaks across files. Confirm against
  the **installed** vitest 4 types that `vi.stubEnv(name, undefined)` deletes the variable (ICR-44
  lesson: bind to the installed `.d.ts`, never to memory); if it doesn't, `delete process.env.X` inside
  the test with a `beforeEach`/`afterEach` restore.

**E2E (`apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts`, project `apiForms`).**

- Add: `GET /api/predica/regenerate-pdf/cron` with `Authorization: Bearer undefined` → **401**. This is
  a live regression test — the Vercel **preview** deployment has no `CRON_SECRET`, so preview is
  precisely the vulnerable environment, and the spec runs against preview.
- Add the same `x-predica-regen-key: undefined` case for the webhook (currently fails closed; lock it in).
- **Correct the stale doc comment** at the head of that file: it asserts these routes are fail-closed
  by default on preview, which is exactly what was _false_ for the cron. It documents the bug as if it
  were the guarantee.
- Existing happy-path coverage stays deferred to post-merge staging QA — preview lacks the secrets
  (ICR-44 lesson: env-limited ⇒ BLOCKED, not FAIL).

**Manual smoke (post-merge, staging).** `curl -H "Authorization: Bearer undefined"
https://staging.idcredentor.org/api/predica/regenerate-pdf/cron` must return **401** (it returns 200
today). This is the direct reproduction of the reported bug and the single most convincing proof.

## Implementation checkpoints

### CP1 — The helper (TDD)

- **Files:** `apps/web/src/utils/auth/secret.ts` (new), `apps/web/src/utils/auth/secret.test.ts` (new)
- **Do:** write the failing tests first (all 12 edge cases), then the implementation.
- **Verify:** `pnpm test` — confirm `secret.test.ts` actually appears in the vitest output (ICR-21:
  a file outside the include globs is silently skipped); `pnpm type-check`; `pnpm lint`.
- **Commit:** `fix(ICR-136): add fail-closed timing-safe shared-secret helper`

### CP2 — Wire the four routes

- **Files:** the four `route.ts` + their four `route.test.ts`
- **Do:** replace each guard with `isAuthorizedSecret(...)`; add the unset-secret route tests
  (401 **and** downstream service never called). Keep every status code and response body byte-identical.
- **Verify:** `pnpm test` (all 438 pre-existing tests still green + the new ones), `pnpm type-check`,
  `pnpm lint`, `pnpm build`.
- **Commit:** `fix(ICR-136): fail closed when a route's shared secret is unset`

### CP3 — E2E spec + docs

- **Files:** `apps/web/e2e/api/forms.predica-regen-pdf-auth.spec.ts`, docs per the step-13.5 evaluation
- **Do:** add the `Bearer undefined` cases; rewrite the stale doc comment.
- **Verify:** `pnpm lint`, `pnpm type-check`. (The spec runs against the PR's Vercel preview during QA,
  not locally — preview is where `CRON_SECRET` is unset.)
- **Commit:** `test(ICR-136): cover the Bearer undefined bypass in the auth e2e spec`

## Open questions

1. **Should the four routes pin `export const runtime = "nodejs"`?** The helper depends on
   `node:crypto`. Node is already the App Router default and no route in the repo declares a runtime, so
   pinning only these four would be inconsistent — decided **no**, with the requirement documented in the
   helper's JSDoc instead. Worth revisiting if the app ever adopts the edge runtime. (Flagged for review;
   a reviewer may reasonably push the other way.)
2. **`CRON_SECRET` is still unset on Vercel `staging`** — RESOLVED, no follow-up ticket needed. This fix
   makes the endpoint fail closed there, which also means the staging cron cannot run _at all_ until the
   variable is set. Setting it is deliberately **out of scope** here (code-only ticket). Checked
   **ICR-133** (`deferred-prod-action`, In Progress): it already instructs "Also set `CRON_SECRET` in the
   `staging` environment", carries the acceptance criterion "`CRON_SECRET` is set in **both** the
   Production and `staging` Vercel environments", _and_ asserts `GET …/cron` must return 401 for
   `Authorization: Bearer undefined` — the exact bug this ticket fixes. ICR-133 names ICR-136 as its
   blocker. The standing deferred-production-actions rule is therefore already satisfied.
