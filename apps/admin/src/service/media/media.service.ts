import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import {
  COLLECTIONS,
  isEmptyValue,
  mediaCreateSchema,
  normalizeLocalized,
  sha256Schema,
  type Localized,
  type MediaCreateInput,
  type MediaDoc,
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
  type ContentReferenceUsage,
} from "@src/lib/content/errors";
import {
  MEDIA_REFERENCING_COLLECTIONS,
  extractEntryLabel,
  stripUndefinedDeep,
} from "@src/lib/content/guards";
import {
  findMediaUsages,
  type StoredContentEnvelope,
} from "@src/service/content/content-core.service";
import {
  CANONICAL_MEDIA_ID_RE,
  MEDIA_TYPES_BY_KIND,
  buildMediaPathname,
  getMediaSizeCapForContentType,
  isAllowedMediaContentType,
  isAllowedPublicBlobUrl,
  isMultipartUpload,
  isValidMediaPathname,
  normalizeMediaContentType,
  type AllowedMediaContentType,
  type MediaKind,
} from "@src/lib/media/policy";
import type { MediaResult } from "@src/lib/media/errors";
import {
  STORAGE_CLASS,
  delBlob,
  headBlob,
  putBlob,
} from "./storage.service";

/** Stored MongoDB document shape in `website*.media`. */
export interface StoredMediaDoc extends Omit<MediaDoc, "_id"> {
  _id: ObjectId;
}

export interface MediaServiceDeps {
  readonly getContentDb: () => Db;
  readonly withContentTransaction: typeof withContentTransaction;
  readonly appendContentAuditEntry: typeof appendContentAuditEntry;
  readonly findMediaUsages: typeof findMediaUsages;
  readonly putBlob: typeof putBlob;
  readonly headBlob: typeof headBlob;
  readonly delBlob: typeof delBlob;
  readonly ensureMediaIndexes: () => Promise<void>;
  readonly allocateObjectId: () => ObjectId;
  readonly now: () => Date;
}

let mediaIndexesPromise: Promise<void> | null = null;

export function ensureMediaIndexes(
  dbAccessor: () => Db = getContentDb,
): Promise<void> {
  mediaIndexesPromise ??= (async () => {
    const col = dbAccessor().collection(COLLECTIONS.media);
    await Promise.all([
      col.createIndex({ pathname: 1 }, { unique: true }),
      col.createIndex({ sha256: 1 }),
      col.createIndex({ contentType: 1, createdAt: -1 }),
      col.createIndex({ createdAt: -1 }),
    ]);
  })();
  return mediaIndexesPromise;
}

export function resetMediaIndexMemoForTest(): void {
  mediaIndexesPromise = null;
}

export const defaultMediaServiceDeps: MediaServiceDeps = {
  getContentDb,
  withContentTransaction,
  appendContentAuditEntry,
  findMediaUsages,
  putBlob,
  headBlob,
  delBlob,
  ensureMediaIndexes: () => ensureMediaIndexes(getContentDb),
  allocateObjectId: () => new ObjectId(),
  now: () => new Date(),
};

const MAX_SEARCH_QUERY_LENGTH = 120;
const MUTABLE_METADATA_KEYS = new Set([
  "title",
  "alt",
  "decorative",
  "caption",
  "credit",
  "durationSeconds",
]);

function toMediaDoc(stored: StoredMediaDoc): MediaDoc {
  return {
    _id: stored._id.toHexString(),
    pathname: stored.pathname,
    url: stored.url,
    filename: stored.filename,
    contentType: stored.contentType,
    size: stored.size,
    sha256: stored.sha256,
    ...(stored.width !== undefined && { width: stored.width }),
    ...(stored.height !== undefined && { height: stored.height }),
    ...(stored.durationSeconds !== undefined && {
      durationSeconds: stored.durationSeconds,
    }),
    title: stored.title,
    ...(stored.alt !== undefined && { alt: stored.alt }),
    ...(stored.decorative !== undefined && { decorative: stored.decorative }),
    ...(stored.caption !== undefined && { caption: stored.caption }),
    ...(stored.credit !== undefined && { credit: stored.credit }),
    createdBy: stored.createdBy,
    createdAt: stored.createdAt,
  };
}

