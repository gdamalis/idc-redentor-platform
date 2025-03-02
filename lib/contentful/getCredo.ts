import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  description {
    json
  }
  bibleVerse {
    json
  }
`;

export async function getCredos(
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        credoCollection(
          locale: "${locale}",
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );
  
  return data?.data?.credoCollection?.items;
}
