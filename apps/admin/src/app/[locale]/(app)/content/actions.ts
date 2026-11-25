"use server";

import { revalidatePath } from "next/cache";
import {
  CONTENT_SCHEMAS,
  bibleVerseKey,
  extractReferences,
  type BibleVerseFields,
  type ContentDoc,
  type ContentStatus,
} from "@idcr/content";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import {
  formatZodFieldErrors,
  type ContentCollectionName,
  type ContentFailure,
  type ContentReferenceUsage,
} from "@src/lib/content/errors";
import {
  extractEntryLabel,
  isEntryProtected,
  resolveConcreteType,
} from "@src/lib/content/guards";
import {
  isPublishEmailsEnabled,
  type RevalidateFailureReason,
} from "@src/lib/content/revalidate";
import {
  compareBibleVerses,
  formatVerseChipLabel,
  getVerseVersionLabel,
} from "@src/lib/content/bible-books";
import {
  createContent,
  deleteContent,
  discardChanges,
  findContentUsages,
  getContentById,
  getContentByNaturalKey,
  listContent,
  publishContent,
  retryRevalidation,
  saveDraft,
  unpublishContent,
} from "@src/service/content/content-core.service";

const CONTENT_LAYOUT_ROUTE = "/[locale]/content";

export interface SerializedContentDoc<TFields = Record<string, unknown>> {
  readonly _id: string;
  readonly draft: TFields;
  readonly published?: TFields;
  readonly publishedAt?: string;
  readonly firstPublishedAt?: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly updatedByLabel?: string;
}

export interface SerializedConflictFailure {
  readonly ok: false;
  readonly reason: "conflict";
  readonly updatedBy: string;
  readonly updatedByLabel?: string;
  readonly updatedAt: string;
  readonly currentRevision: number;
}

export type SerializedContentFailure =
  | Exclude<ContentFailure, { readonly reason: "conflict" }>
  | SerializedConflictFailure;

export type ContentActionResult<TSuccess> =
  | ({ readonly ok: true } & TSuccess)
  | SerializedContentFailure;

export type PreparePublishResult<TFields = Record<string, unknown>> =
  | {
      readonly ok: true;
      readonly doc: SerializedContentDoc<TFields>;
      readonly status: ContentStatus;
      readonly isFirstPublish: boolean;
      readonly isPublishEmailsEnabled?: boolean;
      readonly willCascade: readonly {
        readonly collection: ContentCollectionName;
        readonly docId: string;
        readonly label: string;
      }[];
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fieldErrors: Record<string, string[]>;
      readonly savedDoc?: SerializedContentDoc<TFields>;
      readonly savedStatus?: ContentStatus;
    }
  | SerializedContentFailure;

function serializeDoc<TFields>(
  doc: ContentDoc<TFields>,
  updatedByLabel?: string,
): SerializedContentDoc<TFields> {
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

export async function createContentAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly draft: TFields;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TFields>;
    readonly status: ContentStatus;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const result = await createContent<TFields>(caller, {
    collection: input.collection,
    draft: input.draft,
  });
  if (!result.ok) return serializeFailure(result);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(result.doc, authz.user.displayName ?? authz.user.email),
    status: result.status,
  };
}

export async function saveDraftAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly patch: Partial<TFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TFields>;
    readonly status: ContentStatus;
    readonly changedFields: string[];
    readonly noOp: boolean;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const result = await saveDraft<TFields>(caller, {
    collection: input.collection,
    docId: input.docId,
    patch: input.patch,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  if (!result.noOp) {
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  }

  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    changedFields: result.changedFields,
    noOp: result.noOp,
  };
}

/**
 * Step 1 of two-step Publish (`F-editor-ux-decisions.md` §2.2 & §2.5):
 * 1. Saves dirty draft (or creates new draft) first so strict validation
 *    failures still preserve the editor's work.
 * 2. Runs the strict `publishable` Zod schema server-side.
 * 3. Resolves never-published referenced `authors` and `bible_verses` that
 *    will cascade-publish alongside this entry so the confirmation dialog can
 *    list them accurately.
 */
