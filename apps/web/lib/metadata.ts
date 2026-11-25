import { LOGO } from "@idcr/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildLocaleAlternates } from "@src/i18n/config";
import { shouldUseDraftMode } from "./content/draft-mode";
import { getSeo } from "./content/getSeo";
import type {
  BlogPostView,
  EventBannerView,
  SeoView,
} from "./content/types";

interface BuildPageMetadataOptions {
  readonly machineName: string;
  readonly locale: string;
  readonly path: string;
}

interface BuildArticleMetadataOptions {
  readonly post: BlogPostView;
  readonly locale: string;
  readonly path: string;
}

/**
 * Site-wide default Open Graph / social-card image, used whenever a page or
 * entry has no image of its own. Single source of truth for the filename — the
 * asset on disk is `og_default.jpeg` (underscore); referencing this constant
 * everywhere avoids the recurring `og-default.jpeg` (hyphen) 404.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/assets/img/og_default.jpeg",
  width: 1200,
  height: 630,
  alt: "Iglesia de Cristo Redentor",
};

function buildOgImage(seoContent: SeoView | undefined) {
  if (!seoContent?.image?.url) {
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
  const siteName = t("site-name");
  const title = seoContent?.title || siteName;
  const description = seoContent?.description ?? "";
  const keywords = seoContent?.keywords ?? [];
  const images = buildOgImage(seoContent);

  return {
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      images,
      url: pageUrl,
      siteName,
      type: "website",
      locale: locale.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
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

  const ogImage = post.featuredImage
    ? {
        url: post.featuredImage.url,
        width: 1200,
        height: 630,
        alt: post.featuredImage.title,
      }
    : DEFAULT_OG_IMAGE;

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
      ...(post.author ? { authors: [post.author.name] } : {}),
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

export function buildOrganizationJsonLd(locale: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const name =
    locale === "en-US" ? "Redentor Church of Christ" : "Iglesia de Cristo Redentor";

  return {
    "@context": "https://schema.org",
    "@type": "Church" as const,
    "@id": `${baseUrl}/#church`,
    name,
    url: `${baseUrl}/${locale}`,
    logo: `${baseUrl}${LOGO.default}`,
    image: `${baseUrl}/assets/img/og_default.jpeg`,
    email: "info@idcredentor.org",
    address: {
      "@type": "PostalAddress" as const,
      streetAddress: "Tte. Gral. Juan Domingo Perón 4385",
      addressLocality: "Buenos Aires",
      addressRegion: "Ciudad Autónoma de Buenos Aires",
      addressCountry: "AR",
    },
    geo: {
      "@type": "GeoCoordinates" as const,
      latitude: -34.6058,
      longitude: -58.4287,
    },
    sameAs: [
      "https://www.facebook.com/iglesiadecristoredentor",
      "https://www.instagram.com/idcredentor/",
    ],
  };
}

export function buildEventJsonLd(
  eventBanner: Pick<EventBannerView, "eventInfo" | "location">,
  locale: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const { eventInfo, location } = eventBanner;

  const name =
    locale === "en-US" ? "Redentor Church of Christ" : "Iglesia de Cristo Redentor";

  const geo =
    location?.location?.lat != null
      ? {
          "@type": "GeoCoordinates" as const,
          latitude: location.location.lat,
          longitude: location.location.lon,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event" as const,
    name: eventInfo.name,
    ...(eventInfo.note ? { description: eventInfo.note } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    eventSchedule: {
      "@type": "Schedule" as const,
      byDay: "https://schema.org/Sunday",
      startTime: eventInfo.time,
      repeatFrequency: "P1W",
    },
    ...(location
      ? {
          location: {
            "@type": "Place" as const,
            name,
            address: {
              "@type": "PostalAddress" as const,
              streetAddress: location.addressLine1,
              addressLocality: location.city,
              ...(location.neighborhood
                ? { addressRegion: location.neighborhood }
                : {}),
              addressCountry: location.country,
            },
            ...(geo ? { geo } : {}),
            ...(location.googleMapsUrl
              ? { hasMap: location.googleMapsUrl }
              : {}),
          },
        }
      : {}),
    organizer: {
      "@type": "Church" as const,
      name,
      url: `${baseUrl}/${locale}`,
    },
  };
}

export function buildArticleJsonLd(post: BlogPostView, locale: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting" as const,
    headline: post.seoTitle,
    description: post.seoDescription,
    image: post.featuredImage?.url ?? `${baseUrl}${DEFAULT_OG_IMAGE.url}`,
    datePublished: post.publishedDate,
    dateModified: post.sys.publishedAt ?? post.publishedDate,
    ...(post.author
      ? {
          author: {
            "@type": "Person" as const,
            name: post.author.name,
          },
        }
      : {}),
    publisher: {
      "@type": "Organization" as const,
      name: "Iglesia de Cristo Redentor",
      logo: {
        "@type": "ImageObject" as const,
        url: `${baseUrl}${DEFAULT_OG_IMAGE.url}`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage" as const,
      "@id": `${baseUrl}/${locale}/blog/${post.slug}`,
    },
    keywords: post.keywords?.join(", "),
    inLanguage: locale,
  };
}
