import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getContactForm } from "@lib/contentful/getContactForm";
import { getEventBanner } from "@lib/contentful/getEventBanner";
import { getSeo } from "@lib/contentful/getSeo";
import { getTextBlockComponent } from "@lib/contentful/getTextBlockComponent";
import { CommunityEvent } from "@src/components/features/community-event";
import { ContactForm } from "@src/components/features/contact-form";
import { InfoConnect } from "@src/components/features/info-connect/InfoConnect";
import { Header } from "@src/components/shared/header";
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
  const seoContent = await getSeo("seo-connect", locale, isEnabled);
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

export default async function ComeMeetUsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();

  const infoContact = await getTextBlockComponent(
    "info-connect",
    locale,
    isEnabled,
  );
  const eventSundayMeetings = await getEventBanner(
    "event-sunday-meetings",
    locale,
    isEnabled,
  );
  const contactForm = await getContactForm(locale, isEnabled);

  return (
    <main>
      <Header titlePath="Connect.header-title" className="bg-community" />

      <InfoConnect content={infoContact} />

      <CommunityEvent content={eventSundayMeetings} />
      <ContactForm content={contactForm} />
    </main>
  );
}
