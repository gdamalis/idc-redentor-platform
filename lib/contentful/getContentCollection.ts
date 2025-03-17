import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  description {
    json
  }
  credoCollection {
    items {
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
        contentCollection(
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

  const contentCollection = {
    title: data?.data?.contentCollection?.items[0].title,
    description: data?.data?.contentCollection?.items[0].description,
    creedItems:
      data?.data?.contentCollection?.items[0].credoCollection.items,
    image: data?.data?.contentCollection?.items[0].image,
  };

  return contentCollection;
}
