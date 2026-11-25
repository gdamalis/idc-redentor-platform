/**
 * Size caps for content fields and rich-text documents.
 */
export const LIMITS = {
  /** Max length for slugs and machine names. */
  slugMax: 256,
  machineNameMax: 256,
  /** Titles, names, labels, CTA text, book, version, URLs. */
  shortTextMax: 500,
  /** Descriptions, thesis, excerpt, SEO, verse text. */
  longTextMax: 50_000,
  /** Characters in one rich-text text node. */
  maxTextNodeLength: 50_000,
  /** Nodes in one rich-text document. */
  maxNodes: 20_000,
  /**
   * Node depth (doc = 1). The corpus nests lists two deep (text at depth 7). Each node costs
   * about two BSON levels under `draft.content["es-AR"]` (4 levels), plus 3 for `marks[].attrs`:
   * 4 + 2 * 10 + 3 = 27, well under MongoDB's 50.
   */
  maxNodeDepth: 10,
  hrefMax: 2_048,
  /** Items in any plain array field (keywords, ids, menu items, ...). */
  maxArrayItems: 500,
} as const;
