import type { BibleVerseFields, Locale } from "@idcr/content";

export interface CanonicalBibleBook {
  readonly order: number;
  readonly es: string;
  readonly en: string;
}

/**
 * Canonical 66-book Protestant Bible list in biblical order (`es-AR` and `en-US`
 * standard names), driving `VersePicker`'s book select and `/content/verses` sorting.
 */
export const BIBLE_BOOKS: readonly CanonicalBibleBook[] = [
  // Old Testament (1–39)
  { order: 1, es: "Génesis", en: "Genesis" },
  { order: 2, es: "Éxodo", en: "Exodus" },
  { order: 3, es: "Levítico", en: "Leviticus" },
  { order: 4, es: "Números", en: "Numbers" },
  { order: 5, es: "Deuteronomio", en: "Deuteronomy" },
  { order: 6, es: "Josué", en: "Joshua" },
  { order: 7, es: "Jueces", en: "Judges" },
  { order: 8, es: "Rut", en: "Ruth" },
  { order: 9, es: "1 Samuel", en: "1 Samuel" },
  { order: 10, es: "2 Samuel", en: "2 Samuel" },
  { order: 11, es: "1 Reyes", en: "1 Kings" },
  { order: 12, es: "2 Reyes", en: "2 Kings" },
  { order: 13, es: "1 Crónicas", en: "1 Chronicles" },
  { order: 14, es: "2 Crónicas", en: "2 Chronicles" },
  { order: 15, es: "Esdras", en: "Ezra" },
  { order: 16, es: "Nehemías", en: "Nehemiah" },
  { order: 17, es: "Ester", en: "Esther" },
  { order: 18, es: "Job", en: "Job" },
  { order: 19, es: "Salmos", en: "Psalms" },
  { order: 20, es: "Proverbios", en: "Proverbs" },
  { order: 21, es: "Eclesiastés", en: "Ecclesiastes" },
  { order: 22, es: "Cantares", en: "Song of Songs" },
  { order: 23, es: "Isaías", en: "Isaiah" },
  { order: 24, es: "Jeremías", en: "Jeremiah" },
  { order: 25, es: "Lamentaciones", en: "Lamentations" },
  { order: 26, es: "Ezequiel", en: "Ezekiel" },
  { order: 27, es: "Daniel", en: "Daniel" },
  { order: 28, es: "Oseas", en: "Hosea" },
  { order: 29, es: "Joel", en: "Joel" },
  { order: 30, es: "Amós", en: "Amos" },
  { order: 31, es: "Abdías", en: "Obadiah" },
  { order: 32, es: "Jonás", en: "Jonah" },
  { order: 33, es: "Miqueas", en: "Micah" },
  { order: 34, es: "Nahúm", en: "Nahum" },
  { order: 35, es: "Habacuc", en: "Habakkuk" },
  { order: 36, es: "Sofonías", en: "Zephaniah" },
  { order: 37, es: "Hageo", en: "Haggai" },
  { order: 38, es: "Zacarías", en: "Zechariah" },
  { order: 39, es: "Malaquías", en: "Malachi" },
  // New Testament (40–66)
  { order: 40, es: "Mateo", en: "Matthew" },
  { order: 41, es: "Marcos", en: "Mark" },
  { order: 42, es: "Lucas", en: "Luke" },
  { order: 43, es: "Juan", en: "John" },
  { order: 44, es: "Hechos", en: "Acts" },
  { order: 45, es: "Romanos", en: "Romans" },
  { order: 46, es: "1 Corintios", en: "1 Corinthians" },
  { order: 47, es: "2 Corintios", en: "2 Corinthians" },
  { order: 48, es: "Gálatas", en: "Galatians" },
  { order: 49, es: "Efesios", en: "Ephesians" },
  { order: 50, es: "Filipenses", en: "Philippians" },
  { order: 51, es: "Colosenses", en: "Colossians" },
  { order: 52, es: "1 Tesalonicenses", en: "1 Thessalonians" },
  { order: 53, es: "2 Tesalonicenses", en: "2 Thessalonians" },
  { order: 54, es: "1 Timoteo", en: "1 Timothy" },
  { order: 55, es: "2 Timoteo", en: "2 Timothy" },
  { order: 56, es: "Tito", en: "Titus" },
  { order: 57, es: "Filemón", en: "Philemon" },
  { order: 58, es: "Hebreos", en: "Hebrews" },
  { order: 59, es: "Santiago", en: "James" },
  { order: 60, es: "1 Pedro", en: "1 Peter" },
  { order: 61, es: "2 Pedro", en: "2 Peter" },
  { order: 62, es: "1 Juan", en: "1 John" },
  { order: 63, es: "2 Juan", en: "2 John" },
  { order: 64, es: "3 Juan", en: "3 John" },
  { order: 65, es: "Judas", en: "Jude" },
  { order: 66, es: "Apocalipsis", en: "Revelation" },
];

