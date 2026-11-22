import {
  COLLECTIONS,
  isValidSlug,
  type Locale,
  type SermonFields,
} from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import { isValidLocale } from "@src/i18n/config";
import { normalizeAudioLanguages } from "@src/utils/sermon/audioLanguage";
import { createCachedReader } from "./cache";
import {
  isValidObjectIdHex,
  requireContentDb,
  toObjectIds,
  type StoredEnvelope,
} from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import {
  buildRichTextView,
  collectEmbeddedMediaIds,
  loadMediaMap,
  toImageView,
  toSermonMediaView,
} from "./media";
import {
  loadAuthorMap,
  loadBibleVerseMap,
  toAuthorView,
  toScriptureRefView,
} from "./references";
import type {
  AuthorView,
  RelatedSermonView,
  ScriptureRefView,
  SermonView,
  SlugEntryView,
} from "./types";

const LATEST_SERMONS_LIMIT = 3;
const RELATED_SERMONS_LIMIT = 3;

async function hydrateSermons(
  db: Db,
  docs: Array<StoredEnvelope<SermonFields>>,
  locale: Locale,
  isDraftMode: boolean,
  cardOnly: boolean,
): Promise<SermonView[]> {
  if (docs.length === 0) return [];

  const snap = snapshotKey(isDraftMode);
  const authorIds = new Set<string>();
  const verseIds = new Set<string>();
  const relatedIds = new Set<string>();
  const mediaIds = new Set<string>();

  const pairs: Array<{
    doc: StoredEnvelope<SermonFields>;
    fields: SermonFields;
    contentDoc: ReturnType<
      typeof resolveLocalized<NonNullable<SermonFields["content"]>["es-AR"]>
    >;
    pdfMediaId: string | undefined;
  }> = [];

  for (const doc of docs) {
    const fields = resolveSnapshot(doc, isDraftMode);
    if (!fields) continue;
    if (fields.featuredImageId) mediaIds.add(fields.featuredImageId);
    if (fields.audioMediaId) mediaIds.add(fields.audioMediaId);
    if (fields.preacherId) authorIds.add(fields.preacherId);

    let contentDoc: ReturnType<
      typeof resolveLocalized<NonNullable<SermonFields["content"]>["es-AR"]>
    >;
    let pdfMediaId: string | undefined;

    if (!cardOnly) {
      contentDoc = resolveLocalized(fields.content, locale);
      collectEmbeddedMediaIds(contentDoc, mediaIds);
      pdfMediaId = resolveLocalized(fields.pdfSummaryMediaId, locale);
      if (pdfMediaId) mediaIds.add(pdfMediaId);
      if (fields.interpreterId) authorIds.add(fields.interpreterId);
      for (const id of fields.additionalPreacherIds ?? []) authorIds.add(id);
      for (const id of fields.scriptureRefIds ?? []) verseIds.add(id);
      for (const id of (fields.relatedSermonIds ?? []).slice(
        0,
        RELATED_SERMONS_LIMIT,
      )) {
        relatedIds.add(id);
      }
    }

    pairs.push({ doc, fields, contentDoc, pdfMediaId });
  }

  const relatedObjectIds = toObjectIds(relatedIds);
  const [authorMap, verseMap, relatedDocs] = await Promise.all([
    loadAuthorMap(db, authorIds, isDraftMode),
    cardOnly
      ? Promise.resolve(new Map())
      : loadBibleVerseMap(db, verseIds, isDraftMode),
    !cardOnly && relatedObjectIds.length > 0
      ? db
          .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
          .find({ _id: { $in: relatedObjectIds }, [snap]: { $exists: true } })
          .toArray()
      : Promise.resolve([]),
  ]);

  for (const author of authorMap.values()) {
    if (author.avatarMediaId) mediaIds.add(author.avatarMediaId);
  }
  const relatedMap = new Map<string, SermonFields>();
  for (const relDoc of relatedDocs) {
    const relFields = resolveSnapshot(relDoc, isDraftMode);
    if (relFields) {
      relatedMap.set(relDoc._id.toHexString(), relFields);
      if (relFields.featuredImageId) mediaIds.add(relFields.featuredImageId);
    }
  }

  const mediaMap = await loadMediaMap(db, mediaIds);

  return pairs.map(({ doc, fields, contentDoc, pdfMediaId }) => {
    const additionalPreachers: AuthorView[] = [];
    if (!cardOnly) {
      for (const id of fields.additionalPreacherIds ?? []) {
        const mapped = toAuthorView(authorMap.get(id), mediaMap, locale);
        if (mapped) additionalPreachers.push(mapped);
      }
    }

    const scriptureReferences: ScriptureRefView[] = [];
    if (!cardOnly) {
      for (const id of fields.scriptureRefIds ?? []) {
        const ref = toScriptureRefView(verseMap.get(id), locale);
        if (ref) scriptureReferences.push(ref);
      }
    }

    const relatedSermons: RelatedSermonView[] = [];
    if (!cardOnly) {
      for (const id of (fields.relatedSermonIds ?? []).slice(
        0,
        RELATED_SERMONS_LIMIT,
      )) {
        const rel = relatedMap.get(id);
        if (!rel) continue;
        const item: RelatedSermonView = {
          title: resolveLocalized(rel.title, locale) ?? "",
          slug: rel.slug ?? "",
          sermonDate: rel.sermonDate ?? "",
          excerpt: resolveLocalized(rel.excerpt, locale) ?? "",
        };
        const relImg = rel.featuredImageId
          ? toImageView(mediaMap.get(rel.featuredImageId), locale)
          : undefined;
        if (relImg) item.featuredImage = relImg;
        relatedSermons.push(item);
      }
    }

    // Matches `lib/contentful/getSermons.ts#mapSermon` (note: no `__typename` on mapped Sermon).
    return {
      title: resolveLocalized(fields.title, locale) ?? "",
      slug: fields.slug ?? "",
      sermonDate: fields.sermonDate ?? "",
      preacher: fields.preacherId
        ? toAuthorView(authorMap.get(fields.preacherId), mediaMap, locale)
        : undefined,
      additionalPreachers,
      audioLanguages: normalizeAudioLanguages(
        cardOnly ? undefined : fields.audioLanguages,
      ),
      interpreter:
        !cardOnly && fields.interpreterId
          ? toAuthorView(authorMap.get(fields.interpreterId), mediaMap, locale)
          : undefined,
      scriptureReferences,
      thesis: resolveLocalized(fields.thesis, locale) ?? "",
      mainPoints: resolveLocalized(fields.mainPoints, locale) ?? [],
      excerpt: resolveLocalized(fields.excerpt, locale) ?? "",
      content: cardOnly
        ? undefined
        : buildRichTextView(contentDoc, mediaMap, locale),
      featuredImage: fields.featuredImageId
        ? toImageView(mediaMap.get(fields.featuredImageId), locale)
        : undefined,
      audio: fields.audioMediaId
        ? toSermonMediaView(mediaMap.get(fields.audioMediaId), locale)
        : undefined,
      durationSeconds: fields.durationSeconds,
      pdfSummary:
        !cardOnly && pdfMediaId
          ? toSermonMediaView(mediaMap.get(pdfMediaId), locale)
          : undefined,
      seoTitle: resolveLocalized(fields.seoTitle, locale) ?? "",
      seoDescription: resolveLocalized(fields.seoDescription, locale) ?? "",
      keywords: resolveLocalized(fields.keywords, locale) ?? [],
      relatedSermons,
      sys: {
        id: doc._id.toHexString(),
        ...(doc.publishedAt
          ? { publishedAt: doc.publishedAt.toISOString() }
          : {}),
      },
    };
  });
}

