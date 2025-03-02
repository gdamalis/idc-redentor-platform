import { getCredos } from "@lib/contentful/getCredo";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getDuplexComponent } from "@lib/contentful/getDuplexComponent";
import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import AboutCommunitySection from "@src/components/features/about-community-section/AboutCommunitySection";
import { ContactCta } from "@src/components/features/contact-cta";
import { CredoSection } from "@src/components/features/creed-section";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { Header } from "@src/components/shared/header";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: t("comunidadPage.title"),
    description: t("comunidadPage.description"),
    keywords: t("comunidadPage.keywords"),
    openGraph: {
      title: t("comunidadPage.title"),
      description: t("comunidadPage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/community",
    },
    alternates: {
      canonical: "/community",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
    },
  };
}

export default async function CommunityPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const contactCta = await getCtaComponent("connect-with-us", locale);
  const aboutCommunitySection = await getHeroBannerComponent("about-community", locale);
  const credos = await getCredos(locale);
  const ourMissionSection = await getDuplexComponent("our-mission-section", locale);

  setRequestLocale(locale);

  return (
    <main>
      <Header titlePath="comunidadPage.headerTitle" className="bg-community" />
      <AboutCommunitySection content={aboutCommunitySection} />
      <CredoSection content={credos} />
      <OurMissionSection content={ourMissionSection} />
      <ContactCta content={contactCta} />
    </main>
  );
}