function parseStrictObjectId(id: string): ObjectId | null {
  const trimmed = id.trim();
  if (!CANONICAL_MEDIA_ID_RE.test(trimmed)) return null;
  return ObjectId.createFromHexString(trimmed);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOptionalLocalized(
  value: Localized<string> | undefined,
): Localized<string> | undefined {
  if (!value) return undefined;
  const cleaned = normalizeLocalized(value);
  if (isEmptyValue(cleaned["es-AR"]) && isEmptyValue(cleaned["en-US"])) {
    return undefined;
  }
  return cleaned;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Runs a transactional media usage scan across every collection derived from
 * `@idcr/content`'s `REFERENCE_PATHS` (`MEDIA_REFERENCING_COLLECTIONS`).
 */
async function queryMediaUsagesTransactional(
  mediaId: string,
  session: ClientSession,
  deps: MediaServiceDeps,
): Promise<ContentReferenceUsage[]> {
  const usedBy: ContentReferenceUsage[] = [];
  for (const sourceCollection of MEDIA_REFERENCING_COLLECTIONS) {
    const docs = (await deps
      .getContentDb()
      .collection(sourceCollection)
      .find({ "_refs.mediaIds": mediaId }, { session })
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
  return usedBy;
}

async function collectUsedMediaIds(deps: MediaServiceDeps): Promise<Set<string>> {
  const used = new Set<string>();
  const db = deps.getContentDb();
  for (const sourceCollection of MEDIA_REFERENCING_COLLECTIONS) {
    // MongoDB Stable API v1 (strict: true) forbids `distinct`; use a projected `find` instead.
    const docs = (await db
      .collection(sourceCollection)
      .find(
        { "_refs.mediaIds.0": { $exists: true } },
        { projection: { "_refs.mediaIds": 1 } },
      )
      .toArray()) as { readonly _refs?: { readonly mediaIds?: readonly unknown[] } }[];
    for (const doc of docs) {
      const ids = doc._refs?.mediaIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === "string" && id.trim().length > 0) {
          used.add(id.trim());
        }
      }
    }
  }
  return used;
}

// ── Prepare Upload (SHA-256 dedup + deterministic pathname allocation) ──────

export interface PrepareMediaUploadInput {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
}

export type PrepareMediaUploadSuccess =
  | {
      readonly status: "duplicate";
      readonly existing: MediaDoc;
    }
  | {
      readonly status: "ready";
      readonly mediaId: string;
      readonly pathname: string;
      readonly normalizedContentType: AllowedMediaContentType;
      readonly maxBytes: number;
      readonly multipart: boolean;
    };

/**
 * Validates upload policy and checks for an existing SHA-256 duplicate BEFORE
 * the browser uploads bytes to Vercel Blob (`ICR-196` AC2 & AC4).
 * Accepts both `UserContentCaller` and `ServiceContentCaller` with `media:manage`.
 */
export async function prepareMediaUpload(
  caller: ContentCaller,
  input: PrepareMediaUploadInput,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<PrepareMediaUploadSuccess>> {
  if (!hasPermission(caller, "media:manage")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const normalizedType = normalizeMediaContentType(input.contentType);
  if (!isAllowedMediaContentType(normalizedType)) {
    return {
      ok: false,
      reason: "unsupported-type",
      contentType: input.contentType,
    };
  }

  const maxBytes = getMediaSizeCapForContentType(normalizedType);
  if (
    maxBytes === null ||
    !Number.isInteger(input.size) ||
    input.size <= 0
  ) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { size: ["Invalid file size"] },
    };
  }
  if (input.size > maxBytes) {
    return {
      ok: false,
      reason: "file-too-large",
      maxBytes,
      actualBytes: input.size,
    };
  }

  const shaParsed = sha256Schema.safeParse(input.sha256);
  if (!shaParsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { sha256: ["Invalid SHA-256 digest"] },
    };
  }
  const sha256 = shaParsed.data.toLowerCase();

  await deps.ensureMediaIndexes();
  const existing = (await deps
    .getContentDb()
    .collection<StoredMediaDoc>(COLLECTIONS.media)
    .findOne({ sha256 })) as StoredMediaDoc | null;

  if (existing) {
    return {
      ok: true,
      status: "duplicate",
      existing: toMediaDoc(existing),
    };
  }

  const mediaId = deps.allocateObjectId().toHexString();
  const pathname = buildMediaPathname(mediaId, input.filename, normalizedType);

  return {
    ok: true,
    status: "ready",
    mediaId,
    pathname,
    normalizedContentType: normalizedType,
    maxBytes,
    multipart: isMultipartUpload(normalizedType),
  };
}

// ── Confirm Client Upload (head() verification + transactional insert) ──────

export interface ConfirmMediaUploadInput {
  readonly mediaId: string;
  readonly pathname: string;
  readonly url: string;
  readonly filename: string;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly title: Localized<string>;
  readonly alt?: Localized<string>;
  readonly decorative?: boolean;
  readonly caption?: Localized<string>;
  readonly credit?: Localized<string>;
}

/**
 * Verifies a direct-to-Blob upload server-side via `head()`, removes any blob
 * that violates type/size policy (`ICR-196` Edge case #9), and inserts the
 * `media` document + `media.create` audit entry inside `withContentTransaction`.
 * Accepts both `UserContentCaller` and `ServiceContentCaller` with `media:manage`.
 */
export async function confirmMediaUpload(
  caller: ContentCaller,
  input: ConfirmMediaUploadInput,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<{ readonly doc: MediaDoc }>> {
  if (!hasPermission(caller, "media:manage")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const objectId = parseStrictObjectId(input.mediaId);
  if (!objectId) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { mediaId: ["Invalid media ID"] },
    };
  }

  const shaParsed = sha256Schema.safeParse(input.sha256);
  if (!shaParsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { sha256: ["Invalid SHA-256 digest"] },
    };
  }
  const sha256 = shaParsed.data.toLowerCase();

  if (
    !input.pathname.startsWith(`media/${input.mediaId}/`) ||
    !isAllowedPublicBlobUrl(input.url, input.pathname)
  ) {
    return {
      ok: false,
      reason: "policy-violation",
      detail: "Blob URL does not match public store host or expected pathname",
    };
  }

  // Never run head/cleanup against a blob already registered in the media library.
  const mediaCol = deps.getContentDb().collection<StoredMediaDoc>(COLLECTIONS.media);
  const alreadyRegistered = (await mediaCol.findOne({
    $or: [
      { _id: objectId },
      { pathname: input.pathname },
      { url: input.url },
    ],
  })) as StoredMediaDoc | null;
  if (alreadyRegistered) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { pathname: ["duplicate-key"] },
    };
  }

  const headRes = await deps.headBlob(STORAGE_CLASS.publicMedia, input.url);
  if (!headRes.ok) {
    if (headRes.reason === "storage-not-configured") {
      return { ok: false, reason: "storage-not-configured" };
    }
    return {
      ok: false,
      reason: "policy-violation",
      detail: "Uploaded blob could not be verified in storage",
    };
  }

  const verifiedBlob = headRes.blob;
  const verifiedType = normalizeMediaContentType(verifiedBlob.contentType);
  const cap = getMediaSizeCapForContentType(verifiedType);

  // Reject identity/path mismatches without deleting anything that may belong to another record.
  if (
    verifiedBlob.pathname !== input.pathname ||
    !isAllowedPublicBlobUrl(verifiedBlob.url, verifiedBlob.pathname)
  ) {
    return {
      ok: false,
      reason: "policy-violation",
      detail: "Uploaded blob identity did not match expected pathname",
    };
  }

  const violatesPolicy =
    !isAllowedMediaContentType(verifiedType) ||
    cap === null ||
    verifiedBlob.size <= 0 ||
    verifiedBlob.size > cap ||
    !isValidMediaPathname(verifiedBlob.pathname, input.mediaId, verifiedType);

  if (violatesPolicy) {
    // Defense-in-depth: only delete unregistered blobs so cleanup can never bypass deleteMedia guards.
    const registered = (await mediaCol.findOne({
      $or: [{ pathname: verifiedBlob.pathname }, { url: verifiedBlob.url }],
    })) as StoredMediaDoc | null;
    if (!registered) {
      await deps.delBlob(STORAGE_CLASS.publicMedia, verifiedBlob.url);
    }
    return {
      ok: false,
      reason: "policy-violation",
      detail: "Uploaded file metadata violated allowed type, size, or pathname policy",
    };
  }

  const isImage = verifiedType.startsWith("image/");
  const isAudio = verifiedType.startsWith("audio/");
  const actor = getCallerActor(caller);
  const createdAt = deps.now();

  const normalizedTitle = normalizeLocalized(input.title);
  const normalizedAlt =
    input.decorative === true ? undefined : normalizeOptionalLocalized(input.alt);
  const normalizedCaption = normalizeOptionalLocalized(input.caption);
  const normalizedCredit = normalizeOptionalLocalized(input.credit);

  const candidate: MediaCreateInput = {
    pathname: verifiedBlob.pathname,
    url: verifiedBlob.url,
    filename: input.filename.trim(),
    contentType: verifiedType,
    size: verifiedBlob.size,
    sha256,
    ...(isImage && input.width !== undefined && { width: input.width }),
    ...(isImage && input.height !== undefined && { height: input.height }),
    ...(isAudio &&
      input.durationSeconds !== undefined && {
        durationSeconds: input.durationSeconds,
      }),
    title: normalizedTitle,
    ...(normalizedAlt !== undefined && { alt: normalizedAlt }),
    ...(isImage && input.decorative === true && { decorative: true }),
    ...(normalizedCaption !== undefined && { caption: normalizedCaption }),
    ...(normalizedCredit !== undefined && { credit: normalizedCredit }),
    createdBy: actor.id,
    createdAt,
  };

  const parsed = mediaCreateSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(parsed.error),
    };
  }

  await deps.ensureMediaIndexes();

  try {
    const storedDoc: StoredMediaDoc = {
      _id: objectId,
      ...(stripUndefinedDeep(parsed.data) as MediaCreateInput),
    };

    await deps.withContentTransaction(async (session) => {
      await deps
        .getContentDb()
        .collection<StoredMediaDoc>(COLLECTIONS.media)
        .insertOne(storedDoc, { session });

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "media.create",
          collection: COLLECTIONS.media,
          docId: input.mediaId,
          naturalKey: verifiedBlob.pathname,
          changedFields: Object.keys(parsed.data),
          revision: 1,
        },
        session,
      );
    });

    return { ok: true, doc: toMediaDoc(storedDoc) };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { pathname: ["duplicate-key"] },
      };
    }
    throw err;
  }
}

