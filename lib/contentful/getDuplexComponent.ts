import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  headline
  bodyText {
    json
  }
  ctaText
  targetPage {
    ... on Page {
      slug
    }
  }
  image {
    url
    title
  }
`;

export async function getDuplexComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        componentDuplexCollection(
          locale: "${locale}",
          where:{
            machineName: "${name}"
          }, 
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

  return data?.data?.componentDuplexCollection?.items[0];
}
