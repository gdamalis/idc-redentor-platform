import { getContentDb } from "@src/service/database.service";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { isFixedCollection } from "@src/lib/content/guards";

const indexPromises = new Map<ContentCollectionName, Promise<void>>();

/**
 * Memoized lazy index creation per content collection on `getContentDb()`
 * (mirrors `ensureAuthIndexes` / `ensureRbacIndexes`).
 *
 * All optional natural-key unique indexes use `partialFilterExpression: { ...: { $type: "string" } }`
 * so incomplete drafts without optional slugs/keys never collide on BSON `null`.
 */
export function ensureContentIndexes(
  collection: ContentCollectionName,
  dbProvider: typeof getContentDb = getContentDb,
): Promise<void> {
  const cached = indexPromises.get(collection);
  if (cached) return cached;

  const promise = (async () => {
    const col = dbProvider().collection(collection);

    if (isFixedCollection(collection)) {
      const tasks: Promise<string>[] = [
        col.createIndex({ "draft.machineName": 1 }, { unique: true }),
        col.createIndex(
          { "published.machineName": 1 },
          {
            unique: true,
            partialFilterExpression: {
              "published.machineName": { $type: "string" },
            },
          },
        ),
        col.createIndex({ "_refs.mediaIds": 1 }),
      ];
      if (collection === "belief_collections" || collection === "globals") {
        tasks.push(
          col.createIndex({
            "_refs.contentRefs.collection": 1,
            "_refs.contentRefs.id": 1,
          }),
        );
      }
      await Promise.all(tasks);
      return;
    }

    switch (collection) {
      case "posts":
        await Promise.all([
          col.createIndex(
            { "draft.slug": 1 },
            {
              unique: true,
              partialFilterExpression: { "draft.slug": { $type: "string" } },
            },
          ),
          col.createIndex(
            { "published.slug": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "published.slug": { $type: "string" },
              },
            },
          ),
          col.createIndex({ "published.publishedDate": -1 }),
          col.createIndex({ updatedAt: -1 }),
          col.createIndex({ "_refs.mediaIds": 1 }),
          col.createIndex({
            "_refs.contentRefs.collection": 1,
            "_refs.contentRefs.id": 1,
          }),
        ]);
        return;

      case "sermons":
        await Promise.all([
          col.createIndex(
            { "draft.slug": 1 },
            {
              unique: true,
              partialFilterExpression: { "draft.slug": { $type: "string" } },
            },
          ),
          col.createIndex(
            { "published.slug": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "published.slug": { $type: "string" },
              },
            },
          ),
          col.createIndex({ "published.sermonDate": -1 }),
          col.createIndex({ updatedAt: -1 }),
          col.createIndex({ "_refs.mediaIds": 1 }),
          col.createIndex({
            "_refs.contentRefs.collection": 1,
            "_refs.contentRefs.id": 1,
          }),
        ]);
        return;

      case "topics":
        await Promise.all([
          col.createIndex(
            { "draft.slug.es-AR": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "draft.slug.es-AR": { $type: "string" },
              },
            },
          ),
          col.createIndex(
            { "draft.slug.en-US": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "draft.slug.en-US": { $type: "string" },
              },
            },
          ),
          col.createIndex(
            { "published.slug.es-AR": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "published.slug.es-AR": { $type: "string" },
              },
            },
          ),
          col.createIndex(
            { "published.slug.en-US": 1 },
            {
              unique: true,
              partialFilterExpression: {
                "published.slug.en-US": { $type: "string" },
              },
            },
          ),
          col.createIndex({ updatedAt: -1 }),
          col.createIndex({ "_refs.mediaIds": 1 }),
        ]);
        return;

      case "bible_verses":
        await Promise.all([
          col.createIndex(
            { _naturalKey: 1 },
            {
              unique: true,
              partialFilterExpression: { _naturalKey: { $type: "string" } },
            },
          ),
          col.createIndex({ updatedAt: -1 }),
        ]);
        return;

      case "authors":
        await Promise.all([
          col.createIndex({ "draft.name": 1 }),
          col.createIndex({ "_refs.mediaIds": 1 }),
        ]);
        return;
    }
  })();

  indexPromises.set(collection, promise);
  return promise;
}

/** Test-only helper to clear memoized index promises between isolated test runs. */
export function resetContentIndexesCache(): void {
  indexPromises.clear();
}
