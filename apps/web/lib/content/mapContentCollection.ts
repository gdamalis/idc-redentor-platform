import type {
  ContentCollectionView,
  RawContentCollectionView,
} from "./types";

/**
 * Pure mapper mirroring `lib/contentful/mapContentCollection.ts` so `getContentCollection`
 * keeps its raw shape and existing callers swap imports without structural rework.
 */
export function mapContentCollection(
  raw: RawContentCollectionView,
): ContentCollectionView {
  return {
    title: raw?.title,
    description: raw?.description,
    creedItems: raw?.contentItemsCollection?.items,
    image: raw?.image,
    sys: raw?.sys,
  };
}
