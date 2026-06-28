export const i18n = {
  defaultLocale: "es-AR",
  locales: ["es-AR", "en-US"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

// `locale` reaches the Contentful getters (interpolated into GraphQL) and the draft-mode route
// (interpolated into a redirect path) from request input. Validate it against the configured
// locales — the single source of truth above — before any such use. Rejects unknown locales,
// nullish values, and anything that could inject GraphQL or force an off-site redirect.
export function isValidLocale(value: string | null | undefined): value is Locale {
  return value != null && (i18n.locales as readonly string[]).includes(value);
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
const localesMap = i18n.locales.map((locale) => [locale, `${baseUrl}/${locale}`]);
export const localesPath = Object.fromEntries(localesMap) as Record<
  Locale,
  string
>;

export function buildLocaleAlternates(path = ""): Record<Locale, string> {
  const suffix = path ? `/${path}` : "";
  return Object.fromEntries(
    i18n.locales.map((locale) => [
      locale,
      `${baseUrl}/${locale}${suffix}`,
    ]),
  ) as Record<Locale, string>;
}
