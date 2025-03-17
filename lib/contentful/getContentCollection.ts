import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  description {
    json
  }
  contentItemsCollection {
    items {
      ... on Credo {
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
) {
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
      data?.data?.contentCollectionCollection?.items[0].contentItemsCollection.items,
    image: data?.data?.contentCollectionCollection?.items[0].image,
  };

  return contentCollectionCollection;
}
