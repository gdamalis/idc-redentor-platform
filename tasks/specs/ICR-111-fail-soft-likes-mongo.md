# ICR-111 — Fail-soft likes: article pages must survive a Mongo outage

**Issue:** [ICR-111](https://divinelab.atlassian.net/browse/ICR-111) — Bug · Priority Highest · Component: Website
**Commit type:** `fix` · **Branch:** `fix/ICR-111-fail-soft-likes-mongo` · **QA depth:** heavy
**Sensitive area:** `likes-mongo` (touches `src/service/**` + `src/app/api/**`)

## Problem

`getLikes()` throws `new Error("Failed to connect to database")` when `connect()` returns `undefined`
(`like.service.ts:19-22`; same in `toggleLike()` at `:44-47`). Both article pages `await` it unguarded
at the top level of the server component — `blog/[slug]/page.tsx:71` and `predicas/[slug]/page.tsx:63`
— and **no `error.tsx` / `global-error.tsx` exists anywhere in `apps/web/src/app`**. So the throw
crashes the RSC render: every blog _and_ sermon article page 500s whenever Mongo is unavailable
(observed as digest `4282309776` on Vercel preview, where `MONGODB_URI` is unset).

The blog "like" is, per `docs/product/scope-and-boundaries.md`, the _single_ interactive reader feature
and explicitly "lightweight". It must never be able to take down the article itself. A like-counter
outage degrading to "no heart" is invisible; a 500 is a broken site.

**Beyond the ticket's literal wording:** `connect()` pings on every call (`database.service.ts:40-41`),
so a fully-down Mongo is caught there. But the collection queries (`findOne` at `like.service.ts:28`,
`:53`) can still throw _after_ a successful connect+ping — mid-request drop, auth failure, timeout, or a
`serverApi.strict: true` rejection. Today those land in the `catch` that **logs and rethrows** (`:34-37`),
which 500s the page identically. Fixing only the `!client` branch would fix the preview symptom while
leaving a live 500 path open for a real production outage. **Decision (approved): fail soft on both.**

## Dependencies Check

Everything needed already exists on `main` (worktree base `7853ed4`). Nothing to build first.

| Dependency                                       | Status | Notes                                                               |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| `connect()` returns `MongoClient \| undefined`   | ✅     | `database.service.ts:37-49` — contract **unchanged** by this ticket |
| `vi.mock("../database.service", …)` test pattern | ✅     | `broadcast/broadcastLog.test.ts:8` — reuse verbatim                 |
| Fail-soft precedent in a Mongo service           | ✅     | `broadcastLog.ts:66,83` returns `"error"` rather than throwing      |
| API route-test pattern                           | ✅     | `api/subscribe/route.test.ts`, `api/revalidate/route.test.ts`       |
| `LikeButton` reverts optimistic state on `!ok`   | ✅     | `LikeButton.tsx:70-73` — needs **no change**                        |

## Requirements

1. **`getLikes()` and `toggleLike()` never throw.** Both return `Promise<LikesOutcome>` (below).
   The `!client` branch and the `catch` block both resolve to `{ ok: false, reason: "db-unavailable" }`.
2. **The underlying error is logged, not thrown.** Both `catch` blocks keep their existing
   `console.error("Error fetching likes:" | "Error toggling like:", error)` call, then return the
   failed outcome instead of `throw error`.
3. **`connect()` is untouched.** Its shared consumers (`contact.service`, `predica/pdfJobs`,
   `broadcast/broadcastLog`) must keep failing loudly — a dropped contact message is not a dropped like.
4. **`/api/likes` returns 503 on DB-unavailable**, for both `GET` and `POST`, with body
   `{ error: "Service Unavailable" }`. It never fabricates a count.
5. **The 200 wire contract is byte-identical to today**: `{ count, hasLiked }`. The `ok` discriminant is
   stripped before responding, so `LikeButton.toggleLikeApi` (which parses the body straight into
   `LikeState`) needs no change.
6. **Genuine bugs still 500.** The routes' outer `try/catch` stays and still returns 500 — a malformed
   `request.json()` body must not be laundered into a 503.
7. **The like control is absent, not zeroed,** when likes are unavailable. `PostActions` takes a single
   optional `likes?: Likes` prop (absent ⇒ unavailable) instead of `initialLikeCount` +
   `initialHasLiked`, making a fabricated `count: 0` **unrepresentable** rather than merely discouraged.
8. **`<ShareButton>` always renders.** Only `<LikeButton>` is conditional.
9. **No new i18n strings.** Hiding a control needs no copy.
10. **Unit tests cover the DB-down path** for `getLikes()` and `toggleLike()` — they must be asserted to
    _resolve_ to a failed outcome and **never reject**.

## Data Model Changes

No MongoDB schema, collection, or index change. The `likes` collection and `LikesDocument` are untouched.

Only the **service return type** changes:

```ts
// apps/web/src/service/like.service.ts
interface LikesDocument {
  // unchanged
  slug: string;
  count: number;
  visitors: string[];
  updatedAt: Date;
}

export interface Likes {
  readonly count: number;
  readonly hasLiked: boolean;
}

interface LikesOk extends Likes {
  readonly ok: true;
}

interface LikesUnavailable {
  readonly ok: false;
  readonly reason: "db-unavailable";
}

export type LikesOutcome = LikesOk | LikesUnavailable;
```

`interface` for the shapes (repo convention); `type` only for the union itself, which cannot be an
interface. `Likes` is exported because the render path consumes it as a prop. A single failure `reason`
is deliberate: every consumer treats "couldn't connect" and "query blew up" identically (hide the
control / return 503), and the union stays extensible if that ever stops being true.

The previous `interface LikesResult { count; hasLiked }` is **replaced** by `Likes` — no other module
imports it (verified: only `like.service.ts` referenced it).

## API Changes

`/api/likes` — no request-shape change, no Zod schema needed (inputs are unchanged: `?slug=` for GET, a
`{ slug }` JSON body for POST; the existing `!slug || typeof slug !== "string"` guards stay).

| Handler | Condition                 | Status | Body                                                |
| ------- | ------------------------- | -----: | --------------------------------------------------- |
| `GET`   | missing `slug`            |  `400` | `{ error: "slug is required" }`                     |
| `GET`   | `outcome.ok === false`    |  `503` | `{ error: "Service Unavailable" }`                  |
| `GET`   | success                   |  `200` | `{ count, hasLiked }`                               |
| `GET`   | unexpected throw          |  `500` | `{ error: "Internal Server Error" }`                |
| `POST`  | missing/non-string `slug` |  `400` | `{ error: "slug is required" }`                     |
| `POST`  | `outcome.ok === false`    |  `503` | `{ error: "Service Unavailable" }`                  |
| `POST`  | success                   |  `200` | `{ count, hasLiked }` + `_visitor_id` cookie if new |
| `POST`  | unexpected throw          |  `500` | `{ error: "Internal Server Error" }`                |

On the POST 503 path we return **before** setting the visitor cookie — there is no reason to mint a
visitor id for a like that did not land.

## New / Modified Files

### New

| File                                        | Purpose                                                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| `apps/web/src/service/like.service.test.ts` | DB-down + happy-path unit tests for `getLikes` / `toggleLike` |
| `apps/web/src/app/api/likes/route.test.ts`  | 503-not-500 + body-shape contract tests for `GET` / `POST`    |

### Modified

| File                                                                     | Change                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/web/src/service/like.service.ts`                                   | Return `LikesOutcome`; never throw; export `Likes` + `LikesOutcome`   |
| `apps/web/src/app/api/likes/route.ts`                                    | Branch on `outcome.ok`; 503 on failure; strip `ok` from the 200 body  |
| `apps/web/src/app/[locale]/blog/[slug]/page.tsx`                         | Map outcome → `likes \| undefined`; pass `likes` to `BlogPostDetails` |
| `apps/web/src/app/[locale]/predicas/[slug]/page.tsx`                     | Same, with `likeKey = predicas/${slug}`                               |
| `apps/web/src/components/features/blog-post-details/BlogPostDetails.tsx` | Prop `likes?: Likes` replaces `initialLikeCount` + `initialHasLiked`  |
| `apps/web/src/components/features/sermon-details/SermonDetails.tsx`      | Same prop swap                                                        |
| `apps/web/src/components/features/blog-post-details/PostActions.tsx`     | Prop `likes?: Likes`; render `<LikeButton>` only when `likes` present |

**Unchanged on purpose:** `database.service.ts` (`connect()`), `LikeButton.tsx`, `ShareButton.tsx`,
`contact.service.ts`, `predica/pdfJobs.ts`, `broadcast/broadcastLog.ts`, all locale JSON.

## Component Hierarchy

```
[locale]/blog/[slug]/page.tsx              [locale]/predicas/[slug]/page.tsx
  const outcome = await getLikes(slug,…)     const outcome = await getLikes(`predicas/${slug}`,…)
  const likes = outcome.ok                   const likes = outcome.ok
    ? { count, hasLiked } : undefined          ? { count, hasLiked } : undefined
        │                                            │
        ▼                                            ▼
  <BlogPostDetails likes={likes}>             <SermonDetails likes={likes}>
        │                                            │
        └──────────────► <PostActions likes={likes}> ◄──────────┘
                              │
                              ├── {likes && <LikeButton                 ← omitted entirely
                              │       initialCount={likes.count}          when likes is undefined
                              │       initialHasLiked={likes.hasLiked} />}
                              │
                              └── <ShareButton … />                    ← ALWAYS rendered
```

No responsive variants involved — `PostActions` is a single `flex` row at every breakpoint; with
`<LikeButton>` gone, `gap-3` collapses cleanly to a lone share button under the same top border.

## Edge Cases

1. **Mongo up, post never liked** → `doc` is `null` → `{ ok: true, count: 0, hasLiked: false }`. A
   _legitimate_ zero: the heart renders showing `0`. This is NOT the forbidden "fabricated 0" — that one
   is only forbidden when the DB is **unavailable**, where we now render no heart at all.
2. **Mongo up, query throws mid-request** (timeout / auth / strict-serverApi rejection) → caught, logged,
   `{ ok: false }` → page still 200s, heart hidden. _This is the path the ticket's literal wording missed._
3. **`MONGODB_URI` unset** → `getClient()` throws inside `connect()`'s `try` → caught there → `undefined`
   → `{ ok: false }`. This is exactly the Vercel-preview state, and the reason preview is our DB-down test bed.
4. **Mongo dies between the RSC render and the user's click** → page rendered a heart (DB was up), the
   `POST` now 503s → `LikeButton`'s existing `.catch` reverts the optimistic increment. No code change;
   the user sees the heart bounce back. Silent, correct.
5. **Anonymous visitor with no `_visitor_id` cookie, DB down** → 503 before the cookie is set; no orphan
   visitor id is minted.
6. **`hasLiked` for a visitor with no cookie, DB up** → unchanged behaviour: `visitorId` is `undefined`,
   so `hasLiked` is `false`.
7. **Both pages call `cookies()`** → forced dynamic rendering. A degraded (heartless) render is therefore
   never cached and re-served after Mongo recovers; the next request re-renders with the heart. No ISR
   staleness concern, and no `revalidate` change needed.
8. **`GET /api/likes` has no in-app caller** (`LikeButton` only POSTs; initial state comes from the RSC).
   It is still made honest here (503, not 500). Deleting it is explicitly out of scope.

## i18n

**No new keys.** Both `public/locales/es-AR.json` and `en-US.json` are untouched. The degraded state is
the _absence_ of a control, which needs no copy — this is precisely why "hide the control" was chosen
over a disabled/zeroed heart with a tooltip during refinement. The existing `BlogPostActions.like` /
`.unlike` keys stay in use for the healthy path.

## Testing Strategy

TDD applies properly here — unlike ICR-108, the tests genuinely fail RED against current code, because
`getLikes` today **rejects** where the new tests expect it to **resolve** to `{ ok: false }`.

### Unit — `like.service.test.ts` (new)

Mock: `vi.mock("../database.service", () => ({ connect: vi.fn() }))` (verbatim from `broadcastLog.test.ts:8`).

| #   | Case                                    | Expectation                                                           |
| --- | --------------------------------------- | --------------------------------------------------------------------- |
| 1   | `getLikes`, `connect()` → `undefined`   | resolves `{ ok: false, reason: "db-unavailable" }`; **never rejects** |
| 2   | `getLikes`, `findOne` rejects           | resolves `{ ok: false, … }`; `console.error` called; never rejects    |
| 3   | `getLikes`, doc found                   | `{ ok: true, count: 7, hasLiked: true }` for a matching visitor       |
| 4   | `getLikes`, no doc                      | `{ ok: true, count: 0, hasLiked: false }` (the legitimate zero)       |
| 5   | `getLikes`, doc found, no `visitorId`   | `hasLiked: false`                                                     |
| 6   | `toggleLike`, `connect()` → `undefined` | resolves `{ ok: false, … }`; never rejects                            |
| 7   | `toggleLike`, `updateOne` rejects       | resolves `{ ok: false, … }`; logged; never rejects                    |
| 8   | `toggleLike`, first like                | `{ ok: true, count: 1, hasLiked: true }`; `$addToSet` + upsert        |
| 9   | `toggleLike`, unlike                    | `{ ok: true, count: n-1, hasLiked: false }`; `$pull`                  |

Assert "never rejects" explicitly (`await expect(fn()).resolves.toEqual(…)`), not merely that the value
is right — the whole point of the ticket is the absence of a throw.

### Unit — `api/likes/route.test.ts` (new)

Mock `@src/service/like.service` + `next/headers`'s `cookies`. Follow `api/subscribe/route.test.ts`.

| #   | Case                                | Expectation                                                                    |
| --- | ----------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `GET`, service → `{ ok: false }`    | **503** (not 500), body `{ error: "Service Unavailable" }`, **no `count` key** |
| 2   | `GET`, service → `{ ok: true, … }`  | 200, body **exactly** `{ count, hasLiked }` — no `ok` key leaked               |
| 3   | `GET`, no `slug` param              | 400 (unchanged)                                                                |
| 4   | `POST`, service → `{ ok: false }`   | **503**, no fabricated count, **no `_visitor_id` cookie set**                  |
| 5   | `POST`, service → `{ ok: true, … }` | 200, body exactly `{ count, hasLiked }`                                        |
| 6   | `POST`, malformed JSON body         | **500** — a genuine bug is still an honest 500, not a 503                      |

### Manual smoke — Vercel preview (the DB-down environment)

Preview has **no `MONGODB_URI`** (lesson ICR-44: previews lack runtime secrets), which makes it a
free, faithful reproduction of a total Mongo outage. Expected before/after: the blog article page goes
**500 → 200**.

- `/es-AR/blog/<slug>` and `/en-US/blog/<slug>` → **200**, title/body/related/share/CTA all intact, **no heart**.
- `/es-AR/predicas/<slug>` and `/en-US/predicas/<slug>` → same.
- `GET /api/likes?slug=<slug>` → **503**. `POST /api/likes` → **503**.

### Playwright suites (`config.playwrightProjectMap`)

Changed paths map to `e2eBlog`, `e2ePublic`, `apiLikes`. Authored per-ticket by `qa-runner` at heavy depth.

> ⚠️ **AC 3 (Mongo healthy → no regression) is ENV-LIMITED on preview and cannot be tested there.**
> It is covered by unit tests 3–5 / 8–9 above and **deferred to post-merge staging QA** (staging has its
> own `website-staging` DB). Per lesson ICR-136, the expected preview verdict is **PARTIAL with 0
> failures** — an env-limited block, _not_ a code defect, and **not** something to route back to the
> implementer.

## Implementation Checkpoints

> **Why the service + every consumer land in ONE checkpoint (lesson ICR-49).** `pnpm type-check` is
> repo-wide (`tsc --noEmit`). The moment `getLikes()` returns a union, all three call sites
> (`route.ts`, both `page.tsx`) stop type-checking — they still destructure `.count`/`.hasLiked` off an
> unnarrowed union. So a checkpoint that changes only the service is **guaranteed red**, which would fail
> the verifier and burn a re-dispatch on a defect that isn't one. The breaking type change and its
> consumers are therefore atomic. **Every checkpoint below verifies green.**

### CP1 — Fail-soft the likes path end-to-end (RED → GREEN)

- **Files:**
  - `apps/web/src/service/like.service.test.ts` (new — written FIRST)
  - `apps/web/src/service/like.service.ts`
  - `apps/web/src/app/api/likes/route.ts`
  - `apps/web/src/app/[locale]/blog/[slug]/page.tsx`
  - `apps/web/src/app/[locale]/predicas/[slug]/page.tsx`
  - `apps/web/src/components/features/blog-post-details/PostActions.tsx`
  - `apps/web/src/components/features/blog-post-details/BlogPostDetails.tsx`
  - `apps/web/src/components/features/sermon-details/SermonDetails.tsx`
- **RED first:** write the 9 `like.service.test.ts` cases and **observe them fail**. Capture the output —
  the failure must be a _rejection_ (`getLikes` throws `Failed to connect to database`) where the test
  expects a resolved `{ ok: false }`. That rejection **is** the bug; do not soften the test to accommodate it.
- **GREEN:** introduce `Likes` / `LikesOk` / `LikesUnavailable` / `LikesOutcome`; convert both service
  functions to return outcomes and delete both `throw`s (keeping the `console.error`s); branch both route
  handlers on `outcome.ok` (503 on failure, explicit `{ count, hasLiked }` on success, outer `try/catch`
  → 500 retained); swap `initialLikeCount` + `initialHasLiked` for `likes?: Likes` across the three
  components; map the outcome to `likes | undefined` in both pages; gate `<LikeButton>` on `likes` and
  leave `<ShareButton>` unconditional.
- **Verify:** `pnpm type-check` **and** `pnpm lint` **and** `pnpm test` **and** `pnpm build` — all green.
- **Commit:** `fix(ICR-111): fail soft when the likes DB is unavailable`

### CP2 — Lock the `/api/likes` 503 contract

- **Files:** `apps/web/src/app/api/likes/route.test.ts` (new)
- **Steps:** Author the 6 route-contract tests from the table above.
- **Mutation check (required — lesson ICR-108).** These tests are written against code CP1 already made
  correct, so they pass on the first run — and _a test never observed to fail is not regression cover._
  The honest substitute for RED: temporarily revert `route.ts`'s DB-unavailable branch to the old
  `500` + `{ error: "Internal Server Error" }` shape, confirm the tests fail **and fail on the status/body
  assertion** (not on a mock or import error), then `git checkout -- apps/web/src/app/api/likes/route.ts`
  and confirm it is gone from `git status` before committing. Paste the verbatim failure output into the
  PR body as the evidence this checkpoint earned its keep.
- **Verify:** `pnpm type-check`, `pnpm lint`, `pnpm test` — green.
- **Commit:** `test(ICR-111): lock the /api/likes 503 contract when the likes DB is unavailable`
  (`test`, not `fix` — no runtime surface, so semantic-release cuts no spurious version bump; per ICR-108.)

## Open Questions

None blocking. Two things deliberately deferred:

1. **No `error.tsx` / `global-error.tsx` exists anywhere in `apps/web/src/app`** — so _any_ unguarded
   throw in _any_ RSC (a Contentful hiccup, say) still hard-500s with an unbranded page. Out of scope
   here (it needs real user-facing copy in both locales, which would trip the `i18n-messages` sensitive
   gate and contradict this ticket's "no new i18n strings"). **Approved for a separate ticket**; raised
   at triage (step 15). Logged in `tasks/todo.md`.
2. **`GET /api/likes` has no in-app caller.** Left in place and made honest (503); removing it is a
   separate cleanup, per the ticket's own out-of-scope list.
