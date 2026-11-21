/** MongoDB collection names in the `website*` database (snake_case, like `pdf_jobs`). */
export const COLLECTIONS = {
  sections: "sections",
  beliefCollections: "belief_collections",
  eventBanners: "event_banners",
  posts: "posts",
  sermons: "sermons",
  bibleVerses: "bible_verses",
  authors: "authors",
  topics: "topics",
  seoEntries: "seo_entries",
  globals: "globals",
  media: "media",
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
export type CollectionName = (typeof COLLECTIONS)[CollectionKey];
