import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { getSeo } from "@lib/contentful/getSeo";
import { ContactForm } from "@src/components/features/contact-form";
import { ContactInformationSection } from "@src/components/features/contact-information-section";
import DescriptionContactSection from "@src/components/features/description-contact-section/DescriptionContactSection";
import { Header } from "@src/components/shared/header";
import { localesPath } from "@src/i18n/config";
import { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;

  const seoContent = await getSeo("seo-connect", locale);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    title: seoContent.title,
    description: seoContent.desacription,
    keywords: seoContent.keywords,
    openGraph: {
      title: seoContent.title,
      description: seoContent.desacription,
      images: [{ url: seoContent.image.url }],
      url: `${baseUrl}/${locale}`,
      siteName: seoContent.siteName,
      type: seoContent.type,
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: localesPath,
    },
  };
}

export default async function ComeMeetUsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled } = await draftMode();

  const descriptionContactSection = await getHeroBannerComponent(
    "description-contact-section",
    locale,
    isEnabled,
  );

  return (
    <main>
      <Header titlePath={"Connect.header-title"} className="bg-community" />

      <DescriptionContactSection content={descriptionContactSection} />

      <ContactInformationSection />
      <ContactForm />
    </main>
  );
}
