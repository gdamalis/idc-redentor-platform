/**
 * ICR-223 — the real read-only driver adapter. The returned object exposes ONLY
 * find / count / aggregate / close: no write method is reachable from it.
 */
import { MongoClient } from "mongodb";
import type { ReadOnlyDb } from "./run";

export async function connectReadOnly(
  uri: string,
  dbName: string,
): Promise<ReadOnlyDb> {
  const client = new MongoClient(uri, {
    appName: "idcr-qa-db-read",
    readPreference: "secondaryPreferred",
    serverSelectionTimeoutMS: 8000,
    retryWrites: false,
  });
  await client.connect();
  // eslint-disable-next-line no-restricted-syntax -- dbName passed the exact QA allowlist in policy.ts before connect
  const db = client.db(dbName);
  return {
    find: (collection, filter, { projection, sort, limit, maxTimeMS }) =>
      db
        .collection(collection)
        .find(filter, {
          ...(projection ? { projection } : {}),
          ...(sort ? { sort } : {}),
          limit,
          maxTimeMS,
        })
        .toArray(),
    count: (collection, filter, { maxTimeMS }) =>
      db.collection(collection).countDocuments(filter, { maxTimeMS }),
    aggregate: (collection, pipeline, { maxTimeMS }) =>
      db
        .collection(collection)
        .aggregate(pipeline, { maxTimeMS, allowDiskUse: false })
        .toArray(),
    close: () => client.close(),
  };
}
