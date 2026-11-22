import { ObjectId } from "mongodb";
import {
  LOCALES,
  type Locale,
  type PostFields,
  type TopicFields,
} from "@idcr/content";
import { getContentDb } from "@src/service/database.service";
import { hasPermission, type ContentCaller } from "@src/lib/content/caller";
import type { ContentFailure, ContentResult } from "@src/lib/content/errors";
import {
  isEntryProtected,
  isProtectedFlagToggled,
} from "@src/lib/content/guards";
import {
  createContent,
  getContentById,
  saveDraft,
  type ContentDocumentView,
  type SaveDraftSuccess,
} from "@src/service/content/content-core.service";
import { ensureContentIndexes } from "@src/service/content/indexes";
import { isAllowedPostCategory, isReservedTopicSlug } from "./editorial-rules";

export interface EditorialGuardsDeps {
  readonly getContentDb: typeof getContentDb;
  readonly createContent: typeof createContent;
  readonly saveDraft: typeof saveDraft;
  readonly getContentById: typeof getContentById;
  readonly ensureContentIndexes: typeof ensureContentIndexes;
}

export const defaultEditorialGuardsDeps: EditorialGuardsDeps = {
  getContentDb,
  createContent,
  saveDraft,
  getContentById,
  ensureContentIndexes,
};

const CANONICAL_OBJECT_ID_RE = /^[0-9a-f]{24}$/;

function parseObjectId(id: string | undefined): ObjectId | null {
  if (!id || !CANONICAL_OBJECT_ID_RE.test(id)) return null;
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/**
 * Cross-snapshot slug collision check for `posts` (`ICR-199` AC3 & Edge Case 2):
 * refuses any slug currently held by ANOTHER post in EITHER `draft.slug` OR
 * `published.slug` (closing the gap where Post A renames its draft away from
 * `"x"` while its published copy is still live at `"x"`).
 */
export async function checkPostSlugConflict(
  slug: string,
  excludeDocId: string | undefined,
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentFailure | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  await deps.ensureContentIndexes("posts");
  const excludeOid = parseObjectId(excludeDocId);
  const filter: Record<string, unknown> = {
    $or: [{ "draft.slug": trimmed }, { "published.slug": trimmed }],
  };
  if (excludeOid) {
    filter._id = { $ne: excludeOid };
  }

  const clash = await deps
    .getContentDb()
    .collection("posts")
    .findOne(filter, { projection: { _id: 1 } });

  if (clash) {
    return {
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    };
  }
  return null;
}

/**
 * Cross-snapshot per-locale slug collision check for `topics` (`ICR-199` AC3):
 * checks `draft.slug.<locale>` AND `published.slug.<locale>` across all other
 * topic documents independently per locale (`es-AR` and `en-US`).
 */
export async function checkTopicSlugConflict(
  locale: Locale,
  slug: string,
  excludeDocId: string | undefined,
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentFailure | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  await deps.ensureContentIndexes("topics");
  const excludeOid = parseObjectId(excludeDocId);
  const filter: Record<string, unknown> = {
    $or: [
      { [`draft.slug.${locale}`]: trimmed },
      { [`published.slug.${locale}`]: trimmed },
    ],
  };
  if (excludeOid) {
    filter._id = { $ne: excludeOid };
  }

  const clash = await deps
    .getContentDb()
    .collection("topics")
    .findOne(filter, { projection: { _id: 1 } });

  if (clash) {
    const field = `slug.${locale}`;
    return {
      ok: false,
      reason: "duplicate-key",
      field,
      fieldErrors: { [field]: ["duplicate-key"] },
    };
  }
  return null;
}

function validatePostCategoryValue(
  category: string | undefined,
): ContentFailure | null {
  if (category === undefined) return null;
  if (!isAllowedPostCategory(category)) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: { category: ["invalid-category"] },
    };
  }
  return null;
}

/**
 * Guarded blog post creation (`ICR-199` AC3, AC4):
 * enforces `POST_CATEGORIES` allowlist and cross-snapshot slug uniqueness
 * before delegating to `ICR-195` `createContent`.
 */
export async function createGuardedPost(
  caller: ContentCaller,
  draft: PostFields,
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentResult<ContentDocumentView<PostFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const catErr = validatePostCategoryValue(draft.category);
  if (catErr) return catErr;

  if (typeof draft.slug === "string" && draft.slug.trim() !== "") {
    const slugErr = await checkPostSlugConflict(draft.slug, undefined, deps);
    if (slugErr) return slugErr;
  }

  return deps.createContent<PostFields>(caller, {
    collection: "posts",
    draft,
  });
}

