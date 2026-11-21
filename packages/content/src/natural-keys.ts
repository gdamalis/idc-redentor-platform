import { LIMITS } from "./limits";

/** Kebab-case: lowercase alphanumerics joined by single hyphens (same rule as the site today). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a well-formed slug. The length is capped before the pattern runs. */
export function isValidSlug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= LIMITS.slugMax &&
    SLUG_PATTERN.test(slug)
  );
}

function isAsciiAlnum(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

/**
 * Transliterate -> lowercase -> collapse every non-[a-z0-9] run into one dash -> trim dashes,
 * capped at `LIMITS.slugMax`. Same rule as `slugifyPersonName` (predica). A single linear loop:
 * no regex backtracking on large input.
 */
export function slugify(text: string): string {
  const folded = text
    .slice(0, LIMITS.longTextMax)
    .normalize("NFD")
    .toLowerCase();
  let out = "";
  let pendingDash = false;
  for (let i = 0; i < folded.length && out.length < LIMITS.slugMax; i += 1) {
    const code = folded.charCodeAt(i);
    if (code >= 0x300 && code <= 0x36f) continue; // combining diacritics
    if (isAsciiAlnum(code)) {
      if (pendingDash && out.length > 0) out += "-";
      pendingDash = false;
      out += folded[i];
    } else {
      pendingDash = true;
    }
  }
  return out.slice(0, LIMITS.slugMax).replace(/-$/, "");
}

/** NFC, trim, collapse internal whitespace runs to one space, lowercase. */
function normalizeKeyPart(value: string): string {
  return value
    .slice(0, LIMITS.shortTextMax)
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}

/** Accepts `3`, `"3"`, `" 03 "`; anything that is not a positive integer throws. */
function toVerseNumber(value: number | string, field: string): number {
  const n =
    typeof value === "number"
      ? value
      : /^\s*\d{1,4}\s*$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`bibleVerseKey: ${field} must be a positive integer`);
  }
  return n;
}

export interface BibleVerseKeyInput {
  /** Spanish book name as stored (e.g. "Joel"). */
  book: string;
  chapter: number | string;
  fromVerse: number | string;
  toVerse?: number | string | null;
  /** Spanish version label as stored (e.g. "NVI", "RVR1960"). */
  version: string;
}

/**
 * Version-scoped natural key for `bible_verses` (today's dedup is "Joel 2:13 (NVI)"):
 * Spanish book + chapter + fromVerse + toVerse (= fromVerse when absent) + Spanish version.
 * Whitespace is trimmed and collapsed and case is folded; version labels are never renamed,
 * so "NVI" and "RVR1960" (or "RVR") stay distinct.
 */
export function bibleVerseKey(input: BibleVerseKeyInput): string {
  const book = normalizeKeyPart(input.book);
  const version = normalizeKeyPart(input.version);
  if (book === "") throw new RangeError("bibleVerseKey: book is required");
  if (version === "")
    throw new RangeError("bibleVerseKey: version is required");
  const chapter = toVerseNumber(input.chapter, "chapter");
  const fromVerse = toVerseNumber(input.fromVerse, "fromVerse");
  const hasTo =
    input.toVerse !== undefined &&
    input.toVerse !== null &&
    !(typeof input.toVerse === "string" && input.toVerse.trim() === "");
  const toVerse = hasTo
    ? toVerseNumber(input.toVerse as number | string, "toVerse")
    : fromVerse;
  return `${book}|${chapter}|${fromVerse}|${toVerse}|${version}`;
}
