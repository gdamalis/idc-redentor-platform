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
