import { z } from "zod";
import type { Localized } from "../model/localized";
import { RICH_TEXT_SCHEMAS } from "../rich-text/schema";
import type { RichTextDoc } from "../rich-text/spec";
import type { SitePageSlug } from "../registries/pages";
import {
  httpUrlSchema,
  idSchema,
  longTextSchema,
  machineNameSchema,
  nonEmptyShortTextSchema,
  shortTextSchema,
  sitePageSlugSchema,
  socialPlatformSchema,
  stringListSchema,
  type SocialPlatform,
} from "./common";
import { localizedSchema } from "./localized";

export const GLOBAL_KIND = {
  navigationMenu: "navigationMenu",
  footer: "footer",
  singleEmailForm: "singleEmailForm",
  contactForm: "contactForm",
  location: "location",
} as const;

export type GlobalKind = (typeof GLOBAL_KIND)[keyof typeof GLOBAL_KIND];

// ── Navigation Menu ─────────────────────────────────────────────────────────

export interface MenuItemFields {
  groupName?: Localized<string>;
  groupLink?: SitePageSlug;
}

export interface NavigationMenuFields {
  kind: "navigationMenu";
  machineName: string;
  menuItems?: MenuItemFields[];
}

const menuItemDraftSchema = z.strictObject({
  groupName: localizedSchema(shortTextSchema).optional(),
  groupLink: sitePageSlugSchema.optional(),
});

const menuItemPublishableSchema = z.strictObject({
  groupName: localizedSchema(shortTextSchema, { requireEs: true }),
  groupLink: sitePageSlugSchema,
});

export const navigationMenuDraftSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.navigationMenu),
  machineName: machineNameSchema,
  menuItems: z.array(menuItemDraftSchema).max(50).optional(),
});

export const navigationMenuPublishableSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.navigationMenu),
  machineName: machineNameSchema,
  menuItems: z.array(menuItemPublishableSchema).min(1).max(50),
});

export const navigationMenuUpdateSchema = navigationMenuDraftSchema.partial();

// ── Footer ──────────────────────────────────────────────────────────────────

export interface SocialLinkFields {
  platform: SocialPlatform;
  url: string;
}

export interface FooterFields {
  kind: "footer";
  machineName: string;
  /** Logo media id. */
  logo?: string;
  shortDescription?: Localized<string>;
  socialLinks?: SocialLinkFields[];
}

const socialLinkSchema = z.strictObject({
  platform: socialPlatformSchema,
  url: httpUrlSchema,
});

export const footerDraftSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.footer),
  machineName: machineNameSchema,
  logo: idSchema.optional(),
  shortDescription: localizedSchema(longTextSchema).optional(),
  socialLinks: z.array(socialLinkSchema).max(20).optional(),
});

export const footerPublishableSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.footer),
  machineName: machineNameSchema,
  logo: idSchema.optional(),
  shortDescription: localizedSchema(longTextSchema, { requireEs: true }),
  socialLinks: z.array(socialLinkSchema).max(20).optional(),
});

export const footerUpdateSchema = footerDraftSchema.partial();

// ── Single Email Form ───────────────────────────────────────────────────────

export interface SingleEmailFormFields {
  kind: "singleEmailForm";
  machineName: string;
  title?: Localized<string>;
  shortDescription?: Localized<string>;
  ctaText?: Localized<string>;
  inputPlaceholder?: Localized<string>;
  successMessage?: Localized<string>;
}

export const singleEmailFormDraftSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.singleEmailForm),
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema).optional(),
  shortDescription: localizedSchema(longTextSchema).optional(),
  ctaText: localizedSchema(shortTextSchema).optional(),
  inputPlaceholder: localizedSchema(shortTextSchema).optional(),
  successMessage: localizedSchema(longTextSchema).optional(),
});

export const singleEmailFormPublishableSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.singleEmailForm),
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  shortDescription: localizedSchema(longTextSchema).optional(),
  ctaText: localizedSchema(shortTextSchema, { requireEs: true }),
  inputPlaceholder: localizedSchema(shortTextSchema).optional(),
  successMessage: localizedSchema(longTextSchema).optional(),
});

export const singleEmailFormUpdateSchema = singleEmailFormDraftSchema.partial();

// ── Contact Form ────────────────────────────────────────────────────────────

export interface ContactFormFieldItem {
  inputId: string;
  type: string;
  required: boolean;
  name?: Localized<string>;
  placeholder?: Localized<string>;
  values?: Localized<string[]>;
}

