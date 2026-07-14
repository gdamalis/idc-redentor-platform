# ICR-111 — Fail-soft likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Mongo outage must degrade the blog/sermon "like" control to _absent_, never take the article page down with a 500.

**Architecture:** `getLikes()` / `toggleLike()` stop throwing and return a discriminated union `LikesOutcome` (`{ ok: true, count, hasLiked } | { ok: false, reason: "db-unavailable" }`). Every consumer narrows on `.ok`: `/api/likes` maps failure to **503** (never a fabricated count), and both article pages map failure to `likes === undefined`, which `PostActions` renders as "no `<LikeButton>`, `<ShareButton>` still there". `connect()` is **not touched** — its other consumers (contact, pdfJobs, broadcastLog) must keep failing loudly.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router (RSC), MongoDB driver, Vitest (jsdom), Tailwind v4.

**Spec:** `tasks/specs/ICR-111-fail-soft-likes-mongo.md` — read it first.

## Global Constraints

- **Repo conventions (CLAUDE.md):** functional-first — **no classes**; model failures as **return values**, never a thrown `Error` subclass for control flow. `interface` over `type` for object shapes (`type` only for the union itself). Prefer `??` over `||`. Named exports for components. Always `await` Next runtime APIs (`cookies()`, `params`).
- **`connect()` (`apps/web/src/service/database.service.ts`) MUST NOT be modified.** Not its signature, not its behaviour. `contact.service.ts`, `predica/pdfJobs.ts`, and `broadcast/broadcastLog.ts` depend on it failing loudly.
- **No new i18n strings.** `apps/web/public/locales/{es-AR,en-US}.json` must be **byte-identical** at the end of this plan.
- **The single failure reason literal is exactly `"db-unavailable"`.** Do not invent additional reasons.
- **The `/api/likes` 200 wire body stays exactly `{ count, hasLiked }`** — the `ok` discriminant must never leak into a response body, or `LikeButton.toggleLikeApi` starts parsing a field it doesn't expect.
- **`LikeButton.tsx` and `ShareButton.tsx` are NOT modified.** `LikeButton` already reverts its optimistic update on `!response.ok` (`LikeButton.tsx:70-73`).
- Run all commands from the **worktree root** (`/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-111`). `pnpm type-check` is **hyphenated**.
- Commit header ≤ 100 chars, Conventional Commits, scope `(ICR-111)`.

## File Structure

| File                                                                     | Responsibility                                                                              | Task |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---- |
| `apps/web/src/service/like.service.ts`                                   | The fail-soft boundary. Owns `Likes`, `LikesOutcome`, and the two never-throwing functions. | 1    |
| `apps/web/src/service/like.service.test.ts` _(new)_                      | Proves the service resolves (never rejects) when Mongo is down.                             | 1    |
| `apps/web/src/app/api/likes/route.ts`                                    | Maps outcome → HTTP. 503 on unavailable; 500 reserved for genuine bugs.                     | 1    |
| `apps/web/src/components/features/blog-post-details/PostActions.tsx`     | Renders `<LikeButton>` only when `likes` is present.                                        | 1    |
| `apps/web/src/components/features/blog-post-details/BlogPostDetails.tsx` | Threads `likes` through.                                                                    | 1    |
| `apps/web/src/components/features/sermon-details/SermonDetails.tsx`      | Threads `likes` through.                                                                    | 1    |
| `apps/web/src/app/[locale]/blog/[slug]/page.tsx`                         | Narrows the outcome to `likes \| undefined`.                                                | 1    |
| `apps/web/src/app/[locale]/predicas/[slug]/page.tsx`                     | Same, with `likeKey = predicas/${slug}`.                                                    | 1    |
| `apps/web/src/app/api/likes/route.test.ts` _(new)_                       | Locks the 503-not-500 contract + the exact response body.                                   | 2    |

**Why Task 1 is one task and not four.** `pnpm type-check` is repo-wide (`tsc --noEmit`). The instant `getLikes()` returns a union, all three call sites stop compiling — they still destructure `.count` / `.hasLiked` off an unnarrowed union. A task that changes only the service is **guaranteed red**, which would fail the verifier and burn a re-dispatch on a non-defect. The breaking type change and its consumers are therefore atomic. (Lesson ICR-49.)

---

### Task 1: Fail-soft the likes path end-to-end

**Files:**

