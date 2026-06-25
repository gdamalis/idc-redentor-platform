import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  layout
  headline
  subHeadline
  body {
    json
  }
  ctaText
  targetPage {
    ... on Page {
      slug
    }
  }
  urlParameters
  image {
    url
    title
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

export async function getSection(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        sectionCollection(
          locale: "${locale}",
          where: {
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

  return data?.data?.sectionCollection?.items[0];
}
