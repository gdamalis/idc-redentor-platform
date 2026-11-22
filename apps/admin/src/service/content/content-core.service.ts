import { ObjectId } from "mongodb";
import type { ClientSession } from "mongodb";
import {
  CONTENT_SCHEMAS,
  LOCALES,
  bibleVerseKey,
  canonicalEqual,
  deriveStatus,
  extractReferences,
  type BibleVerseKeyInput,
  type CollectionName,
  type ContentDoc,
  type ContentReference,
  type ContentStatus,
  type ExtractedReferences,
  type Locale,
  type Localized,
  type SermonFields,
} from "@idcr/content";
import {
  getContentDb,
  withContentTransaction,
} from "@src/service/database.service";
import { appendContentAuditEntry } from "@src/service/content-audit.service";
import { isDuplicateKeyError } from "@src/service/user.service";
import {
  getCallerActor,
  hasAnyPermission,
  hasPermission,
  type ContentCaller,
} from "@src/lib/content/caller";
import {
  formatZodFieldErrors,
  mapDuplicateKeyToFailure,
  type ContentCollectionName,
  type ContentReferenceUsage,
  type ContentResult,
} from "@src/lib/content/errors";
import {
  COLLECTION_META,
  MEDIA_REFERENCING_COLLECTIONS,
  REFERENCING_COLLECTIONS_BY_TARGET,
  computeNaturalKey,
  diffChangedFields,
  diffSnapshotFields,
  extractEntryLabel,
  findImmutableFieldViolation,
  isEntryProtected,
  isFixedCollection,
  isProtectedFlagToggled,
  isVisibleFixedEntry,
  resolveConcreteType,
  shouldRequireProtectedApproval,
  stripUndefinedDeep,
} from "@src/lib/content/guards";
import {
  isPublishEmailsEnabled,
  revalidateWebsite,
  shouldNotifySubscribers,
  type RevalidateFailureReason,
} from "@src/lib/content/revalidate";
import { ensureContentIndexes } from "./indexes";

/** Stored MongoDB envelope shape in `website*` content collections. */
export interface StoredContentEnvelope<TFields> {
  _id: ObjectId;
  draft: TFields;
  published?: TFields;
  publishedAt?: Date;
  firstPublishedAt?: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
  updatedByLabel?: string;
  sourceContentfulId?: string;
  _naturalKey?: string;
  _refs: ExtractedReferences;
  /**
   * Internal monotonic counter bumped inside transactions to create a shared
   * target-side write key between reference-introducing writes and concurrent
   * `deleteContent` / `unpublishContent` operations (prevents MongoDB
   * snapshot-isolation write skew without bumping `revision`).
   */
  _refGuardRev?: number;
}

export interface ContentDocumentView<TFields> {
  readonly doc: ContentDoc<TFields>;
  readonly status: ContentStatus;
  readonly updatedByLabel?: string;
}

export interface ContentServiceDeps {
  readonly getContentDb: typeof getContentDb;
  readonly withContentTransaction: typeof withContentTransaction;
  readonly appendContentAuditEntry: typeof appendContentAuditEntry;
  readonly revalidateWebsite: typeof revalidateWebsite;
  readonly isPublishEmailsEnabled: typeof isPublishEmailsEnabled;
  readonly ensureContentIndexes: (
    collection: ContentCollectionName,
  ) => Promise<void>;
  readonly now: () => Date;
}

export const defaultContentServiceDeps: ContentServiceDeps = {
  getContentDb,
  withContentTransaction,
  appendContentAuditEntry,
  revalidateWebsite,
  isPublishEmailsEnabled,
  ensureContentIndexes: (collection) =>
    ensureContentIndexes(collection, getContentDb),
  now: () => new Date(),
};

function parseObjectId(id: string): ObjectId | null {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function toContentDocView<TFields>(
  stored: StoredContentEnvelope<TFields>,
): ContentDocumentView<TFields> {
  const doc: ContentDoc<TFields> = {
    _id: stored._id.toHexString(),
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
    ...(stored.sourceContentfulId !== undefined && {
      sourceContentfulId: stored.sourceContentfulId,
    }),
  };

  return {
    doc,
    status: deriveStatus(doc),
    ...(stored.updatedByLabel !== undefined && {
      updatedByLabel: stored.updatedByLabel,
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function referenceKey(ref: ContentReference): string {
  return `${ref.collection}:${ref.id}`;
}

function findAddedContentRefs(
  existingRefs: readonly ContentReference[],
  nextRefs: readonly ContentReference[],
  self?: { readonly collection: ContentCollectionName; readonly docId: string },
): ContentReference[] {
  const existingKeys = new Set(existingRefs.map(referenceKey));
  return nextRefs.filter((ref) => {
    if (self && ref.collection === self.collection && ref.id === self.docId) {
      return false;
    }
    return !existingKeys.has(referenceKey(ref));
  });
}

/**
 * Acquires a target-side transactional write lock on every referenced content
 * document (sorted deterministically by `collection:id`) by bumping internal
 * `_refGuardRev` (leaving `revision`, `draft`, and `published` untouched) and
 * verifying each target still exists in the transaction's snapshot.
 *
 * Because `deleteContent` and `unpublishContent` also write the target document
 * inside their transaction before checking usages, MongoDB snapshot isolation
 * raises a retryable `WriteConflict` if a reference write and a target
 * deletion/unpublish overlap — preventing dangling references.
 */
async function lockAndVerifyContentRefs(
  refs: readonly ContentReference[],
  session: ClientSession,
  deps: ContentServiceDeps,
): Promise<Extract<ContentResult<never>, { ok: false }> | null> {
  const deduped = new Map<string, ContentReference>();
  for (const ref of refs) {
    deduped.set(referenceKey(ref), ref);
  }
  const ordered = [...deduped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ref]) => ref);

  // Sequential across targets so an active ClientSession is never used in parallel.
  for (const ref of ordered) {
    const refObjectId = parseObjectId(ref.id);
    if (!refObjectId) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: {
          [ref.collection]: [
            `Referenced ${ref.collection} id "${ref.id}" is invalid`,
          ],
        },
      };
    }

    const res = await deps
      .getContentDb()
      .collection(ref.collection)
      .updateOne(
        { _id: refObjectId },
        { $inc: { _refGuardRev: 1 } },
        { session },
      );

    if ((res.matchedCount ?? 0) === 0) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: {
          [ref.collection]: [
            `Referenced ${ref.collection} entry "${ref.id}" does not exist`,
          ],
        },
      };
    }
  }

  return null;
}

// ── Read operations ─────────────────────────────────────────────────────────

