import type { z } from "zod";
import {
  authorDraftSchema,
  authorPublishableSchema,
  authorUpdateSchema,
  bibleVerseDraftSchema,
  bibleVersePublishableSchema,
  bibleVerseUpdateSchema,
  postDraftSchema,
  postPublishableSchema,
  postUpdateSchema,
  sermonDraftSchema,
  sermonPublishableSchema,
  sermonUpdateSchema,
  topicDraftSchema,
  topicPublishableSchema,
  topicUpdateSchema,
} from "./editorial-types";
import {
  beliefCollectionDraftSchema,
  beliefCollectionPublishableSchema,
  beliefCollectionUpdateSchema,
  eventBannerDraftSchema,
  eventBannerPublishableSchema,
  eventBannerUpdateSchema,
  sectionDraftSchema,
  sectionPublishableSchema,
  sectionUpdateSchema,
  seoEntryDraftSchema,
  seoEntryPublishableSchema,
  seoEntryUpdateSchema,
} from "./fixed-types";
import {
  contactFormDraftSchema,
  contactFormPublishableSchema,
  contactFormUpdateSchema,
  footerDraftSchema,
  footerPublishableSchema,
  footerUpdateSchema,
  globalDraftSchema,
  globalPublishableSchema,
  globalUpdateSchema,
  locationDraftSchema,
  locationPublishableSchema,
  locationUpdateSchema,
  navigationMenuDraftSchema,
  navigationMenuPublishableSchema,
  navigationMenuUpdateSchema,
  singleEmailFormDraftSchema,
  singleEmailFormPublishableSchema,
  singleEmailFormUpdateSchema,
} from "./globals";

/** Content types that live in `ContentDoc<TFields>` envelopes (excludes `media`). */
export const CONTENT_TYPES = {
  section: "section",
  beliefCollection: "beliefCollection",
  eventBanner: "eventBanner",
  post: "post",
  sermon: "sermon",
  bibleVerse: "bibleVerse",
  author: "author",
  topic: "topic",
  seoEntry: "seoEntry",
  global: "global",
  navigationMenu: "navigationMenu",
  footer: "footer",
  singleEmailForm: "singleEmailForm",
  contactForm: "contactForm",
  location: "location",
} as const;

export type ContentType = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];

export interface ContentSchemaTriple {
  draft: z.ZodTypeAny;
  publishable: z.ZodTypeAny;
  update: z.ZodTypeAny;
}

/**
 * Registry of lenient `draft`, strict `publishable`, and `.partial()` `update` schemas
 * for every enveloped content type. Zero `.default()` in any create schema.
 */
export const CONTENT_SCHEMAS = {
  section: {
    draft: sectionDraftSchema,
    publishable: sectionPublishableSchema,
    update: sectionUpdateSchema,
  },
  beliefCollection: {
    draft: beliefCollectionDraftSchema,
    publishable: beliefCollectionPublishableSchema,
    update: beliefCollectionUpdateSchema,
  },
  eventBanner: {
    draft: eventBannerDraftSchema,
    publishable: eventBannerPublishableSchema,
    update: eventBannerUpdateSchema,
  },
  post: {
    draft: postDraftSchema,
    publishable: postPublishableSchema,
    update: postUpdateSchema,
  },
  sermon: {
    draft: sermonDraftSchema,
    publishable: sermonPublishableSchema,
    update: sermonUpdateSchema,
  },
  bibleVerse: {
    draft: bibleVerseDraftSchema,
    publishable: bibleVersePublishableSchema,
    update: bibleVerseUpdateSchema,
  },
  author: {
    draft: authorDraftSchema,
    publishable: authorPublishableSchema,
    update: authorUpdateSchema,
  },
  topic: {
    draft: topicDraftSchema,
    publishable: topicPublishableSchema,
    update: topicUpdateSchema,
  },
  seoEntry: {
    draft: seoEntryDraftSchema,
    publishable: seoEntryPublishableSchema,
    update: seoEntryUpdateSchema,
  },
  global: {
    draft: globalDraftSchema,
    publishable: globalPublishableSchema,
    update: globalUpdateSchema,
  },
  navigationMenu: {
    draft: navigationMenuDraftSchema,
    publishable: navigationMenuPublishableSchema,
    update: navigationMenuUpdateSchema,
  },
  footer: {
    draft: footerDraftSchema,
    publishable: footerPublishableSchema,
    update: footerUpdateSchema,
  },
  singleEmailForm: {
    draft: singleEmailFormDraftSchema,
    publishable: singleEmailFormPublishableSchema,
    update: singleEmailFormUpdateSchema,
  },
  contactForm: {
    draft: contactFormDraftSchema,
    publishable: contactFormPublishableSchema,
    update: contactFormUpdateSchema,
  },
  location: {
    draft: locationDraftSchema,
    publishable: locationPublishableSchema,
    update: locationUpdateSchema,
  },
} as const satisfies Record<ContentType, ContentSchemaTriple>;

export * from "./common";
export * from "./editorial-types";
export * from "./fixed-types";
export * from "./globals";
export * from "./localized";
export * from "./media";
