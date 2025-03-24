import {
  getBlogPostPage,
  getLatestBlogPostPages,
} from "@lib/contentful/getBlogPostPages";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import BlogPostDetails from "@src/components/features/blog-post-details/BlogPostDetails";
import { ComponentCta } from "@src/components/features/component-cta";
import { localesPath } from "@src/i18n/config";
import { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { draftMode } from "next/headers";

type PostDetailsPageParams = {
  slug: string;
  locale: string;
};

type PostDetailsPageProps = Readonly<{
  params: Promise<PostDetailsPageParams>;
}>;

export async function generateMetadata({
  params,
}: PostDetailsPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const t = await getTranslations("Metadata");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const { isEnabled } = await draftMode();
  const post = await getBlogPostPage(slug, locale, isEnabled);

  if (!post) {
    return {
      title: "Post not found",
    };
  }

  return {
    title: post.seoTitle,
    description: post.seoDescription,
    keywords: post.keywords,
    openGraph: {
      title: post.seoTitle,
      description: post.seoDescription,
      images: [{ url: post.featuredImage.url }],
      url: `${baseUrl}/${locale}/blog/${post.slug}`,
      siteName: t("site-name"),
      type: "article",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/blog/${post.slug}`,
      languages: localesPath,
    },
  };
}

export default async function PostDetailsPage({
  params,
}: PostDetailsPageProps) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const { isEnabled } = await draftMode();

  const post = await getBlogPostPage(slug, locale, isEnabled);

  if (!post) {
    return <div>Post not found</div>;
  }

  const latestPosts = await getLatestBlogPostPages(locale, isEnabled);

  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  return (
    <>
      <BlogPostDetails post={post} relatedPosts={latestPosts} locale={locale} />
      <ComponentCta content={contactCta} />
    </>
  );
}