export async function getContentById<TFields>(
  caller: ContentCaller,
  collection: ContentCollectionName,
  docId: string,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<ContentDocumentView<TFields>>> {
  if (!hasPermission(caller, "content:read")) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const objectId = parseObjectId(docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  await deps.ensureContentIndexes(collection);
  const raw = (await deps
    .getContentDb()
    .collection(collection)
    .findOne({ _id: objectId })) as StoredContentEnvelope<TFields> | null;

  if (!raw) return { ok: false, reason: "not-found" };
  if (!isVisibleFixedEntry(collection, asRecord(raw.draft))) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, ...toContentDocView(raw) };
}

export type NaturalKeyQuery =
  | string
  | BibleVerseKeyInput
  | { readonly locale: Locale; readonly slug: string };

export async function getContentByNaturalKey<TFields>(
  caller: ContentCaller,
  collection: Exclude<ContentCollectionName, "authors">,
  key: NaturalKeyQuery,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<ContentDocumentView<TFields>>> {
  if (!hasPermission(caller, "content:read")) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  await deps.ensureContentIndexes(collection);

  let filter: Record<string, unknown>;
  if (isFixedCollection(collection)) {
    if (typeof key !== "string" || key.trim() === "") {
      return { ok: false, reason: "not-found" };
    }
    if (!isVisibleFixedEntry(collection, { machineName: key })) {
      return { ok: false, reason: "not-found" };
    }
    filter = { "draft.machineName": key };
  } else if (collection === "posts" || collection === "sermons") {
    if (typeof key !== "string" || key.trim() === "") {
      return { ok: false, reason: "not-found" };
    }
    filter = { "draft.slug": key };
  } else if (collection === "topics") {
    if (typeof key === "string") {
      if (key.trim() === "") return { ok: false, reason: "not-found" };
      filter = { "draft.slug.es-AR": key };
    } else if ("locale" in key && "slug" in key) {
      if (
        !(LOCALES as readonly string[]).includes(key.locale) ||
        key.slug.trim() === ""
      ) {
        return { ok: false, reason: "not-found" };
      }
      filter = { [`draft.slug.${key.locale}`]: key.slug };
    } else {
      return { ok: false, reason: "not-found" };
    }
  } else {
    // bible_verses
    let normalizedKey: string;
    if (typeof key === "string") {
      if (key.trim() === "") return { ok: false, reason: "not-found" };
      normalizedKey = key;
    } else if ("book" in key) {
      try {
        normalizedKey = bibleVerseKey(key);
      } catch {
        return { ok: false, reason: "not-found" };
      }
    } else {
      return { ok: false, reason: "not-found" };
    }
    filter = { _naturalKey: normalizedKey };
  }

  const raw = (await deps
    .getContentDb()
    .collection(collection)
    .findOne(filter)) as StoredContentEnvelope<TFields> | null;

  if (!raw) return { ok: false, reason: "not-found" };
  if (!isVisibleFixedEntry(collection, asRecord(raw.draft))) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, ...toContentDocView(raw) };
}

export interface ListContentOptions {
  readonly status?: ContentStatus;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function listContent<TFields>(
  caller: ContentCaller,
  collection: ContentCollectionName,
  options: ListContentOptions = {},
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<
  ContentResult<{
    readonly items: ContentDocumentView<TFields>[];
    readonly total: number;
  }>
> {
  if (!hasPermission(caller, "content:read")) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  await deps.ensureContentIndexes(collection);
  const rawDocs = (await deps
    .getContentDb()
    .collection(collection)
    .find({})
    .toArray()) as unknown as StoredContentEnvelope<TFields>[];

  const visible = rawDocs
    .filter((doc) => isVisibleFixedEntry(collection, asRecord(doc.draft)))
    .map((doc) => toContentDocView(doc));

  const filtered = options.status
    ? visible.filter((item) => item.status === options.status)
    : visible;

  const total = filtered.length;
  const pageSize = Math.max(1, options.pageSize ?? 25);
  const page = Math.max(1, options.page ?? 1);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { ok: true, items, total };
}

// ── Usage / Reference Queries ───────────────────────────────────────────────

async function queryContentUsagesInternal(
  target: { readonly collection: CollectionName; readonly docId: string },
  options: { readonly publishedOnly?: boolean; readonly session?: ClientSession },
  deps: ContentServiceDeps,
): Promise<ContentReferenceUsage[]> {
  const referencingCollections =
    REFERENCING_COLLECTIONS_BY_TARGET[target.collection] ?? [];
  const usages: ContentReferenceUsage[] = [];
  const targetObjectId = parseObjectId(target.docId);

  // Sequential across collections so an active ClientSession is never used in parallel.
  for (const sourceCollection of referencingCollections) {
    const filter: Record<string, unknown> = {
      "_refs.contentRefs": {
        $elemMatch: { collection: target.collection, id: target.docId },
      },
    };
    if (options.publishedOnly) {
      filter.published = { $exists: true };
    }
    if (sourceCollection === target.collection && targetObjectId) {
      filter._id = { $ne: targetObjectId };
    }

    const candidates = (await deps
      .getContentDb()
      .collection(sourceCollection)
      .find(filter, options.session ? { session: options.session } : undefined)
      .toArray()) as unknown as StoredContentEnvelope<Record<string, unknown>>[];

    for (const candidate of candidates) {
      const candidateId = candidate._id.toHexString();
      if (sourceCollection === target.collection && candidateId === target.docId) {
        continue;
      }

      if (options.publishedOnly) {
        if (!candidate.published) continue;
        const pubRefs = extractReferences(
          COLLECTION_META[sourceCollection].contentType,
          { draft: candidate.published, published: undefined },
        );
        const stillReferencedInPublished = pubRefs.contentRefs.some(
          (ref) =>
            ref.collection === target.collection && ref.id === target.docId,
        );
        if (!stillReferencedInPublished) continue;
      }

      usages.push({
        collection: sourceCollection,
        docId: candidateId,
        label: extractEntryLabel(
          sourceCollection,
          asRecord(candidate.draft),
          candidateId,
        ),
        isPublished: candidate.published !== undefined,
      });
    }
  }

  return usages;
}

export async function findContentUsages(
  caller: ContentCaller,
  target: { readonly collection: CollectionName; readonly docId: string },
  options: { readonly publishedOnly?: boolean } = {},
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<{ readonly usedBy: ContentReferenceUsage[] }>> {
  if (!hasPermission(caller, "content:read")) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const usedBy = await queryContentUsagesInternal(target, options, deps);
  return { ok: true, usedBy };
}

/**
 * Finds every content document referencing `mediaId` in either `draft` or
 * `published` snapshots across both locales.
 *
 * Accessible to callers holding `content:read` OR `media:manage` (`ICR-196` AC5/AC7).
 */
export async function findMediaUsages(
  caller: ContentCaller,
  mediaId: string,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<{ readonly usedBy: ContentReferenceUsage[] }>> {
  if (!hasAnyPermission(caller, ["content:read", "media:manage"])) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const trimmed = mediaId.trim();
  if (!trimmed) return { ok: true, usedBy: [] };

  const usedBy: ContentReferenceUsage[] = [];
  for (const sourceCollection of MEDIA_REFERENCING_COLLECTIONS) {
    const docs = (await deps
      .getContentDb()
      .collection(sourceCollection)
      .find({ "_refs.mediaIds": trimmed })
      .toArray()) as unknown as StoredContentEnvelope<Record<string, unknown>>[];

    for (const doc of docs) {
      const docId = doc._id.toHexString();
      usedBy.push({
        collection: sourceCollection,
        docId,
        label: extractEntryLabel(sourceCollection, asRecord(doc.draft), docId),
        isPublished: doc.published !== undefined,
      });
    }
  }

  return { ok: true, usedBy };
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateContentInput<TFields> {
  readonly collection: ContentCollectionName;
  readonly draft: TFields;
}

export async function createContent<TFields>(
  caller: ContentCaller,
  input: CreateContentInput<TFields>,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<ContentDocumentView<TFields>>> {
  if (isFixedCollection(input.collection)) {
    return {
      ok: false,
      reason: "operation-not-allowed",
      detail: "fixed-entry",
    };
  }

  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const incomingRecord = asRecord(input.draft);
  if (
    input.collection === "topics" &&
    incomingRecord.protected === true &&
    !hasPermission(caller, "content:publish-protected")
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    };
  }

  const concreteType = resolveConcreteType(input.collection, incomingRecord);
  if (!concreteType) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { kind: ["Invalid content type"] },
    };
  }

  const parsed = CONTENT_SCHEMAS[concreteType].draft.safeParse(input.draft);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(parsed.error),
    };
  }

  await deps.ensureContentIndexes(input.collection);

  const cleanDraft = stripUndefinedDeep(parsed.data) as TFields;
  const cleanDraftRecord = asRecord(cleanDraft);
  const refs = extractReferences(concreteType, {
    draft: cleanDraft,
    published: undefined,
  });
  const naturalKey = computeNaturalKey(input.collection, cleanDraftRecord);
  const actor = getCallerActor(caller);

  return deps.withContentTransaction(async (session) => {
    const refFailure = await lockAndVerifyContentRefs(
      refs.contentRefs,
      session,
      deps,
    );
    if (refFailure) {
      await session.abortTransaction();
      return refFailure;
    }

    const now = deps.now();
    const toInsert: Omit<StoredContentEnvelope<TFields>, "_id"> = {
      draft: cleanDraft,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
      updatedByLabel: actor.label,
      ...(naturalKey !== undefined && { _naturalKey: naturalKey }),
      _refs: refs,
    };

    try {
      const insertRes = await deps
        .getContentDb()
        .collection(input.collection)
        .insertOne(toInsert, { session });

      const stored: StoredContentEnvelope<TFields> = {
        ...toInsert,
        _id: insertRes.insertedId,
      };
      const docId = stored._id.toHexString();

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "content.create",
          collection: input.collection,
          docId,
          ...(naturalKey !== undefined && { naturalKey }),
          changedFields: Object.keys(cleanDraftRecord).sort(),
          revision: 1,
        },
        session,
      );

      return { ok: true, ...toContentDocView(stored) };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        await session.abortTransaction();
        return mapDuplicateKeyToFailure(error);
      }
      throw error;
    }
  });
}

