import { isEmptyValue, type Locale, type Localized } from "@idcr/content";
import type { StoredEnvelope } from "./db";

/**
 * Resolves a localized field for `locale`, falling back from `en-US` to `es-AR` whenever
 * the English value is absent or empty (`isEmptyValue`).
 */
export function resolveLocalized<T>(
  field: Localized<T> | undefined,
  locale: Locale,
): T | undefined {
  if (!field) return undefined;
  if (locale === "en-US" && !isEmptyValue(field["en-US"])) {
    return field["en-US"];
  }
  return field["es-AR"];
}

export function snapshotKey(isDraftMode: boolean): "draft" | "published" {
  return isDraftMode ? "draft" : "published";
}

export function resolveSnapshot<TFields>(
  doc: StoredEnvelope<TFields> | null | undefined,
  isDraftMode: boolean,
): TFields | undefined {
  if (!doc) return undefined;
  return isDraftMode ? doc.draft : doc.published;
}
