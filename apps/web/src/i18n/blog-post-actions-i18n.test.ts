import { describe, it, expect } from "vitest";
import esAR from "../../public/locales/es-AR.json";
import enUS from "../../public/locales/en-US.json";

const EXPECTED_KEYS = [
  "share",
  "copy-link",
  "email",
  "link-copied",
  "close",
  "like",
  "unlike",
  "tags",
] as const;

type Messages = Record<string, Record<string, string>>;

describe("BlogPostActions i18n namespace", () => {
  const es = (esAR as unknown as Messages).BlogPostActions;
  const en = (enUS as unknown as Messages).BlogPostActions;

  it("exists in both locale files", () => {
    expect(es).toBeTypeOf("object");
    expect(en).toBeTypeOf("object");
  });

  it("contains exactly the expected keys in both locales", () => {
    expect(Object.keys(es ?? {}).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(en ?? {}).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has identical key sets across locales (parity)", () => {
    expect(Object.keys(es ?? {}).sort()).toEqual(Object.keys(en ?? {}).sort());
  });

  it("has non-empty string values for every key in both locales", () => {
    for (const key of EXPECTED_KEYS) {
      expect(typeof es?.[key]).toBe("string");
      expect(es?.[key].trim().length).toBeGreaterThan(0);
      expect(typeof en?.[key]).toBe("string");
      expect(en?.[key].trim().length).toBeGreaterThan(0);
    }
  });
});
