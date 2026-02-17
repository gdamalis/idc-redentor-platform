import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  headline
  subtitle
  body {
    json
  }
  imagesCollection {
    items {
      url
      title
      width
      height
    }
  }
  sys {
    id
  }
  __typename
`;

export async function getTextBlockComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        componentTextBlockCollection(
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

  return data?.data?.componentTextBlockCollection?.items[0];
}
