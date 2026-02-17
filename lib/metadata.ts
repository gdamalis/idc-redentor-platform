import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { BlogPost } from "@src/types/BlogPost";
import type { SeoContent } from "@src/types/Seo";
import { buildLocaleAlternates } from "@src/i18n/config";
import { shouldUseDraftMode } from "./contentful/draftMode";
import { getSeo } from "./contentful/getSeo";

interface BuildPageMetadataOptions {
  machineName: string;
  locale: string;
  path: string;
}

interface BuildArticleMetadataOptions {
  post: BlogPost;
  locale: string;
  path: string;
}

const DEFAULT_OG_IMAGE = {
  url: "/assets/img/og-default.jpeg",
  width: 1200,
  height: 630,
  alt: "Iglesia de Cristo Redentor",
};

function buildOgImage(seoContent: SeoContent) {
  if (!seoContent.image?.url) {
    return [DEFAULT_OG_IMAGE];
  }

  return [
    {
      url: seoContent.image.url,
      width: seoContent.image.width || 1200,
      height: seoContent.image.height || 630,
      alt: seoContent.image.title,
    },
  ];
}

export async function buildPageMetadata({
  machineName,
  locale,
  path,
}: BuildPageMetadataOptions): Promise<Metadata> {
  const isEnabled = await shouldUseDraftMode();
  const seoContent = await getSeo(machineName, locale, isEnabled);
  const t = await getTranslations("Metadata");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const suffix = path ? `/${path}` : "";
  const pageUrl = `${baseUrl}/${locale}${suffix}`;

  return {
    title: seoContent.title,
    description: seoContent.description,
    keywords: seoContent.keywords,
    openGraph: {
      title: seoContent.title,
      description: seoContent.description,
      images: buildOgImage(seoContent),
      url: pageUrl,
      siteName: t("site-name"),
      type: "website",
      locale: locale.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: seoContent.title,
      description: seoContent.description,
      images: buildOgImage(seoContent),
    },
    alternates: {
      canonical: pageUrl,
      languages: buildLocaleAlternates(path),
    },
  };
}

export function buildArticleMetadata({
  post,
  locale,
  path,
}: BuildArticleMetadataOptions): Metadata {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const pageUrl = `${baseUrl}/${locale}/${path}`;

  const ogImage = {
    url: post.featuredImage.url,
    width: 1200,
    height: 630,
    alt: post.featuredImage.title,
  };

  return {
    title: post.seoTitle,
    description: post.seoDescription,
    keywords: post.keywords,
    openGraph: {
      title: post.seoTitle,
      description: post.seoDescription,
      images: [ogImage],
      url: pageUrl,
      type: "article",
      locale: locale.replace("-", "_"),
      publishedTime: post.publishedDate,
      modifiedTime: post.sys.publishedAt,
      authors: [post.author.name],
      tags: post.keywords,
    },
    twitter: {
      card: "summary_large_image",
      title: post.seoTitle,
      description: post.seoDescription,
      images: [ogImage],
    },
    alternates: {
      canonical: pageUrl,
      languages: buildLocaleAlternates(path),
    },
  };
}

export function buildArticleJsonLd(post: BlogPost, locale: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.seoTitle,
    description: post.seoDescription,
    image: post.featuredImage.url,
    datePublished: post.publishedDate,
    dateModified: post.sys.publishedAt ?? post.publishedDate,
    author: {
      "@type": "Person",
      name: post.author.name,
    },
    publisher: {
      "@type": "Organization",
      name: "Iglesia de Cristo Redentor",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/assets/img/og-default.jpeg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/${locale}/blog/${post.slug}`,
    },
    keywords: post.keywords?.join(", "),
    inLanguage: locale,
  };
}
