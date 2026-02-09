import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import {
  getBlogPostPage,
  getLatestBlogPostPages,
} from "@lib/contentful/getBlogPostPages";
import { getCtaComponent } from "@lib/contentful/getCtaComponent";
import { buildArticleJsonLd, buildArticleMetadata } from "@lib/metadata";
import BlogPostDetails from "@src/components/features/blog-post-details/BlogPostDetails";
import { ComponentCta } from "@src/components/features/component-cta";
import { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

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

  const isEnabled = await shouldUseDraftMode();
  const post = await getBlogPostPage(slug, locale, isEnabled);

  if (!post) {
    return {
      title: "Post not found",
    };
  }

  return buildArticleMetadata({
    post,
    locale,
    path: `blog/${post.slug}`,
  });
}

export default async function PostDetailsPage({
  params,
}: PostDetailsPageProps) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  const isEnabled = await shouldUseDraftMode();

  const post = await getBlogPostPage(slug, locale, isEnabled);

  if (!post) {
    return <div>Post not found</div>;
  }

  const latestPosts = await getLatestBlogPostPages(locale, {
    slug,
    isDraftMode: isEnabled,
  });

  const contactCta = await getCtaComponent(
    "connect-with-us",
    locale,
    isEnabled,
  );

  const jsonLd = buildArticleJsonLd(post, locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogPostDetails post={post} relatedPosts={latestPosts} locale={locale} />
      <ComponentCta content={contactCta} />
    </>
  );
}