// ── Server-Side Media Creation (`ICR-200` PDF worker & `ICR-203` importer) ──

export interface CreateServerMediaBaseInput {
  readonly filename: string;
  readonly contentType: string;
  readonly title: Localized<string>;
  readonly alt?: Localized<string>;
  readonly decorative?: boolean;
  readonly caption?: Localized<string>;
  readonly credit?: Localized<string>;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  /** Default `true`: checks `{ sha256 }` BEFORE `putBlob` so `ICR-203` re-runs upload zero duplicates. */
  readonly dedupeBySha256?: boolean;
}

export type CreateServerMediaInput = CreateServerMediaBaseInput &
  (
    | { readonly body: Buffer | Uint8Array; readonly buffer?: never }
    | { readonly buffer: Buffer | Uint8Array; readonly body?: never }
  );

export type CreateServerMediaSuccess =
  | {
      readonly status: "duplicate";
      readonly doc: MediaDoc;
      readonly reused: true;
    }
  | {
      readonly status: "created";
      readonly doc: MediaDoc;
      readonly reused: false;
    };

/**
 * Server-side binary upload + transactional media record creation for
 * server-side workers (e.g., the sermon PDF worker).
 * Accepts both `UserContentCaller` and `ServiceContentCaller` with `media:manage`.
 */
