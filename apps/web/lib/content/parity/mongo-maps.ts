import { COLLECTIONS, type Locale } from "@idcr/content";
import type { Db } from "mongodb";
import { requireContentDb } from "../db";
import { createMediaIdentityMap, type MediaIdentityMap } from "./normalize";

export interface CollectionCountSummary {
  readonly total: number;
  readonly published: number;
  readonly draftOnly: number;
}

export interface MongoParityContext {
  readonly mediaMap: MediaIdentityMap;
  readonly entryIdByContentfulId: ReadonlyMap<string, string>;
  readonly postSlugs: readonly string[];
  readonly sermonSlugs: readonly string[];
  readonly draftOnlyPostSlugs: readonly string[];
  readonly draftOnlySermonSlugs: readonly string[];
  readonly topicSlugsByLocale: Readonly<Record<Locale, readonly string[]>>;
  readonly mediaCount: number;
  readonly collectionCounts: Readonly<Record<string, CollectionCountSummary>>;
}

const CONTENT_COLLECTIONS = [
  COLLECTIONS.sections,
  COLLECTIONS.beliefCollections,
  COLLECTIONS.eventBanners,
  COLLECTIONS.seoEntries,
  COLLECTIONS.globals,
  COLLECTIONS.posts,
  COLLECTIONS.sermons,
  COLLECTIONS.topics,
  COLLECTIONS.authors,
  COLLECTIONS.bibleVerses,
] as const;

/**
 * Loads media identity maps (including `sourceContentfulUrls` so split-locale
 * bilingual sermon PDFs map cleanly by exact CDN URL without colliding on bare
 * `assetId`), entry ID maps, dynamic slugs, and collection counts from MongoDB.
 */
export async function loadParityMapsFromMongo(
  dbArg?: Db,
): Promise<MongoParityContext> {
  const db = dbArg ?? (await requireContentDb());

  const mediaDocs = await db
    .collection<{
      _id: { toHexString: () => string };
      url: string;
      sha256: string;
      sourceContentfulIds?: string[];
      sourceContentfulUrls?: string[];
    }>(COLLECTIONS.media)
    .find(
      {},
      {
        projection: {
          _id: 1,
          url: 1,
          sha256: 1,
          sourceContentfulIds: 1,
          sourceContentfulUrls: 1,
        },
      },
    )
    .toArray();

  const mediaMap = createMediaIdentityMap(
    mediaDocs.map((m) => ({
      canonicalKey: m.sha256,
      urls: [m.url, ...(m.sourceContentfulUrls ?? [])],
      mongoMediaIds: [m._id.toHexString()],
      // Only map un-split assets by bare Contentful assetId; split-locale PDFs resolve by exact URL!
      contentfulAssetIds: (m.sourceContentfulIds ?? []).filter(
        (id) => !id.includes(":"),
      ),
    })),
  );

  const entryIdByContentfulId = new Map<string, string>();
  const collectionCounts: Record<string, CollectionCountSummary> = {};

  for (const col of CONTENT_COLLECTIONS) {
    const docs = await db
      .collection<{
        _id: { toHexString: () => string };
        sourceContentfulId?: string;
        published?: unknown;
      }>(col)
      .find({}, { projection: { _id: 1, sourceContentfulId: 1, published: 1 } })
      .toArray();

    let published = 0;
    let draftOnly = 0;
    for (const d of docs) {
      if (d.sourceContentfulId) {
        entryIdByContentfulId.set(d.sourceContentfulId, d._id.toHexString());
      }
      if (d.published !== undefined && d.published !== null) {
        published += 1;
      } else {
        draftOnly += 1;
      }
    }
    collectionCounts[col] = {
      total: docs.length,
      published,
      draftOnly,
    };
  }

  const [postDocs, sermonDocs, topicDocs] = await Promise.all([
    db
      .collection<{ draft?: { slug?: string }; published?: { slug?: string } }>(
        COLLECTIONS.posts,
      )
      .find({}, { projection: { "draft.slug": 1, "published.slug": 1 } })
      .toArray(),
    db
      .collection<{ draft?: { slug?: string }; published?: { slug?: string } }>(
        COLLECTIONS.sermons,
      )
      .find({}, { projection: { "draft.slug": 1, "published.slug": 1 } })
      .toArray(),
    db
      .collection<{
        draft?: { slug?: Partial<Record<Locale, string>> };
        published?: { slug?: Partial<Record<Locale, string>> };
      }>(COLLECTIONS.topics)
      .find({}, { projection: { "draft.slug": 1, "published.slug": 1 } })
      .toArray(),
  ]);

  const postSlugs = [
    ...new Set(
      postDocs
        .map((d) => d.published?.slug ?? d.draft?.slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ].sort();

  const sermonSlugs = [
    ...new Set(
      sermonDocs
        .map((d) => d.published?.slug ?? d.draft?.slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ].sort();

  const esTopics = new Set<string>();
  const enTopics = new Set<string>();
  for (const doc of topicDocs) {
    const es = doc.published?.slug?.["es-AR"] ?? doc.draft?.slug?.["es-AR"];
    const en = doc.published?.slug?.["en-US"] ?? doc.draft?.slug?.["en-US"];
    if (es) esTopics.add(es);
    if (en) enTopics.add(en);
  }

  const draftOnlyPostSlugs = [
    ...new Set(
      postDocs
        .filter((d) => !d.published && d.draft?.slug)
        .map((d) => d.draft!.slug!),
    ),
  ].sort();

  const draftOnlySermonSlugs = [
    ...new Set(
      sermonDocs
        .filter((d) => !d.published && d.draft?.slug)
        .map((d) => d.draft!.slug!),
    ),
  ].sort();

  return {
    mediaMap,
    entryIdByContentfulId,
    postSlugs,
    sermonSlugs,
    draftOnlyPostSlugs,
    draftOnlySermonSlugs,
    topicSlugsByLocale: {
      "es-AR": esTopics.size > 0 ? [...esTopics].sort() : ["privacidad"],
      "en-US": enTopics.size > 0 ? [...enTopics].sort() : ["privacy"],
    },
    mediaCount: mediaDocs.length,
    collectionCounts,
  };
}
