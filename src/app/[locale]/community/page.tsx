import { getContentCollection } from "@lib/contentful/getContentCollection";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getDuplexComponent } from "@lib/contentful/getDuplexComponent";
import { getSeo } from "@lib/contentful/getSeo";
import { getTextBlockComponent } from "@lib/contentful/getTextBlockComponent";
import { ComponentCta } from "@src/components/features/component-cta";
import { CreedSection } from "@src/components/features/creed-section";
import InfoCommunity from "@src/components/features/info-community/InfoCommunity";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { Header } from "@src/components/shared/header";
import { localesPath } from "@src/i18n/config";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata");

  const seoContent = await getSeo("seo-community", locale);
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

export default async function CommunityPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled } = await draftMode();
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );
  const infoCommunity = await getTextBlockComponent(
    "info-community",
    locale,
    isEnabled,
  );
  const ourCreedContent = await getContentCollection(
    "our-creed",
    locale,
    isEnabled,
  );
  const ourMissionSection = await getDuplexComponent(
    "our-mission-section",
    locale,
    isEnabled,
  );

  return (
    <main>
      <Header titlePath="Community.header-title" className="bg-community" />
      <InfoCommunity content={infoCommunity} />
      <CreedSection content={ourCreedContent} />
      <OurMissionSection content={ourMissionSection} />
      <ComponentCta content={contactCta} />
    </main>
  );
}