export async function createServerMedia(
  caller: ContentCaller,
  input: CreateServerMediaInput,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<CreateServerMediaSuccess>> {
  if (!hasPermission(caller, "media:manage")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const normalizedType = normalizeMediaContentType(input.contentType);
  if (!isAllowedMediaContentType(normalizedType)) {
    return {
      ok: false,
      reason: "unsupported-type",
      contentType: input.contentType,
    };
  }

  const bytes = input.body ?? input.buffer;
  const size = bytes.byteLength;
  const maxBytes = getMediaSizeCapForContentType(normalizedType);
  if (maxBytes === null || size <= 0) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { size: ["Invalid file size"] },
    };
  }
  if (size > maxBytes) {
    return {
      ok: false,
      reason: "file-too-large",
      maxBytes,
      actualBytes: size,
    };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await deps.ensureMediaIndexes();

  if (input.dedupeBySha256 !== false) {
    const existing = (await deps
      .getContentDb()
      .collection<StoredMediaDoc>(COLLECTIONS.media)
      .findOne({ sha256 })) as StoredMediaDoc | null;
    if (existing) {
      return {
        ok: true,
        status: "duplicate",
        doc: toMediaDoc(existing),
        reused: true,
      };
    }
  }

  const objectId = deps.allocateObjectId();
  const mediaId = objectId.toHexString();
  const pathname = buildMediaPathname(mediaId, input.filename, normalizedType);
  const isImage = normalizedType.startsWith("image/");
  const isAudio = normalizedType.startsWith("audio/");
  const actor = getCallerActor(caller);
  const createdAt = deps.now();

  const normalizedTitle = normalizeLocalized(input.title);
  const normalizedAlt =
    input.decorative === true ? undefined : normalizeOptionalLocalized(input.alt);
  const normalizedCaption = normalizeOptionalLocalized(input.caption);
  const normalizedCredit = normalizeOptionalLocalized(input.credit);

  // Pre-validate metadata BEFORE uploading bytes to Vercel Blob so invalid input leaves zero orphan blob.
  const preCheck: MediaCreateInput = {
    pathname,
    url: `https://placeholder.public.blob.vercel-storage.com/${pathname}`,
    filename: input.filename.trim(),
    contentType: normalizedType,
    size,
    sha256,
    ...(isImage && input.width !== undefined && { width: input.width }),
    ...(isImage && input.height !== undefined && { height: input.height }),
    ...(isAudio &&
      input.durationSeconds !== undefined && {
        durationSeconds: input.durationSeconds,
      }),
    title: normalizedTitle,
    ...(normalizedAlt !== undefined && { alt: normalizedAlt }),
    ...(isImage && input.decorative === true && { decorative: true }),
    ...(normalizedCaption !== undefined && { caption: normalizedCaption }),
    ...(normalizedCredit !== undefined && { credit: normalizedCredit }),
    createdBy: actor.id,
    createdAt,
  };

  const preParsed = mediaCreateSchema.safeParse(preCheck);
  if (!preParsed.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(preParsed.error),
    };
  }

  const uploaded = await deps.putBlob(
    STORAGE_CLASS.publicMedia,
    pathname,
    bytes,
    {
      contentType: normalizedType,
      multipart: isMultipartUpload(normalizedType),
    },
  );
  if (!uploaded.ok) {
    if (uploaded.reason === "storage-not-configured") {
      return { ok: false, reason: "storage-not-configured" };
    }
    return {
      ok: false,
      reason: "policy-violation",
      detail:
        uploaded.reason === "error" ? uploaded.message : "Blob upload failed",
    };
  }

  const finalCandidate: MediaCreateInput = {
    ...preParsed.data,
    pathname: uploaded.blob.pathname,
    url: uploaded.blob.url,
  };
  const finalParsed = mediaCreateSchema.safeParse(finalCandidate);
  if (!finalParsed.success) {
    await deps.delBlob(STORAGE_CLASS.publicMedia, uploaded.blob.url);
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(finalParsed.error),
    };
  }

  const storedDoc: StoredMediaDoc = {
    _id: objectId,
    ...(stripUndefinedDeep(finalParsed.data) as MediaCreateInput),
  };

  try {
    await deps.withContentTransaction(async (session) => {
      await deps
        .getContentDb()
        .collection<StoredMediaDoc>(COLLECTIONS.media)
        .insertOne(storedDoc, { session });

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "media.create",
          collection: COLLECTIONS.media,
          docId: mediaId,
          naturalKey: uploaded.blob.pathname,
          changedFields: Object.keys(finalParsed.data),
          revision: 1,
        },
        session,
      );
    });
  } catch (err) {
    await deps.delBlob(STORAGE_CLASS.publicMedia, uploaded.blob.url);
    throw err;
  }

  return {
    ok: true,
    status: "created",
    doc: toMediaDoc(storedDoc),
    reused: false,
  };
}

