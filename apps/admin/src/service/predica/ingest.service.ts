import type { Db } from "mongodb";
import {
  COLLECTIONS,
  bibleVerseKey,
  deriveStatus,
  isEmptyValue,
  type AuthorFields,
  type BibleVerseFields,
  type ContentStatus,
  type Locale,
  type Localized,
  type MediaDoc,
  type SermonFields,
} from "@idcr/content";
import { getContentDb } from "@src/service/database.service";
import {
  authorService,
  bibleVerseService,
  sermonService,
  type StoredContentEnvelope,
} from "@src/service/content";
import { getMediaById } from "@src/service/media";
import type { ContentCaller } from "@src/lib/content/caller";
import type { ContentFailure } from "@src/lib/content/errors";
import { getEntryEditorHref } from "@src/lib/content/routes";
import {
  isNeedsReviewDraft,
  isServiceIdentity,
} from "@src/lib/content/status-helpers";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  computeSermonHashForSnapshot,
  hasEnglishPdfContent,
  hasRenderableSermonBody,
  normalizeSermonAudioLanguages,
} from "@src/service/content/sermons/sermon-hash.service";
import { normalizeLocalizedStringArray } from "@src/service/content/sermons/sermon-helpers";
import { checkSermonSlugConflict } from "@src/service/content/sermons/sermon-slug.service";
import {
  markSermonPdfDirty,
  syncContentPdfJobOnDiscard,
} from "@src/service/content/sermons/pdf-jobs.service";
import {
  PREDICA_INGEST_SERVICE_ID,
  type PredicaRuntimeTarget,
} from "@src/lib/predica/auth";
import type {
  PredicaIngestRequest,
  PredicaPersonInput,
  PredicaScriptureRefInput,
} from "@src/lib/predica/schemas";

export interface PredicaLookupFeaturedImage {
  readonly mediaId: string;
  readonly filename: string;
  readonly createdBy: string;
  readonly isHumanReplaced: boolean;
}

export interface PredicaLookupMatch {
  readonly id: string;
  readonly slug: string;
  readonly sermonDate?: string;
  readonly titleEs: string;
  readonly status: ContentStatus;
  readonly isPublished: boolean;
  readonly revision: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly updatedByLabel?: string;
  readonly isHumanEdited: boolean;
  readonly featuredImage: PredicaLookupFeaturedImage | null;
  readonly editUrl: string;
}

export interface PredicaLookupResponse {
  readonly ok: true;
  readonly environment: PredicaRuntimeTarget;
  readonly trialMode: boolean;
  readonly exactMatch: PredicaLookupMatch | null;
  readonly sameDateMatches: readonly PredicaLookupMatch[];
  readonly slugDateConflict: boolean;
}

export interface PredicaIngestSuccess {
  readonly ok: true;
  readonly mode: "create" | "update";
  readonly updated: boolean;
  readonly docId: string;
  readonly slug: string;
  readonly status: ContentStatus;
  readonly revision: number;
  readonly published: false;
  readonly needsReview: boolean;
  readonly trialMode: boolean;
  readonly editUrl: string;
  readonly preacherId: string;
  readonly additionalPreacherIds: readonly string[];
  readonly interpreterId?: string;
  readonly scriptureRefIds: readonly string[];
  readonly bibleVerses: {
    readonly created: number;
    readonly reused: number;
  };
  readonly contentHash: string;
  readonly pdfJobQueued: boolean;
}

export type PredicaIngestFailure =
  | {
      readonly ok: false;
      readonly status: 400;
      readonly reason: "invalid";
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly status: 404;
      readonly reason: "not-found";
      readonly error: string;
    }
  | {
      readonly ok: false;
      readonly status: 409;
      readonly reason: "conflict";
      readonly humanEdited: boolean;
      readonly updatedBy: string;
      readonly updatedByLabel?: string;
      readonly updatedAt: string;
      readonly currentRevision: number;
    }
  | {
      readonly ok: false;
      readonly status: 409;
      readonly reason: "duplicate-key";
      readonly field: string;
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly status: 403;
      readonly reason: "forbidden";
      readonly error: string;
    };

export type PredicaIngestResult = PredicaIngestSuccess | PredicaIngestFailure;

