import { fetchGraphQL } from "./fetch";
import type { Sermon } from "@src/types/Sermon";

const GRAPHQL_FIELDS = `
  title
  slug
  sermonDate
  thesis
  mainPoints
  excerpt
  durationSeconds
  content {
    json
    links {
      assets {
        block {
          sys {
            id
          }
          url
          title
          width
          height
          contentType
        }
      }
    }
  }
  featuredImage {
    url
    title
  }
  audio {
    url
    title
    contentType
    fileName
    size
  }
  pdfSummary {
    url
    title
    contentType
    fileName
    size
  }
  preacher {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  scriptureReferencesCollection {
    items {
      ... on BibleVerse {
        book
        chapter
        fromVerse
        toVerse
        verseContent
        bibleVersion
      }
    }
  }
  seoTitle
  seoDescription
  keywords
  relatedSermonsCollection(limit: 3) {
    items {
      ... on Sermon {
        title
        slug
        sermonDate
        excerpt
        featuredImage {
          url
          title
        }
      }
    }
  }
  sys {
    id
    publishedAt
  }
  __typename
`;

function mapSermon(item: Record<string, unknown>): Sermon {
  const scriptureItems = (
    (item.scriptureReferencesCollection as Record<string, unknown>)?.items as unknown[]
  ) ?? [];

  const relatedItems = (
    (item.relatedSermonsCollection as Record<string, unknown>)?.items as unknown[]
  ) ?? [];

  return {
    title: item.title as string,
    slug: item.slug as string,
    sermonDate: item.sermonDate as string,
    preacher: item.preacher as Sermon["preacher"],
    scriptureReferences: scriptureItems as Sermon["scriptureReferences"],
    thesis: item.thesis as string,
    mainPoints: (item.mainPoints as string[]) ?? [],
    excerpt: item.excerpt as string,
    content: item.content as Sermon["content"],
    featuredImage: item.featuredImage as Sermon["featuredImage"],
    audio: item.audio as Sermon["audio"],
    durationSeconds: item.durationSeconds as number | undefined,
    pdfSummary: item.pdfSummary as Sermon["pdfSummary"],
    seoTitle: item.seoTitle as string,
    seoDescription: item.seoDescription as string,
    keywords: (item.keywords as string[]) ?? [],
    relatedSermons: relatedItems as Sermon["relatedSermons"],
    sys: item.sys as Sermon["sys"],
  };
}

export async function getSermon(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<Sermon> {
  const data = await fetchGraphQL(
    `query {
      sermonCollection(
        where: { slug: "${slug}" },
        locale: "${locale}",
        limit: 1,
        preview: ${isDraftMode ? "true" : "false"}
      ) {
        items {
          ${GRAPHQL_FIELDS}
        }
      }
    }`,
    isDraftMode,
  );

  return mapSermon(data?.data?.sermonCollection?.items[0]);
}

export async function getLatestSermons(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  } = {},
): Promise<Sermon[]> {
  const whereClause = options?.slug
    ? `where: { slug_not: "${options.slug}" },`
    : "";

  const data = await fetchGraphQL(
    `query {
      sermonCollection(
        locale: "${locale}",
        limit: 3,
        ${whereClause}
        order: sermonDate_DESC,
        preview: ${options?.isDraftMode ? "true" : "false"}
      ) {
        items {
          ${GRAPHQL_FIELDS}
        }
      }
    }`,
    options?.isDraftMode ?? false,
  );

  return (data?.data?.sermonCollection?.items ?? []).map(
    (item: Record<string, unknown>) => mapSermon(item),
  );
}

export async function getAllSermons(
  locale: string,
  options: {
    isDraftMode?: boolean;
  } = {},
): Promise<Sermon[]> {
  const data = await fetchGraphQL(
    `query {
      sermonCollection(
        locale: "${locale}",
        limit: 100,
        order: sermonDate_DESC,
        preview: ${options?.isDraftMode ? "true" : "false"}
      ) {
        items {
          ${GRAPHQL_FIELDS}
        }
      }
    }`,
    options?.isDraftMode ?? false,
  );

  return (data?.data?.sermonCollection?.items ?? []).map(
    (item: Record<string, unknown>) => mapSermon(item),
  );
}

export async function getAllSermonSlugs(
  locale: string,
): Promise<Array<{ slug: string; updatedAt: string }>> {
  const data = await fetchGraphQL(
    `query {
      sermonCollection(
        locale: "${locale}",
        limit: 100,
        preview: false
      ) {
        items {
          slug
          sys {
            publishedAt
          }
        }
      }
    }`,
    false,
  );

  return (
    data?.data?.sermonCollection?.items?.map(
      (item: { slug: string; sys: { publishedAt: string } }) => ({
        slug: item.slug,
        updatedAt: item.sys.publishedAt,
      }),
    ) ?? []
  );
}