export async function preparePublishAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly newDraft?: TFields;
  readonly draftPatch?: Partial<TFields>;
  readonly expectedRevision?: number;
  readonly overwrite?: boolean;
}): Promise<PreparePublishResult<TFields>> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  let doc: ContentDoc<TFields>;
  let status: ContentStatus;
  let updatedByLabel: string | undefined;

  if (!input.docId) {
    if (!input.newDraft) {
      return { ok: false, reason: "invalid", fieldErrors: { _root: ["missing-draft"] } };
    }
    const created = await createContent<TFields>(caller, {
      collection: input.collection,
      draft: input.newDraft,
    });
    if (!created.ok) return serializeFailure(created);
    doc = created.doc;
    status = created.status;
    updatedByLabel = authz.user.displayName ?? authz.user.email;
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  } else if (
    input.draftPatch &&
    Object.keys(input.draftPatch as Record<string, unknown>).length > 0
  ) {
    const saved = await saveDraft<TFields>(caller, {
      collection: input.collection,
      docId: input.docId,
      patch: input.draftPatch,
      expectedRevision: input.expectedRevision ?? 0,
      overwrite: input.overwrite,
    });
    if (!saved.ok) return serializeFailure(saved);
    doc = saved.doc;
    status = saved.status;
    updatedByLabel = saved.updatedByLabel;
    if (!saved.noOp) {
      revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
    }
  } else {
    const loaded = await getContentById<TFields>(
      caller,
      input.collection,
      input.docId,
    );
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
    doc = loaded.doc;
    status = loaded.status;
    updatedByLabel = loaded.updatedByLabel;
  }

  const draftRecord = doc.draft as Record<string, unknown>;
  const publishedRecord = doc.published as Record<string, unknown> | undefined;

  if (
    isEntryProtected(input.collection, draftRecord, publishedRecord) &&
    !authz.permissions.has("content:publish-protected")
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    };
  }

  const concreteType = resolveConcreteType(input.collection, draftRecord);
  if (!concreteType) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { _root: ["invalid-type"] },
      savedDoc: serializeDoc(doc, updatedByLabel),
      savedStatus: status,
    };
  }

  const strict = CONTENT_SCHEMAS[concreteType].publishable.safeParse(doc.draft);
  if (!strict.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: formatZodFieldErrors(strict.error),
      savedDoc: serializeDoc(doc, updatedByLabel),
      savedStatus: status,
    };
  }

  // Resolve never-published authors and bible_verses that will cascade-publish
  const refs = extractReferences(concreteType, {
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
  };
}

export async function confirmPublishAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  readonly notify?: boolean;
  readonly approvedConfirmed?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TFields>;
    readonly status: ContentStatus;
    readonly revalidated: boolean;
    readonly revalidateReason?: RevalidateFailureReason;
    readonly notified: boolean;
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
  const result = await publishContent<TFields>(caller, {
    collection: input.collection,
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
    notify: input.notify,
    approvedConfirmed: input.approvedConfirmed,
  });
  if (!result.ok) return serializeFailure(result);

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
  };
}

export async function discardChangesAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TFields>;
    readonly status: ContentStatus;
    readonly noOp: boolean;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const result = await discardChanges<TFields>(caller, {
    collection: input.collection,
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    noOp: result.noOp,
  };
}

export async function unpublishContentAction<
  TFields = Record<string, unknown>,
