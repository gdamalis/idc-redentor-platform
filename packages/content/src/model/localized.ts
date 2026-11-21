/** Content locales. es-AR is the source of truth; en-US is optional (the site falls back). */
export const LOCALES = ["es-AR", "en-US"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE = "es-AR" satisfies Locale;

/** A per-locale value. An empty English value is stored as absent, never as a Spanish copy. */
export interface Localized<T> {
  "es-AR": T;
  "en-US"?: T;
}

interface DocLike {
  type?: unknown;
  content?: unknown;
  text?: unknown;
}

/**
 * True when a value carries no content: `undefined`/`null`, a blank string, an empty array, or
 * a rich-text document whose text nodes are all blank. Iterative (no recursion depth risk).
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && (value as DocLike).type === "doc") {
    const stack: unknown[] = [value];
    while (stack.length > 0) {
      const node = stack.pop() as DocLike | null;
      if (!node || typeof node !== "object") continue;
      if (node.type === "embeddedMedia") return false;
      if (typeof node.text === "string" && node.text.trim() !== "")
        return false;
      if (Array.isArray(node.content)) stack.push(...node.content);
    }
    return true;
  }
  return false;
}

/** Drops an empty `en-US` value so the site's es-AR fallback keeps working. */
export function normalizeLocalized<T>(value: Localized<T>): Localized<T> {
  if (!("en-US" in value)) return value;
  if (!isEmptyValue(value["en-US"])) return value;
  const rest: Localized<T> = { "es-AR": value["es-AR"] };
  return rest;
}