/**
 * Guarded blog post draft save (`ICR-199` AC3, AC4, Edge Cases 2 & 7):
 * - Enforces `POST_CATEGORIES` on the effective resulting category (so an
 *   unknown legacy stored category must be changed or cleared before saving).
 * - Checks cross-snapshot slug uniqueness whenever `slug` changes.
 */
export async function saveGuardedPostDraft(
  caller: ContentCaller,
  input: {
    readonly docId: string;
    readonly patch: Partial<PostFields>;
    readonly expectedRevision: number;
    readonly overwrite?: boolean;
  },
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentResult<SaveDraftSuccess<PostFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const existing = await deps.getContentById<PostFields>(
    caller,
    "posts",
    input.docId,
  );
  if (!existing.ok) return existing;

  const hasIncomingCategory = Object.prototype.hasOwnProperty.call(
    input.patch,
    "category",
  );
  const effectiveCategory = hasIncomingCategory
    ? input.patch.category
    : existing.doc.draft.category;

  const catErr = validatePostCategoryValue(effectiveCategory);
  if (catErr) return catErr;

  if (
    typeof input.patch.slug === "string" &&
    input.patch.slug !== existing.doc.draft.slug
  ) {
    const slugErr = await checkPostSlugConflict(
      input.patch.slug,
      input.docId,
      deps,
    );
    if (slugErr) return slugErr;
  }

  return deps.saveDraft<PostFields>(caller, {
    collection: "posts",
    docId: input.docId,
    patch: input.patch,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
}

/**
 * Pre-publish guard for `posts` (`preparePostPublishAction` / `confirmPostPublishAction`):
 * validates the effective merged `category` AND effective merged `slug` across
 * both `draft.slug` and `published.slug` of every other post.
 */
export async function validatePostBeforePublish(
  caller: ContentCaller,
  input: {
    readonly docId?: string;
    readonly newDraft?: PostFields;
    readonly draftPatch?: Partial<PostFields>;
  },
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentFailure | null> {
  if (!hasPermission(caller, "content:publish")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  let effectiveCategory: string | undefined;
  let effectiveSlug: string | undefined;

  if (!input.docId) {
    effectiveCategory = input.newDraft?.category;
    effectiveSlug = input.newDraft?.slug;
  } else {
    const existing = await deps.getContentById<PostFields>(
      caller,
      "posts",
      input.docId,
    );
    if (!existing.ok) return existing;

    const patch = input.draftPatch ?? {};
    effectiveCategory = Object.prototype.hasOwnProperty.call(patch, "category")
      ? patch.category
      : existing.doc.draft.category;
    effectiveSlug = Object.prototype.hasOwnProperty.call(patch, "slug")
      ? patch.slug
      : existing.doc.draft.slug;
  }

  const catErr = validatePostCategoryValue(effectiveCategory);
  if (catErr) return catErr;

  if (typeof effectiveSlug === "string" && effectiveSlug.trim() !== "") {
    const slugErr = await checkPostSlugConflict(
      effectiveSlug,
      input.docId,
      deps,
    );
    if (slugErr) return slugErr;
  }

  return null;
}

async function validateTopicSlugs(
  slugMap: TopicFields["slug"],
  excludeDocId: string | undefined,
  onlyLocales: readonly Locale[] | undefined,
  deps: EditorialGuardsDeps,
): Promise<ContentFailure | null> {
  if (!slugMap) return null;

  const localesToCheck = onlyLocales ?? LOCALES;
  const reservedErrors: Record<string, string[]> = {};

  for (const locale of localesToCheck) {
    const value = slugMap[locale];
    if (typeof value !== "string" || value.trim() === "") continue;
    if (isReservedTopicSlug(value)) {
      reservedErrors[`slug.${locale}`] = ["reserved-route-slug"];
    }
  }

  if (Object.keys(reservedErrors).length > 0) {
    return { ok: false, reason: "invalid", fieldErrors: reservedErrors };
  }

  for (const locale of localesToCheck) {
    const value = slugMap[locale];
    if (typeof value !== "string" || value.trim() === "") continue;
    const conflict = await checkTopicSlugConflict(
      locale,
      value,
      excludeDocId,
      deps,
    );
    if (conflict) return conflict;
  }

  return null;
}

/**
 * Guarded topic creation (`ICR-199` AC3, AC5, Edge Case 6):
 * checks `content:publish-protected` FIRST if `draft.protected === true`, then
 * validates reserved site routes and cross-snapshot per-locale slug uniqueness.
 */
export async function createGuardedTopic(
  caller: ContentCaller,
  draft: TopicFields,
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentResult<ContentDocumentView<TopicFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  if (
    draft.protected === true &&
    !hasPermission(caller, "content:publish-protected")
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    };
  }

  const slugErr = await validateTopicSlugs(
    draft.slug,
    undefined,
    undefined,
    deps,
  );
  if (slugErr) return slugErr;

  return deps.createContent<TopicFields>(caller, {
    collection: "topics",
    draft,
  });
}

/**
 * Guarded topic draft save (`ICR-199` AC3, AC5, Edge Cases 1 & 6):
 * enforces downgrade-proof `content:publish-protected` check on `protected`
 * toggles in EITHER direction BEFORE validating changed localized slugs.
 */
export async function saveGuardedTopicDraft(
  caller: ContentCaller,
  input: {
    readonly docId: string;
    readonly patch: Partial<TopicFields>;
    readonly expectedRevision: number;
    readonly overwrite?: boolean;
  },
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentResult<SaveDraftSuccess<TopicFields>>> {
  if (!hasPermission(caller, "content:write")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const existing = await deps.getContentById<TopicFields>(
    caller,
    "topics",
    input.docId,
  );
  if (!existing.ok) return existing;

  if (
    isProtectedFlagToggled(
      "topics",
      existing.doc.draft as unknown as Record<string, unknown>,
      input.patch as unknown as Record<string, unknown>,
    ) &&
    !hasPermission(caller, "content:publish-protected")
  ) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    };
  }

  if (input.patch.slug !== undefined) {
    const changedLocales = LOCALES.filter(
      (loc) => input.patch.slug?.[loc] !== existing.doc.draft.slug?.[loc],
    );
    if (changedLocales.length > 0) {
      const slugErr = await validateTopicSlugs(
        input.patch.slug,
        input.docId,
        changedLocales,
        deps,
      );
      if (slugErr) return slugErr;
    }
  }

  return deps.saveDraft<TopicFields>(caller, {
    collection: "topics",
    docId: input.docId,
    patch: input.patch,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
}

/**
 * Pre-publish guard for `topics` (`prepareTopicPublishAction` / `confirmTopicPublishAction`):
 * 1. Enforces `content:publish` and downgrade-proof `content:publish-protected`
 *    FIRST (checking stored `published.protected`, stored `draft.protected`,
 *    and incoming `draftPatch.protected` / `newDraft.protected`).
 * 2. PM Refinement #1 (`evidence/ICR-199/pm-spec.md`): validates the **effective
 *    merged** `slug["es-AR"]` AND `slug["en-US"]` (not only keys in `draftPatch`)
 *    against `RESERVED_TOPIC_SLUGS` and cross-snapshot per-locale uniqueness so
 *    a pre-existing bad draft slug can never slip through to publish.
 */
export async function validateTopicBeforePublish(
  caller: ContentCaller,
  input: {
    readonly docId?: string;
    readonly newDraft?: TopicFields;
    readonly draftPatch?: Partial<TopicFields>;
  },
  deps: EditorialGuardsDeps = defaultEditorialGuardsDeps,
): Promise<ContentFailure | null> {
  if (!hasPermission(caller, "content:publish")) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  let effectiveSlug: TopicFields["slug"];

  if (!input.docId) {
    if (
      input.newDraft?.protected === true &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }
    effectiveSlug = input.newDraft?.slug;
  } else {
    const existing = await deps.getContentById<TopicFields>(
      caller,
      "topics",
      input.docId,
    );
    if (!existing.ok) return existing;

    const draftRec = existing.doc.draft as unknown as Record<string, unknown>;
    const pubRec = existing.doc.published as unknown as
      | Record<string, unknown>
      | undefined;
    const patchRec = input.draftPatch as unknown as
      | Record<string, unknown>
      | undefined;

    if (
      (isEntryProtected("topics", draftRec, pubRec, patchRec) ||
        (patchRec && isProtectedFlagToggled("topics", draftRec, patchRec))) &&
      !hasPermission(caller, "content:publish-protected")
    ) {
      return {
        ok: false,
        reason: "forbidden",
        requiredPermission: "content:publish-protected",
      };
    }

    const patch = input.draftPatch ?? {};
    effectiveSlug = Object.prototype.hasOwnProperty.call(patch, "slug")
      ? patch.slug
      : existing.doc.draft.slug;
  }

  // Always check BOTH locales of the effective merged slug (PM refinement #1)
  return validateTopicSlugs(effectiveSlug, input.docId, LOCALES, deps);
}