// ── Save Draft ──────────────────────────────────────────────────────────────

export interface SaveDraftInput<TFields> {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly patch: Partial<TFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

export interface SaveDraftSuccess<TFields> extends ContentDocumentView<TFields> {
  readonly changedFields: string[];
  readonly noOp: boolean;
}

export async function saveDraft<TFields>(
  caller: ContentCaller,
  input: SaveDraftInput<TFields>,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<SaveDraftSuccess<TFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  await deps.ensureContentIndexes(input.collection);

  const patchRecord = asRecord(input.patch);
  const actor = getCallerActor(caller);

  return deps.withContentTransaction(async (session) => {
    const col = deps.getContentDb().collection(input.collection);
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredContentEnvelope<TFields> | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const existingDraftRecord = asRecord(existing.draft);
    if (!isVisibleFixedEntry(input.collection, existingDraftRecord)) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Optimistic concurrency check BEFORE any write
    if (!input.overwrite && existing.revision !== input.expectedRevision) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "conflict",
        updatedBy: existing.updatedBy,
        ...(existing.updatedByLabel !== undefined && {
          updatedByLabel: existing.updatedByLabel,
        }),
        updatedAt: existing.updatedAt,
        currentRevision: existing.revision,
      };
    }

    // Protected toggle guard (downgrade-proof in EITHER direction, AC6)
    if (
      isProtectedFlagToggled(
        input.collection,
        existingDraftRecord,
        patchRecord,
      ) &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }

    const { changedFields, setPatch, unsetFields } = diffChangedFields(
      existingDraftRecord,
      patchRecord,
    );

    // Zero changed fields -> pure no-op: no DB write, no revision bump, no audit row (AC5)
    if (changedFields.length === 0) {
      return {
        ok: true,
        ...toContentDocView(existing),
        changedFields: [],
        noOp: true,
      };
    }

    // Fixed-entry structural immutability checks (F §2.8, §6)
    const immutableViolation = findImmutableFieldViolation(
      input.collection,
      existingDraftRecord,
      setPatch,
      unsetFields,
    );
    if (immutableViolation) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "operation-not-allowed",
        detail: "immutable-field",
        field: immutableViolation,
      };
    }

    // Resolve concrete schema (for `globals`, derived from `existing.draft.kind`)
    const concreteType = resolveConcreteType(
      input.collection,
      existingDraftRecord,
    );
    if (!concreteType) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { kind: ["Invalid global kind"] },
      };
    }

    // Validate ONLY changed non-undefined fields against `.update` schema (H #5)
    let parsedSetPatch: Record<string, unknown> = {};
    if (Object.keys(setPatch).length > 0) {
      const parsed = CONTENT_SCHEMAS[concreteType].update.safeParse(setPatch);
      if (!parsed.success) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "invalid",
          fieldErrors: formatZodFieldErrors(parsed.error),
        };
      }
      parsedSetPatch = stripUndefinedDeep(asRecord(parsed.data));
    }

    // Ensure unsetFields do not remove required draft keys (e.g. `title`, `book`, `name`)
    if (unsetFields.length > 0) {
      const candidateWithoutUnset: Record<string, unknown> = {
        ...existingDraftRecord,
        ...parsedSetPatch,
      };
      for (const key of unsetFields) {
        delete candidateWithoutUnset[key];
      }
      // Validate only the cleared keys aren't required by running draft schema on
      // the minimal non-rich-text structure if any unset field is present
      const unsetProbe: Record<string, unknown> = {};
      for (const k of Object.keys(candidateWithoutUnset)) {
        unsetProbe[k] = candidateWithoutUnset[k];
      }
      const probeCheck =
        CONTENT_SCHEMAS[concreteType].draft.safeParse(unsetProbe);
      if (!probeCheck.success) {
        const unsetErrors = probeCheck.error.issues.filter((issue) =>
          unsetFields.includes(String(issue.path[0])),
        );
        if (unsetErrors.length > 0) {
          await session.abortTransaction();
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of unsetErrors) {
            const pathKey = issue.path.map(String).join(".") || "_root";
            fieldErrors[pathKey] = [...(fieldErrors[pathKey] ?? []), issue.message];
          }
          return { ok: false, reason: "invalid", fieldErrors };
        }
      }
    }

    // Build next merged draft in memory for cross-field checks, _refs, and _naturalKey
    const nextDraftRecord: Record<string, unknown> = {
      ...existingDraftRecord,
      ...parsedSetPatch,
    };
    for (const key of unsetFields) {
      delete nextDraftRecord[key];
    }

    // Cross-field range invariant on bible_verses when only one bound changed
    if (
      input.collection === "bible_verses" &&
      typeof nextDraftRecord.fromVerse === "number" &&
      typeof nextDraftRecord.toVerse === "number" &&
      nextDraftRecord.toVerse < nextDraftRecord.fromVerse
    ) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: {
          toVerse: [
            "Ending verse must be greater than or equal to starting verse",
          ],
        },
      };
    }

    const now = deps.now();
    const refs = extractReferences(concreteType, {
      draft: nextDraftRecord,
      published: existing.published ? asRecord(existing.published) : undefined,
    });
    const addedRefs = findAddedContentRefs(
      existing._refs?.contentRefs ?? [],
      refs.contentRefs,
      { collection: input.collection, docId: input.docId },
    );
    const refFailure = await lockAndVerifyContentRefs(addedRefs, session, deps);
    if (refFailure) {
      await session.abortTransaction();
      return refFailure;
    }

    const naturalKey = computeNaturalKey(input.collection, nextDraftRecord);

    const setFields: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: actor.id,
      updatedByLabel: actor.label,
      _refs: refs,
    };
    const unsetDoc: Record<string, ""> = {};

    for (const [key, val] of Object.entries(parsedSetPatch)) {
      setFields[`draft.${key}`] = val;
    }
    for (const key of unsetFields) {
      unsetDoc[`draft.${key}`] = "";
    }
    if (naturalKey !== undefined) {
      setFields._naturalKey = naturalKey;
    } else if (existing._naturalKey !== undefined) {
      unsetDoc._naturalKey = "";
    }

    const updateFilter: Record<string, unknown> = { _id: objectId };
    if (!input.overwrite) {
      updateFilter.revision = input.expectedRevision;
    }

    const updateOp: Record<string, unknown> = {
      $set: setFields,
      $inc: { revision: 1 },
      ...(Object.keys(unsetDoc).length > 0 && { $unset: unsetDoc }),
    };

    try {
      const updated = (await col.findOneAndUpdate(updateFilter, updateOp, {
        returnDocument: "after",
        session,
      })) as StoredContentEnvelope<TFields> | null;

      if (!updated) {
        const latest = (await col.findOne(
          { _id: objectId },
          { session },
        )) as StoredContentEnvelope<TFields> | null;
        await session.abortTransaction();
        if (!latest) return { ok: false, reason: "not-found" };
        return {
          ok: false,
          reason: "conflict",
          updatedBy: latest.updatedBy,
          ...(latest.updatedByLabel !== undefined && {
            updatedByLabel: latest.updatedByLabel,
          }),
          updatedAt: latest.updatedAt,
          currentRevision: latest.revision,
        };
      }

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "content.save",
          collection: input.collection,
          docId: input.docId,
          ...(naturalKey !== undefined && { naturalKey }),
          changedFields,
          revision: updated.revision,
          ...(input.overwrite ? { meta: { overwrite: true } } : {}),
        },
        session,
      );

      return {
        ok: true,
        ...toContentDocView(updated),
        changedFields,
        noOp: false,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        await session.abortTransaction();
        return mapDuplicateKeyToFailure(error);
      }
      throw error;
    }
  });
}

