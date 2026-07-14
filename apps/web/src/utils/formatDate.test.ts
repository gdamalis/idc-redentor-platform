import { describe, it, expect } from "vitest";
import { formatDate, formatDateLong } from "@src/utils/formatDate";

describe("formatDate", () => {
  it("includes the year for both locales", () => {
    expect(formatDate("2025-06-21", "en-US")).toMatch(/2025/);
    expect(formatDate("2025-06-21", "es-AR")).toMatch(/2025/);
  });

  it("renders the same date differently per locale (order/casing)", () => {
    const en = formatDate("2025-06-21", "en-US");
    const es = formatDate("2025-06-21", "es-AR");
    expect(es).not.toBe(en);
  });
});

describe("formatDateLong", () => {
  it("uses the full month name (not the abbreviation) per locale", () => {
    expect(formatDateLong("2026-06-26", "es-AR")).toContain("junio");
    expect(formatDateLong("2026-06-26", "en-US")).toContain("June");
  });

  it("includes the year", () => {
    expect(formatDateLong("2026-06-26", "es-AR")).toMatch(/2026/);
    expect(formatDateLong("2026-06-26", "en-US")).toMatch(/2026/);
  });
});

/**
 * ICR-103 — dates must not shift with the runtime time zone.
 *
 * Contentful stores `publishedDate` / `sermonDate` as date-only values
 * ("2026-02-16"), which `new Date()` parses as UTC midnight. Formatting without
 * a pinned `timeZone` therefore renders the PREVIOUS day for any visitor west of
 * UTC (e.g. Buenos Aires, UTC-3) — wrong dates sitewide, plus React #418 in the
 * client components that render them.
 *
 * These tests assert zone-INDEPENDENCE rather than a literal output string: a
 * literal assertion would pass on the buggy code whenever the test process runs
 * in UTC (as CI does), proving nothing.
 */
const UTC = "UTC";
const BUENOS_AIRES = "America/Argentina/Buenos_Aires"; // UTC-3 — the congregation's zone

/**
 * Run `fn` with the process time zone temporarily set to `tz`, always restoring it.
 *
 * The restore must DELETE `TZ` when it was originally unset: `process.env.TZ = undefined`
 * coerces to the literal string `"undefined"`, an invalid zone that leaves
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` undefined for the rest of the
 * process — silently corrupting any later date-sensitive code in the same worker.
 */
const withTimeZone = <T>(tz: string, fn: () => T): T => {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
};

/** A real published blog post's `publishedDate`. Authored day = the 16th. */
const AUTHORED_DATE = "2026-02-16";
const AUTHORED_DAY = "16";

describe("timezone stability (ICR-103)", () => {
  it("withTimeZone restores an originally-unset TZ by deleting it, not as the string \"undefined\"", () => {
    const original = process.env.TZ;
    delete process.env.TZ;

    try {
      withTimeZone(BUENOS_AIRES, () => formatDate(AUTHORED_DATE, "es-AR"));

      // `process.env.TZ = undefined` would coerce to the STRING "undefined" — an
      // invalid zone that leaves the whole worker's Intl resolution broken.
      expect(process.env.TZ).toBeUndefined();
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBeTruthy();
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });

  it("control: an UNPINNED formatter diverges across zones (proves the tz shift is real)", () => {
    // Deliberately the old, broken shape. If this ever STOPS diverging, the
    // process time zone is not actually changing and every assertion below is
    // vacuous — so this test failing means the harness is broken, not the code.
    const unpinned = (date: string, locale: string) =>
      new Date(date).toLocaleDateString(locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });

    const inUtc = withTimeZone(UTC, () => unpinned(AUTHORED_DATE, "es-AR"));
    const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
      unpinned(AUTHORED_DATE, "es-AR"),
    );

    expect(inBuenosAires).not.toBe(inUtc);
  });

  it("formatDate renders the authored day in every zone and locale", () => {
    for (const locale of ["es-AR", "en-US"]) {
      const inUtc = withTimeZone(UTC, () => formatDate(AUTHORED_DATE, locale));
      const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
        formatDate(AUTHORED_DATE, locale),
      );

      expect(inBuenosAires).toBe(inUtc);
      expect(inBuenosAires).toContain(AUTHORED_DAY);
    }
  });

  it("formatDateLong renders the authored day in every zone and locale", () => {
    for (const locale of ["es-AR", "en-US"]) {
      const inUtc = withTimeZone(UTC, () =>
        formatDateLong(AUTHORED_DATE, locale),
      );
      const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
        formatDateLong(AUTHORED_DATE, locale),
      );

      expect(inBuenosAires).toBe(inUtc);
      expect(inBuenosAires).toContain(AUTHORED_DAY);
    }
  });
});
