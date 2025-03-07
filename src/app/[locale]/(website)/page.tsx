import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getHeroBannerComponent } from "@lib/contentful/getHeroBannerComponent";
import { ContactCta } from "@src/components/features/contact-cta";
import { OurMissionCta } from "@src/components/features/our-mission-cta";
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
    title: t("homePage.title"),
    description: t("homePage.description"),
    keywords: t("homePage.keywords"),
    openGraph: {
      title: t("homePage.title"),
      description: t("homePage.description"),
      image: "/assets/img/redentor_logo.png",
      url: "/",
    },
    alternates: {
      canonical: "/",
      languages: {
        "es-AR": "/es-AR",
        "en-US": "/en-US",
      },
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

  const { isEnabled } = await draftMode();
  const ourMission = await getHeroBannerComponent(
    "our-mission",
    locale,
    isEnabled,
  );
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );


  return (
    <main>
      <OurMissionCta content={ourMission} />
      {/* <BlogSection posts={posts} /> */}
      <ContactCta content={contactCta} />
    </main>
  );
}