// ── Reads & Listings ────────────────────────────────────────────────────────

export async function getMediaById(
  caller: ContentCaller,
  mediaId: string,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<{ readonly doc: MediaDoc }>> {
  if (
    !hasAnyPermission(caller, ["content:read", "content:write", "media:manage"])
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    };
  }

  const objectId = parseStrictObjectId(mediaId);
  if (!objectId) return { ok: false, reason: "not-found" };

  const stored = (await deps
    .getContentDb()
    .collection<StoredMediaDoc>(COLLECTIONS.media)
    .findOne({ _id: objectId })) as StoredMediaDoc | null;

  if (!stored) return { ok: false, reason: "not-found" };
  return { ok: true, doc: toMediaDoc(stored) };
}

export async function getMediaByIds(
  caller: ContentCaller,
  mediaIds: readonly string[],
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<{ readonly items: MediaDoc[] }>> {
  if (
    !hasAnyPermission(caller, ["content:read", "content:write", "media:manage"])
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    };
  }

  const uniqueObjectIds: ObjectId[] = [];
  const seen = new Set<string>();
  for (const rawId of mediaIds) {
    const trimmed = rawId.trim();
    if (!seen.has(trimmed)) {
      const oid = parseStrictObjectId(trimmed);
      if (oid) {
        seen.add(trimmed);
        uniqueObjectIds.push(oid);
      }
    }
  }

  if (uniqueObjectIds.length === 0) {
    return { ok: true, items: [] };
  }

  const docs = (await deps
    .getContentDb()
    .collection<StoredMediaDoc>(COLLECTIONS.media)
    .find({ _id: { $in: uniqueObjectIds } })
    .toArray()) as StoredMediaDoc[];

  const byId = new Map<string, MediaDoc>();
  for (const doc of docs) {
    const mapped = toMediaDoc(doc);
    byId.set(mapped._id, mapped);
  }

  const ordered: MediaDoc[] = [];
  for (const rawId of mediaIds) {
    const found = byId.get(rawId.trim());
    if (found) ordered.push(found);
  }

  return { ok: true, items: ordered };
}

