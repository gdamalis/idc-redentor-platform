import { z } from "zod";
import { isEmptyValue, type Locale, type Localized } from "../model/localized";
import { RICH_TEXT_SCHEMAS } from "../rich-text/schema";
import type { RichTextDoc } from "../rich-text/spec";
import {
  audioLanguagesSchema,
  idListSchema,
  idSchema,
  isoDateStringSchema,
  longTextSchema,
  nonEmptyShortTextSchema,
  nonEmptyStringListSchema,
  nonNegativeNumberSchema,
  positiveIntSchema,
  shortTextSchema,
  slugSchema,
  stringListSchema,
} from "./common";
import { localizedSchema } from "./localized";

// ── Blog Post (`posts`) ─────────────────────────────────────────────────────

export interface PostFields {
  slug?: string;
  title: Localized<string>;
  subtitle?: Localized<string>;
  category?: string;
  featuredImageId?: string;
  content?: Localized<RichTextDoc>;
  authorId?: string;
  publishedDate?: string;
  seoTitle?: Localized<string>;
  seoDescription?: Localized<string>;
  keywords?: Localized<string[]>;
  relatedPostIds?: string[];
}

export const postDraftSchema = z.strictObject({
  slug: slugSchema.optional(),
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  subtitle: localizedSchema(longTextSchema).optional(),
  category: shortTextSchema.optional(),
  featuredImageId: idSchema.optional(),
  content: localizedSchema(RICH_TEXT_SCHEMAS.article).optional(),
  authorId: idSchema.optional(),
  publishedDate: isoDateStringSchema.optional(),
  seoTitle: localizedSchema(longTextSchema).optional(),
  seoDescription: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(stringListSchema).optional(),
  relatedPostIds: idListSchema.optional(),
});

export const postPublishableSchema = z.strictObject({
  slug: slugSchema,
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  subtitle: localizedSchema(longTextSchema).optional(),
  category: shortTextSchema.optional(),
  featuredImageId: idSchema,
  content: localizedSchema(RICH_TEXT_SCHEMAS.article, { requireEs: true }),
  authorId: idSchema,
  publishedDate: isoDateStringSchema,
  seoTitle: localizedSchema(longTextSchema).optional(),
  seoDescription: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(stringListSchema).optional(),
  relatedPostIds: idListSchema.optional(),
});

export const postUpdateSchema = postDraftSchema.partial();

// ── Sermon (`sermons`) ──────────────────────────────────────────────────────

export interface SermonFields {
  slug?: string;
  title: Localized<string>;
  thesis?: Localized<string>;
  mainPoints?: Localized<string[]>;
  excerpt?: Localized<string>;
  sermonDate?: string;
  durationSeconds?: number;
  content?: Localized<RichTextDoc>;
  featuredImageId?: string;
  /** Default-locale-only audio file (not localized). */
  audioMediaId?: string;
  /** Languages spoken in the recording (not localized; mapper defaults absent to `["es-AR"]`). */
  audioLanguages?: Locale[];
  /** Localized PDF summary media ids (es-AR and optional en-US). */
  pdfSummaryMediaId?: Localized<string>;
  preacherId?: string;
  additionalPreacherIds?: string[];
  interpreterId?: string;
  scriptureRefIds?: string[];
  seoTitle?: Localized<string>;
  seoDescription?: Localized<string>;
  keywords?: Localized<string[]>;
  relatedSermonIds?: string[];
  contentHash?: string;
}

const localizedMediaIdSchema = z
  .strictObject({
    "es-AR": idSchema,
    "en-US": z.union([z.literal(""), idSchema]).optional(),
  })
  .transform((value) => {
    if (!value["en-US"]) {
      const out: Localized<string> = { "es-AR": value["es-AR"] };
      return out;
    }
    return value as Localized<string>;
  });

export const sermonDraftSchema = z.strictObject({
  slug: slugSchema.optional(),
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  thesis: localizedSchema(longTextSchema).optional(),
  mainPoints: localizedSchema(stringListSchema).optional(),
  excerpt: localizedSchema(longTextSchema).optional(),
  sermonDate: isoDateStringSchema.optional(),
  durationSeconds: nonNegativeNumberSchema.optional(),
  content: localizedSchema(RICH_TEXT_SCHEMAS.sermon).optional(),
  featuredImageId: idSchema.optional(),
  audioMediaId: idSchema.optional(),
  audioLanguages: audioLanguagesSchema.optional(),
  pdfSummaryMediaId: localizedMediaIdSchema.optional(),
  preacherId: idSchema.optional(),
  additionalPreacherIds: idListSchema.optional(),
  interpreterId: idSchema.optional(),
  scriptureRefIds: idListSchema.optional(),
  seoTitle: localizedSchema(longTextSchema).optional(),
  seoDescription: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(stringListSchema).optional(),
  relatedSermonIds: idListSchema.optional(),
  contentHash: shortTextSchema.optional(),
});

export const sermonPublishableSchema = z.strictObject({
  slug: slugSchema,
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  thesis: localizedSchema(longTextSchema, { requireEs: true }),
  mainPoints: localizedSchema(nonEmptyStringListSchema, { requireEs: true }),
  excerpt: localizedSchema(longTextSchema, { requireEs: true }),
  sermonDate: isoDateStringSchema,
  durationSeconds: nonNegativeNumberSchema.optional(),
  content: localizedSchema(RICH_TEXT_SCHEMAS.sermon).optional(),
  featuredImageId: idSchema.optional(),
  audioMediaId: idSchema.optional(),
  audioLanguages: audioLanguagesSchema.optional(),
  pdfSummaryMediaId: localizedMediaIdSchema.optional(),
  preacherId: idSchema,
  additionalPreacherIds: idListSchema.optional(),
  interpreterId: idSchema.optional(),
  scriptureRefIds: idListSchema.optional(),
  seoTitle: localizedSchema(longTextSchema).optional(),
  seoDescription: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(stringListSchema).optional(),
  relatedSermonIds: idListSchema.optional(),
  contentHash: shortTextSchema.optional(),
});