// ── Publish (with atomic cascade + post-commit revalidation) ────────────────

export interface PublishContentInput<TFields> {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  /** Optional unsaved edits saved before strict publish validation (`F` §2.4-2.5). */
  readonly draftPatch?: Partial<TFields>;
  /** Caller opt-in for subscriber email on first publish of post/sermon. */
  readonly notify?: boolean;
  /** Reserved for optional protected-publish confirmation tick (Q2). */
  readonly approvedConfirmed?: boolean;
}

export interface PublishContentSuccess<TFields>
  extends ContentDocumentView<TFields> {
  readonly revalidated: boolean;
  readonly revalidateReason?: RevalidateFailureReason;
  readonly cascaded: ContentReference[];
  readonly notified: boolean;
}

export async function publishContent<TFields>(
  caller: ContentCaller,
  input: PublishContentInput<TFields>,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<PublishContentSuccess<TFields>>> {
  if (!hasPermission(caller, "content:publish")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  if (
    COLLECTION_META[input.collection].isProtectedByType &&
    !hasPermission(caller, "content:publish-protected")
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  let revisionToPublish = input.expectedRevision;

  // F §2.4-2.5: "Publish saves first" so a strict-publish validation error
  // still leaves the editor's draft safely saved.
  if (input.draftPatch && Object.keys(asRecord(input.draftPatch)).length > 0) {
    const saved = await saveDraft(
      caller,
      {
        collection: input.collection,
        docId: input.docId,
        patch: input.draftPatch,
        expectedRevision: input.expectedRevision,
        overwrite: input.overwrite,
      },
      deps,
    );
    if (!saved.ok) return saved;
    revisionToPublish = saved.doc.revision;
  }

  await deps.ensureContentIndexes(input.collection);

  const actor = getCallerActor(caller);
  const isEmailSwitchOn = deps.isPublishEmailsEnabled();

  type PublishTxOutcome =
    | {
        readonly ok: true;
        readonly view: ContentDocumentView<TFields>;
        readonly cascaded: ContentReference[];
        readonly shouldNotify: boolean;
      }
    | Extract<ContentResult<never>, { ok: false }>;

  const txOutcome: PublishTxOutcome = await deps.withContentTransaction(
    async (session) => {
      const col = deps.getContentDb().collection(input.collection);
      const existing = (await col.findOne(
        { _id: objectId },
        { session },
      )) as StoredContentEnvelope<TFields> | null;

      if (!existing) {
        await session.abortTransaction();
        return { ok: false, reason: "not-found" };
      }

      const existingDraftRecord = asRecord(existing.draft);
      const existingPublishedRecord = existing.published
        ? asRecord(existing.published)
        : undefined;

      if (!isVisibleFixedEntry(input.collection, existingDraftRecord)) {
        await session.abortTransaction();
        return { ok: false, reason: "not-found" };
      }

      if (!input.overwrite && existing.revision !== revisionToPublish) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "conflict",
          updatedBy: existing.updatedBy,
          ...(existing.updatedByLabel !== undefined && {
            updatedByLabel: existing.updatedByLabel,
          }),
          updatedAt: existing.updatedAt,
          currentRevision: existing.revision,
        };
      }

      // Downgrade-proof protected gate (AC6): checks BOTH published and draft!
      const isProtected = isEntryProtected(
        input.collection,
        existingDraftRecord,
        existingPublishedRecord,
      );
      if (isProtected && !hasPermission(caller, "content:publish-protected")) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "forbidden",
          requiredPermission: "content:publish-protected",
        };
      }

      if (
        isProtected &&
        shouldRequireProtectedApproval() &&
        input.approvedConfirmed !== true
      ) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "invalid",
          fieldErrors: {
            approvedConfirmed: [
              "Protected content publish requires explicit review confirmation",
            ],
          },
        };
      }

      const concreteType = resolveConcreteType(
        input.collection,
        existingDraftRecord,
      );
      if (!concreteType) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "invalid",
          fieldErrors: { kind: ["Invalid content type"] },
        };
      }

      // Strict publishable schema check (AC4)
      const parsed = CONTENT_SCHEMAS[concreteType].publishable.safeParse(
        existing.draft,
      );
      if (!parsed.success) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "invalid",
          fieldErrors: formatZodFieldErrors(parsed.error),
        };
      }

      const publishableDraft = stripUndefinedDeep(parsed.data) as TFields;
      const publishableRecord = asRecord(publishableDraft);
      const now = deps.now();

      // Lock and verify every referenced content entry inside this transaction
      // so concurrent delete/unpublish of any target conflicts and retries.
      const draftRefs = extractReferences(concreteType, {
        draft: publishableDraft,
        published: undefined,
      });
      const nonSelfDraftRefs = draftRefs.contentRefs.filter(
        (ref) => !(ref.collection === input.collection && ref.id === input.docId),
      );
      const refFailure = await lockAndVerifyContentRefs(
        nonSelfDraftRefs,
        session,
        deps,
      );
      if (refFailure) {
        await session.abortTransaction();
        return refFailure;
      }

      // Atomic cascade publish of NEVER-PUBLISHED referenced `authors` & `bible_verses` (AC4, F §2.6)
      const cascadeTargets = nonSelfDraftRefs.filter(
        (ref) => ref.collection === "authors" || ref.collection === "bible_verses",
      );
      const cascaded: ContentReference[] = [];

      for (const ref of cascadeTargets) {
        const refObjectId = parseObjectId(ref.id);
        if (!refObjectId) {
          await session.abortTransaction();
          return {
            ok: false,
            reason: "invalid",
            fieldErrors: {
              [ref.collection]: [`Referenced ${ref.collection} id "${ref.id}" is invalid`],
            },
          };
        }

        const refCollectionName = ref.collection as "authors" | "bible_verses";
        const refCol = deps.getContentDb().collection(refCollectionName);
        const refDoc = (await refCol.findOne(
          { _id: refObjectId },
          { session },
        )) as StoredContentEnvelope<Record<string, unknown>> | null;

        if (!refDoc) {
          await session.abortTransaction();
          return {
            ok: false,
            reason: "invalid",
            fieldErrors: {
              [refCollectionName]: [
                `Referenced ${refCollectionName} entry "${ref.id}" does not exist`,
              ],
            },
          };
        }

        // Only cascade NEVER-PUBLISHED entries (not already-published entries with pending edits)
        if (
          refDoc.published !== undefined ||
          refDoc.firstPublishedAt !== undefined
        ) {
          continue;
        }

        const refType = COLLECTION_META[refCollectionName].contentType;
        const refParsed = CONTENT_SCHEMAS[refType].publishable.safeParse(
          refDoc.draft,
        );
        if (!refParsed.success) {
          await session.abortTransaction();
          return {
            ok: false,
            reason: "invalid",
            fieldErrors: formatZodFieldErrors(
              refParsed.error,
              `cascade.${refCollectionName}.${ref.id}`,
            ),
          };
        }

        const cleanRefDraft = stripUndefinedDeep(asRecord(refParsed.data));
        const refNaturalKey = computeNaturalKey(refCollectionName, cleanRefDraft);
        const refExtracted = extractReferences(refType, {
          draft: cleanRefDraft,
          published: cleanRefDraft,
        });

        const updatedRef = (await refCol.findOneAndUpdate(
          { _id: refObjectId },
          {
            $set: {
              draft: cleanRefDraft,
              published: cleanRefDraft,
              publishedAt: now,
              firstPublishedAt: now,
              updatedAt: now,
              updatedBy: actor.id,
              updatedByLabel: actor.label,
              ...(refNaturalKey !== undefined && { _naturalKey: refNaturalKey }),
              _refs: refExtracted,
            },
            $inc: { revision: 1 },
          },
          { returnDocument: "after", session },
        )) as StoredContentEnvelope<Record<string, unknown>> | null;

        await deps.appendContentAuditEntry(
          {
            actorId: actor.id,
            actorLabel: actor.label,
            actorKind: actor.kind,
            action: "content.cascade-publish",
            collection: refCollectionName,
            docId: ref.id,
            ...(refNaturalKey !== undefined && { naturalKey: refNaturalKey }),
            changedFields: Object.keys(cleanRefDraft).sort(),
            revision: updatedRef?.revision ?? refDoc.revision + 1,
            meta: {
              cascadedFrom: {
                collection: input.collection,
                docId: input.docId,
              },
            },
          },
          session,
        );

        cascaded.push({ collection: refCollectionName, id: ref.id });
      }

      const isFirstPublish = existing.firstPublishedAt === undefined;
      const shouldNotify = shouldNotifySubscribers({
        collection: input.collection,
        isFirstPublish,
        callerNotify: Boolean(input.notify),
        isEmailSwitchEnabled: isEmailSwitchOn,
      });

      const changedFields = existingPublishedRecord
        ? diffSnapshotFields(existingPublishedRecord, publishableRecord)
        : Object.keys(publishableRecord).sort();

      const parentNaturalKey = computeNaturalKey(
        input.collection,
        publishableRecord,
      );
      const parentRefs = extractReferences(concreteType, {
        draft: publishableDraft,
        published: publishableDraft,
      });

      const updateFilter: Record<string, unknown> = { _id: objectId };
      if (!input.overwrite) {
        updateFilter.revision = revisionToPublish;
      }

      try {
        const updated = (await col.findOneAndUpdate(
          updateFilter,
          {
            $set: {
              draft: publishableDraft,
              published: publishableDraft,
              publishedAt: now,
              ...(isFirstPublish && { firstPublishedAt: now }),
              updatedAt: now,
              updatedBy: actor.id,
              updatedByLabel: actor.label,
              ...(parentNaturalKey !== undefined && {
                _naturalKey: parentNaturalKey,
              }),
              _refs: parentRefs,
            },
            $inc: { revision: 1 },
          },
          { returnDocument: "after", session },
        )) as StoredContentEnvelope<TFields> | null;

        if (!updated) {
          const latest = (await col.findOne(
            { _id: objectId },
            { session },
          )) as StoredContentEnvelope<TFields> | null;
          await session.abortTransaction();
          if (!latest) return { ok: false, reason: "not-found" };
          return {
            ok: false,
            reason: "conflict",
            updatedBy: latest.updatedBy,
            ...(latest.updatedByLabel !== undefined && {
              updatedByLabel: latest.updatedByLabel,
            }),
            updatedAt: latest.updatedAt,
            currentRevision: latest.revision,
          };
        }

        await deps.appendContentAuditEntry(
          {
            actorId: actor.id,
            actorLabel: actor.label,
            actorKind: actor.kind,
            action: isProtected
              ? "content.publish-protected"
              : "content.publish",
            collection: input.collection,
            docId: input.docId,
            ...(parentNaturalKey !== undefined && {
              naturalKey: parentNaturalKey,
            }),
            changedFields,
            revision: updated.revision,
            meta: {
              ...(input.overwrite ? { overwrite: true } : {}),
              ...(input.notify !== undefined
                ? { notifyRequested: input.notify }
                : {}),
              ...(shouldNotify ? { notifySent: true } : {}),
              ...(input.approvedConfirmed !== undefined
                ? { approvedConfirmed: input.approvedConfirmed }
                : {}),
            },
          },
          session,
        );

        return {
          ok: true,
          view: toContentDocView(updated),
          cascaded,
          shouldNotify,
        };
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          await session.abortTransaction();
          return mapDuplicateKeyToFailure(error);
        }
        throw error;
      }
    },
  );

  if (!txOutcome.ok) return txOutcome;

  // Post-commit site refresh — NEVER inside withContentTransaction (AC7)
  const reval = await deps.revalidateWebsite({
    type: COLLECTION_META[input.collection].contentType,
    id: input.docId,
    notify: txOutcome.shouldNotify,
  });

  return {
    ok: true,
    ...txOutcome.view,
    revalidated: reval.ok,
    ...(!reval.ok && { revalidateReason: reval.reason }),
    cascaded: txOutcome.cascaded,
    notified: reval.ok ? txOutcome.shouldNotify : false,
  };
}

