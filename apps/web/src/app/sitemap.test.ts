import { describe, it, expect, vi, beforeEach } from "vitest";

import { i18n } from "@src/i18n/config";

// vi.mock factories are hoisted above the module body, so the shared mock fns
// must be created via vi.hoisted to be defined when the factories run.
const { getAllBlogPostSlugs, getAllSermonSlugs } = vi.hoisted(() => ({
  getAllBlogPostSlugs: vi.fn(),
  getAllSermonSlugs: vi.fn(),
}));

vi.mock("@lib/content/getBlogPostPages", () => ({ getAllBlogPostSlugs }));
vi.mock("@lib/content/getSermons", () => ({ getAllSermonSlugs }));

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
   * ICR-123 + ICR-205 AC8 regression guard:
   * `dynamic = "force-dynamic"` prevents build-time prerendering (so CI builds succeed with
   * zero database credentials) while runtime reads remain cached via the `"site-content"` tag.
   */
  it("opts out of build-time prerendering with dynamic = 'force-dynamic'", async () => {
    const { dynamic } = await importSitemap();
    expect(dynamic).toBe("force-dynamic");
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

  it("emits blog posts on the default locale with alternates for the others (no 100-post cap)", async () => {
    const slugs = Array.from({ length: 105 }, (_, idx) => ({
      slug: `post-${idx + 1}`,
      updatedAt: "2026-06-01T00:00:00.000Z",
    }));
    getAllBlogPostSlugs.mockResolvedValue(slugs);

    const { default: sitemap } = await importSitemap();
    const entries = await sitemap();
    const blogEntries = entries.filter((entry) => entry.url.includes("/blog/"));

    expect(blogEntries).toHaveLength(105);
    const post = entries.find((entry) => entry.url.includes("/blog/post-105"));
    expect(post?.url).toBe(`${BASE_URL}/${i18n.defaultLocale}/blog/post-105`);
    for (const locale of i18n.locales) {
      expect(post?.alternates?.languages?.[locale]).toBe(
        `${BASE_URL}/${locale}/blog/post-105`,
      );
    }
  });

  it("always includes the static pages, even when the database returns nothing", async () => {
    const { default: sitemap } = await importSitemap();
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}`);
    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}/predicas`);
    expect(urls).toContain(`${BASE_URL}/${i18n.defaultLocale}/blog`);
  });

  it.each([
    ["sermons", () => getAllSermonSlugs.mockRejectedValue(new Error("Database error"))],
    ["blog posts", () => getAllBlogPostSlugs.mockRejectedValue(new Error("Database error"))],
  ])("fails regeneration rather than emitting a sitemap missing all %s", async (_label, arrange) => {
    arrange();

    const { default: sitemap } = await importSitemap();

    await expect(sitemap()).rejects.toThrow();
  });

  it("omits lastModified on static pages, but keeps it on database-backed entries", async () => {
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
