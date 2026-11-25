import { shouldUseDraftMode } from "@lib/content/draft-mode";
import { getLatestBlogPostPages } from "@lib/content/getBlogPostPages";
import { getContentCollection } from "@lib/content/getContentCollection";
import { getCtaComponent } from "@lib/content/getCtaComponent";
import { getHeroBannerComponent } from "@lib/content/getHeroBannerComponent";
import { mapContentCollection } from "@lib/content/mapContentCollection";
import { buildPageMetadata } from "@lib/metadata";
import { BlogSection } from "@src/components/features/blog-section";
import { ComponentCta } from "@src/components/features/component-cta";
import { OurMissionCta } from "@src/components/features/our-mission-cta";
import { OurMissionSection } from "@src/components/features/our-mission-section";
import { routing } from "@src/i18n/routing";
import { type Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;

  // The App Router runs page, layout, and generateMetadata in parallel, so the
  // layout's own notFound() guard does not stop this function from running
  // with an invalid locale (e.g. a bare hit to /monitoring, which is excluded
  // from the proxy matcher for the Sentry tunnel and falls through to here).
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return buildPageMetadata({ machineName: "seo-home", locale, path: "" });
}

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // See the comment in generateMetadata above: the layout's notFound() guard
  // does not stop this page's own data fetch + render from running with an
  // invalid locale, which is how /monitoring produced phantom Sentry errors.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();
  const ourMission = await getHeroBannerComponent(
    "our-mission",
    locale,
    isEnabled,
  );
  const ourMissionCollection = await getContentCollection(
    "collection-our-mission",
    locale,
    isEnabled,
  );
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );
  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });

  return (
    <main>
      {ourMission && <OurMissionCta content={ourMission} />}
      {ourMissionCollection && (
        <OurMissionSection
          content={mapContentCollection(ourMissionCollection)}
        />
      )}
      <BlogSection posts={latestPosts} />
      {contactCta && <ComponentCta content={contactCta} />}
    </main>
  );
}
