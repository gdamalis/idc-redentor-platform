import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { ContactForm } from "@src/components/features/contact-form";
import { ContactInformationSection } from "@src/components/features/contact-information-section";
import DescriptionContactSection from "@src/components/features/description-contact-section/DescriptionContactSection";
import { Header } from "@src/components/shared/header";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("conectemosPage.title"),
    description: t("conectemosPage.description"),
    keywords: t("conectemosPage.keywords"),
    openGraph: {
      title: t("conectemosPage.title"),
      description: t("conectemosPage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/come-meet-us",
    },
    alternates: {
      canonical: "/come-meet-us",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function ComeMeetUsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  const { isEnabled } = await draftMode();

  const descriptionContactSection = await getHeroBannerComponent(
    "description-contact-section",
    locale,
    isEnabled,
  );

  setRequestLocale(locale);

  return (
    <main>
      <Header
        titlePath={"conectemosPage.headerTitle"}
        className="bg-community"
      />

      <DescriptionContactSection content={descriptionContactSection} />

      <ContactInformationSection />
      <ContactForm />
    </main>
  );
}
