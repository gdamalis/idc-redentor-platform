import { fetchGraphQL } from "./fetch";
import { isValidSlug } from "./slug";
import { isValidLocale } from "@src/i18n/config";

const GRAPHQL_FIELDS = `
  name
  slug
  shortDescription
  featuredImage {
    url
    title
  }
  body {
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
        hyperlink {
          sys {
            id
          }
          url
          title
          contentType
        }
      }
      entries {
        block {
          sys {
            id
          }
          __typename
        }
        hyperlink {
          sys {
            id
          }
          __typename
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

export interface ChurchInfoTopic {
  name: string;
  slug: string;
  shortDescription?: string | null;
  featuredImage?: {
    url: string;
    title: string;
  } | null;
  body: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any;
    links: {
      assets: {
        block: Array<{
          sys: { id: string };
          url: string;
          title: string;
          width?: number;
          height?: number;
          contentType?: string;
        }>;
        hyperlink: Array<{
          sys: { id: string };
          url: string;
          title: string;
          contentType?: string;
        }>;
      };
      entries: {
        block: Array<{
          sys: { id: string };
          __typename: string;
        }>;
        hyperlink: Array<{
          sys: { id: string };
          __typename: string;
        }>;
      };
    };
  };
  sys: {
    id: string;
    publishedAt: string;
  };
}

export async function getChurchInfoTopic(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<ChurchInfoTopic | undefined> {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;

  const data = await fetchGraphQL(
    `query {
      churchInfoTopicCollection(
        locale: "${locale}",
        where: { slug: "${slug}" },
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

  return data?.data?.churchInfoTopicCollection?.items[0] as
    | ChurchInfoTopic
    | undefined;
}
