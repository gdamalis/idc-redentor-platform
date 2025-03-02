import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  headline
  subline {
    json
  }
  ctaText
  targetPage {
    ... on Page {
      slug
    }
  }
`;

export async function getCtaComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        componentCtaCollection(
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

  return data?.data?.componentCtaCollection?.items[0];
}
