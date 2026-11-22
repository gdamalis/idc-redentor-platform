import {
  COLLECTIONS,
  isValidSlug,
  type BeliefCollectionFields,
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
import type { ContentItemView, RawContentCollectionView } from "./types";

async function fetchContentCollection(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<RawContentCollectionView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<BeliefCollectionFields>>(
      COLLECTIONS.beliefCollections,
    )
    .findOne({ [`${snap}.machineName`]: name });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!doc || !fields) return undefined;

  const docId = doc._id.toHexString();
  const collectionDescDoc = resolveLocalized(fields.description, locale);
  const mediaIds = collectEmbeddedMediaIds(collectionDescDoc);
  const verseIds: string[] = [];

  const rawItems = fields.items ?? [];
  const itemDescDocs = rawItems.map((item) => {
    const descDoc = resolveLocalized(item.description, locale);
    collectEmbeddedMediaIds(descDoc, mediaIds);
    if (item.imageId) mediaIds.add(item.imageId);
    if (item.bibleVerseId) verseIds.push(item.bibleVerseId);
    return descDoc;
  });

  const [mediaMap, verseMap] = await Promise.all([
    loadMediaMap(db, mediaIds),
    loadBibleVerseMap(db, verseIds, isDraftMode),
  ]);

  const items: ContentItemView[] = rawItems.map((item, index) => {
    const mapped: ContentItemView = {
      title: resolveLocalized(item.title, locale) ?? "",
      description: buildRichTextView(itemDescDocs[index], mediaMap, locale),
      bibleVerse: item.bibleVerseId
        ? toStructuredBibleVerseView(verseMap.get(item.bibleVerseId), locale)
        : null,
      kind: item.kind,
      sys: { id: `${docId}:item:${index}` },
      __typename: "BeliefItem",
    };
    const img = item.imageId
      ? toImageView(mediaMap.get(item.imageId), locale)
      : undefined;
    if (img) mapped.image = img;
    return mapped;
  });

  return {
    title: resolveLocalized(fields.title, locale) ?? "",
    description: buildRichTextView(collectionDescDoc, mediaMap, locale),
    contentItemsCollection: { items },
    sys: { id: docId },
    __typename: "ContentCollection",
  };
}

const publishedCollectionReader = createCachedReader(
  "content-collection",
  (name: string, locale: Locale) => fetchContentCollection(name, locale, false),
);

const draftCollectionReader = createCachedReader(
  "content-collection-draft",
  (name: string, locale: Locale) => fetchContentCollection(name, locale, true),
);

export async function getContentCollection(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<RawContentCollectionView | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftCollectionReader.readDraft(name, locale)
    : publishedCollectionReader.readPublished(name, locale);
}