// ── Unpublish ───────────────────────────────────────────────────────────────

export interface UnpublishContentInput {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

export interface UnpublishContentSuccess<TFields>
  extends ContentDocumentView<TFields> {
  readonly revalidated: boolean;
  readonly revalidateReason?: RevalidateFailureReason;
}

export async function unpublishContent<TFields>(
  caller: ContentCaller,
  input: UnpublishContentInput,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<UnpublishContentSuccess<TFields>>> {
  const meta = COLLECTION_META[input.collection];
  if (!meta.canUnpublish) {
    return {
      ok: false,
      reason: "operation-not-allowed",
      detail: meta.kind === "fixed" ? "fixed-entry" : "library-entry",
    };
  }

  if (!hasPermission(caller, "content:publish")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  await deps.ensureContentIndexes(input.collection);
  const actor = getCallerActor(caller);

  const txOutcome = await deps.withContentTransaction<
    ContentResult<ContentDocumentView<TFields>>
  >(async (session) => {
    const col = deps.getContentDb().collection(input.collection);
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredContentEnvelope<TFields> | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const existingDraftRecord = asRecord(existing.draft);
    const existingPublishedRecord = existing.published
      ? asRecord(existing.published)
      : undefined;

    if (
      isEntryProtected(
        input.collection,
        existingDraftRecord,
        existingPublishedRecord,
      ) &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }

    if (existing.published === undefined) {
      await session.abortTransaction();
      return { ok: false, reason: "not-published" };
    }

    if (!input.overwrite && existing.revision !== input.expectedRevision) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "conflict",
        updatedBy: existing.updatedBy,
        ...(existing.updatedByLabel !== undefined && {
          updatedByLabel: existing.updatedByLabel,
        }),
        updatedAt: existing.updatedAt,
        currentRevision: existing.revision,
      };
    }

    // Acquire a target-side write lock before checking published dependents so
    // any concurrent publish referencing this entry conflicts and retries.
    const guardTouch = await col.updateOne(
      { _id: objectId },
      { $inc: { _refGuardRev: 1 } },
      { session },
    );
    if ((guardTouch.matchedCount ?? 0) === 0) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Refuse unpublish if another PUBLISHED entry depends on this entry (Edge case 4)
    const publishedDependents = await queryContentUsagesInternal(
      { collection: input.collection, docId: input.docId },
      { publishedOnly: true, session },
      deps,
    );
    if (publishedDependents.length > 0) {
      await session.abortTransaction();
      return { ok: false, reason: "in-use", usedBy: publishedDependents };
    }

    const now = deps.now();
    const refs = extractReferences(meta.contentType, {
      draft: existing.draft,
      published: undefined,
    });
    const naturalKey = computeNaturalKey(input.collection, existingDraftRecord);

    const updateFilter: Record<string, unknown> = { _id: objectId };
    if (!input.overwrite) {
      updateFilter.revision = input.expectedRevision;
    }

    // NEVER unset `firstPublishedAt` so a future re-publish never re-triggers first-publish emails (Edge case 8)
    const updated = (await col.findOneAndUpdate(
      updateFilter,
      {
        $unset: { published: "", publishedAt: "" },
        $set: {
          updatedAt: now,
          updatedBy: actor.id,
          updatedByLabel: actor.label,
          _refs: refs,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: "after", session },
    )) as StoredContentEnvelope<TFields> | null;

    if (!updated) {
      const latest = (await col.findOne(
        { _id: objectId },
        { session },
      )) as StoredContentEnvelope<TFields> | null;
      await session.abortTransaction();
      if (!latest) return { ok: false, reason: "not-found" };
      return {
        ok: false,
        reason: "conflict",
        updatedBy: latest.updatedBy,
        ...(latest.updatedByLabel !== undefined && {
          updatedByLabel: latest.updatedByLabel,
        }),
        updatedAt: latest.updatedAt,
        currentRevision: latest.revision,
      };
    }

    await deps.appendContentAuditEntry(
      {
        actorId: actor.id,
        actorLabel: actor.label,
        actorKind: actor.kind,
        action: "content.unpublish",
        collection: input.collection,
        docId: input.docId,
        ...(naturalKey !== undefined && { naturalKey }),
        changedFields: ["published"],
        revision: updated.revision,
        ...(input.overwrite ? { meta: { overwrite: true } } : {}),
      },
      session,
    );

    return { ok: true, ...toContentDocView(updated) };
  });

  if (!txOutcome.ok) return txOutcome;

  const reval = await deps.revalidateWebsite({
    type: meta.contentType,
    id: input.docId,
    notify: false,
  });

  return {
    ok: true,
    doc: txOutcome.doc,
    status: txOutcome.status,
    ...(txOutcome.updatedByLabel !== undefined && {
      updatedByLabel: txOutcome.updatedByLabel,
    }),
    revalidated: reval.ok,
    ...(!reval.ok && { revalidateReason: reval.reason }),
  };
}

// ── Discard Changes ─────────────────────────────────────────────────────────

export interface DiscardChangesInput {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

export interface DiscardChangesSuccess<TFields>
  extends ContentDocumentView<TFields> {
  readonly noOp: boolean;
}

export async function discardChanges<TFields>(
  caller: ContentCaller,
  input: DiscardChangesInput,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<DiscardChangesSuccess<TFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  await deps.ensureContentIndexes(input.collection);
  const actor = getCallerActor(caller);

  return deps.withContentTransaction(async (session) => {
    const col = deps.getContentDb().collection(input.collection);
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredContentEnvelope<TFields> | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    if (!isVisibleFixedEntry(input.collection, asRecord(existing.draft))) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    if (!input.overwrite && existing.revision !== input.expectedRevision) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "conflict",
        updatedBy: existing.updatedBy,
        ...(existing.updatedByLabel !== undefined && {
          updatedByLabel: existing.updatedByLabel,
        }),
        updatedAt: existing.updatedAt,
        currentRevision: existing.revision,
      };
    }

    if (existing.published === undefined) {
      await session.abortTransaction();
      return { ok: false, reason: "nothing-to-discard" };
    }

    const existingDraftRecord = asRecord(existing.draft);
    const publishedRecord = asRecord(existing.published);

    // AC6: Discarding changes that would flip a topic's `protected` flag in either
    // direction (including when `published.protected` is absent vs `draft.protected: true`)
    // requires `content:publish-protected`.
    if (
      isProtectedFlagToggled(input.collection, existingDraftRecord, {
        protected: publishedRecord.protected,
      }) &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }

    if (canonicalEqual(existing.draft, existing.published)) {
      return { ok: true, ...toContentDocView(existing), noOp: true };
    }

    const changedFields = diffSnapshotFields(
      existingDraftRecord,
      publishedRecord,
    );

    const concreteType = resolveConcreteType(input.collection, publishedRecord);
    const refs = extractReferences(
      concreteType ?? COLLECTION_META[input.collection].contentType,
      { draft: existing.published, published: existing.published },
    );
    const addedRefs = findAddedContentRefs(
      existing._refs?.contentRefs ?? [],
      refs.contentRefs,
      { collection: input.collection, docId: input.docId },
    );
    const refFailure = await lockAndVerifyContentRefs(addedRefs, session, deps);
    if (refFailure) {
      await session.abortTransaction();
      return refFailure;
    }

    const naturalKey = computeNaturalKey(input.collection, publishedRecord);
    const now = deps.now();

    const updateFilter: Record<string, unknown> = { _id: objectId };
    if (!input.overwrite) {
      updateFilter.revision = input.expectedRevision;
    }

    try {
      const updated = (await col.findOneAndUpdate(
        updateFilter,
        {
          $set: {
            draft: existing.published,
            updatedAt: now,
            updatedBy: actor.id,
            updatedByLabel: actor.label,
            ...(naturalKey !== undefined && { _naturalKey: naturalKey }),
            _refs: refs,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: "after", session },
      )) as StoredContentEnvelope<TFields> | null;

      if (!updated) {
        const latest = (await col.findOne(
          { _id: objectId },
          { session },
        )) as StoredContentEnvelope<TFields> | null;
        await session.abortTransaction();
        if (!latest) return { ok: false, reason: "not-found" };
        return {
          ok: false,
          reason: "conflict",
          updatedBy: latest.updatedBy,
          ...(latest.updatedByLabel !== undefined && {
            updatedByLabel: latest.updatedByLabel,
          }),
          updatedAt: latest.updatedAt,
          currentRevision: latest.revision,
        };
      }

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "content.discard",
          collection: input.collection,
          docId: input.docId,
          ...(naturalKey !== undefined && { naturalKey }),
          changedFields,
          revision: updated.revision,
          ...(input.overwrite ? { meta: { overwrite: true } } : {}),
        },
        session,
      );

      return { ok: true, ...toContentDocView(updated), noOp: false };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        await session.abortTransaction();
        return mapDuplicateKeyToFailure(error);
      }
      throw error;
    }
  });
}

