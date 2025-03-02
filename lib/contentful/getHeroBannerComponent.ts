import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  headline
  bodyText {
    json
  }
  ctaText
  targetPage {
    slug
  }
  image {
    url
    title
  }
  additionalImagesCollection {
    items {
      url
      title
    }
  }
`;

export async function getHeroBannerComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        componentHeroBannerCollection(
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

  return data?.data?.componentHeroBannerCollection?.items[0];
}
