import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
   
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    // Pin the zone rather than inheriting the server runtime's. next-intl's default
    // is "the time zone of the server runtime", which differs between the Vercel
    // server (UTC) and the visitor's browser — the same hydration hazard `formatDate`
    // has, one layer up. UTC matches our content convention: blog/sermon dates are
    // date-only CALENDAR DAYS (see src/utils/formatDate.ts).
    //
    // NOTE: next-intl currently formats no dates in this app, so this line changes no
    // rendered output today — it exists so a future `useFormatter()` / `format.dateTime()`
    // call cannot silently reintroduce ICR-103. A real INSTANT (e.g. a service start
    // time) must pass an explicit per-call `timeZone`, since this global would render
    // it in UTC.
    timeZone: "UTC",
    messages: (
      await (locale === "es-AR"
        ? import("../../public/locales/es-AR.json")
        : import(`../../public/locales/${locale}.json`))
    ).default,
  };
});
