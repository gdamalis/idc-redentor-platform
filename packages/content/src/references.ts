import type { CollectionName } from "./model/collections";
import type { ContentDoc } from "./model/envelope";
import { LOCALES } from "./model/localized";
import { GLOBAL_KIND, type ContentType } from "./schemas";
import {
  REFERENCE_PATHS,
  type ConcreteContentType,
  type ReferencePathSpec,
} from "./registries/reference-paths";

export interface ContentReference {
  collection: CollectionName;
  id: string;
}

export interface ExtractedReferences {
  /** Deduplicated, sorted media ids referenced across draft + published and both locales. */
  mediaIds: string[];
  /** Deduplicated, sorted content references across draft + published and both locales. */
  contentRefs: ContentReference[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addId(set: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.length > 0) set.add(value);
}

function addContentRef(
  map: Map<string, ContentReference>,
  collection: CollectionName,
  value: unknown,
): void {
  if (typeof value === "string" && value.length > 0) {
    map.set(`${collection}:${value}`, { collection, id: value });
  }
}

/** Iteratively walks a TipTap JSON tree and collects every `embeddedMedia.attrs.mediaId`. */
function collectRichTextMediaIds(doc: unknown, mediaIds: Set<string>): void {
  if (!isRecord(doc)) return;
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    if (node.type === "embeddedMedia" && isRecord(node.attrs)) {
      addId(mediaIds, node.attrs.mediaId);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
}

function collectFromSnapshot(
  snapshot: unknown,
  specs: readonly ReferencePathSpec[],
  mediaIds: Set<string>,
  contentRefs: Map<string, ContentReference>,
): void {
  if (!isRecord(snapshot)) return;
  for (const spec of specs) {
    const value = snapshot[spec.field];
    if (value === undefined || value === null) continue;
    switch (spec.kind) {
      case "media":
        addId(mediaIds, value);
        break;
      case "mediaArray":
        if (Array.isArray(value)) {
          for (const id of value) addId(mediaIds, id);
        }
        break;
      case "localizedMedia":
        if (isRecord(value)) {
          for (const locale of LOCALES) addId(mediaIds, value[locale]);
        }
        break;
      case "content":
        addContentRef(contentRefs, spec.target, value);
        break;
      case "contentArray":
        if (Array.isArray(value)) {
          for (const id of value) addContentRef(contentRefs, spec.target, id);
        }
        break;
      case "localizedRichText":
        if (isRecord(value)) {
          for (const locale of LOCALES)
            collectRichTextMediaIds(value[locale], mediaIds);
        }
        break;
      case "itemList":
        if (Array.isArray(value)) {
          for (const item of value) {
            collectFromSnapshot(item, spec.itemPaths, mediaIds, contentRefs);
          }
        }
        break;
    }
  }
}

function resolveSpecs(
  type: ContentType,
  snapshot: unknown,
): readonly ReferencePathSpec[] {
  if (type !== "global") return REFERENCE_PATHS[type];
  if (!isRecord(snapshot) || typeof snapshot.kind !== "string") return [];
  const kind = snapshot.kind;
  if (Object.prototype.hasOwnProperty.call(GLOBAL_KIND, kind)) {
    return REFERENCE_PATHS[kind as ConcreteContentType];
  }
  return [];
}

/**
 * Extracts every media id and content id an entry points to, from plain fields and from inside
 * rich text (`embeddedMedia.attrs.mediaId`), across BOTH `draft` and `published` snapshots and
 * BOTH locales (`es-AR`, `en-US`).
 *
 * ICR-195 stores the result in an indexed field on every save; ICR-195 and ICR-196 use it for
 * delete guards and "used in" lists.
 */
export function extractReferences<TFields>(
  type: ContentType,
  doc: Pick<ContentDoc<TFields>, "draft" | "published">,
): ExtractedReferences {
  const mediaIds = new Set<string>();
  const contentRefs = new Map<string, ContentReference>();

  for (const snapshot of [doc.draft, doc.published]) {
    if (snapshot === undefined) continue;
    const specs = resolveSpecs(type, snapshot);
    collectFromSnapshot(snapshot, specs, mediaIds, contentRefs);
  }

  return {
    mediaIds: [...mediaIds].sort(),
    contentRefs: [...contentRefs.values()].sort((a, b) =>
      a.collection === b.collection
        ? a.id.localeCompare(b.id)
        : a.collection.localeCompare(b.collection),
    ),
  };
}
