import {
  DEFAULT_LOCALE,
  LOCALES,
  isEmptyValue,
  type Locale,
  type Localized,
  type SermonFields,
} from "@idcr/content";

/**
 * Normalizes `audioLanguages` preserving `ICR-146` semantics:
 * filters to known locales, deduplicates, and defaults empty/absent to `["es-AR"]`.
 * Pure client-safe helper (zero server/DB/Node imports).
 */
export function normalizeSermonAudioLanguages(
  value: readonly string[] | undefined | null,
): Locale[] {
  const known = (value ?? []).filter((entry): entry is Locale =>
    (LOCALES as readonly string[]).includes(entry),
  );
  const unique = [...new Set(known)];
  return unique.length > 0 ? unique : [DEFAULT_LOCALE];
}

/** Collects all non-empty PDF summary media IDs across both locales. */
export function collectSermonPdfMediaIds(
  pdfSummaryMediaId: Localized<string> | undefined,
): string[] {
  if (!pdfSummaryMediaId) return [];
  const ids = new Set<string>();
  for (const locale of LOCALES) {
    const id = pdfSummaryMediaId[locale]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/** True when the sermon has meaningful English content to warrant an `en-US` PDF. */
export function hasEnglishPdfContent(
  snapshot: Pick<SermonFields, "title" | "content">,
): boolean {
  return (
    !isEmptyValue(snapshot.content?.["en-US"]) ||
    !isEmptyValue(snapshot.title?.["en-US"])
  );
}

/** True when a sermon draft has renderable body text in Spanish. */
export function hasRenderableSermonBody(
  snapshot: Pick<SermonFields, "content">,
): boolean {
  return !isEmptyValue(snapshot.content?.["es-AR"]);
}
