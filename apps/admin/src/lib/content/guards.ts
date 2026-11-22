import {
  COLLECTIONS,
  GLOBAL_KIND,
  REFERENCE_PATHS,
  bibleVerseKey,
  canonicalEqual,
  isRegisteredFixedEntry,
  type CollectionName,
  type ConcreteContentType,
  type ContentType,
  type FixedEntryType,
  type ReferencePathSpec,
} from "@idcr/content";
import type { ContentCollectionName } from "./errors";

export interface CollectionMeta {
  readonly collection: ContentCollectionName;
  readonly contentType: ContentType;
  readonly kind: "fixed" | "editorial" | "library";
  readonly canUnpublish: boolean;
  readonly canDeletePublished: boolean;
  readonly isProtectedByType: boolean;
  readonly isEmailEligible: boolean;
}

export const COLLECTION_META = {
  sections: {
    collection: COLLECTIONS.sections,
    contentType: "section",
    kind: "fixed",
    canUnpublish: false,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  belief_collections: {
    collection: COLLECTIONS.beliefCollections,
    contentType: "beliefCollection",
    kind: "fixed",
    canUnpublish: false,
    canDeletePublished: false,
    isProtectedByType: true,
    isEmailEligible: false,
  },
  event_banners: {
    collection: COLLECTIONS.eventBanners,
    contentType: "eventBanner",
    kind: "fixed",
    canUnpublish: false,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  seo_entries: {
    collection: COLLECTIONS.seoEntries,
    contentType: "seoEntry",
    kind: "fixed",
    canUnpublish: false,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  globals: {
    collection: COLLECTIONS.globals,
    contentType: "global",
    kind: "fixed",
    canUnpublish: false,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  posts: {
    collection: COLLECTIONS.posts,
    contentType: "post",
    kind: "editorial",
    canUnpublish: true,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: true,
  },
  sermons: {
    collection: COLLECTIONS.sermons,
    contentType: "sermon",
    kind: "editorial",
    canUnpublish: true,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: true,
  },
  topics: {
    collection: COLLECTIONS.topics,
    contentType: "topic",
    kind: "editorial",
    canUnpublish: true,
    canDeletePublished: false,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  authors: {
    collection: COLLECTIONS.authors,
    contentType: "author",
    kind: "library",
    canUnpublish: false,
    canDeletePublished: true,
    isProtectedByType: false,
    isEmailEligible: false,
  },
  bible_verses: {
    collection: COLLECTIONS.bibleVerses,
    contentType: "bibleVerse",
    kind: "library",
    canUnpublish: false,
    canDeletePublished: true,
    isProtectedByType: false,
    isEmailEligible: false,
  },
} as const satisfies Record<ContentCollectionName, CollectionMeta>;

export const ALL_CONTENT_COLLECTIONS = Object.keys(
  COLLECTION_META,
) as ContentCollectionName[];

const CONCRETE_TYPE_TO_COLLECTION: Readonly<
  Record<ConcreteContentType, ContentCollectionName>
> = {
  section: COLLECTIONS.sections,
  beliefCollection: COLLECTIONS.beliefCollections,
  eventBanner: COLLECTIONS.eventBanners,
  seoEntry: COLLECTIONS.seoEntries,
  navigationMenu: COLLECTIONS.globals,
  footer: COLLECTIONS.globals,
  singleEmailForm: COLLECTIONS.globals,
  contactForm: COLLECTIONS.globals,
  location: COLLECTIONS.globals,
  post: COLLECTIONS.posts,
  sermon: COLLECTIONS.sermons,
  topic: COLLECTIONS.topics,
  author: COLLECTIONS.authors,
  bibleVerse: COLLECTIONS.bibleVerses,
};

function collectSpecTargets(
  specs: readonly ReferencePathSpec[],
  contentTargets: Set<CollectionName>,
  hasMedia: { value: boolean },
): void {
  for (const spec of specs) {
    if (
      spec.kind === "media" ||
      spec.kind === "mediaArray" ||
      spec.kind === "localizedMedia" ||
      spec.kind === "localizedRichText"
    ) {
      hasMedia.value = true;
    } else if (spec.kind === "content" || spec.kind === "contentArray") {
      contentTargets.add(spec.target);
    } else if (spec.kind === "itemList") {
      collectSpecTargets(spec.itemPaths, contentTargets, hasMedia);
    }
  }
}

function buildReferenceIndexMaps(): {
  referencingByTarget: Readonly<
    Partial<Record<CollectionName, readonly ContentCollectionName[]>>
  >;
  mediaReferencingCollections: readonly ContentCollectionName[];
} {
  const targetMap = new Map<CollectionName, Set<ContentCollectionName>>();
  const mediaSet = new Set<ContentCollectionName>();

  for (const [concreteType, specs] of Object.entries(REFERENCE_PATHS) as Array<
    [ConcreteContentType, readonly ReferencePathSpec[]]
  >) {
    const sourceCollection = CONCRETE_TYPE_TO_COLLECTION[concreteType];
    const targets = new Set<CollectionName>();
    const hasMedia = { value: false };
    collectSpecTargets(specs, targets, hasMedia);

    if (hasMedia.value) mediaSet.add(sourceCollection);
    for (const target of targets) {
      const existing = targetMap.get(target);
      if (existing) {
        existing.add(sourceCollection);
      } else {
        targetMap.set(target, new Set([sourceCollection]));
      }
    }
  }

  const referencingByTarget: Partial<
    Record<CollectionName, readonly ContentCollectionName[]>
  > = {};
  for (const [target, sources] of targetMap.entries()) {
    referencingByTarget[target] = [...sources].sort();
  }

  return {
    referencingByTarget,
    mediaReferencingCollections: [...mediaSet].sort(),
  };
}

const REFERENCE_INDEX_MAPS = buildReferenceIndexMaps();

/** Derived directly from `@idcr/content`'s `REFERENCE_PATHS` — never drifts. */
export const REFERENCING_COLLECTIONS_BY_TARGET =
  REFERENCE_INDEX_MAPS.referencingByTarget;

/** Collections that can reference media ids (plain fields, arrays, or rich text). */
export const MEDIA_REFERENCING_COLLECTIONS =
  REFERENCE_INDEX_MAPS.mediaReferencingCollections;

export function isFixedCollection(collection: ContentCollectionName): boolean {
  return COLLECTION_META[collection].kind === "fixed";
}

/**
 * Resolves the concrete schema key (`ConcreteContentType`) for validation and
 * reference extraction. For `globals`, derives from `snapshot.kind` so fields
 * belonging to another global kind cannot slip through on `saveDraft` or publish.
 */
export function resolveConcreteType(
  collection: ContentCollectionName,
  snapshot: Record<string, unknown>,
): ConcreteContentType | null {
  if (collection !== "globals") {
    return COLLECTION_META[collection].contentType as ConcreteContentType;
  }
  const kind = snapshot.kind;
  if (
    typeof kind === "string" &&
    Object.prototype.hasOwnProperty.call(GLOBAL_KIND, kind)
  ) {
    return kind as ConcreteContentType;
  }
  return null;
}

/**
 * Returns true if the document is visible in fixed-entry lists/lookups
 * (`F-editor-ux` §2.8). Non-fixed collections always return true.
 */
export function isVisibleFixedEntry(
  collection: ContentCollectionName,
  draft: Record<string, unknown>,
): boolean {
  if (!isFixedCollection(collection)) return true;
  const machineName = draft.machineName;
  if (typeof machineName !== "string") return false;
  return isRegisteredFixedEntry(
    COLLECTION_META[collection].contentType as FixedEntryType,
    machineName,
  );
}

/**
 * Downgrade-proof protection predicate (`ICR-195` AC6):
 * - ALL `belief_collections` are protected by type.
 * - `topics` are protected when ANY of `published.protected`, `draft.protected`,
 *   or an incoming `patch.protected` is `true`.
 */
export function isEntryProtected(
  collection: ContentCollectionName,
  draft: Record<string, unknown> | undefined,
  published?: Record<string, unknown>,
  incomingPatch?: Record<string, unknown>,
): boolean {
  if (COLLECTION_META[collection].isProtectedByType) return true;
  if (collection !== "topics") return false;
  return (
    published?.protected === true ||
    draft?.protected === true ||
    incomingPatch?.protected === true
  );
}

/**
 * True when a `topics` save attempts to change `protected` in EITHER direction
 * (`true -> false/undefined` OR `false/undefined -> true`).
 */
export function isProtectedFlagToggled(
  collection: ContentCollectionName,
  existingDraft: Record<string, unknown>,
  incomingPatch: Record<string, unknown>,
): boolean {
  if (collection !== "topics") return false;
  if (!Object.prototype.hasOwnProperty.call(incomingPatch, "protected")) {
    return false;
  }
  return Boolean(incomingPatch.protected) !== Boolean(existingDraft.protected);
}

/**
 * Modular Q2 gate: whether `publishContent` requires `approvedConfirmed === true`
 * on protected publishes. Default `false` (permission alone gates v1); toggled
 * cleanly if owner selects Option B.
 */
export function shouldRequireProtectedApproval(): boolean {
  return false;
}

interface ContactFieldLike {
  inputId?: unknown;
  type?: unknown;
  required?: unknown;
}

/**
 * Checks structural immutability rules for fixed entries (`F-editor-ux` §2.8, §6):
 * - `machineName` is immutable on all fixed collections.
 * - `layout` is immutable on `sections`.
 * - `kind` is immutable on `globals`.
 * - `contactForm.fields` may edit labels/placeholders/dropdown values only;
 *   `inputId`, `type`, `required`, count, and order are locked.
 */
export function findImmutableFieldViolation(
  collection: ContentCollectionName,
  existingDraft: Record<string, unknown>,
  changedPatch: Record<string, unknown>,
  unsetFields: readonly string[],
): string | null {
  if (!isFixedCollection(collection)) return null;

  if (
    Object.prototype.hasOwnProperty.call(changedPatch, "machineName") ||
    unsetFields.includes("machineName")
  ) {
    return "machineName";
  }

  if (
    collection === "sections" &&
    (Object.prototype.hasOwnProperty.call(changedPatch, "layout") ||
      unsetFields.includes("layout"))
  ) {
    return "layout";
  }

  if (
    collection === "globals" &&
    (Object.prototype.hasOwnProperty.call(changedPatch, "kind") ||
      unsetFields.includes("kind"))
  ) {
    return "kind";
  }

  if (collection === "globals" && existingDraft.kind === "contactForm") {
    if (unsetFields.includes("fields")) return "fields";
    if (Object.prototype.hasOwnProperty.call(changedPatch, "fields")) {
      const prev = existingDraft.fields;
      const next = changedPatch.fields;
      if (!Array.isArray(prev) || !Array.isArray(next)) return "fields";
      if (prev.length !== next.length) return "fields";
      for (let i = 0; i < prev.length; i += 1) {
        const prevItem = prev[i] as ContactFieldLike | undefined;
        const nextItem = next[i] as ContactFieldLike | undefined;
        if (
          !prevItem ||
          !nextItem ||
          prevItem.inputId !== nextItem.inputId ||
          prevItem.type !== nextItem.type ||
          prevItem.required !== nextItem.required
        ) {
          return "fields";
        }
      }
    }
  }

  return null;
}

export interface DiffPatchResult {
  readonly changedFields: string[];
  /** Own keys present in `patch` with non-undefined values that differ from `existingDraft`. */
  readonly setPatch: Record<string, unknown>;
  /** Own keys explicitly passed as `undefined` in `patch` that currently exist on `existingDraft`. */
  readonly unsetFields: string[];
}

/**
 * Compares `patch` against `existingDraft` using `@idcr/content`'s
 * `canonicalEqual`. Unchanged fields (including untouched rich text or slugs)
 * are omitted so they are neither re-validated nor written (`ICR-195` AC5, `H` #5).
 */
export function diffChangedFields(
  existingDraft: Record<string, unknown>,
  patch: Record<string, unknown>,
): DiffPatchResult {
  const changedFields: string[] = [];
  const setPatch: Record<string, unknown> = {};
  const unsetFields: string[] = [];

  for (const key of Object.keys(patch)) {
    const incoming = patch[key];
    const current = existingDraft[key];
    if (canonicalEqual(current, incoming)) continue;

    changedFields.push(key);
    if (incoming === undefined) {
      unsetFields.push(key);
    } else {
      setPatch[key] = incoming;
    }
  }

  changedFields.sort();
  return { changedFields, setPatch, unsetFields };
}

/**
 * Recursively strips keys whose value is `undefined` so MongoDB's default
 * `ignoreUndefined: false` never serializes them to BSON `null` (which would
 * break Zod `.optional()` on read-back — see `role.service.ts`).
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      cleaned[k] = stripUndefinedDeep(v);
    }
  }
  return cleaned as T;
}

/**
 * Computes the natural key for audit logs and (for `bible_verses`) the unique
 * `_naturalKey` MongoDB index field. Returns `undefined` when an incomplete
 * draft lacks the required components.
 */
export function computeNaturalKey(
  collection: ContentCollectionName,
  draft: Record<string, unknown>,
): string | undefined {
  if (isFixedCollection(collection)) {
    return typeof draft.machineName === "string"
      ? draft.machineName
      : undefined;
  }
  if (collection === "posts" || collection === "sermons") {
    return typeof draft.slug === "string" && draft.slug.length > 0
      ? draft.slug
      : undefined;
  }
  if (collection === "topics") {
    const slug = draft.slug as Record<string, unknown> | undefined;
    return typeof slug?.["es-AR"] === "string" && slug["es-AR"].length > 0
      ? slug["es-AR"]
      : undefined;
  }
  if (collection === "bible_verses") {
    const book = (draft.book as Record<string, unknown> | undefined)?.["es-AR"];
    const version = (draft.version as Record<string, unknown> | undefined)?.[
      "es-AR"
    ];
    const chapter = draft.chapter;
    const fromVerse = draft.fromVerse;
    const toVerse = draft.toVerse;
    if (
      typeof book !== "string" ||
      book.trim() === "" ||
      typeof version !== "string" ||
      version.trim() === "" ||
      (typeof chapter !== "number" && typeof chapter !== "string") ||
      (typeof fromVerse !== "number" && typeof fromVerse !== "string")
    ) {
      return undefined;
    }
    try {
      return bibleVerseKey({
        book,
        chapter,
        fromVerse,
        toVerse:
          typeof toVerse === "number" || typeof toVerse === "string"
            ? toVerse
            : undefined,
        version,
      });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Human-friendly label for `ContentReferenceUsage.label` ("used in" dialogs). */
export function extractEntryLabel(
  collection: ContentCollectionName,
  draft: Record<string, unknown>,
  fallbackId: string,
): string {
  const esString = (field: unknown): string | undefined => {
    if (typeof field === "string" && field.trim().length > 0) return field;
    if (field && typeof field === "object") {
      const val = (field as Record<string, unknown>)["es-AR"];
      if (typeof val === "string" && val.trim().length > 0) return val;
    }
    return undefined;
  };

  if (collection === "bible_verses") {
    const book = esString(draft.book);
    if (book && draft.chapter && draft.fromVerse) {
      const range =
        draft.toVerse && draft.toVerse !== draft.fromVerse
          ? `${draft.fromVerse}-${draft.toVerse}`
          : String(draft.fromVerse);
      const version = esString(draft.version);
      return version
        ? `${book} ${draft.chapter}:${range} (${version})`
        : `${book} ${draft.chapter}:${range}`;
    }
  }

  return (
    esString(draft.title) ??
    esString(draft.name) ??
    esString(draft.headline) ??
    esString(draft.machineName) ??
    esString(draft.slug) ??
    fallbackId
  );
}
