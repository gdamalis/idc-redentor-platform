/**
 * ICR-111: fail soft when the likes DB (MongoDB) is unavailable.
 *
 * Vercel PREVIEW deployments for this project have NO `MONGODB_URI` (previews lack
 * runtime secrets) — so every request in this suite exercises the REAL degraded path,
 * not a mock. That is intentional: the preview environment is a faithful, permanent
 * reproduction of a total Mongo outage. See src/service/like.service.ts and
 * src/app/api/likes/route.ts.
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
 * The healthy-Mongo path (AC3: like count/toggle) CANNOT be exercised here — there is no
 * DB to be healthy against on preview — and is covered instead by the unit tests
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
