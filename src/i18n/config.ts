export const i18n = {
  defaultLocale: "es-AR",
  locales: ["es-AR", "en-US"],
} as const;

export type Locale = (typeof i18n)["locales"][number];