>(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TFields>;
    readonly status: ContentStatus;
    readonly revalidated: boolean;
    readonly revalidateReason?: RevalidateFailureReason;
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
  const result = await unpublishContent<TFields>(caller, {
    collection: input.collection,
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(result.doc, result.updatedByLabel),
    status: result.status,
    revalidated: result.revalidated,
    ...(result.revalidateReason !== undefined && {
      revalidateReason: result.revalidateReason,
    }),
  };
}

export async function deleteContentAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<ContentActionResult<{ readonly docId: string }>> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const result = await deleteContent(caller, {
    collection: input.collection,
    docId: input.docId,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!result.ok) return serializeFailure(result);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return { ok: true, docId: result.docId };
}

export async function retryRevalidationAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
}): Promise<
  ContentActionResult<{
    readonly revalidated: boolean;
    readonly revalidateReason?: RevalidateFailureReason;
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
  const result = await retryRevalidation(caller, input.collection, input.docId);
  if (!result.ok) return serializeFailure(result);
  return {
    ok: true,
    revalidated: result.revalidated,
    ...(!result.revalidated && { revalidateReason: result.revalidateReason }),
  };
}

export async function checkContentUsagesAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
}): Promise<
  ContentActionResult<{ readonly usedBy: readonly ContentReferenceUsage[] }>
> {
  const authz = await requireActionPermission("content:read");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const caller = callerFromAuthorized(authz);
  const result = await findContentUsages(caller, {
    collection: input.collection,
    docId: input.docId,
  });
  if (!result.ok) return serializeFailure(result);
  return { ok: true, usedBy: result.usedBy };
}

export interface ContentPickerOption {
  readonly id: string;
  readonly label: string;
  readonly secondary?: string;
  readonly status: ContentStatus;
  readonly avatarMediaId?: string;
}

/**
 * Shared picker lookup (`ICR-197` PM catch #1) covering `authors`, `posts`,
 * `sermons`, and `bible_verses` so Wave 4 `ICR-199` and `ICR-200` never need
 * to edit `content/actions.ts`.
 */
