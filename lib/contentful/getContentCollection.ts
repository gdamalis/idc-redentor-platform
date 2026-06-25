import { fetchGraphQL } from "./fetch";
import { ContentCollection } from "./types";

const GRAPHQL_FIELDS = `
  title
  description {
    json
  }
  contentItemsCollection {
    items {
      ... on BeliefItem {
        title
        description {
          json
        }
        bibleVerse {
          json
        }
        image {
          url
          title
        }
        kind
      }
    }
  }
  sys {
    id
  }
  __typename
`;

export async function getContentCollection(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<ContentCollection> {
  const data = await fetchGraphQL(
    `query {
        contentCollectionCollection(
          locale: "${locale}",
          where: {
            machineName: "${name}"
          },
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );

  const contentCollectionCollection = {
    title: data?.data?.contentCollectionCollection?.items[0].title,
    description: data?.data?.contentCollectionCollection?.items[0].description,
    creedItems:
      data?.data?.contentCollectionCollection?.items[0].contentItemsCollection
        .items,
    image: data?.data?.contentCollectionCollection?.items[0].image,
  };

  return contentCollectionCollection;
}
