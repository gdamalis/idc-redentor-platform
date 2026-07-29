/**
 * ICR-111: fail soft when the likes DB (MongoDB) is unavailable.
 *
 * Originally, on Vercel PREVIEW the likes DB was permanently unreachable — `MONGODB_URI`
 * *was* set and `connect()` SUCCEEDED (it pinged `admin` and logged "Connected to
 * database"), but the Atlas user was not authorized to `find` on the hardcoded literal
 * `website.likes`, so the QUERY threw (`MongoServerError ... code 8000`) inside the
 * try/catch. That distinction was the whole point of this suite: a fix that only handled
 * the `!client` (connect-failed) branch would have been a NO-OP here, and these pages
 * would still 500. They returned 200 only because the catch block also failed soft. See
 * src/service/like.service.ts and src/app/api/likes/route.ts.
 *
 * ICR-143 UPDATE: the hardcoded `"website"` database name was the actual root cause of
 * that unauthorized-query failure — it pointed at a database the preview/staging Mongo
 * user cannot access. `database.service.ts#getWebsiteDb()` now derives the database name
 * from `MONGODB_URI`'s own path segment instead, so the resolver targets the CORRECT
 * database on every environment and **likes now work on preview/staging** — the degraded
 * path this suite exercises is no longer reachable there. Each test below starts with a
 * read-only health probe (`GET /api/likes`) that self-skips via `test.skip(...)` only on
 * a 200 (DB healthy), runs the suite as normal on a 503 (DB genuinely degraded — the
 * state this suite exists to test), and THROWS on anything else (500, 404, 401, ...) —
 * an unexpected status is a real deployment or route regression, not a health signal, and
 * must fail loudly rather than being mistaken for "DB is healthy" and silently skipped.
 *
 * Covers (see tasks/specs/ICR-111-fail-soft-likes-mongo.md for the full AC list):
 *  - AC1 (blog): the blog article page still renders 200 with title, body, related
 *    articles, share button and CTA all intact, and the like control genuinely ABSENT
 *    (not a disabled/zeroed heart), in both locales.
 *  - AC2 (sermon): the same, for the sermon page (`/predicas/[slug]`), which previously
 *    had NO e2e coverage — only a raw HTTP status check + a source-code trace. This
 *    revision closes that gap directly.
 *  - AC4: GET /api/likes returns 503 with a clean body — never a fabricated `count: 0`.
 *
 * Each of the 4 page cases (2 content types x 2 locales) also saves a full-page
 * screenshot under tasks/qa-evidence/ICR-111/ (gitignored) as direct visual evidence
 * that title/body/related/share/CTA rendered — not just a byte-size or code-trace
 * inference.
 *
 * The healthy-Mongo path (AC3: like count/toggle) is NOT exercised by this suite — it is
 * purpose-built for the degraded path (AC1/AC2/AC4 above) and self-skips instead once the
 * DB is healthy (see the ICR-143 UPDATE above). AC3 is covered by the unit tests
 * (src/service/like.service.test.ts) plus post-merge staging QA.
 *
 * SAFETY (lesson ICR-44): GET only. Never POST to a live endpoint from an e2e happy
 * path — a POST /api/likes is harmless here only because the DB is down; this suite
 * stays read-only so it is safe to run against any environment.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BLOG_SLUG = "retiro-idc-redentor-2026";
const SERMON_SLUG = "el-deseo-mas-profundo-de-dios";

const LIKE_ARIA_LABELS = ["Me gusta", "Ya no me gusta", "Like", "Unlike"];
const SHARE_LABEL = { "es-AR": "Compartir", "en-US": "Share" } as const;

// A real article/sermon body runs to thousands of characters; a few hundred is a
// conservative floor that rules out "the wrapper rendered but is empty".
const MIN_BODY_CHARS = 200;

// apps/web/e2e/blog/ -> worktree root -> tasks/qa-evidence/ICR-111/ (gitignored).
const SCREENSHOT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "tasks",
  "qa-evidence",
  "ICR-111",
);

interface PageCase {
  readonly ac: "AC1" | "AC2";
  readonly contentType: "blog" | "sermon";
  readonly locale: "es-AR" | "en-US";
  readonly path: string;
  readonly screenshot: string;
}

const PAGE_CASES: readonly PageCase[] = [
  {
    ac: "AC1",
    contentType: "blog",
    locale: "es-AR",
    path: `/es-AR/blog/${BLOG_SLUG}`,
    screenshot: "ac1-blog-es-AR.png",
  },
  {
    ac: "AC1",
    contentType: "blog",
    locale: "en-US",
    path: `/en-US/blog/${BLOG_SLUG}`,
    screenshot: "ac1-blog-en-US.png",
  },
  {
    ac: "AC2",
    contentType: "sermon",
    locale: "es-AR",
    path: `/es-AR/predicas/${SERMON_SLUG}`,
    screenshot: "ac2-sermon-es-AR.png",
  },
  {
    ac: "AC2",
    contentType: "sermon",
    locale: "en-US",
    path: `/en-US/predicas/${SERMON_SLUG}`,
    screenshot: "ac2-sermon-en-US.png",
  },
] as const;

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

/**
 * How many OTHER blog/sermon slugs exist besides `ownSlug`, per the live listing page.
 *
 * RelatedArticles.tsx / RelatedSermons.tsx both early-return `null` on an empty list (and
 * SermonDetails additionally gates the whole section on `relatedSermons.length > 0`) — so
 * "no related items rendered" is only a defect when other content actually exists to
 * relate to. This checks the real, current inventory instead of assuming it, so the
 * related-section assertion below is meaningful in either direction: it fails if the
 * section is missing when other content DOES exist, and it fails if the section
 * (wrongly) appears when none does.
 */
