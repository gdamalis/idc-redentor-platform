import {
  COLLECTIONS,
  isValidSlug,
  type Locale,
  type SectionFields,
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
  toSectionImageItemView,
} from "./media";
import type { SectionImageItemView, SectionView } from "./types";

async function fetchSection(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<SectionView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<SectionFields>>(COLLECTIONS.sections)
    .findOne({ [`${snap}.machineName`]: name });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!doc || !fields) return undefined;

  const resolvedBodyDoc = resolveLocalized(fields.body, locale);
  const mediaIds = collectEmbeddedMediaIds(resolvedBodyDoc);
  if (fields.image) mediaIds.add(fields.image);
  for (const imgId of fields.images ?? []) mediaIds.add(imgId);

  const mediaMap = await loadMediaMap(db, mediaIds);

  const imagesItems: SectionImageItemView[] = [];
  for (const imgId of fields.images ?? []) {
    const item = toSectionImageItemView(mediaMap.get(imgId), locale);
    if (item) imagesItems.push(item);
  }

  return {
    layout: fields.layout,
    headline: resolveLocalized(fields.headline, locale),
    subHeadline: resolveLocalized(fields.subHeadline, locale),
    body: buildRichTextView(resolvedBodyDoc, mediaMap, locale),
    ctaText: resolveLocalized(fields.ctaText, locale),
    targetPage: fields.targetPage ? { slug: fields.targetPage } : null,
    urlParameters: fields.urlParameters ?? null,
    image: fields.image
      ? toImageView(mediaMap.get(fields.image), locale) ?? null
      : null,
    imagesCollection: { items: imagesItems },
    sys: { id: doc._id.toHexString() },
    __typename: "Section",
  };
}

const publishedSectionReader = createCachedReader(
  "section",
  (name: string, locale: Locale) => fetchSection(name, locale, false),
);

const draftSectionReader = createCachedReader(
  "section-draft",
  (name: string, locale: Locale) => fetchSection(name, locale, true),
);

export async function getSection(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<SectionView | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftSectionReader.readDraft(name, locale)
    : publishedSectionReader.readPublished(name, locale);
}
