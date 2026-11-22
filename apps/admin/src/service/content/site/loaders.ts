import type {
  LocationFields,
  MediaDoc,
} from "@idcr/content";
import type { ContentCaller } from "@src/lib/content/caller";
import type { BibleVersePickerItem } from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { bibleVerseService, globalService } from "@src/service/content/collections";
import { getMediaByIds } from "@src/service/media";

function serializeMedia(doc: MediaDoc): SerializedMediaDoc {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Batch-preloads media records for SSR hydration of `MediaField` / `MediaListField`
 * inside `ICR-198` site-content editors (zero client thumbnail flash).
 */
export async function preloadMediaMap(
  caller: ContentCaller,
  rawIds: readonly (string | undefined)[],
): Promise<Record<string, SerializedMediaDoc>> {
  const uniqueIds = Array.from(
    new Set(
      rawIds
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id && id.length > 0)),
    ),
  );
  if (uniqueIds.length === 0) return {};

  const result = await getMediaByIds(caller, uniqueIds);
  if (!result.ok) return {};

  const map: Record<string, SerializedMediaDoc> = {};
  for (const item of result.items) {
    map[item._id] = serializeMedia(item);
  }
  return map;
}

/**
 * Preloads Bible verse summaries for SSR hydration of `SingleVerseField`
 * chips in `BeliefCollectionEditor` and `ContactFormEditor`.
 */
export async function preloadVersesMap(
  caller: ContentCaller,
  rawIds: readonly (string | undefined)[],
): Promise<Record<string, BibleVersePickerItem>> {
  const uniqueIds = Array.from(
    new Set(
      rawIds
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id && id.length > 0)),
    ),
  );
  if (uniqueIds.length === 0) return {};

  const results = await Promise.all(
    uniqueIds.map((id) => bibleVerseService.getById(caller, id)),
  );
  const map: Record<string, BibleVersePickerItem> = {};
  for (const res of results) {
    if (res.ok) {
      map[res.doc._id] = {
        id: res.doc._id,
        status: res.status,
        revision: res.doc.revision,
        fields: res.doc.draft,
      };
    }
  }
  return map;
}

export interface SharedLocationSummary {
  readonly addressLine1?: string;
  readonly neighborhood?: string;
  readonly city?: string;
  readonly country?: string;
  readonly googleMapsUrl?: string;
  readonly mapEmbedUrl?: string;
}

/**
 * Loads the single shared `location` global (`Dirección y mapa`) for the
 * read-only `SharedLocationCard` in `FooterEditor` and `EventBannerEditor`.
 */
export async function loadSharedLocation(
  caller: ContentCaller,
): Promise<SharedLocationSummary | null> {
  const res = await globalService.getByMachineName(caller, "location");
  if (!res.ok || res.doc.draft.kind !== "location") return null;
  const draft = res.doc.draft as LocationFields;
  return {
    ...(draft.addressLine1 !== undefined && { addressLine1: draft.addressLine1 }),
    ...(draft.neighborhood !== undefined && { neighborhood: draft.neighborhood }),
    ...(draft.city !== undefined && { city: draft.city }),
    ...(draft.country !== undefined && { country: draft.country }),
    ...(draft.googleMapsUrl !== undefined && {
      googleMapsUrl: draft.googleMapsUrl,
    }),
    ...(draft.mapEmbedUrl !== undefined && { mapEmbedUrl: draft.mapEmbedUrl }),
  };
}
