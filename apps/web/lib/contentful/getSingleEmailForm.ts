import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  shortDescription
  ctaText
  inputPlaceholder
  successMessage
  sys {
    id
  }
  __typename
`;

export async function getSingleEmailForm(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        singleEmailFormCollection(
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

  return data?.data?.singleEmailFormCollection?.items[0];
}