async function fetchSermonBySlug(
  slug: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<SermonView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
    .findOne({ [`${snap}.slug`]: slug });
  if (!doc) return undefined;
  const [hydrated] = await hydrateSermons(db, [doc], locale, isDraftMode, false);
  return hydrated;
}

async function fetchSermonById(
  id: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<SermonView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
    .findOne({ _id: new ObjectId(id), [snap]: { $exists: true } });
  if (!doc) return undefined;
  const [hydrated] = await hydrateSermons(db, [doc], locale, isDraftMode, false);
  return hydrated;
}

async function fetchLatestSermons(
  locale: Locale,
  excludeSlug: string | undefined,
  isDraftMode: boolean,
): Promise<SermonView[]> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const filter: Record<string, unknown> = { [snap]: { $exists: true } };
  if (excludeSlug) {
    filter[`${snap}.slug`] = { $ne: excludeSlug };
  }

  const docs = await db
    .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
    .find(filter)
    .sort({ [`${snap}.sermonDate`]: -1, _id: 1 })
    .limit(LATEST_SERMONS_LIMIT)
    .toArray();

  return hydrateSermons(db, docs, locale, isDraftMode, false);
}

async function fetchAllSermons(
  locale: Locale,
  isDraftMode: boolean,
): Promise<SermonView[]> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  // Exclude heavy detail fields to mirror SERMON_CARD_FIELDS; no 100-item truncation.
  const docs = await db
    .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
    .find({ [snap]: { $exists: true } })
    .project<StoredEnvelope<SermonFields>>({
      [`${snap}.content`]: 0,
      [`${snap}.scriptureRefIds`]: 0,
      [`${snap}.relatedSermonIds`]: 0,
      [`${snap}.additionalPreacherIds`]: 0,
      [`${snap}.interpreterId`]: 0,
      [`${snap}.pdfSummaryMediaId`]: 0,
    })
    .sort({ [`${snap}.sermonDate`]: -1, _id: 1 })
    .toArray();

  return hydrateSermons(db, docs, locale, isDraftMode, true);
}