/** Stored Bible version labels offered in the create select (`ICR-197`/`200`). */
export const BIBLE_VERSIONS_ES = ["NVI", "RVR1960"] as const;
export const BIBLE_VERSIONS_EN = ["NIV", "KJV"] as const;

export const DEFAULT_BIBLE_VERSION_ES = "NVI";
export const DEFAULT_BIBLE_VERSION_EN = "NIV";

function foldBookName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const BOOK_LOOKUP = new Map<string, CanonicalBibleBook>();
for (const book of BIBLE_BOOKS) {
  BOOK_LOOKUP.set(foldBookName(book.es), book);
  BOOK_LOOKUP.set(foldBookName(book.en), book);
}
// Common aliases seen in existing content
BOOK_LOOKUP.set("salmo", BIBLE_BOOKS[18]!);
BOOK_LOOKUP.set("psalm", BIBLE_BOOKS[18]!);
BOOK_LOOKUP.set("cantar de los cantares", BIBLE_BOOKS[21]!);
BOOK_LOOKUP.set("song of solomon", BIBLE_BOOKS[21]!);

export function findCanonicalBibleBook(
  name: string | undefined,
): CanonicalBibleBook | undefined {
  if (!name) return undefined;
  return BOOK_LOOKUP.get(foldBookName(name));
}

export function getBibleBookOrder(bookEs: string | undefined): number {
  return findCanonicalBibleBook(bookEs)?.order ?? 999;
}

/**
 * Preserves any non-standard stored version label (e.g. `"RVR"`, trailing space)
 * by appending it to the select options when editing an existing verse.
 */
export function buildVersionOptions(
  offered: readonly string[],
  storedValue?: string,
): string[] {
  if (!storedValue || offered.includes(storedValue)) {
    return [...offered];
  }
  return [...offered, storedValue];
}

/** Formats a verse reference in the given locale (`Juan 3:16–18` / `John 3:16–18`). */
export function formatVerseReference(
  verse: Pick<BibleVerseFields, "book" | "chapter" | "fromVerse" | "toVerse">,
  locale: Locale,
): string {
  const book =
    (locale === "en-US" ? verse.book["en-US"] : verse.book["es-AR"]) ||
    verse.book["es-AR"];
  const range =
    verse.toVerse && verse.toVerse !== verse.fromVerse
      ? `${verse.fromVerse}–${verse.toVerse}`
      : String(verse.fromVerse);
  return `${book} ${verse.chapter}:${range}`;
}

/**
 * Returns the verse's actual stored version label for the requested locale
 * (never a hard-coded NVI/NIV), falling back to `es-AR` when `en-US` is absent.
 */
export function getVerseVersionLabel(
  verse: Pick<BibleVerseFields, "version">,
  locale: Locale,
): string {
  if (locale === "en-US" && verse.version?.["en-US"]) {
    return verse.version["en-US"];
  }
  return verse.version?.["es-AR"] ?? "";
}

/** Formats chip label: `"Juan 3:16–18 · RVR1960"`. */
export function formatVerseChipLabel(
  verse: Pick<
    BibleVerseFields,
    "book" | "chapter" | "fromVerse" | "toVerse" | "version"
  >,
  locale: Locale,
): string {
  const ref = formatVerseReference(verse, locale);
  const version = getVerseVersionLabel(verse, locale);
  return version ? `${ref} · ${version}` : ref;
}

/** Compares two verses in canonical biblical order (book -> chapter -> from -> to). */
export function compareBibleVerses(
  a: Pick<BibleVerseFields, "book" | "chapter" | "fromVerse" | "toVerse">,
  b: Pick<BibleVerseFields, "book" | "chapter" | "fromVerse" | "toVerse">,
): number {
  const orderDiff =
    getBibleBookOrder(a.book["es-AR"]) - getBibleBookOrder(b.book["es-AR"]);
  if (orderDiff !== 0) return orderDiff;
  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  if (a.fromVerse !== b.fromVerse) return a.fromVerse - b.fromVerse;
  return (a.toVerse ?? a.fromVerse) - (b.toVerse ?? b.fromVerse);
}
