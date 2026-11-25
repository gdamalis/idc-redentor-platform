import type {
  ContentCollectionView,
  RawContentCollectionView,
} from "./types";

/**
 * Pure mapper that partitions a `ContentCollection` into creed, mission, and value items.
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
