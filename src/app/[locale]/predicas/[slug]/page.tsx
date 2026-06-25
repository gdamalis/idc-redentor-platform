import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getSermon, getLatestSermons } from "@lib/contentful/getSermons";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { buildSermonMetadata, buildSermonJsonLd } from "@lib/sermonMetadata";
import { SermonDetails } from "@src/components/features/sermon-details";
import { ComponentCta } from "@src/components/features/component-cta";
import { getLikes } from "@src/service/like.service";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";

type SermonDetailsPageParams = {
  slug: string;
  locale: string;
};

type SermonDetailsPageProps = Readonly<{
  params: Promise<SermonDetailsPageParams>;
}>;

export async function generateMetadata({
  params,
}: SermonDetailsPageProps): Promise<Metadata> {
  const { slug, locale } = await params;

  const isEnabled = await shouldUseDraftMode();
  const sermon = await getSermon(slug, locale, isEnabled);

  if (!sermon) {
    return { title: "Sermon not found" };
  }

  return buildSermonMetadata({
    sermon,
    locale,
    path: `predicas/${sermon.slug}`,
  });
}

export default async function SermonDetailsPage({
  params,
}: SermonDetailsPageProps) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const isEnabled = await shouldUseDraftMode();

  const sermon = await getSermon(slug, locale, isEnabled);

  if (!sermon) {
    return <div>Sermon not found</div>;
  }

  const relatedSermons = await getLatestSermons(locale, {
    slug,
    isDraftMode: isEnabled,
  });

  const contactCta = await getCtaComponent("connect-with-us", locale, isEnabled);

  const cookieStore = await cookies();
  const visitorId = cookieStore.get("_visitor_id")?.value;
  const likeKey = `predicas/${slug}`;
  const likesData = await getLikes(likeKey, visitorId);

  const jsonLd = buildSermonJsonLd(sermon, locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SermonDetails
        sermon={sermon}
        relatedSermons={relatedSermons}
        locale={locale}
        initialLikeCount={likesData.count}
        initialHasLiked={likesData.hasLiked}
      />
      <ComponentCta content={contactCta} />
    </>
  );
}
