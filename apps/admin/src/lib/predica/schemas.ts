import { z } from "zod";
import {
  LIMITS,
  RICH_TEXT_SCHEMAS,
  audioLanguagesSchema,
  idSchema,
  isoDateStringSchema,
  localizedSchema,
  longTextSchema,
  nonEmptyShortTextSchema,
  nonNegativeNumberSchema,
  positiveIntSchema,
  sha256Schema,
  shortTextSchema,
  slugSchema,
  stringListSchema,
} from "@idcr/content";
import { CANONICAL_MEDIA_ID_RE } from "@src/lib/media/policy";

/**
 * Strict Zod request schemas for `/api/predica/*` (`ICR-204`).
 *
 * Every object uses `z.strictObject` so any unknown or server-owned field
 * (`published`, `publishedAt`, `firstPublishedAt`, `status`, `updatedBy`,
 * `revision`, `_id`, `_refs`, `_naturalKey`, `contentHash`, etc.) is rejected
 * with `400` (`AC5`, Lesson H #7).
 */

const canonicalObjectIdSchema = z
  .string()
  .regex(CANONICAL_MEDIA_ID_RE, "Must be a lowercase 24-hex ObjectId");

const predicaPersonSchema = z.strictObject({
  name: nonEmptyShortTextSchema,
  email: z.string().trim().email().max(254).optional(),
});

const predicaScriptureRefSchema = z
  .strictObject({
    book: localizedSchema(shortTextSchema, { requireEs: true }),
    chapter: positiveIntSchema,
    fromVerse: positiveIntSchema,
    toVerse: positiveIntSchema.optional(),
    text: localizedSchema(longTextSchema).optional(),
    version: localizedSchema(shortTextSchema, { requireEs: true }),
  })
  .superRefine((value, ctx) => {
    if (value.toVerse !== undefined && value.toVerse < value.fromVerse) {
      ctx.addIssue({
        code: "custom",
        path: ["toVerse"],
        message: "Ending verse must be greater than or equal to starting verse",
      });
    }
  });

const predicaSermonPayloadSchema = z.strictObject({
  slug: slugSchema,
  sermonDate: isoDateStringSchema,
  durationSeconds: nonNegativeNumberSchema.optional(),
  audioLanguages: audioLanguagesSchema.optional(),
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  thesis: localizedSchema(longTextSchema).optional(),
  mainPoints: localizedSchema(stringListSchema).optional(),
  excerpt: localizedSchema(longTextSchema).optional(),
  content: localizedSchema(RICH_TEXT_SCHEMAS.sermon).optional(),
  seoTitle: localizedSchema(longTextSchema).optional(),
  seoDescription: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(stringListSchema).optional(),
});

const localizedMediaIdSchema = localizedSchema(canonicalObjectIdSchema, {
  requireEs: true,
});

const predicaMediaLinksSchema = z.strictObject({
  audioMediaId: canonicalObjectIdSchema.optional(),
  featuredImageId: canonicalObjectIdSchema.optional(),
  pdfSummaryMediaId: localizedMediaIdSchema.optional(),
});

export const predicaIngestRequestSchema = z
  .strictObject({
    mode: z.enum(["create", "update"]),
    docId: canonicalObjectIdSchema.optional(),
    expectedRevision: positiveIntSchema.optional(),
    overwrite: z.boolean().optional(),
    keepExistingFeaturedImage: z.boolean().optional(),
    queuePdfRebuild: z.boolean().optional(),
    sermon: predicaSermonPayloadSchema,
    preacher: predicaPersonSchema,
    additionalPreachers: z.array(predicaPersonSchema).max(20).optional(),
    interpreter: predicaPersonSchema.nullable().optional(),
    scriptureReferences: z.array(predicaScriptureRefSchema).max(50).optional(),
    media: predicaMediaLinksSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "create") {
      if (value.docId !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["docId"],
          message: "docId must be omitted when mode is 'create'",
        });
      }
      if (value.expectedRevision !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedRevision"],
          message: "expectedRevision must be omitted when mode is 'create'",
        });
      }
    } else {
      if (value.docId === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["docId"],
          message: "docId is required when mode is 'update'",
        });
      }
      if (value.expectedRevision === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedRevision"],
          message: "expectedRevision is required when mode is 'update'",
        });
      }
    }
  });

export type PredicaIngestRequest = z.infer<typeof predicaIngestRequestSchema>;
export type PredicaPersonInput = z.infer<typeof predicaPersonSchema>;
export type PredicaScriptureRefInput = z.infer<
  typeof predicaScriptureRefSchema
>;

export const predicaLookupQuerySchema = z.strictObject({
  slug: slugSchema,
  sermonDate: isoDateStringSchema.optional(),
});

export type PredicaLookupQuery = z.infer<typeof predicaLookupQuerySchema>;

export const predicaPrepareMediaSchema = z.strictObject({
  filename: z.string().trim().min(1).max(LIMITS.shortTextMax),
  contentType: z.string().trim().min(1).max(128),
  size: z.number().int().positive(),
  sha256: sha256Schema,
});

export type PredicaPrepareMediaInput = z.infer<
  typeof predicaPrepareMediaSchema
>;

export const predicaConfirmMediaSchema = z.strictObject({
  mediaId: idSchema.regex(CANONICAL_MEDIA_ID_RE, "Invalid mediaId"),
  pathname: z.string().trim().min(1).max(LIMITS.slugMax),
  url: z.string().trim().min(1).max(LIMITS.hrefMax),
  filename: z.string().trim().min(1).max(LIMITS.shortTextMax),
  sha256: sha256Schema,
  width: positiveIntSchema.optional(),
  height: positiveIntSchema.optional(),
  durationSeconds: nonNegativeNumberSchema.optional(),
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  alt: localizedSchema(longTextSchema).optional(),
  decorative: z.boolean().optional(),
  caption: localizedSchema(longTextSchema).optional(),
  credit: localizedSchema(shortTextSchema).optional(),
});

export type PredicaConfirmMediaInput = z.infer<
  typeof predicaConfirmMediaSchema
>;
