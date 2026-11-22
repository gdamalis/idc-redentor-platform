import type { MediaDoc } from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import { connect, getWebsiteDb } from "@src/service/database.service";

/** Stored content envelope shape in the `website*` MongoDB database. */
export interface StoredEnvelope<TFields> {
  _id: ObjectId;
  draft: TFields;
  published?: TFields;
  publishedAt?: Date;
  firstPublishedAt?: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
  sourceContentfulId?: string;
}

/** Stored media document shape in the `media` collection. */
export type StoredMediaDoc = Omit<MediaDoc, "_id"> & { _id: ObjectId };

/** Strict 24-character hex string check (unlike `ObjectId.isValid`, refuses 12-byte arbitrary strings). */
const OBJECT_ID_HEX_PATTERN = /^[0-9a-fA-F]{24}$/;

export function isValidObjectIdHex(id: unknown): id is string {
  return typeof id === "string" && OBJECT_ID_HEX_PATTERN.test(id);
}

/** Deduplicates and converts valid 24-hex id strings into `ObjectId`s, ignoring invalid/absent values. */
export function toObjectIds(
  ids: Iterable<string | undefined | null>,
): ObjectId[] {
  const seen = new Set<string>();
  const out: ObjectId[] = [];
  for (const id of ids) {
    if (isValidObjectIdHex(id)) {
      const normalized = id.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(new ObjectId(id));
      }
    }
  }
  return out;
}

/**
 * Acquires the validated `website*` database handle or throws if MongoDB is unreachable.
 *
 * `database.service.ts#connect()` swallows errors and returns `undefined` for soft-failing
 * callers like likes. Content readers (especially sitemap slug getters, ICR-123) must distinguish
 * "database unreachable" from "zero documents", so every content reader acquires the DB here.
 */
export async function requireContentDb(): Promise<Db> {
  const client = await connect();
  if (!client) {
    throw new Error("[content] MongoDB client unavailable");
  }
  return getWebsiteDb(client);
}
