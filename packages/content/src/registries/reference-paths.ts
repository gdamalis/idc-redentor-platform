import { COLLECTIONS, type CollectionName } from "../model/collections";
import type { ContentType } from "../schemas";

/**
 * Describes where media ids and content ids live inside a content snapshot.
 *
 * - `media`: plain single media id (`featuredImageId`, `audioMediaId`, `image`, `logo`, …)
 * - `mediaArray`: array of media ids (`images`)
 * - `localizedMedia`: localized single media id (`pdfSummaryMediaId`)
 * - `content`: plain single content id (`authorId`, `preacherId`, `interpreterId`, `bibleVerseId`)
 * - `contentArray`: array of content ids (`relatedPostIds`, `additionalPreacherIds`, `scriptureRefIds`, …)
 * - `localizedRichText`: localized TipTap doc walked for `embeddedMedia.attrs.mediaId`
 * - `itemList`: embedded array of objects (e.g. `belief_collections.items`), each with its own paths
 */
export type ReferencePathSpec =
  | {
      field: string;
      kind: "media" | "mediaArray" | "localizedMedia" | "localizedRichText";
    }
  | { field: string; kind: "content" | "contentArray"; target: CollectionName }
  | {
      field: string;
      kind: "itemList";
      itemPaths: readonly ReferencePathSpec[];
    };

/** Concrete (non-union) content types with static reference paths. */
export type ConcreteContentType = Exclude<ContentType, "global">;

export const REFERENCE_PATHS = {
  section: [
    { field: "image", kind: "media" },
    { field: "images", kind: "mediaArray" },
    { field: "body", kind: "localizedRichText" },
  ],
  beliefCollection: [
    { field: "description", kind: "localizedRichText" },
    {
      field: "items",
      kind: "itemList",
      itemPaths: [
        { field: "imageId", kind: "media" },
        {
          field: "bibleVerseId",
          kind: "content",
          target: COLLECTIONS.bibleVerses,
        },
        { field: "description", kind: "localizedRichText" },
      ],
    },
  ],
  eventBanner: [{ field: "image", kind: "media" }],
  post: [
    { field: "featuredImageId", kind: "media" },
    { field: "authorId", kind: "content", target: COLLECTIONS.authors },
    {
      field: "relatedPostIds",
      kind: "contentArray",
      target: COLLECTIONS.posts,
    },
    { field: "content", kind: "localizedRichText" },
  ],
  sermon: [
    { field: "featuredImageId", kind: "media" },
    { field: "audioMediaId", kind: "media" },
    { field: "pdfSummaryMediaId", kind: "localizedMedia" },
    { field: "preacherId", kind: "content", target: COLLECTIONS.authors },
    {
      field: "additionalPreacherIds",
      kind: "contentArray",
      target: COLLECTIONS.authors,
    },
    { field: "interpreterId", kind: "content", target: COLLECTIONS.authors },
    {
      field: "scriptureRefIds",
      kind: "contentArray",
      target: COLLECTIONS.bibleVerses,
    },
    {
      field: "relatedSermonIds",
      kind: "contentArray",
      target: COLLECTIONS.sermons,
    },
    { field: "content", kind: "localizedRichText" },
  ],
  bibleVerse: [],
  author: [{ field: "avatarMediaId", kind: "media" }],
  topic: [
    { field: "featuredImageId", kind: "media" },
    { field: "body", kind: "localizedRichText" },
  ],
  seoEntry: [{ field: "imageId", kind: "media" }],
  navigationMenu: [],
  footer: [{ field: "logo", kind: "media" }],
  singleEmailForm: [],
  contactForm: [
    { field: "image", kind: "media" },
    { field: "bibleVerseId", kind: "content", target: COLLECTIONS.bibleVerses },
    { field: "agreementNote", kind: "localizedRichText" },
  ],
  location: [],
} as const satisfies Record<ConcreteContentType, readonly ReferencePathSpec[]>;
