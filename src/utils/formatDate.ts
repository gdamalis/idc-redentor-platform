export const formatDate = (date: string, locale: string) => {
  return new Date(date).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
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
  });
};
