import {
  DEFAULT_LOCALE,
  LOCALES,
  isEmptyValue,
  type AuthorFields,
  type BibleVerseFields,
  type Locale,
  type Localized,
  type SermonFields,
} from "@idcr/content";
import type {
  ContentCaller,
  ServiceContentCaller,
} from "@src/lib/content/caller";
import { authorService, bibleVerseService } from "@src/service/content";
import {
  computeTipTapSermonContentHash,
  type TipTapSermonHashLocaleInput,
  type TipTapSermonHashScriptureRef,
} from "./tiptap-regen-content";

/** Least-privilege service identity for the admin sermon PDF rebuild worker (`ICR-200`). */
export const PDF_WORKER_SERVICE_ID = "service:pdf-regen";

export const PDF_WORKER_CALLER: ServiceContentCaller = {
  kind: "service",
  serviceId: PDF_WORKER_SERVICE_ID,
  label: "Generación automática de PDF",
  permissions: new Set(["content:read", "content:write", "media:manage"]),
};

/**
 * Normalizes `audioLanguages` preserving `ICR-146` semantics:
 * filters to known locales, deduplicates, and defaults empty/absent to `["es-AR"]`.
 */
export function normalizeSermonAudioLanguages(
  value: readonly string[] | undefined | null,
): Locale[] {
  const known = (value ?? []).filter((entry): entry is Locale =>
    (LOCALES as readonly string[]).includes(entry),
  );
  const unique = [...new Set(known)];
  return unique.length > 0 ? unique : [DEFAULT_LOCALE];
}

