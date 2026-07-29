import { getAllBlogPostSlugs } from "@lib/contentful/getBlogPostPages";
import { getAllSermonSlugs } from "@lib/contentful/getSermons";
import { i18n } from "@src/i18n/config";
import type { MetadataRoute } from "next";

/**
 * Refresh the sitemap hourly instead of baking it into the build (ICR-123).
 *
 * `sitemap.ts` is "a special Route Handler that is cached by default unless it uses a Request-time
 * API or dynamic config option" (Next.js 16). This module uses neither, so it was fully static:
 * every page below is rendered per-request, but sitemap.xml was frozen at build time and only
 * changed on deploy. Verified in production on 2026-07-29 — the live sitemap was still the
 * 2026-07-17 build and omitted two sermons published on 2026-07-19.
 *
 * `revalidate` is the dynamic config option that opts out. An hourly window is deliberate:
 *
 *   - It does not depend on `revalidateTag("site-content")`. The Contentful publish webhook filters
 *     on `sys.environment.sys.id == "production"` while publishes arrive through the `master` alias,
 *     so that tag purge does not currently fire in production. The getters below are still tagged,
 *     so a fixed webhook would additionally purge this route instantly — hourly is the floor, not
 *     the ceiling.
 *   - Unlike `dynamic = "force-dynamic"`, crawlers never pay for a cold Contentful round-trip, and
 *     a failed regeneration keeps the previous copy: "If an error is thrown while attempting to
 *     revalidate data, the last successfully generated data will continue to be served from the
 *     cache" (Next.js ISR docs).
 *
 * That last guarantee only holds if a failed read actually THROWS. Both getters below therefore
 * refuse to report an unreadable collection as an empty one — otherwise regeneration would
 * "succeed" with every URL stripped and cache that for an hour, which is strictly worse than
 * serving a slightly stale sitemap.
 */
export const revalidate = 3600;

const staticPages = [
  "",
  "blog",
  "predicas",
  "community",
  "come-meet-us",
  "who-is-jesus",
];

function buildAlternates(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const suffix = path ? `/${path}` : "";
  return {
    languages: Object.fromEntries(
      i18n.locales.map((locale) => [
        locale,
        `${baseUrl}/${locale}${suffix}`,
      ]),
    ),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  // No `lastModified`: these are hard-coded routes with no content timestamp to report. Stamping
  // `new Date()` would claim all six changed on every hourly regeneration — the kind of inaccurate
  // signal crawlers learn to discount, which would devalue the real timestamps below with it.
  const staticEntries: MetadataRoute.Sitemap = staticPages.map((page) => {
    const suffix = page ? `/${page}` : "";
    return {
      url: `${baseUrl}/${i18n.defaultLocale}${suffix}`,
      alternates: buildAlternates(page),
    };
  });

  const blogSlugs = await getAllBlogPostSlugs(i18n.defaultLocale);

  const blogEntries: MetadataRoute.Sitemap = blogSlugs.map((post) => ({
    url: `${baseUrl}/${i18n.defaultLocale}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    alternates: buildAlternates(`blog/${post.slug}`),
  }));

  const sermonSlugs = await getAllSermonSlugs(i18n.defaultLocale);

  const sermonEntries: MetadataRoute.Sitemap = sermonSlugs.flatMap((sermon) =>
    i18n.locales.map((locale) => ({
      url: `${baseUrl}/${locale}/predicas/${sermon.slug}`,
      lastModified: new Date(sermon.updatedAt),
      alternates: buildAlternates(`predicas/${sermon.slug}`),
    })),
  );

  return [...staticEntries, ...blogEntries, ...sermonEntries];
}