export interface ContactFormFields {
  kind: "contactForm";
  machineName: string;
  title?: Localized<string>;
  description?: Localized<string>;
  ctaText?: Localized<string>;
  /** Image media id. */
  image?: string;
  /** Bible verse content id (required at publish). */
  bibleVerseId?: string;
  agreementNote?: Localized<RichTextDoc>;
  fields?: ContactFormFieldItem[];
}

const contactFormFieldDraftSchema = z.strictObject({
  inputId: nonEmptyShortTextSchema,
  type: nonEmptyShortTextSchema,
  required: z.boolean(),
  name: localizedSchema(shortTextSchema).optional(),
  placeholder: localizedSchema(shortTextSchema).optional(),
  values: localizedSchema(stringListSchema).optional(),
});

const contactFormFieldPublishableSchema = z.strictObject({
  inputId: nonEmptyShortTextSchema,
  type: nonEmptyShortTextSchema,
  required: z.boolean(),
  name: localizedSchema(shortTextSchema, { requireEs: true }),
  placeholder: localizedSchema(shortTextSchema).optional(),
  values: localizedSchema(stringListSchema).optional(),
});

export const contactFormDraftSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.contactForm),
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema).optional(),
  description: localizedSchema(longTextSchema).optional(),
  ctaText: localizedSchema(shortTextSchema).optional(),
  image: idSchema.optional(),
  bibleVerseId: idSchema.optional(),
  agreementNote: localizedSchema(RICH_TEXT_SCHEMAS.inlineLink).optional(),
  fields: z.array(contactFormFieldDraftSchema).max(50).optional(),
});

export const contactFormPublishableSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.contactForm),
  machineName: machineNameSchema,
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  description: localizedSchema(longTextSchema).optional(),
  ctaText: localizedSchema(shortTextSchema, { requireEs: true }),
  image: idSchema.optional(),
  bibleVerseId: idSchema,
  agreementNote: localizedSchema(RICH_TEXT_SCHEMAS.inlineLink).optional(),
  fields: z.array(contactFormFieldPublishableSchema).min(1).max(50),
});

export const contactFormUpdateSchema = contactFormDraftSchema.partial();

// ── Shared Location ("Dirección y mapa") ────────────────────────────────────

export interface LocationFields {
  kind: "location";
  machineName: string;
  addressLine1?: string;
  neighborhood?: string;
  city?: string;
  country?: string;
  mapEmbedUrl?: string;
  googleMapsUrl?: string;
  lat?: number;
  lon?: number;
}

export const locationDraftSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.location),
  machineName: machineNameSchema,
  addressLine1: shortTextSchema.optional(),
  neighborhood: shortTextSchema.optional(),
  city: shortTextSchema.optional(),
  country: shortTextSchema.optional(),
  mapEmbedUrl: httpUrlSchema.optional(),
  googleMapsUrl: httpUrlSchema.optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lon: z.number().finite().min(-180).max(180).optional(),
});

export const locationPublishableSchema = z.strictObject({
  kind: z.literal(GLOBAL_KIND.location),
  machineName: machineNameSchema,
  addressLine1: nonEmptyShortTextSchema,
  neighborhood: shortTextSchema.optional(),
  city: nonEmptyShortTextSchema,
  country: nonEmptyShortTextSchema,
  mapEmbedUrl: httpUrlSchema.optional(),
  googleMapsUrl: httpUrlSchema.optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lon: z.number().finite().min(-180).max(180).optional(),
});

export const locationUpdateSchema = locationDraftSchema.partial();

// ── Discriminated union across all globals ──────────────────────────────────

export type GlobalFields =
  | NavigationMenuFields
  | FooterFields
  | SingleEmailFormFields
  | ContactFormFields
  | LocationFields;

export const globalDraftSchema = z.discriminatedUnion("kind", [
  navigationMenuDraftSchema,
  footerDraftSchema,
  singleEmailFormDraftSchema,
  contactFormDraftSchema,
  locationDraftSchema,
]);

export const globalPublishableSchema = z.discriminatedUnion("kind", [
  navigationMenuPublishableSchema,
  footerPublishableSchema,
  singleEmailFormPublishableSchema,
  contactFormPublishableSchema,
  locationPublishableSchema,
]);

export const globalUpdateSchema = z.union([
  navigationMenuUpdateSchema,
  footerUpdateSchema,
  singleEmailFormUpdateSchema,
  contactFormUpdateSchema,
  locationUpdateSchema,
]);