/** Collects all non-empty PDF summary media IDs across both locales. */
export function collectSermonPdfMediaIds(
  pdfSummaryMediaId: Localized<string> | undefined,
): string[] {
  if (!pdfSummaryMediaId) return [];
  const ids = new Set<string>();
  for (const locale of LOCALES) {
    const id = pdfSummaryMediaId[locale]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/** True when the sermon has meaningful English content to warrant an `en-US` PDF. */
export function hasEnglishPdfContent(
  snapshot: Pick<SermonFields, "title" | "content">,
): boolean {
  return (
    !isEmptyValue(snapshot.content?.["en-US"]) ||
    !isEmptyValue(snapshot.title?.["en-US"])
  );
}

/** True when a sermon draft has renderable body text in Spanish. */
export function hasRenderableSermonBody(
  snapshot: Pick<SermonFields, "content">,
): boolean {
  return !isEmptyValue(snapshot.content?.["es-AR"]);
}

export interface ResolvedSermonDependencies {
  readonly authorsById: ReadonlyMap<string, AuthorFields>;
  readonly versesById: ReadonlyMap<string, BibleVerseFields>;
}

export interface SermonHashDeps {
  readonly getAuthorById: typeof authorService.getById;
  readonly getVerseById: typeof bibleVerseService.getById;
}

const defaultSermonHashDeps: SermonHashDeps = {
  getAuthorById: authorService.getById,
  getVerseById: bibleVerseService.getById,
};

/**
 * Loads all referenced preachers and scripture verses for a sermon snapshot via
 * `ICR-195` services (always reading `draft` for PDF rendering/hashing).
 */
export async function resolveSermonDependencies(
  caller: ContentCaller,
  snapshot: Pick<
    SermonFields,
    "preacherId" | "additionalPreacherIds" | "scriptureRefIds"
  >,
  deps: SermonHashDeps = defaultSermonHashDeps,
): Promise<ResolvedSermonDependencies> {
  const authorIds = new Set<string>();
  if (snapshot.preacherId) authorIds.add(snapshot.preacherId);
  for (const id of snapshot.additionalPreacherIds ?? []) {
    if (id) authorIds.add(id);
  }

  const verseIds = new Set<string>();
  for (const id of snapshot.scriptureRefIds ?? []) {
    if (id) verseIds.add(id);
  }

  const [authorEntries, verseEntries] = await Promise.all([
    Promise.all(
      [...authorIds].map(async (id) => {
        const res = await deps.getAuthorById(caller, id);
        return res.ok ? ([id, res.doc.draft] as const) : null;
      }),
    ),
    Promise.all(
      [...verseIds].map(async (id) => {
        const res = await deps.getVerseById(caller, id);
        return res.ok ? ([id, res.doc.draft] as const) : null;
      }),
    ),
  ]);

  const authorsById = new Map<string, AuthorFields>();
  for (const entry of authorEntries) {
    if (entry) authorsById.set(entry[0], entry[1]);
  }

  const versesById = new Map<string, BibleVerseFields>();
  for (const entry of verseEntries) {
    if (entry) versesById.set(entry[0], entry[1]);
  }

  return { authorsById, versesById };
}

function buildLocaleHashInput(
  snapshot: SermonFields,
  resolved: ResolvedSermonDependencies,
  locale: Locale,
): TipTapSermonHashLocaleInput | undefined {
  const isEn = locale === "en-US";
  if (isEn && !hasEnglishPdfContent(snapshot)) {
    return undefined;
  }

  const title = isEn
    ? (snapshot.title?.["en-US"] ?? snapshot.title?.["es-AR"] ?? "")
    : (snapshot.title?.["es-AR"] ?? "");

  const content = isEn
    ? (snapshot.content?.["en-US"] ?? snapshot.content?.["es-AR"])
    : snapshot.content?.["es-AR"];

  const preacherName = snapshot.preacherId
    ? (resolved.authorsById.get(snapshot.preacherId)?.name ?? "")
    : "";

  const additionalPreacherNames: string[] = [];
  for (const id of snapshot.additionalPreacherIds ?? []) {
    const name = resolved.authorsById.get(id)?.name;
    if (name) additionalPreacherNames.push(name);
  }

  const scriptureReferences: TipTapSermonHashScriptureRef[] = [];
  for (const id of snapshot.scriptureRefIds ?? []) {
    const verse = resolved.versesById.get(id);
    if (!verse) continue;
    const book = isEn
      ? (verse.book["en-US"] ?? verse.book["es-AR"] ?? "")
      : (verse.book["es-AR"] ?? "");
    const verseContent = isEn
      ? (verse.text?.["en-US"] ?? verse.text?.["es-AR"] ?? "")
      : (verse.text?.["es-AR"] ?? "");
    scriptureReferences.push({
      book,
      chapter: verse.chapter,
      fromVerse: verse.fromVerse,
      toVerse: verse.toVerse ?? null,
      verseContent,
    });
  }

  return {
    title,
    sermonDate: snapshot.sermonDate ?? "",
    content: content ?? null,
    preacherName,
    additionalPreacherNames,
    scriptureReferences,
  };
}

/**
 * Pure hash computation from a `SermonFields` snapshot + pre-resolved authors
 * and Bible verses. Reused by server actions, the PDF worker, and `ICR-204`.
 */
export function computeSermonHashFromResolved(
  snapshot: SermonFields,
  resolved: ResolvedSermonDependencies,
): string {
  const esInput = buildLocaleHashInput(snapshot, resolved, "es-AR");
  const enInput = buildLocaleHashInput(snapshot, resolved, "en-US");
  return computeTipTapSermonContentHash(esInput, enInput);
}

/**
 * Resolves authors and verses via `ICR-195` services and returns the
 * authoritative canonical SHA-256 content hash for `snapshot`.
 */
export async function computeSermonHashForSnapshot(
  caller: ContentCaller,
  snapshot: SermonFields,
  deps: SermonHashDeps = defaultSermonHashDeps,
): Promise<{
  readonly contentHash: string;
  readonly resolved: ResolvedSermonDependencies;
}> {
  const resolved = await resolveSermonDependencies(caller, snapshot, deps);
  const contentHash = computeSermonHashFromResolved(snapshot, resolved);
  return { contentHash, resolved };
}