export interface PredicaIngestDeps {
  readonly getContentDb: () => Db;
  readonly sermonService: Pick<
    typeof sermonService,
    "getById" | "create" | "saveDraft"
  >;
  readonly authorService: Pick<typeof authorService, "create" | "list">;
  readonly bibleVerseService: Pick<
    typeof bibleVerseService,
    "getByNaturalKey" | "create"
  >;
  readonly getMediaById: typeof getMediaById;
  readonly computeSermonHashForSnapshot: typeof computeSermonHashForSnapshot;
  readonly checkSermonSlugConflict: typeof checkSermonSlugConflict;
  readonly markSermonPdfDirty: typeof markSermonPdfDirty;
  readonly syncContentPdfJobOnDiscard: typeof syncContentPdfJobOnDiscard;
  readonly isContentTrialMode: typeof isContentTrialMode;
}

export const defaultPredicaIngestDeps: PredicaIngestDeps = {
  getContentDb,
  sermonService,
  authorService,
  bibleVerseService,
  getMediaById,
  computeSermonHashForSnapshot,
  checkSermonSlugConflict,
  markSermonPdfDirty,
  syncContentPdfJobOnDiscard,
  isContentTrialMode,
};

function normalizePersonName(name: string): string {
  return name.normalize("NFC").trim().split(/\s+/).join(" ");
}

function normalizeOptionalLocalizedString(
  value: Localized<string> | undefined,
): Localized<string> | undefined {
  if (!value) return undefined;
  const es = value["es-AR"]?.trim();
  const en = value["en-US"]?.trim();
  if (!es && !en) return undefined;
  return {
    ...(es ? { "es-AR": es } : {}),
    ...(en ? { "en-US": en } : {}),
  } as Localized<string>;
}

function buildAdminEditUrl(adminOrigin: string, docId: string): string {
  return `${adminOrigin}/es-AR${getEntryEditorHref("sermons", docId)}`;
}

async function resolveFeaturedImageMeta(
  caller: ContentCaller,
  mediaId: string | undefined,
  deps: PredicaIngestDeps,
): Promise<PredicaLookupFeaturedImage | null> {
  if (!mediaId) return null;
  const res = await deps.getMediaById(caller, mediaId);
  if (!res.ok) return null;
  const doc: MediaDoc = res.doc;
  const isHumanReplaced =
    doc.createdBy !== PREDICA_INGEST_SERVICE_ID ||
    doc.filename !== "featured.png";
  return {
    mediaId: doc._id,
    filename: doc.filename,
    createdBy: doc.createdBy,
    isHumanReplaced,
  };
}

function mapStoredSermonToMatch(
  stored: StoredContentEnvelope<SermonFields>,
  featuredImage: PredicaLookupFeaturedImage | null,
  adminOrigin: string,
): PredicaLookupMatch {
  const id = stored._id.toHexString();
  const doc = {
    _id: id,
    draft: stored.draft,
    ...(stored.published !== undefined && { published: stored.published }),
    ...(stored.publishedAt !== undefined && {
      publishedAt: stored.publishedAt,
    }),
    ...(stored.firstPublishedAt !== undefined && {
      firstPublishedAt: stored.firstPublishedAt,
    }),
    revision: stored.revision,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    updatedBy: stored.updatedBy,
  };

  return {
    id,
    slug: stored.draft.slug ?? stored.published?.slug ?? "",
    ...(stored.draft.sermonDate !== undefined && {
      sermonDate: stored.draft.sermonDate,
    }),
    titleEs: stored.draft.title?.["es-AR"] ?? "",
    status: deriveStatus(doc),
    isPublished: stored.published !== undefined,
    revision: stored.revision,
    updatedAt: stored.updatedAt.toISOString(),
    updatedBy: stored.updatedBy,
    ...(stored.updatedByLabel !== undefined && {
      updatedByLabel: stored.updatedByLabel,
    }),
    isHumanEdited: !isServiceIdentity(stored.updatedBy),
    featuredImage,
    editUrl: buildAdminEditUrl(adminOrigin, id),
  };
}

