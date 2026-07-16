export const i18n = {
  defaultLocale: "es-AR",
  locales: ["es-AR", "en-US"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

// Validate a locale value against the configured locales — the single source of
// truth above — before any request-derived use (route params, query strings).
export function isValidLocale(value: string | null | undefined): value is Locale {
  return value != null && (i18n.locales as readonly string[]).includes(value);
}
