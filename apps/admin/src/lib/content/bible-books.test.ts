import { describe, expect, it } from "vitest";
import {
  BIBLE_BOOKS,
  BIBLE_VERSIONS_ES,
  buildVersionOptions,
  compareBibleVerses,
  findCanonicalBibleBook,
  formatVerseChipLabel,
} from "./bible-books";

describe("bible-books", () => {
  it("contains all 66 canonical books in biblical order", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    expect(BIBLE_BOOKS[0]).toEqual({ order: 1, es: "Génesis", en: "Genesis" });
    expect(BIBLE_BOOKS[65]).toEqual({
      order: 66,
      es: "Apocalipsis",
      en: "Revelation",
    });
  });

  it("finds books case- and diacritic-insensitively in either language", () => {
    expect(findCanonicalBibleBook("genesis")?.es).toBe("Génesis");
    expect(findCanonicalBibleBook("John")?.es).toBe("Juan");
    expect(findCanonicalBibleBook("Efesios")?.en).toBe("Ephesians");
    expect(findCanonicalBibleBook("Salmo")?.es).toBe("Salmos");
  });

  it("preserves non-standard stored version labels verbatim", () => {
    expect(buildVersionOptions(BIBLE_VERSIONS_ES, "RVR")).toEqual([
      "NVI",
      "RVR1960",
      "RVR",
    ]);
    expect(buildVersionOptions(BIBLE_VERSIONS_ES, "NVI")).toEqual([
      "NVI",
      "RVR1960",
    ]);
    expect(
      formatVerseChipLabel(
        {
          book: { "es-AR": "Juan", "en-US": "John" },
          chapter: 3,
          fromVerse: 16,
          toVerse: 18,
          version: { "es-AR": "RVR1960", "en-US": "KJV" },
        },
        "es-AR",
      ),
    ).toBe("Juan 3:16–18 · RVR1960");
    expect(
      formatVerseChipLabel(
        {
          book: { "es-AR": "Juan", "en-US": "John" },
          chapter: 3,
          fromVerse: 16,
          toVerse: 18,
          version: { "es-AR": "RVR1960", "en-US": "KJV" },
        },
        "en-US",
      ),
    ).toBe("John 3:16–18 · KJV");
  });

  it("sorts verses in canonical Bible order", () => {
    const sorted = [
      { book: { "es-AR": "Juan" }, chapter: 3, fromVerse: 16 },
      { book: { "es-AR": "Génesis" }, chapter: 1, fromVerse: 1 },
      { book: { "es-AR": "Juan" }, chapter: 1, fromVerse: 1 },
    ].sort(compareBibleVerses);
    expect(sorted.map((v) => `${v.book["es-AR"]} ${v.chapter}:${v.fromVerse}`)).toEqual([
      "Génesis 1:1",
      "Juan 1:1",
      "Juan 3:16",
    ]);
  });
});