- Create: `apps/web/src/service/like.service.test.ts`
- Modify: `apps/web/src/service/like.service.ts` (whole file)
- Modify: `apps/web/src/app/api/likes/route.ts:26-35` (GET), `:57-78` (POST)
- Modify: `apps/web/src/components/features/blog-post-details/PostActions.tsx` (whole file)
- Modify: `apps/web/src/components/features/blog-post-details/BlogPostDetails.tsx:8-14,32-40`
- Modify: `apps/web/src/components/features/sermon-details/SermonDetails.tsx:12-26,70-78`
- Modify: `apps/web/src/app/[locale]/blog/[slug]/page.tsx:71,81-87`
- Modify: `apps/web/src/app/[locale]/predicas/[slug]/page.tsx:63,73-79`

**Interfaces:**

- Consumes: `connect()` from `./database.service` — `() => Promise<MongoClient | undefined>`. Unchanged.
- Produces (Task 2 relies on these **exact** names):
  - `export interface Likes { readonly count: number; readonly hasLiked: boolean }`
  - `export type LikesOutcome = LikesOk | LikesUnavailable`
  - `getLikes(slug: string, visitorId?: string): Promise<LikesOutcome>`
  - `toggleLike(slug: string, visitorId: string): Promise<LikesOutcome>`
  - `/api/likes` `GET` / `POST` → 503 `{ error: "Service Unavailable" }` on `!outcome.ok`.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/service/like.service.test.ts`. The mock shape is lifted from `broadcast/broadcastLog.test.ts:1-20` — note the module specifier is `"./database.service"` (this test sits in `src/service/`, unlike broadcastLog's `"../database.service"`).

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const updateOne = vi.fn();
const collection = vi.fn(() => ({ findOne, updateOne }));
const db = vi.fn(() => ({ collection }));

vi.mock("./database.service", () => ({ connect: vi.fn() }));

import { connect } from "./database.service";
import { getLikes, toggleLike } from "./like.service";

const mockedConnect = vi.mocked(connect);

const doc = (over: Partial<{ count: number; visitors: string[] }> = {}) => ({
  slug: "post-1",
  count: 7,
  visitors: ["v1"],
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedConnect.mockResolvedValue({ db } as unknown as Awaited<
    ReturnType<typeof connect>
  >);
  findOne.mockResolvedValue(null);
  updateOne.mockResolvedValue({ acknowledged: true });
});

describe("getLikes", () => {
  it("resolves to db-unavailable when connect() returns undefined", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
  });

  it("resolves to db-unavailable (never rejects) when the query throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    findOne.mockRejectedValueOnce(new Error("connection reset by peer"));
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns count and hasLiked for a visitor who liked the post", async () => {
    findOne.mockResolvedValueOnce(doc());
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 7,
      hasLiked: true,
    });
  });

  it("returns a legitimate zero when the post has no likes document", async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 0,
      hasLiked: false,
    });
  });

  it("reports hasLiked false when no visitorId is supplied", async () => {
    findOne.mockResolvedValueOnce(
      doc({ count: 3, visitors: ["someone-else"] }),
    );
    await expect(getLikes("post-1")).resolves.toEqual({
      ok: true,
      count: 3,
      hasLiked: false,
    });
  });
});

describe("toggleLike", () => {
  it("resolves to db-unavailable when connect() returns undefined", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
  });

  it("resolves to db-unavailable (never rejects) when the write throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    updateOne.mockRejectedValueOnce(new Error("not primary"));
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("adds a like and upserts on a first-time like", async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 1,
      hasLiked: true,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { slug: "post-1" },
      expect.objectContaining({
        $addToSet: { visitors: "v1" },
        $inc: { count: 1 },
      }),
      { upsert: true },
    );
  });

  it("removes a like when the visitor already liked the post", async () => {
    findOne.mockResolvedValueOnce(doc({ count: 5, visitors: ["v1"] }));
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 4,
      hasLiked: false,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { slug: "post-1" },
      expect.objectContaining({
        $pull: { visitors: "v1" },
        $inc: { count: -1 },
      }),
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail for the RIGHT reason**

Run: `pnpm --filter @idcr/web test -- like.service`

Expected: **FAIL**. The two `db-unavailable` cases must fail because `getLikes` / `toggleLike` **reject** with `Error: Failed to connect to database`, where the test expected a resolved `{ ok: false, … }`. The happy-path cases fail on the missing `ok: true` key.

**That rejection IS the bug.** Do not soften the assertions to accommodate it. Capture this output — it goes in the PR body.

- [ ] **Step 3: Rewrite `like.service.ts` to return outcomes**

Replace the whole of `apps/web/src/service/like.service.ts`:

```ts
import { connect } from "./database.service";

