import {
  isEmptyValue,
  type ContentDoc,
  type Localized,
} from "@idcr/content";

/**
 * True when `updatedBy` belongs to an automated service identity (e.g.
 * `service:predica-ingest`, `service:pdf-worker`, `system:*`) rather
 * than a human admin user `_id`.
 */
export function isServiceIdentity(updatedBy: string): boolean {
  return updatedBy.startsWith("service:") || updatedBy.startsWith("system:");
}

/**
 * Derived "Para revisar" signpost (`F-editor-ux-decisions.md` §2.10, `ICR-197`
 * Open Q2, `ICR-200` AC8): a never-published draft whose last editor is a
 * service identity. Clears automatically on the first save by a human user.
 */
export function isNeedsReviewDraft(
  doc: Pick<ContentDoc<unknown>, "published" | "updatedBy">,
): boolean {
  return doc.published === undefined && isServiceIdentity(doc.updatedBy);
}

/**
 * Counts how many localized fields have Spanish (`es-AR`) content populated
 * while English (`en-US`) is absent or empty. Drives both the `"English · faltan N"`
 * tab counter and the `"Falta EN"` list chip.
 */
export function countMissingEnglishFields(
  fields: readonly (Localized<unknown> | undefined)[],
): number {
  let missing = 0;
  for (const field of fields) {
    if (!field) continue;
    const hasEs = !isEmptyValue(field["es-AR"]);
    const hasEn = !isEmptyValue(field["en-US"]);
    if (hasEs && !hasEn) {
      missing += 1;
    }
  }
  return missing;
}

/**
 * Recursively extracts all `Localized<unknown>` leaves from a draft object so
 * lists and shell views can compute missing English counts accurately for any
 * content type without knowing every nested field shape.
 */
export function collectLocalizedFields(
  value: unknown,
): readonly Localized<unknown>[] {
  const result: Localized<unknown>[] = [];
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const record = current as Record<string, unknown>;
    if ("es-AR" in record && Object.keys(record).every((k) => k === "es-AR" || k === "en-US")) {
      result.push(record as unknown as Localized<unknown>);
      continue;
    }

    // Do not descend into TipTap rich-text nodes
    if (record.type === "doc") continue;

    for (const child of Object.values(record)) {
      if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return result;
}

export function countMissingEnglishInDraft(draft: unknown): number {
  return countMissingEnglishFields(collectLocalizedFields(draft));
}

/** Formats a short human-readable timestamp in the panel locale. */
export function formatAdminTimestamp(
  input: Date | string,
  locale: string,
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formats HH:MM for the live-region "Guardado HH:MM" status. */
export function formatShortTime(input: Date | string, locale: string): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formats a stored ISO date string (YYYY-MM-DD...) for list display. */
export function formatShortDate(
  iso: string | undefined,
  locale: string,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}