export async function searchContentEntriesAction(input: {
  readonly collection: "authors" | "posts" | "sermons" | "bible_verses";
  readonly query?: string;
  readonly excludeId?: string;
}): Promise<ContentActionResult<{ readonly items: readonly ContentPickerOption[] }>> {
  const authz = await requireActionPermission("content:read");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const caller = callerFromAuthorized(authz);
  const listed = await listContent<Record<string, unknown>>(
    caller,
    input.collection,
    { page: 1, pageSize: 500 },
  );
  if (!listed.ok) return serializeFailure(listed);

  const needle = input.query?.trim().toLowerCase() ?? "";

  const mapped: ContentPickerOption[] = [];
  for (const item of listed.items) {
    if (input.excludeId && item.doc._id === input.excludeId) continue;
    const draft = item.doc.draft;

    let label = extractEntryLabel(input.collection, draft, item.doc._id);
    let secondary: string | undefined;
    let avatarMediaId: string | undefined;
    let searchHaystack = label.toLowerCase();

    if (input.collection === "authors") {
      if (typeof draft.avatarMediaId === "string") {
        avatarMediaId = draft.avatarMediaId;
      }
      if (typeof draft.email === "string" && draft.email.trim()) {
        secondary = draft.email;
        searchHaystack += ` ${draft.email.toLowerCase()}`;
      }
    } else if (input.collection === "posts" || input.collection === "sermons") {
      const slug = typeof draft.slug === "string" ? draft.slug : undefined;
      const date =
        typeof draft.sermonDate === "string"
          ? draft.sermonDate
          : typeof draft.publishedDate === "string"
            ? draft.publishedDate
            : undefined;
      secondary = [date?.slice(0, 10), slug].filter(Boolean).join(" · ") || undefined;
      if (slug) searchHaystack += ` ${slug.toLowerCase()}`;
      const titleEn = (draft.title as Record<string, unknown> | undefined)?.["en-US"];
      if (typeof titleEn === "string") {
        searchHaystack += ` ${titleEn.toLowerCase()}`;
      }
    } else if (input.collection === "bible_verses") {
      const v = draft as unknown as BibleVerseFields;
      label = formatVerseChipLabel(v, "es-AR");
      secondary = v.text?.["es-AR"]?.slice(0, 120);
      searchHaystack = [
        v.book?.["es-AR"],
        v.book?.["en-US"],
        `${v.chapter}:${v.fromVerse}`,
        v.version?.["es-AR"],
        v.version?.["en-US"],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    }

    if (needle && !searchHaystack.includes(needle)) continue;

    mapped.push({
      id: item.doc._id,
      label,
      ...(secondary !== undefined && { secondary }),
      status: item.status,
      ...(avatarMediaId !== undefined && { avatarMediaId }),
    });
  }

  return { ok: true, items: mapped };
}

export interface BibleVersePickerItem {
  readonly id: string;
  readonly status: ContentStatus;
  readonly revision: number;
  readonly fields: BibleVerseFields;
}

export async function searchBibleVersesAction(input: {
  readonly query?: string;
}): Promise<ContentActionResult<{ readonly items: readonly BibleVersePickerItem[] }>> {
  const authz = await requireActionPermission("content:read");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:read" };
  }

  const caller = callerFromAuthorized(authz);
  const listed = await listContent<BibleVerseFields>(caller, "bible_verses", {
    page: 1,
    pageSize: 500,
  });
  if (!listed.ok) return serializeFailure(listed);

  const needle = input.query?.trim().toLowerCase() ?? "";

  const filtered = listed.items
    .filter((item) => {
      if (!needle) return true;
      const d = item.doc.draft;
      const haystack = [
        d.book["es-AR"],
        d.book["en-US"],
        `${d.chapter}:${d.fromVerse}${d.toVerse ? `-${d.toVerse}` : ""}`,
        getVerseVersionLabel(d, "es-AR"),
        getVerseVersionLabel(d, "en-US"),
        d.text?.["es-AR"],
        d.text?.["en-US"],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => compareBibleVerses(a.doc.draft, b.doc.draft))
    .map((item) => ({
      id: item.doc._id,
      status: item.status,
      revision: item.doc.revision,
      fields: item.doc.draft,
    }));

  return { ok: true, items: filtered };
}

/**
 * Version-scoped lookup-or-create (`ICR-197` Scope #11, `ICR-198` AC5, `ICR-200` AC2):
 * if a verse with the exact Spanish book + chapter + verse range + Spanish
 * version already exists, returns `{ reused: true, verse }` without creating a
 * duplicate.
 */
export async function createOrReuseBibleVerseAction(input: {
  readonly draft: BibleVerseFields;
}): Promise<
  ContentActionResult<{
    readonly reused: boolean;
    readonly verse: BibleVersePickerItem;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return { ok: false, reason: "forbidden", requiredPermission: "content:write" };
  }

  const caller = callerFromAuthorized(authz);
  const esBook = input.draft.book["es-AR"];
  const esVersion = input.draft.version?.["es-AR"];

  if (esBook && esVersion) {
    try {
      const naturalKey = bibleVerseKey({
        book: esBook,
        chapter: input.draft.chapter,
        fromVerse: input.draft.fromVerse,
        toVerse: input.draft.toVerse,
        version: esVersion,
      });
      const existing = await getContentByNaturalKey<BibleVerseFields>(
        caller,
        "bible_verses",
        naturalKey,
      );
      if (existing.ok) {
        return {
          ok: true,
          reused: true,
          verse: {
            id: existing.doc._id,
            status: existing.status,
            revision: existing.doc.revision,
            fields: existing.doc.draft,
          },
        };
      }
    } catch {
      // Let schema validation below report field errors cleanly
    }
  }

  const created = await createContent<BibleVerseFields>(caller, {
    collection: "bible_verses",
    draft: input.draft,
  });
  if (!created.ok) return serializeFailure(created);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    reused: false,
    verse: {
      id: created.doc._id,
      status: created.status,
      revision: created.doc.revision,
      fields: created.doc.draft,
    },
  };
}