export interface ListMediaOptions {
  readonly kind?: MediaKind;
  readonly kinds?: readonly MediaKind[];
  readonly query?: string;
  readonly unused?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function listMedia(
  caller: ContentCaller,
  options: ListMediaOptions = {},
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<
  MediaResult<{
    readonly items: MediaDoc[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly hasMore: boolean;
  }>
> {
  if (
    !hasAnyPermission(caller, ["content:read", "content:write", "media:manage"])
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:read",
    };
  }

  await deps.ensureMediaIndexes();

  const filter: Record<string, unknown> = {};

  const targetKinds =
    options.kinds && options.kinds.length > 0
      ? options.kinds
      : options.kind
        ? [options.kind]
        : [];
  if (targetKinds.length > 0) {
    const allowedMimes = targetKinds.flatMap((k) => MEDIA_TYPES_BY_KIND[k]);
    filter.contentType = { $in: [...new Set(allowedMimes)] };
  }

  const rawQuery = options.query?.trim().slice(0, MAX_SEARCH_QUERY_LENGTH) ?? "";
  if (rawQuery.length > 0) {
    const regex = new RegExp(escapeRegExp(rawQuery), "i");
    filter.$or = [
      { "title.es-AR": regex },
      { "title.en-US": regex },
      { filename: regex },
      { "alt.es-AR": regex },
      { "alt.en-US": regex },
    ];
  }

  if (options.unused === true) {
    const usedIds = await collectUsedMediaIds(deps);
    const usedObjectIds: ObjectId[] = [];
    for (const id of usedIds) {
      const oid = parseStrictObjectId(id);
      if (oid) usedObjectIds.push(oid);
    }
    if (usedObjectIds.length > 0) {
      filter._id = { $nin: usedObjectIds };
    }
  }

  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 24)));
  const skip = (page - 1) * pageSize;

  const col = deps.getContentDb().collection<StoredMediaDoc>(COLLECTIONS.media);
  const [total, rawItems] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
  ]);

  const items = rawItems.map(toMediaDoc);
  return {
    ok: true,
    items,
    total,
    page,
    pageSize,
    hasMore: skip + items.length < total,
  };
}

export async function getMediaUsages(
  caller: ContentCaller,
  mediaId: string,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<{ readonly usedBy: ContentReferenceUsage[] }>> {
  const res = await deps.findMediaUsages(caller, mediaId);
  if (!res.ok) {
    if (res.reason === "forbidden") {
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: res.requiredPermission,
      };
    }
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { mediaId: ["Could not resolve media usages"] },
    };
  }
  return { ok: true, usedBy: res.usedBy };
}

// ── Live Metadata Update ────────────────────────────────────────────────────

export interface UpdateMediaDetailsPatch {
  readonly title?: Localized<string>;
  readonly alt?: Localized<string> | undefined;
  readonly decorative?: boolean;
  readonly caption?: Localized<string> | undefined;
  readonly credit?: Localized<string> | undefined;
  /** Allowed ONLY on audio items that currently lack a stored duration (imported audio, Edge case #6). */
  readonly durationSeconds?: number;
}

