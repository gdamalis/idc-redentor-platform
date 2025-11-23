import { shouldUseDraftMode } from '@lib/contentful/draftMode';
import { getSeo } from '@lib/contentful/getSeo';
import { localesPath } from '@src/i18n/config';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata");
  const isEnabled = await shouldUseDraftMode();
  const seoContent = await getSeo("seo-who-is-jesus", locale, isEnabled);
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

export default function WhoIsJesusPage() {
  return (
    <div>WhoIsJesusPage</div>
  )
}
