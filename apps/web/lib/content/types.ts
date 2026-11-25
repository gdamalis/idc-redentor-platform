import type {
  BeliefKind,
  Locale,
  MediaView,
  RichTextView,
  SectionLayout,
} from "@idcr/content";

export type { MediaView, RichTextView };

export interface ImageView {
  url: string;
  title: string;
}

export interface SizedImageView {
  url: string;
  title: string;
  width: number;
  height: number;
}

export interface SectionImageItemView {
  url: string;
  title: string;
  width?: number;
  height?: number;
}

/**
 * Bible verse shape emitted by `getContactForm` and `getContentCollection`
 * (chapter/fromVerse/toVerse are strings for UI rendering).
 */
export interface StructuredBibleVerseView {
  book: string;
  chapter: string;
  fromVerse: string;
  toVerse: string | null;
  verseContent: string;
  bibleVersion: string;
}

/**
 * Scripture reference shape emitted by `getSermon` / `getSermonById` / `getLatestSermons`
 * (chapter/fromVerse/toVerse are numbers, matching `src/types/Sermon.ts` today).
 */
export interface ScriptureRefView {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number | null;
  verseContent: string;
  bibleVersion: string;
}

export interface SeoView {
  title: string;
  description: string;
  keywords: string[];
  image?: SizedImageView | null;
  siteName?: string;
  type?: string;
  sys: { id: string };
  __typename: "Seo";
}

export interface SectionView {
  layout?: SectionLayout;
  headline?: string;
  subHeadline?: string;
  body?: RichTextView;
  ctaText?: string;
  targetPage?: { slug: string } | null;
  urlParameters?: string | null;
  image?: ImageView | null;
  imagesCollection: { items: SectionImageItemView[] };
  sys: { id: string };
  __typename: "Section";
}

export interface MenuItemView {
  groupName: string;
  groupLink: { slug: string };
}

export interface FooterLocationView {
  addressLine1: string;
  neighborhood?: string;
  city: string;
  country: string;
  googleMapsUrl?: string;
}

export interface FooterView {
  logo?: ImageView;
  shortDescription: string;
  socialLinks: Array<{ url: string; platform: string }>;
  location?: FooterLocationView | null;
}

export interface SingleEmailFormView {
  title: string;
  shortDescription?: string;
  ctaText: string;
  inputPlaceholder?: string;
  successMessage?: string;
  sys: { id: string };
  __typename: "SingleEmailForm";
}

export interface ContactFormFieldView {
  name: string;
  values: string[];
  type: string;
  required: boolean;
  placeholder: string;
  inputId: string;
}

export interface ContactFormView {
  title: string;
  description: string;
  ctaText: string;
  image?: ImageView | null;
  agreementNote?: RichTextView;
  bibleVerse?: StructuredBibleVerseView | null;
  formFields: ContactFormFieldView[];
}

export interface EventBannerLocationView {
  addressLine1: string;
  neighborhood?: string;
  city: string;
  country: string;
  mapEmbedUrl?: string;
  googleMapsUrl?: string;
  location?: { lat: number; lon: number } | null;
}

export interface EventBannerView {
  eventInfo: {
    name: string;
    dayOfWeek: string;
    date?: string | null;
    time: string;
    note?: string | null;
  };
  location?: EventBannerLocationView | null;
  image?: ImageView | null;
  sys: { id: string };
  __typename: "EventBanner";
}

export interface ContentItemView {
  title: string;
  description?: RichTextView;
  bibleVerse?: StructuredBibleVerseView | null;
  image?: ImageView;
  kind?: BeliefKind;
  sys: { id: string };
  __typename: "BeliefItem";
}

export interface RawContentCollectionView {
  title: string;
  description?: RichTextView;
  contentItemsCollection: { items: ContentItemView[] };
  image?: ImageView;
  sys: { id: string };
  __typename: "ContentCollection";
}

export interface ContentCollectionView {
  title: string;
  description?: RichTextView;
  creedItems: ContentItemView[];
  image?: ImageView;
  sys: { id: string };
}

export interface AuthorView {
  name: string;
  avatar?: ImageView;
  email?: string;
}

export interface RelatedBlogPostView {
  title: string;
  slug: string;
  subtitle?: string;
  featuredImage?: ImageView;
  publishedDate: string;
}

export interface BlogPostView {
  title: string;
  subtitle?: string;
  category?: string;
  slug: string;
  featuredImage?: ImageView;
  content?: RichTextView;
  author?: AuthorView;
  publishedDate: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  relatedBlogPostsCollection: { items: RelatedBlogPostView[] };
  sys: { id: string; publishedAt?: string };
  __typename: "BlogPostPage";
}

export interface ChurchInfoTopicView {
  name: string;
  slug: string;
  shortDescription?: string | null;
  featuredImage?: ImageView | null;
  body?: RichTextView;
  sys: { id: string; publishedAt: string };
  __typename: "ChurchInfoTopic";
}

export interface SermonMediaView {
  url: string;
  title: string;
  contentType: string;
  fileName: string;
  size: number;
}

export interface RelatedSermonView {
  title: string;
  slug: string;
  sermonDate: string;
  excerpt: string;
  featuredImage?: ImageView;
}

export interface SermonView {
  title: string;
  slug: string;
  sermonDate: string;
  preacher?: AuthorView;
  additionalPreachers: AuthorView[];
  audioLanguages: Locale[];
  interpreter?: AuthorView;
  scriptureReferences: ScriptureRefView[];
  thesis: string;
  mainPoints: string[];
  excerpt: string;
  content?: RichTextView;
  featuredImage?: ImageView;
  audio?: SermonMediaView;
  durationSeconds?: number;
  pdfSummary?: SermonMediaView;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  relatedSermons: RelatedSermonView[];
  sys: { id: string; publishedAt?: string };
}

export interface SlugEntryView {
  slug: string;
  updatedAt: string;
}