export async function updateMediaDetails(
  caller: ContentCaller,
  input: {
    readonly mediaId: string;
    readonly patch: UpdateMediaDetailsPatch & Record<string, unknown>;
  },
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<MediaResult<{ readonly doc: MediaDoc }>> {
  if (!hasPermission(caller, "media:manage")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const objectId = parseStrictObjectId(input.mediaId);
  if (!objectId) return { ok: false, reason: "not-found" };

  for (const key of Object.keys(input.patch)) {
    if (!MUTABLE_METADATA_KEYS.has(key)) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { [key]: ["immutable-field"] },
      };
    }
  }

  await deps.ensureMediaIndexes();
  const actor = getCallerActor(caller);

  return deps.withContentTransaction<MediaResult<{ readonly doc: MediaDoc }>>(
    async (session) => {
      const col = deps
        .getContentDb()
        .collection<StoredMediaDoc>(COLLECTIONS.media);
      const existing = (await col.findOne(
        { _id: objectId },
        { session },
      )) as StoredMediaDoc | null;

      if (!existing) {
        await session.abortTransaction();
        return { ok: false, reason: "not-found" };
      }

      const isImage = existing.contentType.toLowerCase().startsWith("image/");
      const isAudio = existing.contentType.toLowerCase().startsWith("audio/");

      if ("durationSeconds" in input.patch && input.patch.durationSeconds !== undefined) {
        if (!isAudio || existing.durationSeconds !== undefined) {
          await session.abortTransaction();
          return {
            ok: false,
            reason: "invalid",
            fieldErrors: { durationSeconds: ["immutable-field"] },
          };
        }
      }

      const nextTitle =
        input.patch.title !== undefined
          ? normalizeLocalized(input.patch.title)
          : existing.title;

      const nextDecorative = isImage
        ? "decorative" in input.patch
          ? input.patch.decorative === true
            ? true
            : undefined
          : existing.decorative
        : undefined;

      const rawNextAlt =
        "alt" in input.patch
          ? normalizeOptionalLocalized(input.patch.alt)
          : existing.alt;
      const nextAlt = nextDecorative === true ? undefined : rawNextAlt;

      const nextCaption =
        "caption" in input.patch
          ? normalizeOptionalLocalized(input.patch.caption)
          : existing.caption;
      const nextCredit =
        "credit" in input.patch
          ? normalizeOptionalLocalized(input.patch.credit)
          : existing.credit;
      const nextDuration =
        "durationSeconds" in input.patch &&
        input.patch.durationSeconds !== undefined
          ? input.patch.durationSeconds
          : existing.durationSeconds;

      const mergedCandidate: MediaCreateInput = {
        pathname: existing.pathname,
        url: existing.url,
        filename: existing.filename,
        contentType: existing.contentType,
        size: existing.size,
        sha256: existing.sha256,
        ...(existing.width !== undefined && { width: existing.width }),
        ...(existing.height !== undefined && { height: existing.height }),
        ...(nextDuration !== undefined && { durationSeconds: nextDuration }),
        title: nextTitle,
        ...(nextAlt !== undefined && { alt: nextAlt }),
        ...(nextDecorative === true && { decorative: true }),
        ...(nextCaption !== undefined && { caption: nextCaption }),
        ...(nextCredit !== undefined && { credit: nextCredit }),
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
      };

      const parsed = mediaCreateSchema.safeParse(mergedCandidate);
      if (!parsed.success) {
        await session.abortTransaction();
        return {
          ok: false,
          reason: "invalid",
          fieldErrors: formatZodFieldErrors(parsed.error),
        };
      }

      const $set: Record<string, unknown> = {
        title: stripUndefinedDeep(parsed.data.title),
      };
      const $unset: Record<string, ""> = {};
      const changedFields: string[] = [];

      if ("title" in input.patch) changedFields.push("title");

      if (parsed.data.alt !== undefined) {
        $set.alt = stripUndefinedDeep(parsed.data.alt);
        if ("alt" in input.patch || "decorative" in input.patch) {
          changedFields.push("alt");
        }
      } else if (existing.alt !== undefined) {
        $unset.alt = "";
        changedFields.push("alt");
      }

      if (parsed.data.decorative === true) {
        $set.decorative = true;
        if ("decorative" in input.patch) changedFields.push("decorative");
      } else if (existing.decorative !== undefined) {
        $unset.decorative = "";
        changedFields.push("decorative");
      }

      if (parsed.data.caption !== undefined) {
        $set.caption = stripUndefinedDeep(parsed.data.caption);
        if ("caption" in input.patch) changedFields.push("caption");
      } else if (existing.caption !== undefined && "caption" in input.patch) {
        $unset.caption = "";
        changedFields.push("caption");
      }

      if (parsed.data.credit !== undefined) {
        $set.credit = stripUndefinedDeep(parsed.data.credit);
        if ("credit" in input.patch) changedFields.push("credit");
      } else if (existing.credit !== undefined && "credit" in input.patch) {
        $unset.credit = "";
        changedFields.push("credit");
      }

      if (
        parsed.data.durationSeconds !== undefined &&
        existing.durationSeconds === undefined
      ) {
        $set.durationSeconds = parsed.data.durationSeconds;
        changedFields.push("durationSeconds");
      }

      const updateDoc: Record<string, unknown> = { $set };
      if (Object.keys($unset).length > 0) {
        updateDoc.$unset = $unset;
      }

      await col.updateOne({ _id: objectId }, updateDoc, { session });

      await deps.appendContentAuditEntry(
        {
          actorId: actor.id,
          actorLabel: actor.label,
          actorKind: actor.kind,
          action: "media.update",
          collection: COLLECTIONS.media,
          docId: input.mediaId,
          naturalKey: existing.pathname,
          changedFields: [...new Set(changedFields)],
          revision: 1,
        },
        session,
      );

      const updated: StoredMediaDoc = {
        _id: objectId,
        ...(stripUndefinedDeep(parsed.data) as MediaCreateInput),
      };
      return { ok: true, doc: toMediaDoc(updated) };
    },
  );
}

