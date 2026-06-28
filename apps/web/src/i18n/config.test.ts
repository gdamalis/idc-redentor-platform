import { describe, it, expect } from "vitest";
import { buildLocaleAlternates, i18n, isValidLocale } from "@src/i18n/config";

describe("i18n config", () => {
  it("declares es-AR as default and includes en-US", () => {
    expect(i18n.defaultLocale).toBe("es-AR");
    expect(i18n.locales).toContain("en-US");
  });

  it("builds one alternate URL per locale, appending the path", () => {
    const alts = buildLocaleAlternates("blog");
    expect(Object.keys(alts)).toEqual(["es-AR", "en-US"]);
    expect(alts["es-AR"]).toContain("/es-AR/blog");
    expect(alts["en-US"]).toContain("/en-US/blog");
  });

  it("omits a trailing slash for an empty path", () => {
    const alts = buildLocaleAlternates();
    expect(alts["es-AR"]).not.toMatch(/\/$/);
  });
});

describe("isValidLocale", () => {
  it("accepts the configured locales", () => {
    expect(isValidLocale("es-AR")).toBe(true);
    expect(isValidLocale("en-US")).toBe(true);
  });

  it("rejects unknown, malformed, unsafe, and nullish values", () => {
    for (const bad of [
      "fr-FR",
      "es",
      "EN-US",
      "es-ar",
      "",
      "/evil.com", // open-redirect payload
      "//evil.com",
      '" }) { __typename }', // injection payload
      null,
      undefined,
    ]) {
      expect(isValidLocale(bad)).toBe(false);
    }
  });
});