function isSuffixedDuplicateSlug(candidateSlug: string, baseSlug: string): boolean {
  if (!candidateSlug.startsWith(`${baseSlug}-`)) return false;
  const tail = candidateSlug.slice(baseSlug.length + 1);
  if (tail.length === 0 || tail.length > 6) return false;
  for (let i = 0; i < tail.length; i += 1) {
    const code = tail.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * Gate 0 lookup: finds exact slug match, same-date sermons, and any historical
 * `<slug>-N` duplicates without making any writes.
 */
export async function lookupSermonsForGate0(
  caller: ContentCaller,
  input: {
    readonly slug: string;
    readonly sermonDate?: string;
    readonly environment: PredicaRuntimeTarget;
    readonly adminOrigin: string;
  },
  deps: PredicaIngestDeps = defaultPredicaIngestDeps,
): Promise<PredicaLookupResponse> {
  const col = deps
    .getContentDb()
    .collection<StoredContentEnvelope<SermonFields>>(COLLECTIONS.sermons);

  const orClauses: Record<string, unknown>[] = [
    { "draft.slug": input.slug },
    { "published.slug": input.slug },
  ];
  if (input.sermonDate) {
    orClauses.push(
      { "draft.sermonDate": input.sermonDate },
      { "published.sermonDate": input.sermonDate },
    );
  }
  // Safe prefix scan (slug is pre-validated [a-z0-9-]+ <= 120 chars; verified by pure loop below)
  orClauses.push({ "draft.slug": { $regex: `^${input.slug}-[0-9]+$` } });

  const candidates = await col.find({ $or: orClauses }).limit(25).toArray();

  let exactStored: StoredContentEnvelope<SermonFields> | null = null;
  const secondaryStored: StoredContentEnvelope<SermonFields>[] = [];

  for (const doc of candidates) {
    const draftSlug = doc.draft.slug ?? "";
    const pubSlug = doc.published?.slug ?? "";
    const isExact = draftSlug === input.slug || pubSlug === input.slug;
    if (isExact && exactStored === null) {
      exactStored = doc;
      continue;
    }

    const matchesDate =
      input.sermonDate !== undefined &&
      (doc.draft.sermonDate === input.sermonDate ||
        doc.published?.sermonDate === input.sermonDate);
    const matchesSuffix =
      isSuffixedDuplicateSlug(draftSlug, input.slug) ||
      isSuffixedDuplicateSlug(pubSlug, input.slug);

    if (matchesDate || matchesSuffix) {
      secondaryStored.push(doc);
    }
  }

  const exactMatch = exactStored
    ? mapStoredSermonToMatch(
        exactStored,
        await resolveFeaturedImageMeta(
          caller,
          exactStored.draft.featuredImageId,
          deps,
        ),
        input.adminOrigin,
      )
    : null;

  const sameDateMatches: PredicaLookupMatch[] = [];
  for (const doc of secondaryStored) {
    const featured = await resolveFeaturedImageMeta(
      caller,
      doc.draft.featuredImageId,
      deps,
    );
    sameDateMatches.push(mapStoredSermonToMatch(doc, featured, input.adminOrigin));
  }

  const slugDateConflict = Boolean(
    exactMatch &&
      input.sermonDate &&
      exactMatch.sermonDate &&
      exactMatch.sermonDate !== input.sermonDate,
  );

  return {
    ok: true,
    environment: input.environment,
    trialMode: deps.isContentTrialMode(),
    exactMatch,
    sameDateMatches,
    slugDateConflict,
  };
}

function mapContentFailureToIngestFailure(
  failure: ContentFailure,
): PredicaIngestFailure {
  switch (failure.reason) {
    case "invalid":
      return {
        ok: false,
        status: 400,
        reason: "invalid",
        fieldErrors: failure.fieldErrors,
      };
    case "not-found":
      return {
        ok: false,
        status: 404,
        reason: "not-found",
        error: "Referenced sermon not found",
      };
    case "duplicate-key":
      return {
        ok: false,
        status: 409,
        reason: "duplicate-key",
        field: failure.field,
        fieldErrors: failure.fieldErrors,
      };
    case "conflict":
      return {
        ok: false,
        status: 409,
        reason: "conflict",
        humanEdited: !isServiceIdentity(failure.updatedBy),
        updatedBy: failure.updatedBy,
        ...(failure.updatedByLabel !== undefined && {
          updatedByLabel: failure.updatedByLabel,
        }),
        updatedAt: failure.updatedAt.toISOString(),
        currentRevision: failure.currentRevision,
      };
    case "forbidden":
      return {
        ok: false,
        status: 403,
        reason: "forbidden",
        error: `Missing required permission: ${failure.requiredPermission}`,
      };
    default:
      return {
        ok: false,
        status: 400,
        reason: "invalid",
        fieldErrors: { _root: [failure.reason] },
      };
  }
}

/**
 * Resolves an author by case-insensitive exact trimmed name (preferring a
 * published author when multiple exist), or creates a new draft author.
 */
export async function resolveOrCreateAuthor(
  caller: ContentCaller,
  person: PredicaPersonInput,
  deps: PredicaIngestDeps = defaultPredicaIngestDeps,
): Promise<
  | { readonly ok: true; readonly id: string; readonly reused: boolean }
  | PredicaIngestFailure
> {
  const canonicalName = normalizePersonName(person.name);
  const targetFolded = canonicalName.toLowerCase();

  const listed = await deps.authorService.list(caller, {
    page: 1,
    pageSize: 500,
  });
  if (!listed.ok) {
    return mapContentFailureToIngestFailure(listed);
  }

  const matches = listed.items.filter((item) => {
    const draftName = normalizePersonName(item.doc.draft.name).toLowerCase();
    const pubName = item.doc.published?.name
      ? normalizePersonName(item.doc.published.name).toLowerCase()
      : "";
    return draftName === targetFolded || pubName === targetFolded;
  });

  if (matches.length > 0) {
    matches.sort((a, b) => {
      const aPub = a.doc.published !== undefined ? 0 : 1;
      const bPub = b.doc.published !== undefined ? 0 : 1;
      if (aPub !== bPub) return aPub - bPub;
      return a.doc._id.localeCompare(b.doc._id);
    });
    const winner = matches[0];
    if (winner) {
      return { ok: true, id: winner.doc._id, reused: true };
    }
  }

  const draft: AuthorFields = {
    name: canonicalName,
    ...(person.email !== undefined && { email: person.email.trim() }),
  };

  const created = await deps.authorService.create(caller, draft);
  if (!created.ok) {
    return mapContentFailureToIngestFailure(created);
  }

  return { ok: true, id: created.doc._id, reused: false };
}

/**
 * Resolves a Bible verse by its version-scoped natural key (`bibleVerseKey`),
 * reusing the existing entry verbatim if present or creating a draft otherwise.
 * Handles concurrent creation races by re-fetching on `duplicate-key`.
 */
export async function resolveOrCreateBibleVerse(
  caller: ContentCaller,
  ref: PredicaScriptureRefInput,
  deps: PredicaIngestDeps = defaultPredicaIngestDeps,
): Promise<
  | { readonly ok: true; readonly id: string; readonly reused: boolean }
  | PredicaIngestFailure
> {
  const keyInput = {
    book: ref.book["es-AR"],
    chapter: ref.chapter,
    fromVerse: ref.fromVerse,
    ...(ref.toVerse !== undefined && { toVerse: ref.toVerse }),
    version: ref.version["es-AR"],
  };

  let naturalKey: string;
  try {
    naturalKey = bibleVerseKey(keyInput);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      reason: "invalid",
      fieldErrors: {
        scriptureReferences: [
          err instanceof Error ? err.message : "Invalid Bible verse reference",
        ],
      },
    };
  }

  const existing = await deps.bibleVerseService.getByNaturalKey(
    caller,
    naturalKey,
  );
  if (existing.ok) {
    return { ok: true, id: existing.doc._id, reused: true };
  }
  if (existing.reason !== "not-found") {
    return mapContentFailureToIngestFailure(existing);
  }

  const normalizedText = normalizeOptionalLocalizedString(ref.text);
  const draft: BibleVerseFields = {
    book: {
      "es-AR": ref.book["es-AR"].trim(),
      ...(ref.book["en-US"]?.trim() && { "en-US": ref.book["en-US"].trim() }),
    },
    chapter: ref.chapter,
    fromVerse: ref.fromVerse,
    ...(ref.toVerse !== undefined && { toVerse: ref.toVerse }),
    ...(normalizedText !== undefined && { text: normalizedText }),
    version: {
      "es-AR": ref.version["es-AR"].trim(),
      ...(ref.version["en-US"]?.trim() && {
        "en-US": ref.version["en-US"].trim(),
      }),
    },
  };

  const created = await deps.bibleVerseService.create(caller, draft);
  if (created.ok) {
    return { ok: true, id: created.doc._id, reused: false };
  }

  // Concurrent race: another ingest created the exact same natural key first
  if (created.reason === "duplicate-key") {
    const winner = await deps.bibleVerseService.getByNaturalKey(
      caller,
      naturalKey,
    );
    if (winner.ok) {
      return { ok: true, id: winner.doc._id, reused: true };
    }
  }

  return mapContentFailureToIngestFailure(created);
}

function buildOwnedSermonDraftFields(
  input: PredicaIngestRequest,
  resolved: {
    readonly preacherId: string;
    readonly additionalPreacherIds: readonly string[];
    readonly interpreterId?: string;
    readonly scriptureRefIds: readonly string[];
    readonly featuredImageId?: string;
  },
): SermonFields {
  const s = input.sermon;
  const audioLanguages: Locale[] = s.audioLanguages
    ? normalizeSermonAudioLanguages(s.audioLanguages)
    : resolved.interpreterId
      ? ["es-AR", "en-US"]
      : ["es-AR"];

  const title = normalizeOptionalLocalizedString(s.title) ?? {
    "es-AR": s.title["es-AR"].trim(),
  };
  const thesis = normalizeOptionalLocalizedString(s.thesis);
  const mainPoints = normalizeLocalizedStringArray(s.mainPoints);
  const excerpt = normalizeOptionalLocalizedString(s.excerpt);
  const seoTitle = normalizeOptionalLocalizedString(s.seoTitle);
  const seoDescription = normalizeOptionalLocalizedString(s.seoDescription);
  const keywords = normalizeLocalizedStringArray(s.keywords);

  let content: SermonFields["content"];
  if (s.content) {
    const hasEnContent = !isEmptyValue(s.content["en-US"]);
    content = {
      ...(s.content["es-AR"] !== undefined && { "es-AR": s.content["es-AR"] }),
      ...(hasEnContent &&
        s.content["en-US"] !== undefined && { "en-US": s.content["en-US"] }),
    } as SermonFields["content"];
  }

  return {
    slug: s.slug,
    sermonDate: s.sermonDate,
    ...(s.durationSeconds !== undefined && {
      durationSeconds: s.durationSeconds,
    }),
    audioLanguages,
    title,
    ...(thesis !== undefined && { thesis }),
    ...(mainPoints !== undefined && { mainPoints }),
    ...(excerpt !== undefined && { excerpt }),
    ...(content !== undefined && { content }),
    ...(seoTitle !== undefined && { seoTitle }),
    ...(seoDescription !== undefined && { seoDescription }),
    ...(keywords !== undefined && { keywords }),
    preacherId: resolved.preacherId,
    ...(resolved.additionalPreacherIds.length > 0 && {
      additionalPreacherIds: [...resolved.additionalPreacherIds],
    }),
    ...(resolved.interpreterId !== undefined && {
      interpreterId: resolved.interpreterId,
    }),
    ...(resolved.scriptureRefIds.length > 0 && {
      scriptureRefIds: [...resolved.scriptureRefIds],
    }),
    ...(resolved.featuredImageId !== undefined && {
      featuredImageId: resolved.featuredImageId,
    }),
    ...(input.media?.audioMediaId !== undefined && {
      audioMediaId: input.media.audioMediaId,
    }),
    ...(input.media?.pdfSummaryMediaId !== undefined && {
      pdfSummaryMediaId: input.media.pdfSummaryMediaId,
    }),
  };
}

function shouldQueuePdfRebuild(
  savedDraft: SermonFields,
  explicitQueue: boolean | undefined,
): boolean {
  if (explicitQueue === true) return true;
  if (!hasRenderableSermonBody(savedDraft)) return false;
  const pdfs = savedDraft.pdfSummaryMediaId;
  if (!pdfs?.["es-AR"]) return true;
  if (hasEnglishPdfContent(savedDraft) && !pdfs["en-US"]) return true;
  return false;
}

/**
 * Main draft-only sermon ingest orchestration (`POST /api/predica/sermons`).
 *
 * Strictly writes `draft` only (zero code path to `published` or emails),
 * resolves authors and Bible verses idempotently, enforces optimistic
 * concurrency + human-edit conflict guard on updates, computes `contentHash`
 * via `ICR-200`, and syncs or queues `content_pdf_jobs`.
 */
export async function ingestSermonDraft(
  caller: ContentCaller,
  input: PredicaIngestRequest,
  context: { readonly adminOrigin: string },
  deps: PredicaIngestDeps = defaultPredicaIngestDeps,
): Promise<PredicaIngestResult> {
  // 1. In update mode, load & check human-edit / revision conflict BEFORE creating any side records
  let existingSermon: Awaited<ReturnType<typeof sermonService.getById>> | null =
    null;
  if (input.mode === "update") {
    const docId = input.docId!;
    const expectedRevision = input.expectedRevision!;
    existingSermon = await deps.sermonService.getById(caller, docId);
    if (!existingSermon.ok) {
      return mapContentFailureToIngestFailure(existingSermon);
    }

    const humanEdited = !isServiceIdentity(existingSermon.doc.updatedBy);
    const revisionMismatch = existingSermon.doc.revision !== expectedRevision;
    if (!input.overwrite && (revisionMismatch || humanEdited)) {
      return {
        ok: false,
        status: 409,
        reason: "conflict",
        humanEdited,
        updatedBy: existingSermon.doc.updatedBy,
        ...(existingSermon.updatedByLabel !== undefined && {
          updatedByLabel: existingSermon.updatedByLabel,
        }),
        updatedAt: existingSermon.doc.updatedAt.toISOString(),
        currentRevision: existingSermon.doc.revision,
      };
    }
  }

  // 2. Pre-check slug uniqueness across BOTH draft.slug and published.slug
  const slugConflict = await deps.checkSermonSlugConflict(
    input.sermon.slug,
    input.mode === "update" ? input.docId : undefined,
  );
  if (slugConflict) {
    return {
      ok: false,
      status: 409,
      reason: "duplicate-key",
      field: slugConflict.field,
      fieldErrors: slugConflict.fieldErrors,
    };
  }

  // 3. Resolve preacher, additionalPreachers, and optional interpreter (NEVER mixed!)
  const preacherRes = await resolveOrCreateAuthor(caller, input.preacher, deps);
  if (!preacherRes.ok) return preacherRes;

  const additionalPreacherIds: string[] = [];
  for (const coPreacher of input.additionalPreachers ?? []) {
    const res = await resolveOrCreateAuthor(caller, coPreacher, deps);
    if (!res.ok) return res;
    if (
      res.id !== preacherRes.id &&
      !additionalPreacherIds.includes(res.id)
    ) {
      additionalPreacherIds.push(res.id);
    }
  }

  let interpreterId: string | undefined;
  if (input.interpreter) {
    const res = await resolveOrCreateAuthor(caller, input.interpreter, deps);
    if (!res.ok) return res;
    interpreterId = res.id;
  }

  // 4. Resolve/upsert scripture references in order (version-scoped natural key)
  const scriptureRefIds: string[] = [];
  let versesCreated = 0;
  let versesReused = 0;
  for (const ref of input.scriptureReferences ?? []) {
    const res = await resolveOrCreateBibleVerse(caller, ref, deps);
    if (!res.ok) return res;
    if (!scriptureRefIds.includes(res.id)) {
      scriptureRefIds.push(res.id);
    }
    if (res.reused) {
      versesReused += 1;
    } else {
      versesCreated += 1;
    }
  }

  // 5. Preserve featured image when requested on update
  const featuredImageId =
    input.mode === "update" &&
    input.keepExistingFeaturedImage === true &&
    existingSermon?.ok
      ? existingSermon.doc.draft.featuredImageId
      : input.media?.featuredImageId;

  const ownedDraft = buildOwnedSermonDraftFields(input, {
    preacherId: preacherRes.id,
    additionalPreacherIds,
    ...(interpreterId !== undefined && { interpreterId }),
    scriptureRefIds,
    ...(featuredImageId !== undefined && { featuredImageId }),
  });

  // 6. Compute authoritative TipTap contentHash (ICR-200)
  const { contentHash } = await deps.computeSermonHashForSnapshot(
    caller,
    ownedDraft,
  );
  const draftWithHash: SermonFields = {
    ...ownedDraft,
    contentHash,
  };

  // 7. Create or update draft ONLY via ICR-195 sermonService
  if (input.mode === "create") {
    const created = await deps.sermonService.create(caller, draftWithHash);
    if (!created.ok) {
      return mapContentFailureToIngestFailure(created);
    }

    const docId = created.doc._id;
    const queuePdf = shouldQueuePdfRebuild(
      created.doc.draft,
      input.queuePdfRebuild,
    );
    if (queuePdf) {
      await deps.markSermonPdfDirty(docId, contentHash);
    }

    return {
      ok: true,
      mode: "create",
      updated: false,
      docId,
      slug: created.doc.draft.slug ?? input.sermon.slug,
      status: created.status,
      revision: created.doc.revision,
      published: false,
      needsReview: isNeedsReviewDraft(created.doc),
      trialMode: deps.isContentTrialMode(),
      editUrl: buildAdminEditUrl(context.adminOrigin, docId),
      preacherId: preacherRes.id,
      additionalPreacherIds,
      ...(interpreterId !== undefined && { interpreterId }),
      scriptureRefIds,
      bibleVerses: { created: versesCreated, reused: versesReused },
      contentHash,
      pdfJobQueued: queuePdf,
    };
  }

  // Update mode: explicitly clear any previously-set owned optional fields not
  // present in the new payload, while preserving non-owned fields like
  // `relatedSermonIds` (and `featuredImageId` when keepExistingFeaturedImage).
  const docId = input.docId!;
  const expectedRevision = input.expectedRevision!;
  const existingDraft =
    existingSermon && existingSermon.ok ? existingSermon.doc.draft : undefined;

  const updatePatch: Partial<SermonFields> = {
    ...draftWithHash,
    additionalPreacherIds: draftWithHash.additionalPreacherIds,
    interpreterId: draftWithHash.interpreterId,
    scriptureRefIds: draftWithHash.scriptureRefIds,
    audioMediaId: draftWithHash.audioMediaId,
    featuredImageId: draftWithHash.featuredImageId,
    pdfSummaryMediaId: draftWithHash.pdfSummaryMediaId,
    durationSeconds: draftWithHash.durationSeconds,
    ...(existingDraft?.relatedSermonIds !== undefined && {
      relatedSermonIds: existingDraft.relatedSermonIds,
    }),
  };

  const saved = await deps.sermonService.saveDraft(caller, {
    docId,
    patch: updatePatch,
    expectedRevision,
    overwrite: input.overwrite ?? false,
  });

  if (!saved.ok) {
    return mapContentFailureToIngestFailure(saved);
  }

  const queuePdf = shouldQueuePdfRebuild(
    saved.doc.draft,
    input.queuePdfRebuild,
  );
  if (queuePdf) {
    await deps.markSermonPdfDirty(docId, contentHash);
  } else {
    await deps.syncContentPdfJobOnDiscard(
      docId,
      contentHash,
      Boolean(saved.doc.draft.pdfSummaryMediaId?.["es-AR"]),
    );
  }

  return {
    ok: true,
    mode: "update",
    updated: !saved.noOp,
    docId,
    slug: saved.doc.draft.slug ?? input.sermon.slug,
    status: saved.status,
    revision: saved.doc.revision,
    published: false,
    needsReview: isNeedsReviewDraft(saved.doc),
    trialMode: deps.isContentTrialMode(),
    editUrl: buildAdminEditUrl(context.adminOrigin, docId),
    preacherId: preacherRes.id,
    additionalPreacherIds,
    ...(interpreterId !== undefined && { interpreterId }),
    scriptureRefIds,
    bibleVerses: { created: versesCreated, reused: versesReused },
    contentHash,
    pdfJobQueued: queuePdf,
  };
}
