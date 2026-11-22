import {
  COLLECTIONS,
  type AuthorFields,
  type BibleVerseFields,
  type Locale,
} from "@idcr/content";
import type { Db } from "mongodb";
import { toObjectIds, type StoredEnvelope, type StoredMediaDoc } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import { toImageView } from "./media";
import type {
  AuthorView,
  ScriptureRefView,
  StructuredBibleVerseView,
} from "./types";

/**
 * Batch-fetches `bible_verses` documents for the requested snapshot (`draft` or `published`).
 * Returns a map keyed by hex `_id` containing ONLY verses that exist in the selected snapshot.
 */
export async function loadBibleVerseMap(
  db: Db,
  ids: Iterable<string | undefined | null>,
  isDraftMode: boolean,
): Promise<Map<string, BibleVerseFields>> {
  const objectIds = toObjectIds(ids);
  const map = new Map<string, BibleVerseFields>();
  if (objectIds.length === 0) return map;

  const snap = snapshotKey(isDraftMode);
  const docs = await db
    .collection<StoredEnvelope<BibleVerseFields>>(COLLECTIONS.bibleVerses)
    .find({ _id: { $in: objectIds }, [snap]: { $exists: true } })
    .toArray();

  for (const doc of docs) {
    const fields = resolveSnapshot(doc, isDraftMode);
    if (fields) {
      map.set(doc._id.toHexString(), fields);
    }
  }
  return map;
}

/** Formats a `BibleVerseFields` as `StructuredBibleVerseView` (string verse numbers: contact form & belief items). */
export function toStructuredBibleVerseView(
  verse: BibleVerseFields | undefined,
  locale: Locale,
): StructuredBibleVerseView | null {
  if (!verse) return null;
  return {
    book: resolveLocalized(verse.book, locale) ?? "",
    chapter: String(verse.chapter),
    fromVerse: String(verse.fromVerse),
    toVerse: verse.toVerse != null ? String(verse.toVerse) : null,
    verseContent: resolveLocalized(verse.text, locale) ?? "",
    bibleVersion: resolveLocalized(verse.version, locale) ?? "",
  };
}

/** Formats a `BibleVerseFields` as `ScriptureRefView` (numeric verse numbers: sermons). */
export function toScriptureRefView(
  verse: BibleVerseFields | undefined,
  locale: Locale,
): ScriptureRefView | undefined {
  if (!verse) return undefined;
  return {
    book: resolveLocalized(verse.book, locale) ?? "",
    chapter: verse.chapter,
    fromVerse: verse.fromVerse,
    toVerse: verse.toVerse ?? null,
    verseContent: resolveLocalized(verse.text, locale) ?? "",
    bibleVersion: resolveLocalized(verse.version, locale) ?? "",
  };
}

/**
 * Batch-fetches `authors` documents for the requested snapshot (`draft` or `published`).
 */
export async function loadAuthorMap(
  db: Db,
  ids: Iterable<string | undefined | null>,
  isDraftMode: boolean,
): Promise<Map<string, AuthorFields>> {
  const objectIds = toObjectIds(ids);
  const map = new Map<string, AuthorFields>();
  if (objectIds.length === 0) return map;

  const snap = snapshotKey(isDraftMode);
  const docs = await db
    .collection<StoredEnvelope<AuthorFields>>(COLLECTIONS.authors)
    .find({ _id: { $in: objectIds }, [snap]: { $exists: true } })
    .toArray();

  for (const doc of docs) {
    const fields = resolveSnapshot(doc, isDraftMode);
    if (fields) {
      map.set(doc._id.toHexString(), fields);
    }
  }
  return map;
}

export function toAuthorView(
  author: AuthorFields | undefined,
  mediaMap: ReadonlyMap<string, StoredMediaDoc>,
  locale: Locale,
): AuthorView | undefined {
  if (!author) return undefined;
  const view: AuthorView = {
    name: author.name,
  };
  const avatar = author.avatarMediaId
    ? toImageView(mediaMap.get(author.avatarMediaId), locale)
    : undefined;
  if (avatar) view.avatar = avatar;
  if (author.email !== undefined) view.email = author.email;
  return view;
}
