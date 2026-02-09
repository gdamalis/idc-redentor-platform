import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getLatestBlogPostPages } from "@lib/contentful/getBlogPostPages";
import { getPage } from "@lib/contentful/getPage";
import { buildPageMetadata } from "@lib/metadata";
import { BlogSection } from "@src/components/features/blog-section";
import { resolveComponents } from "@src/components/features/component-resolver";
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

  const landingPage = await getPage("blog", locale, isEnabled);

  const latestPosts = await getLatestBlogPostPages(locale, {
    isDraftMode: isEnabled,
  });

  return (
    <main>
      <Header 
        titlePath="Blog.header-title" 
        variant="gradient"
        subtitle={t("header-subtitle")}
      />
      <BlogSection posts={latestPosts} showHeader={false} />
      {resolveComponents(landingPage.extraSectionCollection)}
    </main>
  );
}
