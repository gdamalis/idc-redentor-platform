export type BlogPost = {
  title: string;
  subtitle?: string;
  category?: string;
  slug: string;
  featuredImage: {
    url: string;
    title: string;
  };
  content: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any;
    links: {
      assets: {
        block: Array<{
          sys: { id: string };
          url: string;
          title: string;
          width?: number;
          height?: number;
          contentType: string;
        }>;
        hyperlink: Array<{
          sys: { id: string };
          url: string;
          title: string;
          contentType: string;
        }>;
      };
      entries: {
        block: Array<{
          sys: { id: string };
          __typename: string;
        }>;
        hyperlink: Array<{
          sys: { id: string };
          __typename: string;
          title?: string;
          slug?: string;
        }>;
      };
    };
  };
  author: {
    name: string;
    avatar: {
      url: string;
      title: string;
    };
    email: string;
  };
  publishedDate: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  sys: {
    id: string;
    publishedAt?: string;
  };
};
