/**
 * Blog `publishedDate` and sermon `sermonDate` are Contentful **date-only** values
 * ("2026-02-16"), which `new Date()` parses as UTC midnight. They must therefore be
 * formatted **in UTC** to reproduce the calendar day the editor authored — without
 * `timeZone`, `toLocaleDateString` uses the runtime's zone, so every visitor west of
 * UTC renders the previous day, and client components throw React #418 when the
 * server's HTML disagrees with the hydrated text. (ICR-103)
 */
const UTC_DATE_ONLY = { timeZone: "UTC" } as const;

export const formatDate = (date: string, locale: string) => {
  return new Date(date).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    ...UTC_DATE_ONLY,
  });
};

/**
 * Long form with the full month name (e.g. es-AR "26 de junio de 2026",
 * en-US "June 26, 2026"). Used for article-style headers (sermon post header)
 * where the compact `formatDate` reads as an abbreviation. Listings/cards keep
 * `formatDate`.
 */
export const formatDateLong = (date: string, locale: string) => {
  return new Date(date).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...UTC_DATE_ONLY,
  });
};
