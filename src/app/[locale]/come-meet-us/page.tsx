import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getContactForm } from "@lib/contentful/getContactForm";
import { getEventBanner } from "@lib/contentful/getEventBanner";
import { getTextBlockComponent } from "@lib/contentful/getTextBlockComponent";
import { buildPageMetadata } from "@lib/metadata";
import { CommunityEvent } from "@src/components/features/community-event";
import { ContactForm } from "@src/components/features/contact-form";
import { InfoConnect } from "@src/components/features/info-connect/InfoConnect";
import { Header } from "@src/components/shared/header";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    machineName: "seo-connect",
    locale,
    path: "come-meet-us",
  });
}

export default async function ComeMeetUsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Connect");
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
      <Header 
        titlePath="Connect.header-title" 
        variant="gradient"
        subtitle={t("header-subtitle")}
      />

      <InfoConnect content={infoContact} />

      <CommunityEvent content={eventSundayMeetings} />
      <ContactForm content={contactForm} />
    </main>
  );
}