async function fetchAllSermonSlugs(): Promise<SlugEntryView[]> {
  const db = await requireContentDb();
  // Consumed by the ISR sitemap (ICR-123): DB/query failures MUST propagate so Next.js keeps
  // serving the last good sitemap instead of caching an empty list. No 100-item cap.
  const docs = await db
    .collection<StoredEnvelope<SermonFields>>(COLLECTIONS.sermons)
    .find({
      published: { $exists: true },
      "published.slug": { $type: "string" },
    })
    .sort({ "published.sermonDate": -1, _id: 1 })
    .toArray();

  return docs.map((doc) => ({
    slug: doc.published!.slug!,
    updatedAt: (doc.publishedAt ?? doc.updatedAt).toISOString(),
  }));
}

const publishedSermonBySlug = createCachedReader(
  "sermon-by-slug",
  (slug: string, locale: Locale) => fetchSermonBySlug(slug, locale, false),
);
const draftSermonBySlug = createCachedReader(
  "sermon-by-slug-draft",
  (slug: string, locale: Locale) => fetchSermonBySlug(slug, locale, true),
);

const publishedSermonById = createCachedReader(
  "sermon-by-id",
  (id: string, locale: Locale) => fetchSermonById(id, locale, false),
);
const draftSermonById = createCachedReader(
  "sermon-by-id-draft",
  (id: string, locale: Locale) => fetchSermonById(id, locale, true),
);

const publishedLatestSermons = createCachedReader(
  "sermon-latest",
  (locale: Locale, excludeSlug: string | undefined) =>
    fetchLatestSermons(locale, excludeSlug, false),
);
const draftLatestSermons = createCachedReader(
  "sermon-latest-draft",
  (locale: Locale, excludeSlug: string | undefined) =>
    fetchLatestSermons(locale, excludeSlug, true),
);

const publishedAllSermons = createCachedReader(
  "sermon-all",
  (locale: Locale) => fetchAllSermons(locale, false),
);
const draftAllSermons = createCachedReader(
  "sermon-all-draft",
  (locale: Locale) => fetchAllSermons(locale, true),
);

const publishedAllSermonSlugs = createCachedReader(
  "sermon-all-slugs",
  (_locale: Locale) => fetchAllSermonSlugs(),
);

export async function getSermon(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<SermonView | undefined> {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftSermonBySlug.readDraft(slug, locale)
    : publishedSermonBySlug.readPublished(slug, locale);
}

export async function getSermonById(
  id: string,
  locale: string,
  isDraftMode = false,
): Promise<SermonView | undefined> {
  if (!isValidObjectIdHex(id) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftSermonById.readDraft(id, locale)
    : publishedSermonById.readPublished(id, locale);
}

export async function getLatestSermons(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  } = {},
): Promise<SermonView[]> {
  if (!isValidLocale(locale)) return [];
  const excludeSlug =
    options?.slug && isValidSlug(options.slug) ? options.slug : undefined;
  return options?.isDraftMode
    ? draftLatestSermons.readDraft(locale, excludeSlug)
    : publishedLatestSermons.readPublished(locale, excludeSlug);
}

/**
 * Fetches every sermon for the public `/predicas` archive.
 * Fails soft to `[]` on DB/query error (ICR-111); the catch sits OUTSIDE `unstable_cache` so a
 * transient DB outage is never cached as an empty archive.
 */
export async function getAllSermons(
  locale: string,
  options: {
    isDraftMode?: boolean;
  } = {},
): Promise<SermonView[]> {
  if (!isValidLocale(locale)) return [];
  try {
    return await (options?.isDraftMode
      ? draftAllSermons.readDraft(locale)
      : publishedAllSermons.readPublished(locale));
  } catch (error) {
    console.error("[getAllSermons] Failed to fetch sermons:", error);
    return [];
  }
}

export async function getAllSermonSlugs(
  locale: string,
): Promise<SlugEntryView[]> {
  if (!isValidLocale(locale)) return [];
  return publishedAllSermonSlugs.readPublished(locale);
}