// ── Guarded Delete ──────────────────────────────────────────────────────────

export interface DeleteContentInput {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

export type DeleteContentSuccess =
  | { readonly docId: string; readonly wasPublished: false }
  | {
      readonly docId: string;
      readonly wasPublished: true;
      readonly revalidated: boolean;
      readonly revalidateReason?: RevalidateFailureReason;
    };

export async function deleteContent(
  caller: ContentCaller,
  input: DeleteContentInput,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<DeleteContentSuccess>> {
  const meta = COLLECTION_META[input.collection];
  if (meta.kind === "fixed") {
    return {
      ok: false,
      reason: "operation-not-allowed",
      detail: "fixed-entry",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  await deps.ensureContentIndexes(input.collection);
  const actor = getCallerActor(caller);

  const txOutcome = await deps.withContentTransaction<
    ContentResult<{ readonly wasPublished: boolean }>
  >(async (session) => {
    const col = deps.getContentDb().collection(input.collection);
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredContentEnvelope<Record<string, unknown>> | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const existingDraftRecord = asRecord(existing.draft);
    const existingPublishedRecord = existing.published
      ? asRecord(existing.published)
      : undefined;
    const wasPublished = existing.published !== undefined;

    // Protected content requires `content:publish-protected` (AC6)
    if (
      isEntryProtected(
        input.collection,
        existingDraftRecord,
        existingPublishedRecord,
      ) &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }

    // F §2.5 & §6: Published posts, sermons, and topics must be unpublished first
    if (wasPublished && !meta.canDeletePublished) {
      await session.abortTransaction();
      return { ok: false, reason: "published-must-unpublish" };
    }

    // Q4 Option A: published library entries require `content:publish`;
    // unpublished non-protected entries require `content:write`.
    const requiredPermission = wasPublished
      ? ("content:publish" as const)
      : ("content:write" as const);
    if (!hasPermission(caller, requiredPermission)) {
      await session.abortTransaction();
      return { ok: false, reason: "forbidden", requiredPermission };
    }

    if (!input.overwrite && existing.revision !== input.expectedRevision) {
      await session.abortTransaction();
      return {
        ok: false,
        reason: "conflict",
        updatedBy: existing.updatedBy,
        ...(existing.updatedByLabel !== undefined && {
          updatedByLabel: existing.updatedByLabel,
        }),
        updatedAt: existing.updatedAt,
        currentRevision: existing.revision,
      };
    }

    // Acquire a target-side write lock before checking usages so any concurrent
    // write introducing a reference to this entry conflicts and retries.
    const guardTouch = await col.updateOne(
      { _id: objectId },
      { $inc: { _refGuardRev: 1 } },
      { session },
    );
    if ((guardTouch.matchedCount ?? 0) === 0) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Refuse delete if referenced anywhere in draft OR published (Edge case 5)
    const usages = await queryContentUsagesInternal(
      { collection: input.collection, docId: input.docId },
      { publishedOnly: false, session },
      deps,
    );
    if (usages.length > 0) {
      await session.abortTransaction();
      return { ok: false, reason: "in-use", usedBy: usages };
    }

    const deleteFilter: Record<string, unknown> = { _id: objectId };
    if (!input.overwrite) {
      deleteFilter.revision = input.expectedRevision;
    }

    const delRes = await col.deleteOne(deleteFilter, { session });
    if ((delRes.deletedCount ?? 0) === 0) {
      const latest = (await col.findOne(
        { _id: objectId },
        { session },
      )) as StoredContentEnvelope<Record<string, unknown>> | null;
      await session.abortTransaction();
      if (!latest) return { ok: false, reason: "not-found" };
      return {
        ok: false,
        reason: "conflict",
        updatedBy: latest.updatedBy,
        ...(latest.updatedByLabel !== undefined && {
          updatedByLabel: latest.updatedByLabel,
        }),
        updatedAt: latest.updatedAt,
        currentRevision: latest.revision,
      };
    }

    const naturalKey = computeNaturalKey(input.collection, existingDraftRecord);
    await deps.appendContentAuditEntry(
      {
        actorId: actor.id,
        actorLabel: actor.label,
        actorKind: actor.kind,
        action: "content.delete",
        collection: input.collection,
        docId: input.docId,
        ...(naturalKey !== undefined && { naturalKey }),
        changedFields: [],
        revision: existing.revision,
        ...(input.overwrite ? { meta: { overwrite: true } } : {}),
      },
      session,
    );

    return { ok: true, wasPublished };
  });

  if (!txOutcome.ok) return txOutcome;

  if (!txOutcome.wasPublished) {
    return { ok: true, docId: input.docId, wasPublished: false };
  }

  // Delete-of-published (unused published library entry) refreshes site post-commit (AC7)
  const reval = await deps.revalidateWebsite({
    type: meta.contentType,
    id: input.docId,
    notify: false,
  });

  return {
    ok: true,
    docId: input.docId,
    wasPublished: true,
    revalidated: reval.ok,
    ...(!reval.ok && { revalidateReason: reval.reason }),
  };
}

// ── Manual Revalidation Retry ───────────────────────────────────────────────

export async function retryRevalidation(
  caller: ContentCaller,
  collection: ContentCollectionName,
  docId: string,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<
  ContentResult<
    | { readonly revalidated: true }
    | {
        readonly revalidated: false;
        readonly revalidateReason: RevalidateFailureReason;
      }
  >
> {
  if (!hasPermission(caller, "content:publish")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const objectId = parseObjectId(docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  const exists = (await deps
    .getContentDb()
    .collection(collection)
    .findOne({ _id: objectId })) as StoredContentEnvelope<Record<string, unknown>> | null;
  if (!exists || !isVisibleFixedEntry(collection, asRecord(exists.draft))) {
    return { ok: false, reason: "not-found" };
  }

  const reval = await deps.revalidateWebsite({
    type: COLLECTION_META[collection].contentType,
    id: docId,
    notify: false, // Never risk duplicate subscriber email on retry
  });

  if (reval.ok) return { ok: true, revalidated: true };
  return { ok: true, revalidated: false, revalidateReason: reval.reason };
}

// ── Sermon PDF Background Update (ICR-200 AC4-AC6, F §2.3 & §2.10) ──────────

export interface UpdateSermonPdfMediaInput {
  readonly docId: string;
  readonly pdfSummaryMediaId: Localized<string>;
  readonly expectedContentHash: string;
}

export interface UpdateSermonPdfMediaSuccess {
  readonly updatedDraft: boolean;
  readonly updatedPublished: boolean;
  readonly previousMediaIds: string[];
  readonly revalidated: boolean;
  readonly revalidateReason?: RevalidateFailureReason;
}

function collectPdfMediaIds(
  pdf: Localized<string> | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!pdf) return ids;
  if (typeof pdf["es-AR"] === "string" && pdf["es-AR"].trim()) {
    ids.add(pdf["es-AR"].trim());
  }
  if (typeof pdf["en-US"] === "string" && pdf["en-US"].trim()) {
    ids.add(pdf["en-US"].trim());
  }
  return ids;
}

/**
 * System-owned sermon PDF attachment updater (`ICR-200` AC4–AC6, `F` §2.3/§2.10).
 *
 * - Gates `draft.pdfSummaryMediaId` on `draft.contentHash === expectedContentHash`
 *   and `published.pdfSummaryMediaId` on `published?.contentHash === expectedContentHash`.
 * - Recomputes `_refs` inside the transaction and returns `previousMediaIds`
 *   (superseded PDF media ids no longer referenced by either snapshot).
 * - Appends a `content.pdf-update` audit row WITHOUT bumping `revision` and
 *   WITHOUT overwriting human `updatedBy` / `updatedByLabel`.
 * - Revalidates post-commit ONLY when `updatedPublished === true`.
 */
export async function updateSermonPdfMedia(
  caller: ContentCaller,
  input: UpdateSermonPdfMediaInput,
  deps: ContentServiceDeps = defaultContentServiceDeps,
): Promise<ContentResult<UpdateSermonPdfMediaSuccess>> {
  if (caller.kind !== "service" || !hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const objectId = parseObjectId(input.docId);
  if (!objectId) return { ok: false, reason: "not-found" };

  const validated = CONTENT_SCHEMAS.sermon.update.safeParse({
    pdfSummaryMediaId: input.pdfSummaryMediaId,
  });
  if (!validated.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(validated.error),
    };
  }

  const cleanPdf = stripUndefinedDeep(
    (validated.data as { pdfSummaryMediaId?: Localized<string> })
      .pdfSummaryMediaId,
  );
  if (!cleanPdf) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { pdfSummaryMediaId: ["Required"] },
    };
  }

  await deps.ensureContentIndexes("sermons");
  const actor = getCallerActor(caller);

  const txOutcome = await deps.withContentTransaction<
    ContentResult<{
      readonly updatedDraft: boolean;
      readonly updatedPublished: boolean;
      readonly previousMediaIds: string[];
    }>
  >(async (session) => {
    const col = deps.getContentDb().collection("sermons");
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredContentEnvelope<SermonFields> | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const updatedDraft = existing.draft.contentHash === input.expectedContentHash;
    const updatedPublished =
      existing.published !== undefined &&
      existing.published.contentHash === input.expectedContentHash;

    if (!updatedDraft && !updatedPublished) {
      return {
        ok: true,
        updatedDraft: false,
        updatedPublished: false,
        previousMediaIds: [],
      };
    }

    const beforePdfIds = new Set<string>([
      ...collectPdfMediaIds(existing.draft.pdfSummaryMediaId),
      ...collectPdfMediaIds(existing.published?.pdfSummaryMediaId),
    ]);

    const nextDraft: SermonFields = updatedDraft
      ? { ...existing.draft, pdfSummaryMediaId: cleanPdf }
      : existing.draft;
    const nextPublished: SermonFields | undefined =
      updatedPublished && existing.published
        ? { ...existing.published, pdfSummaryMediaId: cleanPdf }
        : existing.published;

    const afterPdfIds = new Set<string>([
      ...collectPdfMediaIds(nextDraft.pdfSummaryMediaId),
      ...collectPdfMediaIds(nextPublished?.pdfSummaryMediaId),
    ]);

    const previousMediaIds = [...beforePdfIds]
      .filter((id) => !afterPdfIds.has(id))
      .sort();

    const refs = extractReferences("sermon", {
      draft: nextDraft,
      published: nextPublished,
    });

    const setFields: Record<string, unknown> = {
      _refs: refs,
    };
    if (updatedDraft) setFields["draft.pdfSummaryMediaId"] = cleanPdf;
    if (updatedPublished) setFields["published.pdfSummaryMediaId"] = cleanPdf;

    // Deliberately does NOT `$inc: { revision: 1 }` and does NOT overwrite `updatedBy` / `updatedByLabel`
    await col.updateOne({ _id: objectId }, { $set: setFields }, { session });

    const naturalKey = computeNaturalKey("sermons", asRecord(nextDraft));
    await deps.appendContentAuditEntry(
      {
        actorId: actor.id,
        actorLabel: actor.label,
        actorKind: actor.kind,
        action: "content.pdf-update",
        collection: "sermons",
        docId: input.docId,
        ...(naturalKey !== undefined && { naturalKey }),
        changedFields: ["pdfSummaryMediaId"],
        revision: existing.revision,
      },
      session,
    );

    return {
      ok: true,
      updatedDraft,
      updatedPublished,
      previousMediaIds,
    };
  });

  if (!txOutcome.ok) return txOutcome;

  if (!txOutcome.updatedPublished) {
    return {
      ok: true,
      updatedDraft: txOutcome.updatedDraft,
      updatedPublished: false,
      previousMediaIds: txOutcome.previousMediaIds,
      revalidated: false,
    };
  }

  const reval = await deps.revalidateWebsite({
    type: "sermon",
    id: input.docId,
    notify: false,
  });

  return {
    ok: true,
    updatedDraft: txOutcome.updatedDraft,
    updatedPublished: true,
    previousMediaIds: txOutcome.previousMediaIds,
    revalidated: reval.ok,
    ...(!reval.ok && { revalidateReason: reval.reason }),
  };
}
