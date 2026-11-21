import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "./model/collections";
import { isEmptyValue, normalizeLocalized } from "./model/localized";
import { bibleVerseKey, isValidSlug, slugify } from "./natural-keys";
import { canonicalEqual, deriveStatus } from "./status";

describe("COLLECTIONS", () => {
  it("uses snake_case names that are unique", () => {
    const names = Object.values(COLLECTIONS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});

describe("deriveStatus / canonicalEqual", () => {
  const base = {
    title: { "es-AR": "Hola" },
    date: new Date("2026-01-01T00:00:00Z"),
    tags: ["a", "b"],
  };

  it("is draft when there is no published copy", () => {
    expect(deriveStatus({ draft: base })).toBe("draft");
    expect(deriveStatus({ draft: base, published: undefined })).toBe("draft");
  });

  it("is published when draft deep-equals published", () => {
    expect(
      deriveStatus({ draft: base, published: structuredClone(base) }),
    ).toBe("published");
  });

  it("ignores key order (top level and nested)", () => {
    const reordered = {
      tags: ["a", "b"],
      date: new Date("2026-01-01T00:00:00Z"),
      title: { "es-AR": "Hola" },
    };
    expect(deriveStatus({ draft: base, published: reordered })).toBe(
      "published",
    );
    expect(canonicalEqual({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toBe(
      true,
    );
  });

  it("compares Dates by value, and never equal to an ISO string", () => {
    expect(canonicalEqual(new Date(5), new Date(5))).toBe(true);
    expect(canonicalEqual(new Date(5), new Date(6))).toBe(false);
    expect(
      canonicalEqual({ d: new Date(0) }, { d: new Date(0).toISOString() }),
    ).toBe(false);
    expect(canonicalEqual(new Date(NaN), new Date(NaN))).toBe(true);
  });

  it("treats an undefined key as absent", () => {
    expect(canonicalEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(
      deriveStatus({
        draft: { ...base, subtitle: undefined },
        published: base,
      }),
    ).toBe("published");
  });

  it("does not treat null as absent", () => {
    expect(canonicalEqual({ a: null }, {})).toBe(false);
  });

  it("is changed when array order differs", () => {
    expect(
      deriveStatus({ draft: base, published: { ...base, tags: ["b", "a"] } }),
    ).toBe("changed");
  });

  it("is changed when a nested value differs", () => {
    expect(
      deriveStatus({
        draft: base,
        published: { ...base, title: { "es-AR": "Chau" } },
      }),
    ).toBe("changed");
    expect(canonicalEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(
      false,
    );
  });

  it("does not coerce types", () => {
    expect(canonicalEqual(1, "1")).toBe(false);
    expect(canonicalEqual([], {})).toBe(false);
    expect(canonicalEqual(NaN, NaN)).toBe(true);
  });

  it("handles very deep structures without recursion", () => {
    let a: Record<string, unknown> = {};
    let b: Record<string, unknown> = {};
    const rootA = a;
    const rootB = b;
    for (let i = 0; i < 20_000; i += 1) {
      a.n = {};
      b.n = {};
      a = a.n as Record<string, unknown>;
      b = b.n as Record<string, unknown>;
    }
    expect(canonicalEqual(rootA, rootB)).toBe(true);
  });
});

describe("slugify / isValidSlug", () => {
  it("transliterates, lowercases and collapses separators", () => {
    expect(slugify("¿Quién es Jesús?")).toBe("quien-es-jesus");
    expect(slugify("  El Señor   es mi pastor -- Salmo 23 ")).toBe(
      "el-senor-es-mi-pastor-salmo-23",
    );
    expect(slugify("Jonathan Hanegán")).toBe("jonathan-hanegan");
    expect(slugify("---")).toBe("");
  });

  it("produces valid slugs and caps length", () => {
    expect(isValidSlug(slugify("Hola Mundo"))).toBe(true);
    const long = slugify("a ".repeat(10_000));
    expect(long.length).toBeLessThanOrEqual(256);
    expect(isValidSlug(long)).toBe(true);
  });

  it("is fast on large adversarial input", () => {
    const started = Date.now();
    slugify("-a".repeat(200_000) + "!");
    isValidSlug("a-".repeat(200_000) + "!");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("rejects malformed slugs", () => {
    for (const bad of [
      "",
      "Hola",
      "a--b",
      "-a",
      "a-",
      "a b",
      "a_b",
      "á",
      'a"b',
      "a".repeat(257),
      3,
    ]) {
      expect(isValidSlug(bad)).toBe(false);
    }
    expect(isValidSlug("predica-2026-07-12")).toBe(true);
  });
});

describe("bibleVerseKey", () => {
  const joel = { book: "Joel", chapter: 2, fromVerse: 13, version: "NVI" };

  it("gives two keys for the same passage in two Spanish versions", () => {
    expect(bibleVerseKey(joel)).not.toBe(
      bibleVerseKey({ ...joel, version: "RVR1960" }),
    );
  });

  it("does not rename versions (RVR stays distinct from RVR1960)", () => {
    expect(bibleVerseKey({ ...joel, version: "RVR" })).not.toBe(
      bibleVerseKey({ ...joel, version: "RVR1960" }),
    );
  });

  it("trims and collapses whitespace and folds case", () => {
    expect(bibleVerseKey({ ...joel, version: "RVR1960 " })).toBe(
      bibleVerseKey({ ...joel, version: "RVR1960" }),
    );
    expect(bibleVerseKey({ ...joel, book: "  1   Corintios " })).toBe(
      bibleVerseKey({ ...joel, book: "1 corintios" }),
    );
  });

  it("treats an absent toVerse as a single verse", () => {
    expect(bibleVerseKey(joel)).toBe(bibleVerseKey({ ...joel, toVerse: 13 }));
    expect(bibleVerseKey(joel)).toBe(bibleVerseKey({ ...joel, toVerse: null }));
    expect(bibleVerseKey(joel)).toBe(bibleVerseKey({ ...joel, toVerse: "" }));
    expect(bibleVerseKey(joel)).not.toBe(
      bibleVerseKey({ ...joel, toVerse: 14 }),
    );
    expect(bibleVerseKey(joel)).toBe("joel|2|13|13|nvi");
  });

  it("accepts Contentful's string numbers the same as numbers", () => {
    expect(
      bibleVerseKey({
        ...joel,
        chapter: "2",
        fromVerse: " 13 ",
        toVerse: "13",
      }),
    ).toBe(bibleVerseKey(joel));
    expect(bibleVerseKey({ ...joel, chapter: "02" })).toBe(bibleVerseKey(joel));
  });

  it("refuses non-integer or missing parts", () => {
    expect(() => bibleVerseKey({ ...joel, chapter: "2a" })).toThrow(RangeError);
    expect(() => bibleVerseKey({ ...joel, chapter: 0 })).toThrow(RangeError);
    expect(() => bibleVerseKey({ ...joel, fromVerse: 1.5 })).toThrow(
      RangeError,
    );
    expect(() => bibleVerseKey({ ...joel, book: "  " })).toThrow(RangeError);
    expect(() => bibleVerseKey({ ...joel, version: "" })).toThrow(RangeError);
  });
});

describe("normalizeLocalized / isEmptyValue", () => {
  it("drops an empty English value", () => {
    expect(normalizeLocalized({ "es-AR": "Hola", "en-US": "" })).toEqual({
      "es-AR": "Hola",
    });
    expect(normalizeLocalized({ "es-AR": "Hola", "en-US": "   " })).toEqual({
      "es-AR": "Hola",
    });
    expect(normalizeLocalized({ "es-AR": ["a"], "en-US": [] })).toEqual({
      "es-AR": ["a"],
    });
    expect(
      normalizeLocalized({
        "es-AR": { type: "doc", content: [] },
        "en-US": { type: "doc", content: [{ type: "paragraph" }] },
      }),
    ).toEqual({ "es-AR": { type: "doc", content: [] } });
  });

  it("keeps a real English value", () => {
    const value = { "es-AR": "Hola", "en-US": "Hello" };
    expect(normalizeLocalized(value)).toBe(value);
  });

  it("treats a doc with only an embedded file as non-empty", () => {
    expect(
      isEmptyValue({
        type: "doc",
        content: [{ type: "embeddedMedia", attrs: { mediaId: "m1" } }],
      }),
    ).toBe(false);
  });
});
