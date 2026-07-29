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
 *   - Unlike `dynamic = "force-dynamic"`, a cached copy is still served if Contentful is briefly
 *     unavailable, and crawlers never pay for a cold Contentful round-trip.
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

  const staticEntries: MetadataRoute.Sitemap = staticPages.map((page) => {
    const suffix = page ? `/${page}` : "";
    return {
      url: `${baseUrl}/${i18n.defaultLocale}${suffix}`,
      lastModified: new Date(),
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