export const sermonUpdateSchema = sermonDraftSchema.partial();

// ── Bible Verse (`bible_verses`) ────────────────────────────────────────────

export interface BibleVerseFields {
  book: Localized<string>;
  chapter: number;
  fromVerse: number;
  toVerse?: number;
  text?: Localized<string>;
  version?: Localized<string>;
}

const checkVerseRange = (
  value: { fromVerse?: number; toVerse?: number },
  ctx: z.RefinementCtx,
) => {
  if (
    value.fromVerse !== undefined &&
    value.toVerse !== undefined &&
    value.toVerse < value.fromVerse
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["toVerse"],
      message: "Ending verse must be greater than or equal to starting verse",
    });
  }
};

export const bibleVerseDraftSchema = z
  .strictObject({
    book: localizedSchema(shortTextSchema, { requireEs: true }),
    chapter: positiveIntSchema,
    fromVerse: positiveIntSchema,
    toVerse: positiveIntSchema.optional(),
    text: localizedSchema(longTextSchema).optional(),
    version: localizedSchema(shortTextSchema).optional(),
  })
  .superRefine(checkVerseRange);

export const bibleVersePublishableSchema = z
  .strictObject({
    book: localizedSchema(shortTextSchema, { requireEs: true }),
    chapter: positiveIntSchema,
    fromVerse: positiveIntSchema,
    toVerse: positiveIntSchema.optional(),
    text: localizedSchema(longTextSchema, { requireEs: true }),
    version: localizedSchema(shortTextSchema, { requireEs: true }),
  })
  .superRefine(checkVerseRange);

export const bibleVerseUpdateSchema = z
  .strictObject({
    book: localizedSchema(shortTextSchema, { requireEs: true }),
    chapter: positiveIntSchema,
    fromVerse: positiveIntSchema,
    toVerse: positiveIntSchema.optional(),
    text: localizedSchema(longTextSchema).optional(),
    version: localizedSchema(shortTextSchema).optional(),
  })
  .partial()
  .superRefine(checkVerseRange);

// ── Author (`authors`) ──────────────────────────────────────────────────────

export interface AuthorFields {
  name: string;
  avatarMediaId?: string;
  /** Optional internal email; never part of what the public site reads. */
  email?: string;
  /** Optional plain-string link to a platform user id; no cross-DB lookup. */
  userId?: string;
}

export const authorDraftSchema = z.strictObject({
  name: nonEmptyShortTextSchema,
  avatarMediaId: idSchema.optional(),
  email: shortTextSchema.optional(),
  userId: idSchema.optional(),
});

export const authorPublishableSchema = z.strictObject({
  name: nonEmptyShortTextSchema,
  avatarMediaId: idSchema.optional(),
  email: z.string().trim().email().max(254).optional(),
  userId: idSchema.optional(),
});

export const authorUpdateSchema = authorDraftSchema.partial();

// ── Church Info Topic (`topics`; NO SEO fields; localized slug) ─────────────

export interface TopicFields {
  name: Localized<string>;
  shortDescription?: Localized<string>;
  body?: Localized<RichTextDoc>;
  /** Localized slug (e.g. `es-AR: "privacidad"`, `en-US: "privacy"`). */
  slug?: Localized<string>;
  /** Kept in data; no editor field in v1. */
  featuredImageId?: string;
  /** Protected legal content (e.g. privacy policy) requires both locales and `content:publish-protected`. */
  protected?: boolean;
}

const localizedSlugSchema = z
  .strictObject({
    "es-AR": slugSchema,
    "en-US": z.union([z.literal(""), slugSchema]).optional(),
  })
  .transform((value) => {
    if (!value["en-US"]) {
      const out: Localized<string> = { "es-AR": value["es-AR"] };
      return out;
    }
    return value as Localized<string>;
  });

export const topicDraftSchema = z.strictObject({
  name: localizedSchema(shortTextSchema, { requireEs: true }),
  shortDescription: localizedSchema(longTextSchema).optional(),
  body: localizedSchema(RICH_TEXT_SCHEMAS.article).optional(),
  slug: localizedSlugSchema.optional(),
  featuredImageId: idSchema.optional(),
  protected: z.boolean().optional(),
});

export const topicPublishableSchema = z
  .strictObject({
    name: localizedSchema(shortTextSchema, { requireEs: true }),
    shortDescription: localizedSchema(longTextSchema).optional(),
    body: localizedSchema(RICH_TEXT_SCHEMAS.article, { requireEs: true }),
    slug: localizedSlugSchema,
    featuredImageId: idSchema.optional(),
    protected: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.protected) return;
    if (isEmptyValue(value.name["en-US"])) {
      ctx.addIssue({
        code: "custom",
        path: ["name", "en-US"],
        message: "English (en-US) name is required for protected topics",
      });
    }
    if (isEmptyValue(value.slug["en-US"])) {
      ctx.addIssue({
        code: "custom",
        path: ["slug", "en-US"],
        message: "English (en-US) slug is required for protected topics",
      });
    }
    if (isEmptyValue(value.body["en-US"])) {
      ctx.addIssue({
        code: "custom",
        path: ["body", "en-US"],
        message: "English (en-US) body is required for protected topics",
      });
    }
    if (
      value.shortDescription !== undefined &&
      isEmptyValue(value.shortDescription["en-US"])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["shortDescription", "en-US"],
        message:
          "English (en-US) short description is required for protected topics",
      });
    }
  });

export const topicUpdateSchema = topicDraftSchema.partial();
