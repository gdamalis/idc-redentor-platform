"use server";

import { revalidatePath } from "next/cache";
import {
  CONTENT_SCHEMAS,
  extractReferences,
  type ContentDoc,
  type ContentStatus,
  type Locale,
  type MediaDoc,
  type SermonFields,
} from "@idcr/content";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import {
  formatZodFieldErrors,
  type ContentCollectionName,
  type ContentFailure,
} from "@src/lib/content/errors";
import { extractEntryLabel } from "@src/lib/content/guards";
import {
  isPublishEmailsEnabled,
  type RevalidateFailureReason,
} from "@src/lib/content/revalidate";
import { getContentById, sermonService } from "@src/service/content";
import { deleteMedia, getMediaByIds } from "@src/service/media";
import {
  PDF_WORKER_CALLER,
  collectSermonPdfMediaIds,
  computeSermonHashForSnapshot,
  hasRenderableSermonBody,
  normalizeSermonAudioLanguages,
} from "@src/service/content/sermons/sermon-hash.service";
import { normalizeLocalizedStringArray } from "@src/service/content/sermons/sermon-helpers";
import {
  deriveSermonPdfUiState,
  getContentPdfJob,
  markSermonPdfDirty,
  syncContentPdfJobOnDiscard,
  type SermonPdfUiState,
} from "@src/service/content/sermons/pdf-jobs.service";
import { checkSermonSlugConflict } from "@src/service/content/sermons/sermon-slug.service";
import type {
  ContentActionResult,
  PreparePublishResult,
  SerializedContentDoc,
  SerializedContentFailure,
} from "../actions";
import type { SerializedMediaDoc } from "../media/actions";

const CONTENT_LAYOUT_ROUTE = "/[locale]/content";

export interface SerializedSermonPdfStatus {
  readonly stateByLocale: Record<Locale, SermonPdfUiState>;
  readonly isPending: boolean;
  readonly version: number;
  readonly lastRenderedAt?: string;
  readonly lastError?: string;
  readonly pdfs: Partial<Record<Locale, SerializedMediaDoc>>;
}

function serializeDoc(
  doc: ContentDoc<SermonFields>,
  updatedByLabel?: string,
): SerializedContentDoc<SermonFields> {
  return {
    _id: doc._id,
    draft: doc.draft,
    ...(doc.published !== undefined && { published: doc.published }),
    ...(doc.publishedAt !== undefined && {
      publishedAt: doc.publishedAt.toISOString(),
    }),
    ...(doc.firstPublishedAt !== undefined && {
      firstPublishedAt: doc.firstPublishedAt.toISOString(),
    }),
    revision: doc.revision,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    updatedBy: doc.updatedBy,
    ...(updatedByLabel !== undefined && { updatedByLabel }),
    ...(doc.sourceContentfulId !== undefined && {
      sourceContentfulId: doc.sourceContentfulId,
    }),
  };
}

function serializeFailure(failure: ContentFailure): SerializedContentFailure {
  if (failure.reason === "conflict") {
    return {
      ok: false,
      reason: "conflict",
      updatedBy: failure.updatedBy,
      ...(failure.updatedByLabel !== undefined && {
        updatedByLabel: failure.updatedByLabel,
      }),
      updatedAt: failure.updatedAt.toISOString(),
      currentRevision: failure.currentRevision,
    };
  }
  return failure;
}

function serializeMedia(doc: MediaDoc): SerializedMediaDoc {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Strips system-owned PDF fields so an editor save can NEVER revert worker PDFs (AC4),
 *  and strips whitespace-only items from `mainPoints`/`keywords` so blank English rows
 *  never suppress Spanish fallback (`ICR-200` C3). */
function stripSystemOwnedSermonPatch(
  patch: Partial<SermonFields>,
): Partial<SermonFields> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "pdfSummaryMediaId" || key === "contentHash") continue;
    if (key === "audioLanguages" && value !== undefined) {
      out[key] = normalizeSermonAudioLanguages(value as readonly string[]);
    } else if (
      (key === "mainPoints" || key === "keywords") &&
      value !== undefined
    ) {
      out[key] = normalizeLocalizedStringArray(
        value as SermonFields["mainPoints"],
      );
    } else {
      out[key] = value;
    }
  }
  return out as Partial<SermonFields>;
}

