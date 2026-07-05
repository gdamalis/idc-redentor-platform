import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getContentCollection } from "@lib/contentful/getContentCollection";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { getTextBlockComponent } from "@lib/contentful/getTextBlockComponent";
import { mapContentCollection } from "@lib/contentful/mapContentCollection";
import { buildPageMetadata } from "@lib/metadata";
import {
  ComponentCta,
  ComponentCtaLive,
} from "@src/components/features/component-cta";
import {
  CreedSection,
  CreedSectionLive,
} from "@src/components/features/creed-section";
import { InfoCommunityLive } from "@src/components/features/info-community";
import InfoCommunity from "@src/components/features/info-community/InfoCommunity";
import {
  OurMissionSection,
  OurMissionSectionLive,
} from "@src/components/features/our-mission-section";
import { PhotoGrid } from "@src/components/features/photo-grid";
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
    machineName: "seo-community",
    locale,
    path: "community",
  });
}

export default async function CommunityPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Community");
  const isEnabled = await shouldUseDraftMode();
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
  const ourMissionCollection = await getContentCollection(
    "collection-our-mission",
    locale,
    isEnabled,
  );

  return (
    <main>
      <Header
        titlePath="Community.header-title"
        variant="gradient"
        subtitle={t("header-subtitle")}
      />
      {infoCommunity?.imagesCollection?.items &&
        infoCommunity.imagesCollection.items.length > 0 && (
          <PhotoGrid
            images={infoCommunity.imagesCollection.items}
            caption={t("photo-grid-caption")}
          />
        )}
      {isEnabled ? (
        <InfoCommunityLive raw={infoCommunity} locale={locale} />
      ) : (
        <InfoCommunity content={infoCommunity} />
      )}
      {isEnabled ? (
        <CreedSectionLive raw={ourCreedContent} locale={locale} />
      ) : (
        <CreedSection content={mapContentCollection(ourCreedContent)} />
      )}
      {isEnabled ? (
        <OurMissionSectionLive raw={ourMissionCollection} locale={locale} />
      ) : (
        <OurMissionSection
          content={mapContentCollection(ourMissionCollection)}
        />
      )}
      {isEnabled ? (
        <ComponentCtaLive raw={contactCta} locale={locale} />
      ) : (
        <ComponentCta content={contactCta} />
      )}
    </main>
  );
}
