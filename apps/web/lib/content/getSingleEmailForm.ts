import {
  COLLECTIONS,
  GLOBAL_KIND,
  isValidSlug,
  type Locale,
  type SingleEmailFormFields,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import type { SingleEmailFormView } from "./types";

async function fetchSingleEmailForm(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<SingleEmailFormView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<SingleEmailFormFields>>(COLLECTIONS.globals)
    .findOne({
      [`${snap}.kind`]: GLOBAL_KIND.singleEmailForm,
      [`${snap}.machineName`]: name,
    });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!doc || !fields) return undefined;

  return {
    title: resolveLocalized(fields.title, locale) ?? "",
    shortDescription: resolveLocalized(fields.shortDescription, locale),
    ctaText: resolveLocalized(fields.ctaText, locale) ?? "",
    inputPlaceholder: resolveLocalized(fields.inputPlaceholder, locale),
    successMessage: resolveLocalized(fields.successMessage, locale),
    sys: { id: doc._id.toHexString() },
    __typename: "SingleEmailForm",
  };
}

const publishedSingleEmailReader = createCachedReader(
  "single-email-form",
  (name: string, locale: Locale) => fetchSingleEmailForm(name, locale, false),
);

const draftSingleEmailReader = createCachedReader(
  "single-email-form-draft",
  (name: string, locale: Locale) => fetchSingleEmailForm(name, locale, true),
);

export async function getSingleEmailForm(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<SingleEmailFormView | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftSingleEmailReader.readDraft(name, locale)
    : publishedSingleEmailReader.readPublished(name, locale);
}
