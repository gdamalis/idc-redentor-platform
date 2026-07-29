import { describe, it, expect, vi, beforeEach } from "vitest";

import { i18n } from "@src/i18n/config";

// vi.mock factories are hoisted above the module body, so the shared mock fns
// must be created via vi.hoisted to be defined when the factories run.
const { getAllBlogPostSlugs, getAllSermonSlugs } = vi.hoisted(() => ({
  getAllBlogPostSlugs: vi.fn(),
  getAllSermonSlugs: vi.fn(),
}));

vi.mock("@lib/contentful/getBlogPostPages", () => ({ getAllBlogPostSlugs }));
vi.mock("@lib/contentful/getSermons", () => ({ getAllSermonSlugs }));

const BASE_URL = "https://www.example.org";

async function importSitemap() {
  const mod = await import("./sitemap");
  return mod;
}

describe("sitemap", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
    getAllBlogPostSlugs.mockResolvedValue([]);
    getAllSermonSlugs.mockResolvedValue([]);
  });

  /**
   * ICR-123 regression guard.
   *
   * `sitemap.ts` is "a special Route Handler that is cached by default unless it uses a
   * Request-time API or dynamic config option" (Next.js 16 docs). Without an explicit opt-out it is
   * baked at build time, so sermons and posts published AFTER the last deploy never enter
   * sitemap.xml — verified in production on 2026-07-29, where the live sitemap was still the
   * 2026-07-17 build and omitted two sermons published on 2026-07-19.
   *
   * The exported `revalidate` IS that opt-out. It is invisible at runtime until SEO quietly decays,
   * so it is asserted here rather than left to review.
   */
  it("opts out of build-time-only caching with a bounded revalidate window", async () => {
    const { revalidate } = await importSitemap();

    expect(typeof revalidate).toBe("number");
    expect(Number.isFinite(revalidate)).toBe(true);
    expect(revalidate).toBeGreaterThan(0);
    // A window longer than a day would reintroduce the staleness this guards against.
    expect(revalidate).toBeLessThanOrEqual(86_400);
  });

  it("emits every sermon once per locale", async () => {
    getAllSermonSlugs.mockResolvedValue([
      { slug: "consuelo-en-medio-del-dolor", updatedAt: "2026-07-19T17:25:48.480Z" },
      { slug: "dios-toca-la-puerta", updatedAt: "2026-07-19T17:26:09.116Z" },
    ]);

    const { default: sitemap } = await importSitemap();
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const locale of i18n.locales) {
      expect(urls).toContain(`${BASE_URL}/${locale}/predicas/consuelo-en-medio-del-dolor`);
      expect(urls).toContain(`${BASE_URL}/${locale}/predicas/dios-toca-la-puerta`);
    }
  });

  it("emits blog posts on the default locale with alternates for the others", async () => {
    getAllBlogPostSlugs.mockResolvedValue([
      { slug: "el-perdon-de-jesus", updatedAt: "2026-06-01T00:00:00.000Z" },
    ]);

    const { default: sitemap } = await importSitemap();
    const entries = await sitemap();
    const post = entries.find((entry) => entry.url.includes("/blog/el-perdon-de-jesus"));

    expect(post?.url).toBe(`${BASE_URL}/${i18n.defaultLocale}/blog/el-perdon-de-jesus`);
    for (const locale of i18n.locales) {
      expect(post?.alternates?.languages?.[locale]).toBe(
        `${BASE_URL}/${locale}/blog/el-perdon-de-jesus`,
      );
    }
  });

  it("always includes the static pages, even when Contentful returns nothing", async () => {
    const { default: sitemap } = await importSitemap();
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}`);
    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}/predicas`);
    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}/blog`);
  });

  /**
   * ICR-123 review follow-up. Because this route is ISR, a regeneration that *succeeds* with a
   * degraded result caches that degraded result for the next hour. Propagating the failure is what
   * makes Next.js keep serving the previous complete sitemap: "If an error is thrown while
   * attempting to revalidate data, the last successfully generated data will continue to be served
   * from the cache."
   */
  it.each([
    ["sermons", () => getAllSermonSlugs.mockRejectedValue(new Error("Contentful error"))],
    ["blog posts", () => getAllBlogPostSlugs.mockRejectedValue(new Error("Contentful error"))],
  ])("fails regeneration rather than emitting a sitemap missing all %s", async (_label, arrange) => {
    arrange();

    const { default: sitemap } = await importSitemap();

    await expect(sitemap()).rejects.toThrow();
  });

  /**
   * `lastModified: new Date()` on a hard-coded route is not a modification time — it is "now". Once
   * the route regenerates hourly it would claim all six static pages changed every hour, which is
   * exactly the kind of untrustworthy signal crawlers learn to discount. Contentful-backed entries
   * keep their real timestamps; these have none to report, so they report none.
   */
  it("omits lastModified on static pages, but keeps it on Contentful-backed entries", async () => {
    getAllBlogPostSlugs.mockResolvedValue([
      { slug: "el-perdon-de-jesus", updatedAt: "2026-06-01T00:00:00.000Z" },
    ]);
    getAllSermonSlugs.mockResolvedValue([
      { slug: "dios-toca-la-puerta", updatedAt: "2026-07-19T17:26:09.116Z" },
    ]);

    const entries = await (await importSitemap()).default();
    const bySuffix = (suffix: string) =>
      entries.find((entry) => entry.url.endsWith(suffix));

    expect(bySuffix(`/${i18n.defaultLocale}`)?.lastModified).toBeUndefined();
    expect(bySuffix("/predicas")?.lastModified).toBeUndefined();
    expect(bySuffix("/blog")?.lastModified).toBeUndefined();

    expect(bySuffix("/blog/el-perdon-de-jesus")?.lastModified).toEqual(
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(bySuffix("/es-AR/predicas/dios-toca-la-puerta")?.lastModified).toEqual(
      new Date("2026-07-19T17:26:09.116Z"),
    );
  });
});