function mergePatchOntoDraft(
  base: SermonFields,
  patch: Partial<SermonFields>,
): SermonFields {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as unknown as SermonFields;
}

async function cleanupUnreferencedPdfMediaIds(
  candidateIds: readonly string[],
  retainedDoc: ContentDoc<SermonFields>,
): Promise<void> {
  if (candidateIds.length === 0) return;
  const stillReferenced = new Set<string>([
    ...collectSermonPdfMediaIds(retainedDoc.draft.pdfSummaryMediaId),
    ...collectSermonPdfMediaIds(retainedDoc.published?.pdfSummaryMediaId),
  ]);
  for (const mediaId of candidateIds) {
    if (stillReferenced.has(mediaId)) continue;
    try {
      await deleteMedia(PDF_WORKER_CALLER, mediaId);
    } catch (error) {
      console.warn(
        `[sermons/actions] Best-effort PDF cleanup failed for ${mediaId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function buildSermonPdfStatus(
  caller: ReturnType<typeof callerFromAuthorized>,
  doc: ContentDoc<SermonFields>,
): Promise<SerializedSermonPdfStatus> {
  const job = await getContentPdfJob(doc._id);
  const pdfIds = collectSermonPdfMediaIds(doc.draft.pdfSummaryMediaId);
  const pdfMap: Partial<Record<Locale, SerializedMediaDoc>> = {};

  if (pdfIds.length > 0) {
    const mediaRes = await getMediaByIds(caller, pdfIds);
    if (mediaRes.ok) {
      const byId = new Map(mediaRes.items.map((m) => [m._id, m]));
      const esId = doc.draft.pdfSummaryMediaId?.["es-AR"];
      const enId = doc.draft.pdfSummaryMediaId?.["en-US"];
      if (esId && byId.has(esId)) pdfMap["es-AR"] = serializeMedia(byId.get(esId)!);
      if (enId && byId.has(enId)) pdfMap["en-US"] = serializeMedia(byId.get(enId)!);
    }
  }

  const esState = deriveSermonPdfUiState({
    job,
    hasPdfForLocale: Boolean(pdfMap["es-AR"]),
  });
  const enState = deriveSermonPdfUiState({
    job,
    hasPdfForLocale: Boolean(pdfMap["en-US"]),
  });

  return {
    stateByLocale: { "es-AR": esState, "en-US": enState },
    isPending: esState === "pending" || enState === "pending",
    version: job?.version ?? 0,
    ...(job?.lastRenderedAt && {
      lastRenderedAt: job.lastRenderedAt.toISOString(),
    }),
    ...(job?.lastError && { lastError: job.lastError }),
    pdfs: pdfMap,
  };
}

/**
 * `EntryEditor.actionOverrides.create` for `sermons`:
 * computes server-authoritative `contentHash` and enqueues a PDF job when body
 * content is present.
 */
export async function createSermonAction(input: {
  readonly collection: ContentCollectionName;
  readonly draft: SermonFields;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<SermonFields>;
    readonly status: ContentStatus;
    readonly pdfStatus: SerializedSermonPdfStatus;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const cleanDraft = stripSystemOwnedSermonPatch(input.draft) as SermonFields;
  if (cleanDraft.audioLanguages !== undefined) {
    cleanDraft.audioLanguages = normalizeSermonAudioLanguages(
      cleanDraft.audioLanguages,
    );
  }

  const slugConflict = await checkSermonSlugConflict(cleanDraft.slug);
  if (slugConflict) return slugConflict;

  const { contentHash } = await computeSermonHashForSnapshot(caller, cleanDraft);

  const result = await sermonService.create(caller, {
    ...cleanDraft,
    contentHash,
  });
  if (!result.ok) return serializeFailure(result);

  if (hasRenderableSermonBody(result.doc.draft)) {
    await markSermonPdfDirty(result.doc._id, contentHash);
  }

  const pdfStatus = await buildSermonPdfStatus(caller, result.doc);
  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(result.doc, authz.user.displayName ?? authz.user.email),
    status: result.status,
    pdfStatus,
  };
}

/**
 * `EntryEditor.actionOverrides.saveDraft` for `sermons`:
 * - Strips system-owned `pdfSummaryMediaId` / `contentHash` from client patch (AC4).
 * - Enforces cross-snapshot slug uniqueness (`C1`).
 * - Computes authoritative `prevHash` vs `nextHash`; persists `contentHash` on
 *   draft and creates/updates **exactly one** pending `content_pdf_jobs` entry
 *   iff `prevHash !== nextHash` (AC3).
 */
export async function saveSermonDraftAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly patch: Partial<SermonFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<SermonFields>;
    readonly status: ContentStatus;
    readonly changedFields: string[];
    readonly noOp: boolean;
    readonly pdfStatus: SerializedSermonPdfStatus;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const sanitizedPatch = stripSystemOwnedSermonPatch(input.patch);

  const loaded = await sermonService.getById(caller, input.docId);
  if (!loaded.ok) return serializeFailure(loaded);

  if (
    sanitizedPatch.slug !== undefined &&
    sanitizedPatch.slug !== loaded.doc.draft.slug
  ) {
    const slugConflict = await checkSermonSlugConflict(
      sanitizedPatch.slug,
      input.docId,
    );
    if (slugConflict) return slugConflict;
  }

  const prevHash =
    loaded.doc.draft.contentHash ??
    (await computeSermonHashForSnapshot(caller, loaded.doc.draft)).contentHash;

  const mergedDraft = mergePatchOntoDraft(loaded.doc.draft, sanitizedPatch);
  const { contentHash: nextHash } = await computeSermonHashForSnapshot(
    caller,
    mergedDraft,
  );

  const hasPatchKeys = Object.keys(sanitizedPatch).length > 0;
  const patchToSave: Partial<SermonFields> =
    hasPatchKeys && loaded.doc.draft.contentHash !== nextHash
      ? { ...sanitizedPatch, contentHash: nextHash }
      : sanitizedPatch;

  const result = await sermonService.saveDraft(caller, {
    docId: input.docId,
    patch: patchToSave,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  if (!result.noOp) {
    if (prevHash !== nextHash) {
      await markSermonPdfDirty(input.docId, nextHash);
    }
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  }

  const pdfStatus = await buildSermonPdfStatus(caller, result.doc);
  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    changedFields: result.changedFields,
    noOp: result.noOp,
    pdfStatus,
  };
}

export type PrepareSermonPublishResult =
  | (Extract<PreparePublishResult<SermonFields>, { ok: true }> & {
      readonly pdfStatus: SerializedSermonPdfStatus;
    })
  | (Extract<PreparePublishResult<SermonFields>, { ok: false }> & {
      readonly savedPdfStatus?: SerializedSermonPdfStatus;
    });

/**
 * `EntryEditor.actionOverrides.preparePublish` for `sermons`:
 * saves dirty edits through the exact hash-updating + PDF dirty-marking path
 * BEFORE strict publish validation so `draft.contentHash` is always fresh when
 * `confirmSermonPublishAction` copies `draft` -> `published` (AC5).
 */
export async function prepareSermonPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly newDraft?: SermonFields;
  readonly draftPatch?: Partial<SermonFields>;
  readonly expectedRevision?: number;
  readonly overwrite?: boolean;
}): Promise<PrepareSermonPublishResult> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  let doc: ContentDoc<SermonFields>;
  let status: ContentStatus;
  let updatedByLabel: string | undefined;

  if (!input.docId) {
    if (!input.newDraft) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { _root: ["missing-draft"] },
      };
    }
    const cleanDraft = stripSystemOwnedSermonPatch(input.newDraft) as SermonFields;
    const slugConflict = await checkSermonSlugConflict(cleanDraft.slug);
    if (slugConflict) return slugConflict;

    const { contentHash } = await computeSermonHashForSnapshot(caller, cleanDraft);
    const created = await sermonService.create(caller, {
      ...cleanDraft,
      contentHash,
    });
    if (!created.ok) return serializeFailure(created);
    if (hasRenderableSermonBody(created.doc.draft)) {
      await markSermonPdfDirty(created.doc._id, contentHash);
    }
    doc = created.doc;
    status = created.status;
    updatedByLabel = authz.user.displayName ?? authz.user.email;
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  } else if (
    input.draftPatch &&
    Object.keys(stripSystemOwnedSermonPatch(input.draftPatch)).length > 0
  ) {
    const sanitizedPatch = stripSystemOwnedSermonPatch(input.draftPatch);
    const loaded = await sermonService.getById(caller, input.docId);
    if (!loaded.ok) return serializeFailure(loaded);

    const mergedDraft = mergePatchOntoDraft(loaded.doc.draft, sanitizedPatch);
    const slugConflict = await checkSermonSlugConflict(
      mergedDraft.slug,
      input.docId,
    );
    if (slugConflict) return slugConflict;

    const prevHash =
      loaded.doc.draft.contentHash ??
      (await computeSermonHashForSnapshot(caller, loaded.doc.draft)).contentHash;
    const { contentHash: nextHash } = await computeSermonHashForSnapshot(
      caller,
      mergedDraft,
    );

    const patchToSave: Partial<SermonFields> =
      loaded.doc.draft.contentHash !== nextHash
        ? { ...sanitizedPatch, contentHash: nextHash }
        : sanitizedPatch;

    const saved = await sermonService.saveDraft(caller, {
      docId: input.docId,
      patch: patchToSave,
      expectedRevision: input.expectedRevision ?? 0,
      overwrite: input.overwrite,
    });
    if (!saved.ok) return serializeFailure(saved);
    if (!saved.noOp) {
      if (prevHash !== nextHash) {
        await markSermonPdfDirty(input.docId, nextHash);
      }
      revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
    }
    doc = saved.doc;
    status = saved.status;
    updatedByLabel = saved.updatedByLabel;
  } else {
    const loaded = await sermonService.getById(caller, input.docId);
    if (!loaded.ok) return serializeFailure(loaded);
    if (
      !input.overwrite &&
      input.expectedRevision !== undefined &&
      loaded.doc.revision !== input.expectedRevision
    ) {
      return {
        ok: false,
        reason: "conflict",
        updatedBy: loaded.doc.updatedBy,
        ...(loaded.updatedByLabel !== undefined && {
          updatedByLabel: loaded.updatedByLabel,
        }),
        updatedAt: loaded.doc.updatedAt.toISOString(),
        currentRevision: loaded.doc.revision,
      };
    }
    const slugConflict = await checkSermonSlugConflict(
      loaded.doc.draft.slug,
      input.docId,
    );
    if (slugConflict) return slugConflict;

    doc = loaded.doc;
    status = loaded.status;
    updatedByLabel = loaded.updatedByLabel;
  }

  const pdfStatus = await buildSermonPdfStatus(caller, doc);

  const strict = CONTENT_SCHEMAS.sermon.publishable.safeParse(doc.draft);
  if (!strict.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(strict.error),
      savedDoc: serializeDoc(doc, updatedByLabel),
      savedStatus: status,
      savedPdfStatus: pdfStatus,
    };
  }

  const refs = extractReferences("sermon", {
    draft: doc.draft,
    published: undefined,
  });
  const willCascade: Array<{
    readonly collection: ContentCollectionName;
    readonly docId: string;
    readonly label: string;
  }> = [];

  for (const ref of refs.contentRefs) {
    if (ref.collection !== "authors" && ref.collection !== "bible_verses") {
      continue;
    }
    const target = await getContentById<Record<string, unknown>>(
      caller,
      ref.collection,
      ref.id,
    );
    if (
      target.ok &&
      target.doc.published === undefined &&
      target.doc.firstPublishedAt === undefined
    ) {
      willCascade.push({
        collection: ref.collection,
        docId: ref.id,
        label: extractEntryLabel(ref.collection, target.doc.draft, ref.id),
      });
    }
  }

  return {
    ok: true,
    doc: serializeDoc(doc, updatedByLabel),
    status,
    isFirstPublish: doc.firstPublishedAt === undefined,
    isPublishEmailsEnabled: isPublishEmailsEnabled(),
    willCascade,
    pdfStatus,
  };
}

/**
 * `EntryEditor.actionOverrides.confirmPublish` for `sermons`:
 * enforces cross-snapshot slug uniqueness (`C1`), publishes the sermon, and
 * removes any old published PDF media items no longer referenced by either
 * `draft` or `published` (AC6).
 */
export async function confirmSermonPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  readonly notify?: boolean;
  readonly approvedConfirmed?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<SermonFields>;
    readonly status: ContentStatus;
    readonly revalidated: boolean;
    readonly revalidateReason?: RevalidateFailureReason;
    readonly notified: boolean;
    readonly pdfStatus: SerializedSermonPdfStatus;
  }>
> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  const before = await sermonService.getById(caller, input.docId);
  if (before.ok) {
    const slugConflict = await checkSermonSlugConflict(
      before.doc.draft.slug,
      input.docId,
    );
    if (slugConflict) return slugConflict;
  }
  const beforePublishedPdfIds = before.ok
    ? collectSermonPdfMediaIds(before.doc.published?.pdfSummaryMediaId)
    : [];

  const result = await sermonService.publish(caller, {
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
    notify: input.notify,
    approvedConfirmed: input.approvedConfirmed,
  });
  if (!result.ok) return serializeFailure(result);

  await cleanupUnreferencedPdfMediaIds(beforePublishedPdfIds, result.doc);
  const pdfStatus = await buildSermonPdfStatus(caller, result.doc);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    revalidated: result.revalidated,
    ...(result.revalidateReason !== undefined && {
      revalidateReason: result.revalidateReason,
    }),
    notified: result.notified,
    pdfStatus,
  };
}

/**
 * `EntryEditor.actionOverrides.discardChanges` for `sermons`:
 * discards draft changes back to `published`, removes any draft-only PDFs no
 * longer referenced by either snapshot (AC6), and re-syncs `content_pdf_jobs`
 * to the reverted snapshot (`C2`).
 */
export async function discardSermonChangesAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<SermonFields>;
    readonly status: ContentStatus;
    readonly noOp: boolean;
    readonly pdfStatus: SerializedSermonPdfStatus;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const before = await sermonService.getById(caller, input.docId);
  const beforeDraftPdfIds = before.ok
    ? collectSermonPdfMediaIds(before.doc.draft.pdfSummaryMediaId)
    : [];

  const result = await sermonService.discardChanges(caller, {
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  if (!result.noOp) {
    await cleanupUnreferencedPdfMediaIds(beforeDraftPdfIds, result.doc);
    const revertedHash =
      result.doc.draft.contentHash ??
      (await computeSermonHashForSnapshot(caller, result.doc.draft)).contentHash;
    const hasRevertedPdf = Boolean(
      result.doc.draft.pdfSummaryMediaId?.["es-AR"],
    );
    await syncContentPdfJobOnDiscard(
      input.docId,
      revertedHash,
      hasRevertedPdf,
    );
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  }

  const pdfStatus = await buildSermonPdfStatus(caller, result.doc);
  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    noOp: result.noOp,
    pdfStatus,
  };
}

/**
 * On-demand `"Regenerar"` / `"Generar"` / `"Reintentar"` trigger (`F` §2.10).
 * Ensures `draft.contentHash` matches the recomputed hash (for legacy/unseeded
 * docs) and marks `content_pdf_jobs` dirty with `force: true`.
 */
export async function requestSermonPdfRegenAction(input: {
  readonly docId: string;
}): Promise<ContentActionResult<{ readonly pdfStatus: SerializedSermonPdfStatus }>> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const loaded = await sermonService.getById(caller, input.docId);
  if (!loaded.ok) return serializeFailure(loaded);

  const { contentHash: currentHash } = await computeSermonHashForSnapshot(
    caller,
    loaded.doc.draft,
  );

  let effectiveDoc = loaded.doc;
  if (loaded.doc.draft.contentHash !== currentHash) {
    const synced = await sermonService.saveDraft(caller, {
      docId: input.docId,
      patch: { contentHash: currentHash },
      expectedRevision: loaded.doc.revision,
    });
    if (synced.ok) {
      effectiveDoc = synced.doc;
    }
  }

  await markSermonPdfDirty(input.docId, currentHash, { force: true });
  const pdfStatus = await buildSermonPdfStatus(caller, effectiveDoc);
  return { ok: true, pdfStatus };
}

/**
 * Polled every 15s by `SermonPdfStatusCard` while status is `"pending"`.
 * Read-only (`content:read`), never touches editor revision or dirty state.
 */
export async function getSermonPdfStatusAction(input: {
  readonly docId: string;
}): Promise<ContentActionResult<{ readonly pdfStatus: SerializedSermonPdfStatus }>> {
  const authz = await requireActionPermission("content:read");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const caller = callerFromAuthorized(authz);
  const loaded = await sermonService.getById(caller, input.docId);
  if (!loaded.ok) return serializeFailure(loaded);

  const pdfStatus = await buildSermonPdfStatus(caller, loaded.doc);
  return { ok: true, pdfStatus };
}
