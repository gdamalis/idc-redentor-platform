import { z } from "zod";
import { LIMITS } from "../limits";
import { isValidSlug } from "../natural-keys";
import { isAllowedHref } from "../rich-text/href";
import { SITE_PAGE_SLUGS } from "../registries/pages";
import { LOCALES } from "../model/localized";

/** Non-empty trimmed/bounded id string at the package boundary (no BSON ObjectId). */
export const idSchema = z.string().min(1).max(128);

/** Natural key for fixed entries (`our-mission`, `seo-home`, …). */
export const machineNameSchema = z
  .string()
  .min(1)
  .max(LIMITS.machineNameMax)
  .refine(isValidSlug, {
    message: "Must be a lowercase kebab-case identifier",
  });

/** Route slug (`predica-2026-07-12`, `privacidad`, …). */
export const slugSchema = z
  .string()
  .min(1)
  .max(LIMITS.slugMax)
  .refine(isValidSlug, { message: "Must be a lowercase kebab-case slug" });

/** Short plain string (titles, names, labels, CTA, book, version). */
export const shortTextSchema = z.string().max(LIMITS.shortTextMax);
export const nonEmptyShortTextSchema = z
  .string()
  .max(LIMITS.shortTextMax)
  .refine((value) => value.trim().length > 0, { message: "Must not be empty" });

/** Long plain string (descriptions, thesis, excerpt, SEO, verse text). */
export const longTextSchema = z.string().max(LIMITS.longTextMax);
export const nonEmptyLongTextSchema = z
  .string()
  .max(LIMITS.longTextMax)
  .refine((value) => value.trim().length > 0, { message: "Must not be empty" });

/** Bounded array of short/long plain strings (keywords, mainPoints, dropdown values). */
export const stringListSchema = z
  .array(longTextSchema)
  .max(LIMITS.maxArrayItems);
export const nonEmptyStringListSchema = z
  .array(nonEmptyLongTextSchema)
  .min(1)
  .max(LIMITS.maxArrayItems);

/** Bounded array of string ids. */
export const idListSchema = z.array(idSchema).max(LIMITS.maxArrayItems);

/** Routable top-level site page slug from `SITE_PAGES`. */
export const sitePageSlugSchema = z.enum(SITE_PAGE_SLUGS);

/** Content locale (`es-AR` | `en-US`). */
export const localeSchema = z.enum(LOCALES);

/** Non-empty array of unique locales (`sermon.audioLanguages`). */
export const audioLanguagesSchema = z
  .array(localeSchema)
  .min(1)
  .max(LOCALES.length)
  .refine((values) => new Set(values).size === values.length, {
    message: "Audio languages must not repeat",
  });

/** Safe HTTP(S) URL for external links, map URLs, stored Blob URLs. */
export const httpUrlSchema = z
  .string()
  .max(LIMITS.hrefMax)
  .refine(
    (value) =>
      isAllowedHref(value) &&
      (value.toLowerCase().startsWith("https://") ||
        value.toLowerCase().startsWith("http://")),
    { message: "Must be an http:// or https:// URL" },
  );

/** ISO date (`YYYY-MM-DD`) or ISO-8601 date-time string as stored for `publishedDate`/`sermonDate`. */
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export const isoDateStringSchema = z
  .string()
  .max(64)
  .refine(
    (value) => ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
    {
      message: "Must be a valid ISO date string",
    },
  );

/** Positive integer (bible verse chapter/fromVerse/toVerse, image dimensions). */
export const positiveIntSchema = z.number().int().min(1).max(1_000_000);

/** Non-negative number (durationSeconds). */
export const nonNegativeNumberSchema = z.number().finite().min(0).max(86_400);

/** SHA-256 hex digest (64 lowercase or uppercase hex chars). */
export const sha256Schema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex sha256");

/** Known blog post categories (plain string in storage; UI hints from this const map). */
export const POST_CATEGORIES = [
  "Events",
  "Spiritual Growth",
  "Community",
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

/** Section layouts (no "duplex" — Agent notes). */
export const SECTION_LAYOUT = {
  hero: "hero",
  cta: "cta",
  textBlock: "textBlock",
} as const;
export type SectionLayout =
  (typeof SECTION_LAYOUT)[keyof typeof SECTION_LAYOUT];
export const sectionLayoutSchema = z.enum(["hero", "cta", "textBlock"]);

/** Belief item kind (`Creed` | `Value`). */
export const BELIEF_KIND = {
  Creed: "Creed",
  Value: "Value",
} as const;
export type BeliefKind = (typeof BELIEF_KIND)[keyof typeof BELIEF_KIND];
export const beliefKindSchema = z.enum(["Creed", "Value"]);

/** Footer social link platforms. */
export const SOCIAL_PLATFORM = {
  facebook: "facebook",
  instagram: "instagram",
  youtube: "youtube",
} as const;
export type SocialPlatform =
  (typeof SOCIAL_PLATFORM)[keyof typeof SOCIAL_PLATFORM];
export const socialPlatformSchema = z.enum([
  "facebook",
  "instagram",
  "youtube",
]);
