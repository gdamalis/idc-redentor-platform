import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getContentCollection } from "@lib/contentful/getContentCollection";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { getSeo } from "@lib/contentful/getSeo";
import { BlogSection } from "@src/components/features/blog-section";
import { ComponentCta } from "@src/components/features/component-cta";
import { OurMissionCta } from "@src/components/features/our-mission-cta";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { localesPath } from "@src/i18n/config";
import { type Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata");

  const isEnabled = await shouldUseDraftMode();
  const seoContent = await getSeo("seo-home", locale, isEnabled);
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

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();
  const ourMission = await getHeroBannerComponent(
    "our-mission",
    locale,
    isEnabled,
  );
  const ourMissionCollection = await getContentCollection(
    "collection-our-mission",
    locale,
    isEnabled,
  );
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );
  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });

  return (
    <main>
      <OurMissionCta content={ourMission} />
      <OurMissionSection content={ourMissionCollection} />
      <BlogSection posts={latestPosts} />
      <ComponentCta content={contactCta} />
    </main>
  );
}