interface LikesDocument {
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

const DB_UNAVAILABLE: LikesUnavailable = {
  ok: false,
  reason: "db-unavailable",
};

export async function getLikes(
  slug: string,
  visitorId?: string,
): Promise<LikesOutcome> {
  const client = await connect();
  if (!client) {
    return DB_UNAVAILABLE;
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const doc = await collection.findOne({ slug });

    return {
      ok: true,
      count: doc?.count ?? 0,
      hasLiked: visitorId
        ? (doc?.visitors?.includes(visitorId) ?? false)
        : false,
    };
  } catch (error) {
    console.error("Error fetching likes:", error);
    return DB_UNAVAILABLE;
  }
}

export async function toggleLike(
  slug: string,
  visitorId: string,
): Promise<LikesOutcome> {
  const client = await connect();
  if (!client) {
    return DB_UNAVAILABLE;
  }

  try {
    const db = client.db("website");
    const collection = db.collection<LikesDocument>("likes");

    const existing = await collection.findOne({ slug });
    const alreadyLiked = existing?.visitors?.includes(visitorId) ?? false;

    if (alreadyLiked) {
      // Remove like
      await collection.updateOne(
        { slug },
        {
          $pull: { visitors: visitorId },
          $inc: { count: -1 },
          $set: { updatedAt: new Date() },
        },
      );
    } else {
      // Add like (upsert for first-time likes on this post)
      await collection.updateOne(
        { slug },
        {
          $addToSet: { visitors: visitorId },
          $inc: { count: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { slug },
        },
        { upsert: true },
      );
    }

    return {
      ok: true,
      count: Math.max((existing?.count ?? 0) + (alreadyLiked ? -1 : 1), 0),
      hasLiked: !alreadyLiked,
    };
  } catch (error) {
    console.error("Error toggling like:", error);
    return DB_UNAVAILABLE;
  }
}
```

The only changes: the two `throw`s become `return DB_UNAVAILABLE`, the two `catch` blocks `return DB_UNAVAILABLE` instead of `throw error` (keeping their `console.error`), and both success returns gain `ok: true`. The Mongo query logic is **untouched**.

- [ ] **Step 4: Run the service tests and verify they pass**

Run: `pnpm --filter @idcr/web test -- like.service`
Expected: **PASS** — 9 tests.

`pnpm type-check` is still red at this point (the three call sites don't narrow). That is expected mid-task; Steps 5–7 close it. Do not commit yet.

- [ ] **Step 5: Map the outcome to HTTP in `/api/likes`**

In `apps/web/src/app/api/likes/route.ts`, replace the `getLikes` call + return in **GET** (currently lines 26-28):

```ts
const outcome = await getLikes(slug, visitorId);

if (!outcome.ok) {
  return NextResponse.json({ error: "Service Unavailable" }, { status: 503 });
}

return NextResponse.json({
  count: outcome.count,
  hasLiked: outcome.hasLiked,
});
```

And in **POST**, replace the `toggleLike` call + response construction (currently lines 57-59) — note the 503 returns **before** the visitor cookie is set:

```ts
const outcome = await toggleLike(slug, visitorId);

if (!outcome.ok) {
  return NextResponse.json({ error: "Service Unavailable" }, { status: 503 });
}

const response = NextResponse.json({
  count: outcome.count,
  hasLiked: outcome.hasLiked,
});
```

Leave both outer `try/catch` blocks (→ 500) **exactly as they are**. A malformed `request.json()` body must still be an honest 500, not a 503.

- [ ] **Step 6: Make `PostActions` render the like button conditionally**

Replace the whole of `apps/web/src/components/features/blog-post-details/PostActions.tsx`:

```tsx
import type { Likes } from "@src/service/like.service";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";

interface PostActionsProps {
  readonly slug: string;
  readonly basePath: string;
  readonly likeKey: string;
  readonly title: string;
  readonly featuredImageUrl: string;
  /** Absent when the likes DB is unavailable — the like control is then omitted entirely. */
  readonly likes?: Likes;
}

export function PostActions({
  slug,
  basePath,
  likeKey,
  title,
  featuredImageUrl,
  likes,
}: PostActionsProps) {
  return (
    <div className="flex items-center gap-3 py-6 border-t border-border">
      {likes && (
        <LikeButton
          slug={likeKey}
          initialCount={likes.count}
          initialHasLiked={likes.hasLiked}
        />
      )}
      <ShareButton
        slug={slug}
        basePath={basePath}
        likeKey={likeKey}
        title={title}
        featuredImageUrl={featuredImageUrl}
      />
    </div>
  );
}
```

`import type` — the import is erased at compile time, so no service code is pulled into the component graph.

- [ ] **Step 7: Thread `likes` through both detail views and both pages**

`BlogPostDetails.tsx` — swap the two props for one (keep this file's existing `Readonly<{…}>` style):

```tsx
import type { Likes } from "@src/service/like.service";

type BlogPostDetailsProps = Readonly<{
  post: BlogPost;
  relatedPosts: BlogPost[];
  locale: string;
  likes?: Likes;
}>;

export default function BlogPostDetails({
  post,
  relatedPosts,
  locale,
  likes,
}: BlogPostDetailsProps) {
```

and its `<PostActions>` (currently lines 32-40):

```tsx
<PostActions
  slug={post.slug}
  basePath="blog"
  likeKey={post.slug}
  title={post.title}
  featuredImageUrl={post.featuredImage.url}
  likes={likes}
/>
```

`SermonDetails.tsx` — same swap (keep this file's existing `interface` + `readonly` style):

```tsx
import type { Likes } from "@src/service/like.service";

interface SermonDetailsProps {
  readonly sermon: Sermon;
  readonly relatedSermons: Sermon[];
  readonly locale: string;
  readonly likes?: Likes;
}

export default async function SermonDetails({
  sermon,
  relatedSermons,
  locale,
  likes,
}: SermonDetailsProps) {
```

and its `<PostActions>` (currently lines 70-78):

```tsx
<PostActions
  slug={sermon.slug}
  basePath="predicas"
  likeKey={`predicas/${sermon.slug}`}
  title={sermon.title}
  featuredImageUrl={sermon.featuredImage?.url ?? ""}
  likes={likes}
/>
```

`[locale]/blog/[slug]/page.tsx` — replace line 71, and the two props at 85-86:

```tsx
const likesOutcome = await getLikes(slug, visitorId);
const likes = likesOutcome.ok
  ? { count: likesOutcome.count, hasLiked: likesOutcome.hasLiked }
  : undefined;
```

```tsx
<BlogPostDetails
  post={post}
  relatedPosts={latestPosts}
  locale={locale}
  likes={likes}
/>
```

`[locale]/predicas/[slug]/page.tsx` — replace line 63, and the two props at 77-78:

```tsx
const likesOutcome = await getLikes(likeKey, visitorId);
const likes = likesOutcome.ok
  ? { count: likesOutcome.count, hasLiked: likesOutcome.hasLiked }
  : undefined;
```

```tsx
<SermonDetails
  sermon={sermon}
  relatedSermons={relatedSermons}
  locale={locale}
  likes={likes}
/>
```

- [ ] **Step 8: Run the full verification stack — everything must be green**

```bash
pnpm type-check   # now clean: the union is narrowed at all 3 call sites
pnpm lint
pnpm test         # 463 baseline + 9 new = 472
pnpm build
```

Expected: all four PASS. If `pnpm build` fails with `ERR_INVALID_URL` / `input: 'undefined'`, the worktree is missing `apps/web/.env.local` — that is environmental, not a code defect (lesson ICR-136); copy it from the main checkout and re-run.

- [ ] **Step 9: Confirm the locale files were not touched**

```bash
git diff --name-only origin/main...HEAD -- apps/web/public/locales/
```

Expected: **empty output**. Any hit means an i18n string crept in — revert it.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/service/like.service.ts \
        apps/web/src/service/like.service.test.ts \
        apps/web/src/app/api/likes/route.ts \
        apps/web/src/components/features/blog-post-details/PostActions.tsx \
        apps/web/src/components/features/blog-post-details/BlogPostDetails.tsx \
        apps/web/src/components/features/sermon-details/SermonDetails.tsx \
        "apps/web/src/app/[locale]/blog/[slug]/page.tsx" \
        "apps/web/src/app/[locale]/predicas/[slug]/page.tsx"
git commit -m "fix(ICR-111): fail soft when the likes DB is unavailable"
```

---

### Task 2: Lock the `/api/likes` 503 contract

**Files:**

- Create: `apps/web/src/app/api/likes/route.test.ts`

**Interfaces:**

- Consumes: `GET` / `POST` from `./route`; `getLikes` / `toggleLike` from `@src/service/like.service` (mocked). The outcome shape is Task 1's `LikesOutcome`.
- Produces: nothing — this task is test-only.

> **Why this task needs a mutation check.** Task 1 already made the route correct, so these tests pass on their first run. _A test never observed to fail is not regression cover — it is a green rubber stamp._ Step 3 below is the honest substitute for the RED phase (lesson ICR-108).

- [ ] **Step 1: Write the route contract tests**

Create `apps/web/src/app/api/likes/route.test.ts`. Mock shape follows `apps/web/src/app/api/subscribe/route.test.ts:1-19` (`vi.hoisted` + `vi.mock`), plus a `next/headers` cookie mock, which the subscribe route doesn't need but this one does.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getLikes = vi.hoisted(() => vi.fn());
const toggleLike = vi.hoisted(() => vi.fn());
const cookieGet = vi.hoisted(() => vi.fn());

vi.mock("@src/service/like.service", () => ({ getLikes, toggleLike }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

import { GET, POST } from "./route";

const getReq = (qs: string) => new NextRequest(`http://x/api/likes${qs}`);
const postReq = (body: unknown) =>
  new NextRequest("http://x/api/likes", {
    method: "POST",
    body: JSON.stringify(body),
  });
const rawPostReq = (body: string) =>
  new NextRequest("http://x/api/likes", { method: "POST", body });

beforeEach(() => {
  vi.clearAllMocks();
  cookieGet.mockReturnValue({ value: "visitor-1" });
});

describe("GET /api/likes", () => {
  it("returns 503 — not 500 — and no fabricated count when the DB is unavailable", async () => {
    getLikes.mockResolvedValue({ ok: false, reason: "db-unavailable" });
    const res = await GET(getReq("?slug=post-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Service Unavailable" });
    expect(body).not.toHaveProperty("count");
  });

  it("returns exactly { count, hasLiked } — the ok discriminant never leaks", async () => {
    getLikes.mockResolvedValue({ ok: true, count: 7, hasLiked: true });
    const res = await GET(getReq("?slug=post-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 7, hasLiked: true });
  });

  it("returns 400 when slug is missing, without calling the service", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
    expect(getLikes).not.toHaveBeenCalled();
  });
});

describe("POST /api/likes", () => {
  it("returns 503 and does not mint a visitor cookie when the DB is unavailable", async () => {
    cookieGet.mockReturnValue(undefined); // brand-new visitor
    toggleLike.mockResolvedValue({ ok: false, reason: "db-unavailable" });
    const res = await POST(postReq({ slug: "post-1" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service Unavailable" });
    expect(res.cookies.get("_visitor_id")).toBeUndefined();
  });

  it("returns exactly { count, hasLiked } on success", async () => {
    toggleLike.mockResolvedValue({ ok: true, count: 2, hasLiked: true });
    const res = await POST(postReq({ slug: "post-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2, hasLiked: true });
  });

  it("still returns 500 for a malformed body — a real bug is not laundered into a 503", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const res = await POST(rawPostReq("{not json"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(toggleLike).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests and verify they pass**

Run: `pnpm --filter @idcr/web test -- api/likes`
Expected: **PASS** — 6 tests.

- [ ] **Step 3: Mutation check — prove these tests can actually fail**

Temporarily break `apps/web/src/app/api/likes/route.ts` back to the pre-fix shape. In **both** handlers, change the DB-unavailable branch to the old 500:

```ts
if (!outcome.ok) {
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
```

Run: `pnpm --filter @idcr/web test -- api/likes`

Expected: **exactly 2 tests FAIL** — `GET … returns 503 — not 500 …` and `POST … returns 503 and does not mint a visitor cookie …` — and each must fail on the **status assertion** (`expected 500 to be 503`), not on a mock/import error. That is the precise contract the ticket exists to defend. **Save this verbatim output — it goes in the PR body as the evidence this task earned its keep.**

Now restore the file and confirm the mutation is gone:

```bash
git checkout -- apps/web/src/app/api/likes/route.ts
git status --short          # must NOT list route.ts
pnpm --filter @idcr/web test -- api/likes   # back to 6 PASS
```

- [ ] **Step 4: Run the full verification stack**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green; **478** tests total (463 baseline + 9 + 6).

- [ ] **Step 5: Commit**

`test`, not `fix` — this task adds no runtime surface, so semantic-release must not cut a version bump for it (lesson ICR-108 / ICR-46).

```bash
git add apps/web/src/app/api/likes/route.test.ts
git commit -m "test(ICR-111): lock the /api/likes 503 contract when the likes DB is unavailable"
```

---

## Done when

- `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build` all green.
- `git diff origin/main...HEAD -- apps/web/public/locales/` is **empty** (no new i18n strings).
- `git diff origin/main...HEAD -- apps/web/src/service/database.service.ts` is **empty** (`connect()` untouched).
- The RED output from Task 1 Step 2 and the mutation output from Task 2 Step 3 are captured for the PR body.
