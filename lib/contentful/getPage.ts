import { fetchGraphQL } from "./fetch";

const GRAPHQL_FIELDS = `
  pageName
  slug
  seo {
    title
    description
    keywords
    image {
      url
      title
    }
  }
  topSectionCollection {
    items {
      ... on Entry {
        __typename
        sys {
          id
        }
      }
      ... on ComponentCta {
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
        urlParameters
      }
      ... on ComponentDuplex {
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
          width
          height
        }
      }
      ... on ComponentHeroBanner {
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
          width
          height
        }
        additionalImagesCollection {
          items {
            url
            title
            width
            height
          }
        }
      }
      ... on ComponentTextBlock {
        headline
        subtitle
        body {
          json
        }
      }
    }
  }
  pageContent {
    ... on Entry {
      __typename
      sys {
        id
      }
    }
    ... on ComponentCta {
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
      urlParameters
    }
    ... on ComponentDuplex {
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
        width
        height
      }
    }
    ... on ComponentHeroBanner {
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
        width
        height
      }
      additionalImagesCollection {
        items {
          url
          title
          width
          height
        }
      }
    }
    ... on ComponentTextBlock {
      headline
      subtitle
      body {
        json
      }
    }
    ... on ContentCollection {
      title
      description {
        json
      }
      contentItemsCollection {
        items {
          __typename
          sys {
            id
          }
        }
      }
    }
    ... on EventBanner {
      eventInfo {
        ... on Event {
          date
          time
          note
        }
      }
      location {
        ... on LocationComponent {
          location {
            lat
            lon
          }
          addressLine1
          neighborhood
          city
          country
          mapEmbedUrl
        }
      }
      image {
        url
        title
        width
        height
      }
    }
  }
  extraSectionCollection {
    items {
      ... on Entry {
        __typename
        sys {
          id
        }
      }
      ... on ComponentCta {
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
        urlParameters
      }
      ... on ComponentDuplex {
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
          width
          height
        }
      }
      ... on ComponentHeroBanner {
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
          width
          height
        }
        additionalImagesCollection {
          items {
            url
            title
            width
            height
          }
        }
      }
      ... on ComponentTextBlock {
        headline
        subtitle
        body {
          json
        }
      }
    }
  }
  sys {
    id
  }
  __typename
`;

export async function getPage(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  const data = await fetchGraphQL(
    `query {
        pageCollection(
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

  const pageData = {
    pageName: data?.data?.pageCollection?.items[0].pageName,
    slug: data?.data?.pageCollection?.items[0].slug,
    seo: data?.data?.pageCollection?.items[0].seo,
    topSectionCollection:
      data?.data?.pageCollection?.items[0].topSectionCollection.items,
    pageContent: data?.data?.pageCollection?.items[0].pageContent,
    extraSectionCollection:
      data?.data?.pageCollection?.items[0].extraSectionCollection.items,
  };

  return pageData;
}
