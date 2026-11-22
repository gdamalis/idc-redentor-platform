import type { GlobalKind } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";

export type HubGroupKey = "publishing" | "sitePages" | "site" | "library";

export type ContentDestinationKey =
  | "sermons"
  | "posts"
  | "sections"
  | "beliefCollections"
  | "eventBanner"
  | "topics"
  | "menu"
  | "footer"
  | "location"
  | "subscribeForm"
  | "contactForm"
  | "seo"
  | "media"
  | "authors"
  | "verses";

export interface ContentDestinationMeta {
  readonly key: ContentDestinationKey;
  readonly group: HubGroupKey;
  readonly href: string;
  readonly collection?: ContentCollectionName;
  readonly globalKind?: GlobalKind;
  readonly fixedMachineName?: string;
  readonly kind: "fixed" | "editorial" | "library" | "media";
  /** True when the hub card opens the entry editor directly (singleton fixed entries). */
  readonly isDirectEditor: boolean;
  readonly canCreate: boolean;
  readonly supportsPreview: boolean;
  readonly isProtectedByType?: boolean;
}

/**
 * Pure declarative route catalog for `/content/**` with ZERO imports of editor
 * components — shared safely by the Hub, list pages, breadcrumbs, and "Used in"
 * links across Waves 2–4.
 */
export const CONTENT_DESTINATIONS: readonly ContentDestinationMeta[] = [
  // Publishing
  {
    key: "sermons",
    group: "publishing",
    href: "/content/sermons",
    collection: "sermons",
    kind: "editorial",
    isDirectEditor: false,
    canCreate: true,
    supportsPreview: true,
  },
  {
    key: "posts",
    group: "publishing",
    href: "/content/posts",
    collection: "posts",
    kind: "editorial",
    isDirectEditor: false,
    canCreate: true,
    supportsPreview: true,
  },
  // Site pages
  {
    key: "sections",
    group: "sitePages",
    href: "/content/sections",
    collection: "sections",
    kind: "fixed",
    isDirectEditor: false,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "beliefCollections",
    group: "sitePages",
    href: "/content/belief-collections",
    collection: "belief_collections",
    kind: "fixed",
    isDirectEditor: false,
    canCreate: false,
    supportsPreview: true,
    isProtectedByType: true,
  },
  {
    key: "eventBanner",
    group: "sitePages",
    href: "/content/event-banner",
    collection: "event_banners",
    fixedMachineName: "event-sunday-meetings",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "topics",
    group: "sitePages",
    href: "/content/topics",
    collection: "topics",
    kind: "editorial",
    isDirectEditor: false,
    canCreate: true,
    supportsPreview: true,
  },
  // Site
  {
    key: "menu",
    group: "site",
    href: "/content/menu",
    collection: "globals",
    globalKind: "navigationMenu",
    fixedMachineName: "main-menu",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "footer",
    group: "site",
    href: "/content/footer",
    collection: "globals",
    globalKind: "footer",
    fixedMachineName: "footer",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "location",
    group: "site",
    href: "/content/location",
    collection: "globals",
    globalKind: "location",
    fixedMachineName: "location",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "subscribeForm",
    group: "site",
    href: "/content/subscribe-form",
    collection: "globals",
    globalKind: "singleEmailForm",
    fixedMachineName: "single-email-subscribe",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "contactForm",
    group: "site",
    href: "/content/contact-form",
    collection: "globals",
    globalKind: "contactForm",
    fixedMachineName: "contact-form",
    kind: "fixed",
    isDirectEditor: true,
    canCreate: false,
    supportsPreview: true,
  },
  {
    key: "seo",
    group: "site",
    href: "/content/seo",
    collection: "seo_entries",
    kind: "fixed",
    isDirectEditor: false,
    canCreate: false,
    supportsPreview: true,
  },
  // Library
  {
    key: "media",
    group: "library",
    href: "/content/media",
    kind: "media",
    isDirectEditor: false,
    canCreate: false,
    supportsPreview: false,
  },
  {
    key: "authors",
    group: "library",
    href: "/content/authors",
    collection: "authors",
    kind: "library",
    isDirectEditor: false,
    canCreate: true,
    supportsPreview: false,
  },
  {
    key: "verses",
    group: "library",
    href: "/content/verses",
    collection: "bible_verses",
    kind: "library",
    isDirectEditor: false,
    canCreate: true,
    supportsPreview: false,
  },
];

const GLOBAL_KIND_HREF: Readonly<Record<GlobalKind, string>> = {
  navigationMenu: "/content/menu",
  footer: "/content/footer",
  location: "/content/location",
  singleEmailForm: "/content/subscribe-form",
  contactForm: "/content/contact-form",
};

const COLLECTION_LIST_HREF: Readonly<Record<ContentCollectionName, string>> = {
  sermons: "/content/sermons",
  posts: "/content/posts",
  topics: "/content/topics",
  sections: "/content/sections",
  belief_collections: "/content/belief-collections",
  event_banners: "/content/event-banner",
  seo_entries: "/content/seo",
  globals: "/content",
  authors: "/content/authors",
  bible_verses: "/content/verses",
};

export function getCollectionListHref(
  collection: ContentCollectionName,
  globalKind?: GlobalKind,
): string {
  if (collection === "globals" && globalKind) {
    return GLOBAL_KIND_HREF[globalKind];
  }
  return COLLECTION_LIST_HREF[collection];
}

export function getEntryEditorHref(
  collection: ContentCollectionName,
  docId: string,
  globalKind?: GlobalKind,
): string {
  if (collection === "event_banners") return "/content/event-banner";
  if (collection === "globals" && globalKind) return GLOBAL_KIND_HREF[globalKind];
  if (collection === "globals") return "/content";
  return `${COLLECTION_LIST_HREF[collection]}/${docId}`;
}

export function getNewEntryHref(
  collection: "sermons" | "posts" | "topics" | "authors" | "bible_verses",
): string {
  return `${COLLECTION_LIST_HREF[collection]}/new`;
}

export function getDestinationsByGroup(
  group: HubGroupKey,
): readonly ContentDestinationMeta[] {
  return CONTENT_DESTINATIONS.filter((item) => item.group === group);
}

export function collectionSupportsPreview(
  collection: ContentCollectionName,
): boolean {
  return collection !== "authors" && collection !== "bible_verses";
}
