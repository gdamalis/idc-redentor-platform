import type {
  AuthorFields,
  BeliefCollectionFields,
  BibleVerseFields,
  BibleVerseKeyInput,
  EventBannerFields,
  GlobalFields,
  Locale,
  PostFields,
  SectionFields,
  SeoEntryFields,
  SermonFields,
  TopicFields,
} from "@idcr/content";
import type { ContentCaller } from "@src/lib/content/caller";
import type { ContentCollectionName } from "@src/lib/content/errors";
import {
  createContent,
  defaultContentServiceDeps,
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
  updateSermonPdfMedia,
  type ContentServiceDeps,
  type ListContentOptions,
  type NaturalKeyQuery,
  type UpdateSermonPdfMediaInput,
} from "./content-core.service";

interface SaveInput<TFields> {
  readonly docId: string;
  readonly patch: Partial<TFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

interface PublishInput<TFields> {
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  readonly draftPatch?: Partial<TFields>;
  readonly notify?: boolean;
  readonly approvedConfirmed?: boolean;
}

interface RevisionedIdInput {
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}

/** Fixed-entry facade: omits `create`, `unpublish`, `delete` at the type level (runtime core also refuses them). */
function createFixedService<
  TFields,
  TCollection extends
    | "sections"
    | "belief_collections"
    | "event_banners"
    | "seo_entries"
    | "globals",
>(collection: TCollection) {
  return {
    collection,
    getById: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => getContentById<TFields>(caller, collection, docId, deps),
    getByMachineName: (
      caller: ContentCaller,
      machineName: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => getContentByNaturalKey<TFields>(caller, collection, machineName, deps),
    list: (
      caller: ContentCaller,
      options?: ListContentOptions,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => listContent<TFields>(caller, collection, options, deps),
    saveDraft: (
      caller: ContentCaller,
      input: SaveInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => saveDraft<TFields>(caller, { collection, ...input }, deps),
    publish: (
      caller: ContentCaller,
      input: PublishInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => publishContent<TFields>(caller, { collection, ...input }, deps),
    discardChanges: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => discardChanges<TFields>(caller, { collection, ...input }, deps),
    retryRevalidation: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => retryRevalidation(caller, collection, docId, deps),
  };
}

/** Editorial facade (`posts`, `sermons`, `topics`): full CRUD + publish + unpublish + usages. */
function createEditorialService<
  TFields,
  TCollection extends "posts" | "sermons" | "topics",
  TKey extends NaturalKeyQuery,
>(collection: TCollection) {
  return {
    collection,
    getById: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => getContentById<TFields>(caller, collection, docId, deps),
    getByNaturalKey: (
      caller: ContentCaller,
      key: TKey,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => getContentByNaturalKey<TFields>(caller, collection, key, deps),
    list: (
      caller: ContentCaller,
      options?: ListContentOptions,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => listContent<TFields>(caller, collection, options, deps),
    findUsages: (
      caller: ContentCaller,
      docId: string,
      options?: { readonly publishedOnly?: boolean },
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => findContentUsages(caller, { collection, docId }, options, deps),
    create: (
      caller: ContentCaller,
      draft: TFields,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => createContent<TFields>(caller, { collection, draft }, deps),
    saveDraft: (
      caller: ContentCaller,
      input: SaveInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => saveDraft<TFields>(caller, { collection, ...input }, deps),
    publish: (
      caller: ContentCaller,
      input: PublishInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => publishContent<TFields>(caller, { collection, ...input }, deps),
    unpublish: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => unpublishContent<TFields>(caller, { collection, ...input }, deps),
    discardChanges: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => discardChanges<TFields>(caller, { collection, ...input }, deps),
    delete: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => deleteContent(caller, { collection, ...input }, deps),
    retryRevalidation: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => retryRevalidation(caller, collection, docId, deps),
  };
}

/** Library facade (`authors`, `bible_verses`): CRUD + publish + delete; omits `unpublish` (`F` §2.2/§2.5). */
function createLibraryService<
  TFields,
  TCollection extends "authors" | "bible_verses",
>(collection: TCollection) {
  return {
    collection,
    getById: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => getContentById<TFields>(caller, collection, docId, deps),
    list: (
      caller: ContentCaller,
      options?: ListContentOptions,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => listContent<TFields>(caller, collection, options, deps),
    findUsages: (
      caller: ContentCaller,
      docId: string,
      options?: { readonly publishedOnly?: boolean },
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => findContentUsages(caller, { collection, docId }, options, deps),
    create: (
      caller: ContentCaller,
      draft: TFields,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => createContent<TFields>(caller, { collection, draft }, deps),
    saveDraft: (
      caller: ContentCaller,
      input: SaveInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => saveDraft<TFields>(caller, { collection, ...input }, deps),
    publish: (
      caller: ContentCaller,
      input: PublishInput<TFields>,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => publishContent<TFields>(caller, { collection, ...input }, deps),
    discardChanges: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => discardChanges<TFields>(caller, { collection, ...input }, deps),
    delete: (
      caller: ContentCaller,
      input: RevisionedIdInput,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => deleteContent(caller, { collection, ...input }, deps),
    retryRevalidation: (
      caller: ContentCaller,
      docId: string,
      deps: ContentServiceDeps = defaultContentServiceDeps,
    ) => retryRevalidation(caller, collection, docId, deps),
  };
}

// ── Fixed-entry services ────────────────────────────────────────────────────

export const sectionService = createFixedService<SectionFields, "sections">(
  "sections",
);
export const beliefCollectionService = createFixedService<
  BeliefCollectionFields,
  "belief_collections"
>("belief_collections");
export const eventBannerService = createFixedService<
  EventBannerFields,
  "event_banners"
>("event_banners");
export const seoEntryService = createFixedService<SeoEntryFields, "seo_entries">(
  "seo_entries",
);
export const globalService = createFixedService<GlobalFields, "globals">(
  "globals",
);

// ── Editorial services ──────────────────────────────────────────────────────

export const postService = createEditorialService<PostFields, "posts", string>(
  "posts",
);

export const sermonService = {
  ...createEditorialService<SermonFields, "sermons", string>("sermons"),
  updatePdfMedia: (
    caller: ContentCaller,
    input: UpdateSermonPdfMediaInput,
    deps: ContentServiceDeps = defaultContentServiceDeps,
  ) => updateSermonPdfMedia(caller, input, deps),
};

export const topicService = createEditorialService<
  TopicFields,
  "topics",
  string | { readonly locale: Locale; readonly slug: string }
>("topics");

// ── Library services ────────────────────────────────────────────────────────

export const authorService = createLibraryService<AuthorFields, "authors">(
  "authors",
);

export const bibleVerseService = {
  ...createLibraryService<BibleVerseFields, "bible_verses">("bible_verses"),
  getByNaturalKey: (
    caller: ContentCaller,
    key: string | BibleVerseKeyInput,
    deps: ContentServiceDeps = defaultContentServiceDeps,
  ) =>
    getContentByNaturalKey<BibleVerseFields>(caller, "bible_verses", key, deps),
};

export const CONTENT_SERVICES = {
  sections: sectionService,
  belief_collections: beliefCollectionService,
  event_banners: eventBannerService,
  seo_entries: seoEntryService,
  globals: globalService,
  posts: postService,
  sermons: sermonService,
  topics: topicService,
  authors: authorService,
  bible_verses: bibleVerseService,
} as const satisfies Record<ContentCollectionName, unknown>;
