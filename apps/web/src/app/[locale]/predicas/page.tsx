import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getAllSermons } from "@lib/contentful/getSermons";
import { buildLocaleAlternates } from "@src/i18n/config";
import { SermonSection } from "@src/components/features/sermon-section";
import { Header } from "@src/components/shared/header";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Sermons" });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    title: t("header-title"),
    description: t("header-subtitle"),
    alternates: {
      canonical: `${baseUrl}/${locale}/predicas`,
      languages: buildLocaleAlternates("predicas"),
    },
  };
}

export default async function PredicasPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Sermons" });
  const isEnabled = await shouldUseDraftMode();

  const sermons = await getAllSermons(locale, { isDraftMode: isEnabled });

  return (
    <main>
      <Header
        titlePath="Sermons.header-title"
        variant="gradient"
        subtitle={t("header-subtitle")}
      />
      <SermonSection sermons={sermons} />
    </main>
  );
}
