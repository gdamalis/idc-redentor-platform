import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { buildPageMetadata } from "@lib/metadata";
import { BlogSection } from "@src/components/features/blog-section";
import { ComponentCta } from "@src/components/features/component-cta";
import { Header } from "@src/components/shared/header";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ machineName: "seo-blog", locale, path: "blog" });
}

export default async function BlogPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const isEnabled = await shouldUseDraftMode();

  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });
  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  return (
    <main>
      <Header
        titlePath="Blog.header-title"
        variant="gradient"
        subtitle={t("header-subtitle")}
      />
      <BlogSection posts={latestPosts} showHeader={false} />
      {contactCta && <ComponentCta content={contactCta} />}
    </main>
  );
}
