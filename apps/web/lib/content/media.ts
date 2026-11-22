import {
  COLLECTIONS,
  type Locale,
  type MediaView,
  type RichTextDoc,
  type RichTextView,
} from "@idcr/content";
import type { Db } from "mongodb";
import { toObjectIds, type StoredMediaDoc } from "./db";
import { resolveLocalized } from "./locale";
import type {
  ImageView,
  SectionImageItemView,
  SermonMediaView,
  SizedImageView,
} from "./types";

const DEFAULT_SEO_IMAGE_WIDTH = 1200;
const DEFAULT_SEO_IMAGE_HEIGHT = 630;

/**
 * Resolves the display title / alt text for a media asset:
 * - Images: `""` when marked `decorative: true`, else localized `alt` (fallback `title`, fallback `""`).
 * - Non-images (audio, PDF): localized `title` (fallback `filename`).
 */
export function resolveMediaTitle(
  media: StoredMediaDoc,
  locale: Locale,
): string {
  if (media.contentType.toLowerCase().startsWith("image/")) {
    if (media.decorative === true) return "";
    return (
      resolveLocalized(media.alt, locale) ??
      resolveLocalized(media.title, locale) ??
      ""
    );
  }
  return resolveLocalized(media.title, locale) ?? media.filename;
}

export function toImageView(
  media: StoredMediaDoc | undefined,
  locale: Locale,
): ImageView | undefined {
  if (!media) return undefined;
  return {
    url: media.url,
    title: resolveMediaTitle(media, locale),
  };
}

export function toSizedImageView(
  media: StoredMediaDoc | undefined,
  locale: Locale,
): SizedImageView | undefined {
  if (!media) return undefined;
  return {
    url: media.url,
    title: resolveMediaTitle(media, locale),
    width: media.width ?? DEFAULT_SEO_IMAGE_WIDTH,
    height: media.height ?? DEFAULT_SEO_IMAGE_HEIGHT,
  };
}

export function toSectionImageItemView(
  media: StoredMediaDoc | undefined,
  locale: Locale,
): SectionImageItemView | undefined {
  if (!media) return undefined;
  const item: SectionImageItemView = {
    url: media.url,
    title: resolveMediaTitle(media, locale),
  };
  if (media.width !== undefined) item.width = media.width;
  if (media.height !== undefined) item.height = media.height;
  return item;
}

export function toMediaView(
  media: StoredMediaDoc | undefined,
  locale: Locale,
): MediaView | undefined {
  if (!media) return undefined;
  const view: MediaView = {
    url: media.url,
    title: resolveMediaTitle(media, locale),
    contentType: media.contentType,
    fileName: media.filename,
    size: media.size,
  };
  if (media.width !== undefined) view.width = media.width;
  if (media.height !== undefined) view.height = media.height;
  return view;
}

export function toSermonMediaView(
  media: StoredMediaDoc | undefined,
  locale: Locale,
): SermonMediaView | undefined {
  if (!media) return undefined;
  return {
    url: media.url,
    title: resolveMediaTitle(media, locale),
    contentType: media.contentType,
    fileName: media.filename,
    size: media.size,
  };
}

/**
 * Iteratively walks a TipTap JSON document and collects every `embeddedMedia.attrs.mediaId`.
 */
export function collectEmbeddedMediaIds(
  doc: RichTextDoc | undefined,
  out: Set<string> = new Set(),
): Set<string> {
  if (!doc || typeof doc !== "object") return out;
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    if (
      record.type === "embeddedMedia" &&
      record.attrs &&
      typeof record.attrs === "object"
    ) {
      const mediaId = (record.attrs as Record<string, unknown>).mediaId;
      if (typeof mediaId === "string" && mediaId.trim().length > 0) {
        out.add(mediaId.trim());
      }
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) stack.push(child);
    }
  }
  return out;
}

/**
 * Batch-fetches referenced `media` records in a single MongoDB `$in` query, keyed by hex `_id`.
 */
export async function loadMediaMap(
  db: Db,
  ids: Iterable<string | undefined | null>,
): Promise<Map<string, StoredMediaDoc>> {
  const objectIds = toObjectIds(ids);
  const map = new Map<string, StoredMediaDoc>();
  if (objectIds.length === 0) return map;

  const docs = await db
    .collection<StoredMediaDoc>(COLLECTIONS.media)
    .find({ _id: { $in: objectIds } })
    .toArray();

  for (const doc of docs) {
    map.set(doc._id.toHexString(), doc);
  }
  return map;
}

/**
 * Builds a `RichTextView` whose `media` map contains ONLY the files embedded in `doc`.
 */
export function buildRichTextView(
  doc: RichTextDoc | undefined,
  mediaMap: ReadonlyMap<string, StoredMediaDoc>,
  locale: Locale,
): RichTextView | undefined {
  if (!doc) return undefined;
  const embeddedIds = collectEmbeddedMediaIds(doc);
  const media: Record<string, MediaView> = {};
  for (const id of embeddedIds) {
    const resolved = toMediaView(mediaMap.get(id), locale);
    if (resolved) {
      media[id] = resolved;
    }
  }
  return { doc, media };
}
