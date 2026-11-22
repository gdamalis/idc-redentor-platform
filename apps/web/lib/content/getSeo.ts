import {
  COLLECTIONS,
  isValidSlug,
  type Locale,
  type SeoEntryFields,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import { loadMediaMap, toSizedImageView } from "./media";
import type { SeoView } from "./types";

async function fetchSeo(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<SeoView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<SeoEntryFields>>(COLLECTIONS.seoEntries)
    .findOne({ [`${snap}.machineName`]: name });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!doc || !fields) return undefined;

  const mediaMap = await loadMediaMap(db, [fields.imageId]);
  const image = fields.imageId
    ? toSizedImageView(mediaMap.get(fields.imageId), locale) ?? null
    : null;

  return {
    title: resolveLocalized(fields.title, locale) ?? "",
    description: resolveLocalized(fields.description, locale) ?? "",
    keywords: resolveLocalized(fields.keywords, locale) ?? [],
    image,
    siteName: resolveLocalized(fields.siteName, locale),
    type: fields.type,
    sys: { id: doc._id.toHexString() },
    __typename: "Seo",
  };
}

const publishedSeoReader = createCachedReader(
  "seo",
  (name: string, locale: Locale) => fetchSeo(name, locale, false),
);

const draftSeoReader = createCachedReader(
  "seo-draft",
  (name: string, locale: Locale) => fetchSeo(name, locale, true),
);

export async function getSeo(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<SeoView | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftSeoReader.readDraft(name, locale)
    : publishedSeoReader.readPublished(name, locale);
}
