import { fetchGraphQL } from "./fetch";

const MENU_GRAPHQL_FIELDS = `
  menuItemsCollection {
    items {
      ... on MenuGroup {
        groupName
        groupLink {
          slug
        }
      }
    } 
  }
  sys {
    id
  }
  __typename
`;

export async function getNavigationMenu(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        navigationMenuCollection(
          locale: "${locale}",
          where:{internalName: "${name}"}, 
          limit: 1, 
          preview: ${isDraftMode ? "true" : "false"}
        ) {
          items {
            ${MENU_GRAPHQL_FIELDS}
          }
        }
      }`,
    isDraftMode,
  );
  return data?.data?.navigationMenuCollection?.items[0]?.menuItemsCollection
    ?.items;
}
