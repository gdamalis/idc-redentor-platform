export const i18n = {
  defaultLocale: "es-AR",
  locales: ["es-AR", "en-US"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
const localesMap = i18n.locales.map((locale) => [locale, `${baseUrl}/${locale}`]);
export const localesPath = Object.fromEntries(localesMap) as Record<
  Locale,
  string
>;
