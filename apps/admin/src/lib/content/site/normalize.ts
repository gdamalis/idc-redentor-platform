import {
  isEmptyValue,
  normalizeLocalized,
  type BeliefCollectionFields,
  type ContactFormFieldItem,
  type ContactFormFields,
  type EventBannerFields,
  type FooterFields,
  type GlobalFields,
  type LocationFields,
  type Localized,
  type NavigationMenuFields,
  type RichTextDoc,
  type RichTextNode,
  type SectionFields,
  type SeoEntryFields,
  type SingleEmailFormFields,
} from "@idcr/content";

export const EMPTY_RICH_TEXT_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Trims an optional plain string; collapses blank strings to `undefined`. */
export function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Strips leading `?` characters from URL query parameters (`ComponentCta.tsx` prepends `?`). */
export function normalizeUrlParameters(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.trim().replace(/^\?+/, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Parses an optional finite number from text input:
 * - blank / whitespace → `undefined` (clear optional field)
 * - valid finite number → `number`
 * - non-blank invalid text (e.g. `"abc"`) → `Number.NaN` so server Zod validation
 *   surfaces `errors.lat`/`errors.lon` instead of silently unsetting an existing value.
 */
export function normalizeOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Normalizes a `Localized<string>` so an empty `en-US` value is always stored
 * as absent (preserving Spanish fallback on the public site). Returns
 * `undefined` if both locales are empty.
 */
export function normalizeLocalizedText(
  value: Localized<string> | undefined,
): Localized<string> | undefined {
  if (!value) return undefined;
  const normalized = normalizeLocalized({
    "es-AR": value["es-AR"] ?? "",
    ...(value["en-US"] !== undefined ? { "en-US": value["en-US"] } : {}),
  });
  if (
    isEmptyValue(normalized["es-AR"]) &&
    isEmptyValue(normalized["en-US"])
  ) {
    return undefined;
  }
  return normalized;
}

/**
 * Converts a TipTap/ProseMirror `RichTextDoc` into plain `Object.prototype`
 * objects so React 19 / Next.js 16 Server Action Flight never serializes
 * null-prototype ProseMirror `attrs` (`Object.create(null)`) as `"$T"`.
 */
export function toPlainRichTextDoc(doc: RichTextDoc): RichTextDoc {
  return JSON.parse(JSON.stringify(doc)) as RichTextDoc;
}

/**
 * Normalizes a `Localized<RichTextDoc>` so an empty `en-US` document is omitted
 * and all ProseMirror node/mark `attrs` use `Object.prototype`.
 */
export function normalizeLocalizedRichText(
  value: Localized<RichTextDoc> | undefined,
): Localized<RichTextDoc> | undefined {
  if (!value) return undefined;
  const plainEs = toPlainRichTextDoc(value["es-AR"] ?? EMPTY_RICH_TEXT_DOC);
  const plainEn =
    value["en-US"] !== undefined
      ? toPlainRichTextDoc(value["en-US"])
      : undefined;
  const normalized = normalizeLocalized({
    "es-AR": plainEs,
    ...(plainEn !== undefined ? { "en-US": plainEn } : {}),
  });
  if (
    isEmptyValue(normalized["es-AR"]) &&
    isEmptyValue(normalized["en-US"])
  ) {
    return undefined;
  }
  return normalized;
}

/**
 * Normalizes a `Localized<string[]>` (keywords, dropdown values): trims items,
 * drops blank entries, and omits `en-US` when empty.
 */
export function normalizeLocalizedStringList(
  value: Localized<string[]> | undefined,
): Localized<string[]> | undefined {
  if (!value) return undefined;
  const esItems = (value["es-AR"] ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const enItems = (value["en-US"] ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (esItems.length === 0 && enItems.length === 0) {
    return undefined;
  }
  return enItems.length > 0
    ? { "es-AR": esItems, "en-US": enItems }
    : { "es-AR": esItems };
}

/** Extracts readable plain text from a TipTap `RichTextDoc` (for Spanish original previews). */
export function extractRichTextPlainText(
  doc: RichTextDoc | undefined,
): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  const paragraphs: string[] = [];

  const collectText = (nodes: readonly RichTextNode[] | undefined): string => {
    if (!nodes) return "";
    let out = "";
    for (const node of nodes) {
      if (node.type === "text" && typeof node.text === "string") {
        out += node.text;
      } else if ("content" in node && Array.isArray(node.content)) {
        out += collectText(node.content);
      }
    }
    return out;
  };

  for (const child of doc.content) {
    const childNodes =
      "content" in child && Array.isArray(child.content)
        ? child.content
        : undefined;
    const text = collectText(childNodes).trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs.join("\n\n");
}

/**
 * Defense-in-depth client structural lock for `contactForm.fields` (`ICR-198` AC3):
 * preserves exact count, order, `inputId`, `type`, and `required` from the
 * server-loaded baseline while accepting ONLY `name`, `placeholder`, and `values`.
 */
export function lockContactFormFields(
  baselineFields: readonly ContactFormFieldItem[] | undefined,
  nextFields: readonly ContactFormFieldItem[] | undefined,
): ContactFormFieldItem[] | undefined {
  if (!baselineFields) return undefined;
  return baselineFields.map((base, idx) => {
    const edited = nextFields?.[idx];
    const source = edited ?? base;
    const name = normalizeLocalizedText(source.name);
    const placeholder = normalizeLocalizedText(source.placeholder);
    const values = normalizeLocalizedStringList(source.values);
    return {
      inputId: base.inputId,
      type: base.type,
      required: base.required,
      ...(name !== undefined ? { name } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(values !== undefined ? { values } : {}),
    };
  });
}

export function normalizeSectionDraft(values: SectionFields): SectionFields {
  const headline = normalizeLocalizedText(values.headline);
  const subHeadline = normalizeLocalizedText(values.subHeadline);
  const body = normalizeLocalizedRichText(values.body);
  const ctaText = normalizeLocalizedText(values.ctaText);
  const urlParameters = normalizeUrlParameters(values.urlParameters);
  const image = normalizeOptionalText(values.image);
  const images =
    values.images && values.images.length > 0 ? [...values.images] : undefined;

  return {
    machineName: values.machineName,
    ...(values.layout !== undefined ? { layout: values.layout } : {}),
    ...(headline !== undefined ? { headline } : {}),
    ...(subHeadline !== undefined ? { subHeadline } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(ctaText !== undefined ? { ctaText } : {}),
    ...(values.targetPage !== undefined ? { targetPage: values.targetPage } : {}),
    ...(urlParameters !== undefined ? { urlParameters } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(images !== undefined ? { images } : {}),
  };
}

export function normalizeBeliefCollectionDraft(
  values: BeliefCollectionFields,
): BeliefCollectionFields {
  const title = normalizeLocalizedText(values.title);
  const description = normalizeLocalizedRichText(values.description);
  const items = values.items?.map((item) => {
    const itemTitle = normalizeLocalizedText(item.title);
    const itemDescription = normalizeLocalizedRichText(item.description);
    const bibleVerseId = normalizeOptionalText(item.bibleVerseId);
    const imageId = normalizeOptionalText(item.imageId);
    return {
      ...(itemTitle !== undefined ? { title: itemTitle } : {}),
      ...(itemDescription !== undefined ? { description: itemDescription } : {}),
      ...(item.kind !== undefined ? { kind: item.kind } : {}),
      ...(bibleVerseId !== undefined ? { bibleVerseId } : {}),
      ...(imageId !== undefined ? { imageId } : {}),
    };
  });

  return {
    machineName: values.machineName,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(items !== undefined ? { items } : {}),
  };
}

export function normalizeEventBannerDraft(
  values: EventBannerFields,
): EventBannerFields {
  const image = normalizeOptionalText(values.image);
  const ev = values.event;
  const event = ev
    ? (() => {
        const name = normalizeLocalizedText(ev.name);
        const dayOfWeek = normalizeLocalizedText(ev.dayOfWeek);
        const note = normalizeLocalizedText(ev.note);
        const time = normalizeOptionalText(ev.time);
        const date = normalizeOptionalText(ev.date);
        return {
          ...(name !== undefined ? { name } : {}),
          ...(dayOfWeek !== undefined ? { dayOfWeek } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(time !== undefined ? { time } : {}),
          ...(date !== undefined ? { date } : {}),
        };
      })()
    : undefined;

  return {
    machineName: values.machineName,
    ...(event !== undefined ? { event } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

export function normalizeSeoEntryDraft(values: SeoEntryFields): SeoEntryFields {
  const title = normalizeLocalizedText(values.title);
  const description = normalizeLocalizedText(values.description);
  const keywords = normalizeLocalizedStringList(values.keywords);
  const imageId = normalizeOptionalText(values.imageId);
  const siteName = normalizeLocalizedText(values.siteName);
  const type = normalizeOptionalText(values.type);

  return {
    machineName: values.machineName,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(keywords !== undefined ? { keywords } : {}),
    ...(imageId !== undefined ? { imageId } : {}),
    ...(siteName !== undefined ? { siteName } : {}),
    ...(type !== undefined ? { type } : {}),
  };
}

export function normalizeNavigationMenuDraft(
  values: NavigationMenuFields,
): NavigationMenuFields {
  const menuItems = values.menuItems?.map((item) => {
    const groupName = normalizeLocalizedText(item.groupName);
    return {
      ...(groupName !== undefined ? { groupName } : {}),
      ...(item.groupLink !== undefined ? { groupLink: item.groupLink } : {}),
    };
  });
  return {
    kind: "navigationMenu",
    machineName: values.machineName,
    ...(menuItems !== undefined ? { menuItems } : {}),
  };
}

export function normalizeFooterDraft(values: FooterFields): FooterFields {
  const logo = normalizeOptionalText(values.logo);
  const shortDescription = normalizeLocalizedText(values.shortDescription);
  const socialLinks = values.socialLinks?.map((link) => ({
    platform: link.platform,
    url: link.url.trim(),
  }));

  return {
    kind: "footer",
    machineName: values.machineName,
    ...(logo !== undefined ? { logo } : {}),
    ...(shortDescription !== undefined ? { shortDescription } : {}),
    ...(socialLinks !== undefined ? { socialLinks } : {}),
  };
}

export function normalizeLocationDraft(values: LocationFields): LocationFields {
  const addressLine1 = normalizeOptionalText(values.addressLine1);
  const neighborhood = normalizeOptionalText(values.neighborhood);
  const city = normalizeOptionalText(values.city);
  const country = normalizeOptionalText(values.country);
  const mapEmbedUrl = normalizeOptionalText(values.mapEmbedUrl);
  const googleMapsUrl = normalizeOptionalText(values.googleMapsUrl);
  // Preserve explicit invalid numbers (e.g. NaN from non-numeric input) so Zod
  // rejects them with `errors.lat`/`errors.lon` instead of silently clearing coordinates.
  const lat = values.lat;
  const lon = values.lon;

  return {
    kind: "location",
    machineName: values.machineName,
    ...(addressLine1 !== undefined ? { addressLine1 } : {}),
    ...(neighborhood !== undefined ? { neighborhood } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(mapEmbedUrl !== undefined ? { mapEmbedUrl } : {}),
    ...(googleMapsUrl !== undefined ? { googleMapsUrl } : {}),
    ...(lat !== undefined ? { lat } : {}),
    ...(lon !== undefined ? { lon } : {}),
  };
}

export function normalizeSingleEmailFormDraft(
  values: SingleEmailFormFields,
): SingleEmailFormFields {
  const title = normalizeLocalizedText(values.title);
  const shortDescription = normalizeLocalizedText(values.shortDescription);
  const ctaText = normalizeLocalizedText(values.ctaText);
  const inputPlaceholder = normalizeLocalizedText(values.inputPlaceholder);
  const successMessage = normalizeLocalizedText(values.successMessage);

  return {
    kind: "singleEmailForm",
    machineName: values.machineName,
    ...(title !== undefined ? { title } : {}),
    ...(shortDescription !== undefined ? { shortDescription } : {}),
    ...(ctaText !== undefined ? { ctaText } : {}),
    ...(inputPlaceholder !== undefined ? { inputPlaceholder } : {}),
    ...(successMessage !== undefined ? { successMessage } : {}),
  };
}

export function normalizeContactFormDraft(
  values: ContactFormFields,
  baselineFields?: readonly ContactFormFieldItem[],
): ContactFormFields {
  const title = normalizeLocalizedText(values.title);
  const description = normalizeLocalizedText(values.description);
  const ctaText = normalizeLocalizedText(values.ctaText);
  const image = normalizeOptionalText(values.image);
  const bibleVerseId = normalizeOptionalText(values.bibleVerseId);
  const agreementNote = normalizeLocalizedRichText(values.agreementNote);
  const fields = baselineFields
    ? lockContactFormFields(baselineFields, values.fields)
    : values.fields;

  return {
    kind: "contactForm",
    machineName: values.machineName,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(ctaText !== undefined ? { ctaText } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(bibleVerseId !== undefined ? { bibleVerseId } : {}),
    ...(agreementNote !== undefined ? { agreementNote } : {}),
    ...(fields !== undefined ? { fields } : {}),
  };
}

export function normalizeGlobalDraft(
  values: GlobalFields,
  baselineContactFields?: readonly ContactFormFieldItem[],
): GlobalFields {
  switch (values.kind) {
    case "navigationMenu":
      return normalizeNavigationMenuDraft(values);
    case "footer":
      return normalizeFooterDraft(values);
    case "location":
      return normalizeLocationDraft(values);
    case "singleEmailForm":
      return normalizeSingleEmailFormDraft(values);
    case "contactForm":
      return normalizeContactFormDraft(values, baselineContactFields);
  }
}
