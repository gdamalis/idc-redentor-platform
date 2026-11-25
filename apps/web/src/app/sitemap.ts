import { getAllBlogPostSlugs } from "@lib/content/getBlogPostPages";
import { getAllSermonSlugs } from "@lib/content/getSermons";
import { i18n } from "@src/i18n/config";
import type { MetadataRoute } from "next";

/**
 * Render the sitemap on demand at runtime instead of prerendering it at build time
 * (ICR-123 + ICR-205 AC8).
 *
 * - Keeps `pnpm --filter @idcr/web build` completely independent of MongoDB credentials
 *   in CI while ensuring newly published posts and sermons enter `/sitemap.xml` without
 *   needing a redeploy.
 * - Both `@lib/content/*` slug getters wrap their Mongo reads in `unstable_cache` tagged
 *   with `"site-content"`, so runtime requests stay cached and are immediately invalidated
 *   via `revalidateSiteContent()` (`{ expire: 0 }`) when an editor publishes in admin.
 * - Both getters fail closed (throw on DB error) instead of emitting an empty slug list.
 */
export const dynamic = "force-dynamic";

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

  // No `lastModified`: these are hard-coded routes with no content timestamp to report.
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
