import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getPage } from "@lib/contentful/getPage";
import { getSeo } from "@lib/contentful/getSeo";
import { BlogSection } from "@src/components/features/blog-section";
import { resolveComponents } from "@src/components/features/component-resolver";
import { localesPath } from "@src/i18n/config";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata");

  const isEnabled = await shouldUseDraftMode();
  const seoContent = await getSeo("seo-blog", locale, isEnabled);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    title: seoContent.title,
    description: seoContent.description,
    keywords: seoContent.keywords,
    openGraph: {
      title: seoContent.title,
      description: seoContent.description,
      images: [{ url: seoContent.image.url }],
      url: `${baseUrl}/${locale}`,
      siteName: t("site-name"),
      type: "website",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: localesPath,
    },
  };
}

export default async function BlogPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isEnabled = await shouldUseDraftMode();

  const landingPage = await getPage("blog", locale, isEnabled);

  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });

  return (
    <div>
      <BlogSection posts={latestPosts} />
      {resolveComponents(landingPage.extraSectionCollection)}
    </div>
  );
}
