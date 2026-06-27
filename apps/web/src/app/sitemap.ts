import { getAllBlogPostSlugs } from "@lib/contentful/getBlogPostPages";
import { getAllSermonSlugs } from "@lib/contentful/getSermons";
import { i18n } from "@src/i18n/config";
import type { MetadataRoute } from "next";

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
