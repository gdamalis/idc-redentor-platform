import {
  COLLECTIONS,
  isValidSlug,
  type Locale,
  type TopicFields,
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
import type { ChurchInfoTopicView } from "./types";

async function fetchChurchInfoTopic(
  slug: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<ChurchInfoTopicView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);

  // Topics are matched STRICTLY by the requested locale's own slug (never falling back from
  // en-US to es-AR on lookup), so `/en-US/privacidad` returns 404.
  const doc = await db
    .collection<StoredEnvelope<TopicFields>>(COLLECTIONS.topics)
    .findOne({ [`${snap}.slug.${locale}`]: slug });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!doc || !fields) return undefined;

  const bodyDoc = resolveLocalized(fields.body, locale);
  const mediaIds = collectEmbeddedMediaIds(bodyDoc);
  if (fields.featuredImageId) mediaIds.add(fields.featuredImageId);

  const mediaMap = await loadMediaMap(db, mediaIds);

  return {
    name: resolveLocalized(fields.name, locale) ?? "",
    slug: fields.slug?.[locale] ?? slug,
    shortDescription: resolveLocalized(fields.shortDescription, locale) ?? null,
    featuredImage: fields.featuredImageId
      ? toImageView(mediaMap.get(fields.featuredImageId), locale) ?? null
      : null,
    body: buildRichTextView(bodyDoc, mediaMap, locale),
    sys: {
      id: doc._id.toHexString(),
      publishedAt: (doc.publishedAt ?? doc.updatedAt).toISOString(),
    },
    __typename: "ChurchInfoTopic",
  };
}

const publishedTopicReader = createCachedReader(
  "church-info-topic",
  (slug: string, locale: Locale) => fetchChurchInfoTopic(slug, locale, false),
);

const draftTopicReader = createCachedReader(
  "church-info-topic-draft",
  (slug: string, locale: Locale) => fetchChurchInfoTopic(slug, locale, true),
);

export async function getChurchInfoTopic(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<ChurchInfoTopicView | undefined> {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftTopicReader.readDraft(slug, locale)
    : publishedTopicReader.readPublished(slug, locale);
}