async function countOtherSlugs(
  page: import("@playwright/test").Page,
  indexPath: string,
  ownSlug: string,
): Promise<number> {
  const res = await page.request.get(indexPath);
  const html = await res.text();
  const slugs = new Set(
    [...html.matchAll(/href="[^"]*\/(?:blog|predicas)\/([a-z0-9-]+)"/g)]
      .map((m) => m[1])
      .filter((slug) => slug !== ownSlug),
  );
  return slugs.size;
}

test.describe("Article/sermon page — fail-soft when likes DB is unavailable", () => {
  // ICR-143 self-skip: this suite exercises the DEGRADED path on purpose, but ICR-143
  // fixed the root cause (a hardcoded, unauthorized database name) that made the likes DB
  // permanently unreachable on preview/staging. GET-only (see the file's SAFETY note) —
  // a probe slug that will never accumulate real likes.
  test.beforeEach(async ({ request }) => {
    const res = await request.get("/api/likes?slug=probe-health-check");
    const status = res.status();

    // Only 200 means "DB reachable, degraded path unexercisable here" — skip cleanly.
    if (status === 200) {
      test.skip(
        true,
        `Likes DB is reachable here (GET /api/likes -> 200), so the degraded path ` +
          `cannot be exercised. ICR-143 made the DB name URI-derived, which fixed ` +
          `likes on preview/staging (previously 503 because the hardcoded "website" DB ` +
          `was unauthorized). Fail-soft remains covered by src/service/like.service.test.ts.`,
      );
      return;
    }

    // 503 is the degraded state this suite exists to exercise — let it run.
    if (status === 503) {
      return;
    }

    // Anything else (500, 404, 401, 429, ...) is not a DB-health signal this probe
    // understands — it is a real deployment or route regression. Fail loudly instead of
    // silently skipping, so a broken environment is never mistaken for "DB is healthy".
    throw new Error(
      `Health probe ${res.url()} returned unexpected status ${status} (expected 200 ` +
        `= DB healthy or 503 = DB degraded). Not skipping: this looks like a genuine ` +
        `deployment or route regression, not a DB-health signal.`,
    );
  });

  for (const { ac, contentType, locale, path: pagePath, screenshot } of PAGE_CASES) {
    test(`${ac} ${contentType} ${locale}: renders 200 with title/body/related/share/CTA intact, no like control`, async ({
      page,
    }) => {
      const res = await page.goto(pagePath);
      // 200, not merely "not an error" — this page returned 500 before the fix.
      expect(res?.status()).toBe(200);

      // Title renders — a non-empty h1.
      const heading = page.getByRole("heading", { level: 1 }).first();
      await expect(heading).toBeVisible();
      expect((await heading.textContent())?.trim().length ?? 0).toBeGreaterThan(0);

      // Body content renders. `.rich-text-content` is the shared class both
      // BlogPostContent.tsx and SermonContent.tsx wrap their rendered rich text in —
      // it is the only element carrying that class on either page. Asserting on real
      // rendered prose length (not just element presence) rules out an empty wrapper.
      const body = page.locator(".rich-text-content").first();
      await expect(body).toBeVisible();
      const bodyText = (await body.innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(MIN_BODY_CHARS);

      // Related posts/sermons render. RelatedArticles.tsx / RelatedSermons.tsx is the
      // ONLY place on either page that renders a <time datetime> element inside a link
      // — the header/author-info components render their dates as plain text, never
      // <time>. This anchors on the related-items list without hard-coding fragile CMS
      // copy (titles/excerpts) that an editor could change.
      const relatedLink = page
        .locator("a")
        .filter({ has: page.locator("time[datetime]") });
      const indexPath = contentType === "blog" ? `/${locale}/blog` : `/${locale}/predicas`;
      const ownSlug = contentType === "blog" ? BLOG_SLUG : SERMON_SLUG;
      const otherContentCount = await countOtherSlugs(page, indexPath, ownSlug);
      if (otherContentCount > 0) {
        await expect(relatedLink.first()).toBeVisible();
      } else {
        // Legitimate empty state (verified against the live listing page above, not
        // assumed): no other content of this type exists yet, so the section's correct,
        // intentional absence is actively asserted rather than silently skipped.
        await expect(relatedLink).toHaveCount(0);
        test.info().annotations.push({
          type: "env-limited",
          description: `No other ${contentType} content exists in this environment yet (checked ${indexPath}), so the related section legitimately renders nothing.`,
        });
      }

      // Share control is present — proves PostActions rendered and only the like
      // control (conditional on a successful DB read) was omitted.
      await expect(
        page.getByRole("button", { name: SHARE_LABEL[locale] }),
      ).toBeVisible();

      // The like control must be genuinely ABSENT, not a disabled/zeroed heart.
      for (const label of LIKE_ARIA_LABELS) {
        await expect(page.getByRole("button", { name: label })).toHaveCount(0);
      }

      // The CTA renders. <ComponentCta> is the only component on either page that wraps
      // a heading + link in a bare `bg-primary` container (verified against every shared
      // layout component — Header/Navbar/SubscribeBanner/Footer never use that exact
      // class on a standalone div). It is rendered by the page as a sibling AFTER
      // <BlogPostDetails>/<SermonDetails>, never nested inside rich-text content.
      const cta = page.locator("div.bg-primary");
      await expect(cta).toBeVisible();
      await expect(cta.getByRole("link")).toBeVisible();

      // Visual evidence: a full-page screenshot proving all of the above rendered
      // together, not just individually-passing assertions.
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, screenshot),
        fullPage: true,
      });
    });
  }

  test("edge case: GET /api/likes returns 503 with no fabricated count when the DB is down", async ({
    request,
  }) => {
    const res = await request.get(`/api/likes?slug=${BLOG_SLUG}`);
    expect(res.status()).toBe(503);

    const body = await res.json();
    expect(body).toEqual({ error: "Service Unavailable" });
    expect(body).not.toHaveProperty("count");
    expect(body).not.toHaveProperty("hasLiked");
  });
});
