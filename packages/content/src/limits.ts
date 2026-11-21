/**
 * Size caps. Anchored on Contentful's own hard field limits (Symbol 256, Text 50,000), so no value
 * stored today can exceed them; caps are raised, never used to truncate. See the ICR-194 plan.
 */
export const LIMITS = {
  /** Contentful Symbol max. */
  slugMax: 256,
  machineNameMax: 256,
  /** Titles, names, labels, CTA text, book, version, URLs (> Symbol max 256). */
  shortTextMax: 500,
  /** Descriptions, thesis, excerpt, SEO, verse text (= Contentful Text max). */
  longTextMax: 50_000,
  /** Characters in one rich-text text node (= Contentful Text max). */
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
