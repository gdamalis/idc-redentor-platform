import { z } from "zod";
import type { Localized } from "../model/localized";
import { RICH_TEXT_SCHEMAS } from "../rich-text/schema";
import type { RichTextDoc } from "../rich-text/spec";
import type { SitePageSlug } from "../registries/pages";
import {
  beliefKindSchema,
  idListSchema,
  idSchema,
  isoDateStringSchema,
  longTextSchema,
  machineNameSchema,
  sectionLayoutSchema,
  shortTextSchema,
  sitePageSlugSchema,
  type BeliefKind,
  type SectionLayout,
} from "./common";
import { localizedSchema } from "./localized";

// ── Section (`sections`) ────────────────────────────────────────────────────

export interface SectionFields {
  machineName: string;
  layout?: SectionLayout;
  headline?: Localized<string>;
  subHeadline?: Localized<string>;
  body?: Localized<RichTextDoc>;
  ctaText?: Localized<string>;
  targetPage?: SitePageSlug;
  urlParameters?: string;
  /** Single media id (hero / section image). */
  image?: string;
  /** Multiple media ids (`imagesCollection`). */
  images?: string[];
}

export const sectionDraftSchema = z.strictObject({
  machineName: machineNameSchema,
  layout: sectionLayoutSchema.optional(),
  headline: localizedSchema(shortTextSchema).optional(),
  subHeadline: localizedSchema(shortTextSchema).optional(),
  body: localizedSchema(RICH_TEXT_SCHEMAS.inline).optional(),
  ctaText: localizedSchema(shortTextSchema).optional(),
  targetPage: sitePageSlugSchema.optional(),
  urlParameters: shortTextSchema.optional(),
  image: idSchema.optional(),
  images: idListSchema.optional(),
});

export const sectionPublishableSchema = z.strictObject({
  machineName: machineNameSchema,
  layout: sectionLayoutSchema,
  headline: localizedSchema(shortTextSchema, { requireEs: true }),
  subHeadline: localizedSchema(shortTextSchema).optional(),
  body: localizedSchema(RICH_TEXT_SCHEMAS.inline).optional(),
  ctaText: localizedSchema(shortTextSchema).optional(),
  targetPage: sitePageSlugSchema.optional(),
  urlParameters: shortTextSchema.optional(),
  image: idSchema.optional(),
  images: idListSchema.optional(),
});

export const sectionUpdateSchema = sectionDraftSchema.partial();

// ── Belief Collection (`belief_collections`, protected by type) ─────────────

export interface BeliefItemFields {
  title?: Localized<string>;
  description?: Localized<RichTextDoc>;
  bibleVerseId?: string;
  kind?: BeliefKind;
  imageId?: string;
}

export interface BeliefCollectionFields {
  machineName: string;
  title?: Localized<string>;
  description?: Localized<RichTextDoc>;
  items?: BeliefItemFields[];
}

const beliefItemDraftSchema = z.strictObject({
  title: localizedSchema(shortTextSchema).optional(),
  description: localizedSchema(RICH_TEXT_SCHEMAS.inline).optional(),
  bibleVerseId: idSchema.optional(),
  kind: beliefKindSchema.optional(),
  imageId: idSchema.optional(),
});

const beliefItemPublishableSchema = z.strictObject({
  title: localizedSchema(shortTextSchema, { requireEs: true, requireEn: true }),
  description: localizedSchema(RICH_TEXT_SCHEMAS.inline, {
    requireEs: true,
    requireEn: true,
  }),
  bibleVerseId: idSchema.optional(),
  kind: beliefKindSchema,
  imageId: idSchema.optional(),
});

export const beliefCollectionDraftSchema = z.strictObject({
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema).optional(),
  description: localizedSchema(RICH_TEXT_SCHEMAS.inline).optional(),
  items: z.array(beliefItemDraftSchema).max(100).optional(),
});

export const beliefCollectionPublishableSchema = z.strictObject({
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema, { requireEs: true, requireEn: true }),
  description: localizedSchema(RICH_TEXT_SCHEMAS.inline, {
    requireEs: true,
    requireEn: true,
  }).optional(),
  items: z.array(beliefItemPublishableSchema).min(1).max(100),
});

export const beliefCollectionUpdateSchema =
  beliefCollectionDraftSchema.partial();

// ── Event Banner (`event_banners`) ──────────────────────────────────────────

export interface EventInfoFields {
  name?: Localized<string>;
  dayOfWeek?: Localized<string>;
  note?: Localized<string>;
  time?: string;
  date?: string;
}

export interface EventBannerFields {
  machineName: string;
  event?: EventInfoFields;
  /** Media id. Location comes from the shared `location` global. */
  image?: string;
}

const eventInfoDraftSchema = z.strictObject({
  name: localizedSchema(shortTextSchema).optional(),
  dayOfWeek: localizedSchema(shortTextSchema).optional(),
  note: localizedSchema(longTextSchema).optional(),
  time: shortTextSchema.optional(),
  date: isoDateStringSchema.optional(),
});

const eventInfoPublishableSchema = z.strictObject({
  name: localizedSchema(shortTextSchema, { requireEs: true }),
  dayOfWeek: localizedSchema(shortTextSchema, { requireEs: true }),
  note: localizedSchema(longTextSchema).optional(),
  time: shortTextSchema.refine((v) => v.trim().length > 0, {
    message: "Time is required",
  }),
  date: isoDateStringSchema.optional(),
});

export const eventBannerDraftSchema = z.strictObject({
  machineName: machineNameSchema,
  event: eventInfoDraftSchema.optional(),
  image: idSchema.optional(),
});

export const eventBannerPublishableSchema = z.strictObject({
  machineName: machineNameSchema,
  event: eventInfoPublishableSchema,
  image: idSchema,
});

export const eventBannerUpdateSchema = eventBannerDraftSchema.partial();

// ── SEO Entry (`seo_entries`) ───────────────────────────────────────────────

export interface SeoEntryFields {
  machineName: string;
  title?: Localized<string>;
  description?: Localized<string>;
  keywords?: Localized<string[]>;
  imageId?: string;
  siteName?: Localized<string>;
  type?: string;
}

export const seoEntryDraftSchema = z.strictObject({
  machineName: machineNameSchema,
  title: localizedSchema(longTextSchema).optional(),
  description: localizedSchema(longTextSchema).optional(),
  keywords: localizedSchema(z.array(shortTextSchema).max(100)).optional(),
  imageId: idSchema.optional(),
  siteName: localizedSchema(shortTextSchema).optional(),
  type: shortTextSchema.optional(),
});

export const seoEntryPublishableSchema = z.strictObject({
  machineName: machineNameSchema,
  title: localizedSchema(longTextSchema, { requireEs: true }),
  description: localizedSchema(longTextSchema, { requireEs: true }),
  keywords: localizedSchema(z.array(shortTextSchema).max(100)).optional(),
  imageId: idSchema.optional(),
  siteName: localizedSchema(shortTextSchema).optional(),
  type: shortTextSchema.optional(),
});

export const seoEntryUpdateSchema = seoEntryDraftSchema.partial();
