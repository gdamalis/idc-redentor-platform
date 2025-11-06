import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  title
  subtitle
  slug
  featuredImage {
    url
    title
  }
  content {
    json
    links {
      assets {
        block {
          sys {
            id
          }
          url
          title
          width
          height
          contentType
        }
        hyperlink {
          sys {
            id
          }
          url
          title
          contentType
        }
      }
      entries {
        block {
          sys {
            id
          }
          __typename
        }
        hyperlink {
          sys {
            id
          }
          __typename
          ... on BlogPostPage {
            title
            slug
          }
        }
      }
    }
  }
  author {
    ... on Author {
      name
      avatar {
        url
        title
      }
      email
    }
  }
  publishedDate
  seoTitle
  seoDescription
  keywords
  relatedBlogPostsCollection {
    items {
      ... on BlogPostPage {
        title
        slug
        subtitle
        featuredImage {
          url
          title
        }
        publishedDate
      }
    }
  }
  sys {
    id
    publishedAt
  }
  __typename
`;

export async function getLatestBlogPostPages(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  },
) {
  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          locale: "${locale}",
          limit: 3, 
          where: {
            ${options?.slug ? `slug: { ne: "${options.slug}" }` : ""}
          },
          preview: ${options?.isDraftMode ? "true" : "false"}
        ) {
          items {
            ${GRAPHQL_FIELDS}
          }
        }
      }`,
    options?.isDraftMode,
  );

  return data?.data?.blogPostPageCollection?.items;
}

export async function getBlogPostPage(
  slug: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        blogPostPageCollection(
          where: { slug: "${slug}" },
          locale: "${locale}",
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

  return data?.data?.blogPostPageCollection?.items[0];
}