// ── Guarded Delete (transactional ref check + post-commit Blob removal) ─────

/**
 * Deletes an unused media record inside `withContentTransaction` (refusing if
 * ANY draft or published content entry in either locale references it — AC5),
 * and deletes the underlying Vercel Blob STRICTLY AFTER commit (Edge case #3).
 * Accepts both `UserContentCaller` and `ServiceContentCaller` (`ICR-200` cleanup).
 */
export async function deleteMedia(
  caller: ContentCaller,
  mediaId: string,
  deps: MediaServiceDeps = defaultMediaServiceDeps,
): Promise<
  MediaResult<{ readonly docId: string; readonly blobDeleted: boolean }>
> {
  if (!hasPermission(caller, "media:manage")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const objectId = parseStrictObjectId(mediaId);
  if (!objectId) return { ok: false, reason: "not-found" };
  const canonicalMediaId = objectId.toHexString();

  await deps.ensureMediaIndexes();
  const actor = getCallerActor(caller);

  const txResult = await deps.withContentTransaction<
    MediaResult<{ readonly docId: string; readonly blobUrl: string; readonly pathname: string }>
  >(async (session) => {
    const col = deps
      .getContentDb()
      .collection<StoredMediaDoc>(COLLECTIONS.media);
    const existing = (await col.findOne(
      { _id: objectId },
      { session },
    )) as StoredMediaDoc | null;

    if (!existing) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const usedBy = await queryMediaUsagesTransactional(
      canonicalMediaId,
      session,
      deps,
    );
    if (usedBy.length > 0) {
      await session.abortTransaction();
      return { ok: false, reason: "in-use", usedBy };
    }

    const deleted = await col.deleteOne({ _id: objectId }, { session });
    if (deleted.deletedCount === 0) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    await deps.appendContentAuditEntry(
      {
        actorId: actor.id,
        actorLabel: actor.label,
        actorKind: actor.kind,
        action: "media.delete",
        collection: COLLECTIONS.media,
        docId: canonicalMediaId,
        naturalKey: existing.pathname,
        changedFields: ["_deleted"],
        revision: 0,
      },
      session,
    );

    return {
      ok: true,
      docId: canonicalMediaId,
      blobUrl: existing.url,
      pathname: existing.pathname,
    };
  });

  if (!txResult.ok) return txResult;

  // Strictly AFTER commit so retried transactions never call `delBlob` twice.
  const delRes = await deps.delBlob(STORAGE_CLASS.publicMedia, txResult.blobUrl);
  if (!delRes.ok) {
    console.warn("[media] Post-commit blob deletion failed (orphan accepted)", {
      docId: txResult.docId,
      pathname: txResult.pathname,
      reason: delRes.reason,
    });
    return { ok: true, docId: txResult.docId, blobDeleted: false };
  }

  return { ok: true, docId: txResult.docId, blobDeleted: true };
}
