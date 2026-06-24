export interface ScriptureRef {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number | null;
  verseContent: string;
  bibleVersion: string;
}

export interface Sermon {
  title: string;
  slug: string;
  sermonDate: string;
  preacher: {
    name: string;
    avatar?: {
      url: string;
      title: string;
    };
    email: string;
  };
  scriptureReferences?: ScriptureRef[];
  thesis: string;
  mainPoints: string[];
  excerpt: string;
  content?: {
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
      };
    };
  };
  featuredImage: {
    url: string;
    title: string;
  };
  audio?: {
    url: string;
    title: string;
    contentType: string;
    fileName: string;
    size: number;
  };
  durationSeconds?: number;
  pdfSummary?: {
    url: string;
    title: string;
  };
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  relatedSermons?: Array<{
    title: string;
    slug: string;
    sermonDate: string;
    excerpt: string;
    featuredImage: {
      url: string;
      title: string;
    };
  }>;
  sys: {
    id: string;
    publishedAt?: string;
  };
}
