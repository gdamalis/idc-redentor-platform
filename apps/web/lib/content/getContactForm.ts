import {
  COLLECTIONS,
  GLOBAL_KIND,
  type ContactFormFields,
  type Locale,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import {
  buildRichTextView,
  collectEmbeddedMediaIds,
  loadMediaMap,
  toImageView,
} from "./media";
import { loadBibleVerseMap, toStructuredBibleVerseView } from "./references";
import type { ContactFormView } from "./types";

async function fetchContactForm(
  locale: Locale,
  isDraftMode: boolean,
): Promise<ContactFormView> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<ContactFormFields>>(COLLECTIONS.globals)
    .findOne({
      [`${snap}.kind`]: GLOBAL_KIND.contactForm,
      [`${snap}.machineName`]: "contact-form",
    });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!fields) {
    throw new Error("[getContactForm] Contact form document not found");
  }

  const agreementDoc = resolveLocalized(fields.agreementNote, locale);
  const mediaIds = collectEmbeddedMediaIds(agreementDoc);
  if (fields.image) mediaIds.add(fields.image);

  const [mediaMap, verseMap] = await Promise.all([
    loadMediaMap(db, mediaIds),
    loadBibleVerseMap(db, [fields.bibleVerseId], isDraftMode),
  ]);

  const verse = fields.bibleVerseId
    ? verseMap.get(fields.bibleVerseId)
    : undefined;

  return {
    title: resolveLocalized(fields.title, locale) ?? "",
    description: resolveLocalized(fields.description, locale) ?? "",
    ctaText: resolveLocalized(fields.ctaText, locale) ?? "",
    image: fields.image
      ? toImageView(mediaMap.get(fields.image), locale) ?? null
      : null,
    agreementNote: buildRichTextView(agreementDoc, mediaMap, locale),
    bibleVerse: toStructuredBibleVerseView(verse, locale),
    formFields: (fields.fields ?? []).map((f) => ({
      name: resolveLocalized(f.name, locale) ?? "",
      values: resolveLocalized(f.values, locale) ?? [],
      type: f.type,
      required: f.required,
      placeholder: resolveLocalized(f.placeholder, locale) ?? "",
      inputId: f.inputId,
    })),
  };
}

const publishedContactFormReader = createCachedReader(
  "contact-form",
  (locale: Locale) => fetchContactForm(locale, false),
);

const draftContactFormReader = createCachedReader(
  "contact-form-draft",
  (locale: Locale) => fetchContactForm(locale, true),
);

export async function getContactForm(
  locale: string,
  isDraftMode = false,
): Promise<ContactFormView> {
  if (!isValidLocale(locale)) {
    throw new Error(`[getContactForm] Invalid locale: ${locale}`);
  }
  return isDraftMode
    ? draftContactFormReader.readDraft(locale)
    : publishedContactFormReader.readPublished(locale);
}
