import {
  canonicalEqual,
  validateRichText,
  type RichTextDoc,
  type RichTextProfile,
} from "@idcr/content";

function normalizeDocForComparison(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDocForComparison);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (child === undefined) continue;
    // TipTap v3 emits orderedList.attrs = { start: 1, type: null } when absent
    if (
      key === "attrs" &&
      record.type === "orderedList" &&
      child &&
      typeof child === "object"
    ) {
      const attrs = child as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      if (attrs.start !== undefined && attrs.start !== 1) {
        cleaned.start = attrs.start;
      }
      if (attrs.type !== undefined && attrs.type !== null) {
        cleaned.type = attrs.type;
      }
      if (Object.keys(cleaned).length > 0) {
        out.attrs = cleaned;
      }
      continue;
    }
    // ProseMirror omits empty `content: []` on blank paragraphs in some serializations
    if (
      key === "content" &&
      record.type === "paragraph" &&
      Array.isArray(child) &&
      child.length === 0
    ) {
      continue;
    }
    out[key] = normalizeDocForComparison(child);
  }
  return out;
}

/**
 * Detects whether loading `initialDoc` into the TipTap editor dropped or
 * rewrote unsupported nodes/marks (`ICR-197` Edge case #11, `H` lesson #1).
 */
export function isLossyRichTextLoad(
  initialDoc: RichTextDoc | undefined,
  parsedDoc: RichTextDoc,
  profile: RichTextProfile,
): boolean {
  if (!initialDoc) return false;
  // If the stored document already violates the profile schema, ProseMirror had
  // to strip or transform nodes/marks on load.
  if (validateRichText(initialDoc, profile).length > 0) {
    return true;
  }
  return !canonicalEqual(
    normalizeDocForComparison(initialDoc),
    normalizeDocForComparison(parsedDoc),
  );
}
