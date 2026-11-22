import { createHash } from "node:crypto";
import {
  COLLECTIONS,
  CONTENT_SCHEMAS,
  GLOBAL_KIND,
  extractReferences,
  type AuthorFields,
  type BeliefCollectionFields,
  type BeliefItemFields,
  type BibleVerseFields,
  type ContactFormFieldItem,
  type ContactFormFields,
  type EventBannerFields,
  type FooterFields,
  type GlobalFields,
  type Locale,
  type Localized,
  type LocationFields,
  type MenuItemFields,
  type NavigationMenuFields,
  type PostFields,
  type RichTextDoc,
  type RichTextProfile,
  type SectionFields,
  type SeoEntryFields,
  type SermonFields,
  type SingleEmailFormFields,
  type SocialLinkFields,
  type TopicFields,
} from "@idcr/content";
import type { SitePageSlug } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";
import {
  COLLECTION_META,
  computeNaturalKey,
  resolveConcreteType,
  stripUndefinedDeep,
} from "@src/lib/content/guards";
import { scanBrokenLinksInTipTap } from "./guards";
import type { MediaLookup } from "./media-import";
import {
  collapseAsciiWhitespace,
  convertAndVerifyRichText,
  extractPlainTextFromContentful,
  extractPlainTextFromTipTap,
} from "./rich-text";
import {
  computeTipTapSermonContentHash,
  type TipTapSermonHashLocaleInput,
  type TipTapSermonHashScriptureRef,
} from "./sermon-hash";
import type {
  BrokenLinkFinding,
  ContentfulEntry,
  ContentfulEntryState,
  ContentfulLink,
  ContentfulSnapshotManifest,
  ContentfulSys,
  PrivacyPolicyTextCheck,
  RichTextRejectionFinding,
  SkippedEntryReport,
} from "./types";

const LOCALES: readonly Locale[] = ["es-AR", "en-US"];

const EMBEDDED_CONTENT_TYPES = new Set([
  "beliefItem",
  "event",
  "socialLink",
  "menuGroup",
  "formField",
]);

const CONTENT_TYPE_TO_COLLECTION: Readonly<
  Record<string, ContentCollectionName>
> = {
  section: COLLECTIONS.sections,
  contentCollection: COLLECTIONS.beliefCollections,
  eventBanner: COLLECTIONS.eventBanners,
  seo: COLLECTIONS.seoEntries,
  navigationMenu: COLLECTIONS.globals,
  footer: COLLECTIONS.globals,
  singleEmailForm: COLLECTIONS.globals,
  contactForm: COLLECTIONS.globals,
  locationComponent: COLLECTIONS.globals,
  blogPostPage: COLLECTIONS.posts,
  sermon: COLLECTIONS.sermons,
  churchInfoTopic: COLLECTIONS.topics,
  author: COLLECTIONS.authors,
  bibleVerse: COLLECTIONS.bibleVerses,
};

export interface PlannedContentDocument {
  readonly collection: ContentCollectionName;
  readonly sourceContentfulId: string;
  readonly contentType: string;
  readonly state: Exclude<ContentfulEntryState, "archived">;
  readonly docId: string;
  readonly draft: Record<string, unknown>;
  readonly published?: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt?: Date;
  readonly firstPublishedAt?: Date;
  readonly _naturalKey?: string;
  readonly _refs: ReturnType<typeof extractReferences>;
}

export interface ContentTransformPlan {
  readonly documents: readonly PlannedContentDocument[];
  readonly skippedEntries: readonly SkippedEntryReport[];
  readonly richTextRejections: readonly RichTextRejectionFinding[];
  readonly brokenLinks: readonly BrokenLinkFinding[];
  readonly privacyPolicyChecks: readonly PrivacyPolicyTextCheck[];
  readonly errors: readonly string[];
  readonly stateCountsByContentType: Readonly<
    Record<
      string,
      {
        contentfulTotal: number;
        published: number;
        changed: number;
        draft: number;
        archived: number;
      }
    >
  >;
}

/**
 * Classifies a Contentful CMA entry into one of the four lifecycle states.
 * CMA increments `version` by 1 upon publish, so `version === publishedVersion + 1`
 * means cleanly published and `version > publishedVersion + 1` means changed.
 */
export function classifyContentfulEntryState(
  sys: ContentfulSys,
): ContentfulEntryState {
  if (sys.archivedVersion !== undefined && sys.archivedVersion !== null) {
    return "archived";
  }
  if (sys.publishedVersion === undefined || sys.publishedVersion === null) {
    return "draft";
  }
  if (
    sys.version !== undefined &&
    sys.version > sys.publishedVersion + 1
  ) {
    return "changed";
  }
  return "published";
}

function isLink(value: unknown): value is ContentfulLink {
  if (!value || typeof value !== "object") return false;
  const sys = (value as { sys?: unknown }).sys;
  if (!sys || typeof sys !== "object") return false;
  const s = sys as { type?: unknown; linkType?: unknown; id?: unknown };
  return (
    s.type === "Link" &&
    (s.linkType === "Entry" || s.linkType === "Asset") &&
    typeof s.id === "string" &&
    s.id.length > 0
  );
}

function getFieldLocaleMap(
  entry: ContentfulEntry,
  field: string,
): Readonly<Record<string, unknown>> | undefined {
  const val = entry.fields?.[field];
  if (!val || typeof val !== "object" || Array.isArray(val)) return undefined;
  return val;
}

function getDefaultField<T = unknown>(
  entry: ContentfulEntry,
  field: string,
): T | undefined {
  const map = getFieldLocaleMap(entry, field);
  if (!map) return undefined;
  return (map["es-AR"] ?? map["en-US"]) as T | undefined;
}

function getLocalizedString(
  entry: ContentfulEntry,
  field: string,
): Localized<string> | undefined {
  const map = getFieldLocaleMap(entry, field);
  if (!map) return undefined;
  const out: Partial<Localized<string>> = {};
  if (typeof map["es-AR"] === "string") {
    out["es-AR"] = map["es-AR"];
  }
  if (typeof map["en-US"] === "string") {
    out["en-US"] = map["en-US"];
  }
  return Object.keys(out).length > 0 ? (out as Localized<string>) : undefined;
}

function getLocalizedStringArray(
  entry: ContentfulEntry,
  field: string,
): Localized<string[]> | undefined {
  const map = getFieldLocaleMap(entry, field);
  if (!map) return undefined;
  const out: Partial<Localized<string[]>> = {};
  if (Array.isArray(map["es-AR"])) {
    out["es-AR"] = map["es-AR"].filter((x): x is string => typeof x === "string");
  }
  if (Array.isArray(map["en-US"])) {
    out["en-US"] = map["en-US"].filter((x): x is string => typeof x === "string");
  }
  return Object.keys(out).length > 0 ? (out as Localized<string[]>) : undefined;
}

function getLinkId(entry: ContentfulEntry, field: string): string | undefined {
  const raw = getDefaultField(entry, field);
  return isLink(raw) ? raw.sys.id : undefined;
}

function getLinkIds(entry: ContentfulEntry, field: string): string[] {
  const raw = getDefaultField(entry, field);
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (isLink(item)) ids.push(item.sys.id);
  }
  return ids;
}

function getLocalizedAssetLinkIds(
  entry: ContentfulEntry,
  field: string,
): Partial<Record<Locale, string>> {
  const map = getFieldLocaleMap(entry, field);
  if (!map) return {};
  const out: Partial<Record<Locale, string>> = {};
  for (const locale of LOCALES) {
    const val = map[locale];
    if (isLink(val) && val.sys.linkType === "Asset") {
      out[locale] = val.sys.id;
    }
  }
  return out;
}

function collectEmbeddedAssetIdsFromRawRichText(
  doc: unknown,
  out: Set<string>,
): void {
  if (!doc || typeof doc !== "object") return;
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    if (record.nodeType === "embedded-asset-block") {
      const data = record.data as Record<string, unknown> | undefined;
      const target = data?.target as Record<string, unknown> | undefined;
      const sys = target?.sys as Record<string, unknown> | undefined;
      if (typeof sys?.id === "string" && sys.id.length > 0) {
        out.add(sys.id);
      }
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) stack.push(child);
    }
  }
}

/**
 * Walks all non-archived entries (both CMA draft and CDA published) and collects
 * every referenced Contentful asset ID (direct asset links + rich-text embedded blocks).
 */
export function collectReferencedAssetIds(
  manifest: ContentfulSnapshotManifest,
): Set<string> {
  const referenced = new Set<string>();
  const scanEntry = (entry: ContentfulEntry) => {
    for (const localeMap of Object.values(entry.fields ?? {})) {
      if (!localeMap || typeof localeMap !== "object") continue;
      for (const value of Object.values(localeMap)) {
        if (isLink(value) && value.sys.linkType === "Asset") {
          referenced.add(value.sys.id);
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (isLink(item) && item.sys.linkType === "Asset") {
              referenced.add(item.sys.id);
            }
          }
        } else if (
          value &&
          typeof value === "object" &&
          (value as { nodeType?: unknown }).nodeType === "document"
        ) {
          collectEmbeddedAssetIdsFromRawRichText(value, referenced);
        }
      }
    }
  };

  for (const entry of manifest.cmaEntries) {
    if (classifyContentfulEntryState(entry.sys) === "archived") continue;
    scanEntry(entry);
  }
  for (const entry of manifest.cdaPublishedEntries) {
    scanEntry(entry);
  }
  return referenced;
}

function deterministicEntryObjectId(
  collection: ContentCollectionName,
  contentfulId: string,
): string {
  return createHash("sha256")
    .update(`entry:${collection}:${contentfulId}`)
    .digest("hex")
    .slice(0, 24);
}

function parseIntField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) {
    return Number.parseInt(value.trim(), 10);
  }
  return undefined;
}

function parseIsoDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function parseDateOrFallback(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Pure two-pass transformer converting every Contentful entry in the frozen snapshot
 * into schema-validated MongoDB content envelopes (`draft` + optional `published`).
 */
export function planContentImport(
  manifest: ContentfulSnapshotManifest,
  mediaLookup: MediaLookup,
  existingIdsByCollection: ReadonlyMap<
    ContentCollectionName,
    ReadonlyMap<string, string>
  > = new Map(),
): ContentTransformPlan {
  const skippedEntries: SkippedEntryReport[] = [];
  const richTextRejections: RichTextRejectionFinding[] = [];
  const brokenLinks: BrokenLinkFinding[] = [];
  const privacyPolicyChecks: PrivacyPolicyTextCheck[] = [];
  const errors: string[] = [];

  const stateCountsByContentType: Record<
    string,
    {
      contentfulTotal: number;
      published: number;
      changed: number;
      draft: number;
      archived: number;
    }
  > = {};

  const bumpStateCount = (ct: string, state: ContentfulEntryState) => {
    const bucket = (stateCountsByContentType[ct] ??= {
      contentfulTotal: 0,
      published: 0,
      changed: 0,
      draft: 0,
      archived: 0,
    });
    bucket.contentfulTotal += 1;
    bucket[state] += 1;
  };

  const cmaById = new Map<string, ContentfulEntry>();
  const cdaById = new Map<string, ContentfulEntry>();

  for (const entry of manifest.cmaEntries) {
    cmaById.set(entry.sys.id, entry);
  }
  for (const entry of manifest.cdaPublishedEntries) {
    cdaById.set(entry.sys.id, entry);
  }

  // Pass 1: classify states, record skipped types/entries, and allocate stable Mongo `_id`s
  const entryIdMap = new Map<string, string>();
  const activeTopLevel: Array<{
    readonly cmaEntry: ContentfulEntry;
    readonly cdaEntry?: ContentfulEntry;
    readonly contentType: string;
    readonly collection: ContentCollectionName;
    readonly state: Exclude<ContentfulEntryState, "archived">;
    readonly docId: string;
  }> = [];

  const sortedCmaEntries = [...manifest.cmaEntries].sort((a, b) =>
    a.sys.id.localeCompare(b.sys.id),
  );

  for (const entry of sortedCmaEntries) {
    const contentType = entry.sys.contentType?.sys?.id ?? "unknown";
    const state = classifyContentfulEntryState(entry.sys);
    bumpStateCount(contentType, state);

    if (state === "archived") {
      skippedEntries.push({
        contentfulId: entry.sys.id,
        contentType,
        reason: "archived",
      });
      continue;
    }

    if (contentType === "page") {
      skippedEntries.push({
        contentfulId: entry.sys.id,
        contentType,
        reason: "flattened-page",
        detail: `Flattened into slug "${String(getDefaultField(entry, "slug") ?? "")}"`,
      });
      continue;
    }

    if (EMBEDDED_CONTENT_TYPES.has(contentType)) {
      skippedEntries.push({
        contentfulId: entry.sys.id,
        contentType,
        reason: "embedded-child",
      });
      continue;
    }

    if (contentType === "seo") {
      const machineName = getDefaultField<string>(entry, "machineName");
      if (machineName === "seo-predicas") {
        skippedEntries.push({
          contentfulId: entry.sys.id,
          contentType,
          reason: "unused-seo-predicas",
          detail: "Unused SEO entry omitted per designer decision 13.4",
        });
        continue;
      }
    }

    const collection = CONTENT_TYPE_TO_COLLECTION[contentType];
    if (!collection) {
      skippedEntries.push({
        contentfulId: entry.sys.id,
        contentType,
        reason: "unknown-content-type",
      });
      continue;
    }

    const existingId = existingIdsByCollection
      .get(collection)
      ?.get(entry.sys.id);
    const docId =
      existingId ?? deterministicEntryObjectId(collection, entry.sys.id);
    entryIdMap.set(entry.sys.id, docId);

    const cdaEntry =
      state === "published" || state === "changed"
        ? cdaById.get(entry.sys.id)
        : undefined;

    if (state === "changed" && !cdaEntry) {
      errors.push(
        `Entry ${entry.sys.id} (${contentType}) is in "changed" state but missing from CDA published entries snapshot`,
      );
      continue;
    }

    activeTopLevel.push({
      cmaEntry: entry,
      cdaEntry: cdaEntry ?? (state === "published" ? entry : undefined),
      contentType,
      collection,
      state,
      docId,
    });
  }

  // Helper to resolve a linked entry in the matching snapshot ("draft" -> CMA, "published" -> CDA fallback CMA)
  const resolveLinkedEntry = (
    id: string | undefined,
    snapshotKind: "draft" | "published",
  ): ContentfulEntry | undefined => {
    if (!id) return undefined;
    if (snapshotKind === "published") {
      return cdaById.get(id) ?? cmaById.get(id);
    }
    return cmaById.get(id);
  };

  const resolvePageSlug = (
    pageEntryId: string | undefined,
    snapshotKind: "draft" | "published",
    ownerLabel: string,
    required: boolean,
  ): SitePageSlug | undefined => {
    if (!pageEntryId) {
      if (required) {
        errors.push(`Missing required page link on ${ownerLabel} (${snapshotKind})`);
      }
      return undefined;
    }
    const pageEntry = resolveLinkedEntry(pageEntryId, snapshotKind);
    const slug = pageEntry
      ? getDefaultField<string>(pageEntry, "slug")?.trim()
      : undefined;
    if (!slug) {
      errors.push(
        `Broken page link "${pageEntryId}" on ${ownerLabel} (${snapshotKind}): target page missing or has no slug`,
      );
      return undefined;
    }
    return slug as SitePageSlug;
  };

  const resolveMediaOrError = (
    assetId: string | undefined,
    locale: Locale | undefined,
    ownerLabel: string,
  ): string | undefined => {
    if (!assetId) return undefined;
    const mediaId = mediaLookup.resolveMediaId(assetId, locale);
    if (!mediaId) {
      errors.push(
        `Missing media mapping for Contentful asset "${assetId}" referenced by ${ownerLabel}`,
      );
      return undefined;
    }
    return mediaId;
  };

  const buildEmbeddedAssetIdMap = (
    rawDoc: unknown,
    locale: Locale,
  ): Record<string, string> => {
    const assetIds = new Set<string>();
    collectEmbeddedAssetIdsFromRawRichText(rawDoc, assetIds);
    const map: Record<string, string> = {};
    for (const assetId of assetIds) {
      const mediaId = mediaLookup.resolveMediaId(assetId, locale);
      if (mediaId) {
        map[assetId] = mediaId;
      }
    }
    return map;
  };

  const convertLocalizedRichText = (
    entry: ContentfulEntry,
    field: string,
    profile: RichTextProfile,
    snapshotKind: "draft" | "published",
    contentType: string,
  ): Localized<RichTextDoc> | undefined => {
    const map = getFieldLocaleMap(entry, field);
    if (!map) return undefined;
    const out: Partial<Localized<RichTextDoc>> = {};

    for (const locale of LOCALES) {
      const rawDoc = map[locale];
      if (rawDoc === undefined || rawDoc === null) continue;

      const assetIdMap =
        profile === "sermon" ? buildEmbeddedAssetIdMap(rawDoc, locale) : undefined;
      const result = convertAndVerifyRichText(rawDoc, {
        profile,
        documentId: `${contentType}:${entry.sys.id}:${snapshotKind}:${field}:${locale}`,
        assetIdMap,
      });

      if (!result.ok) {
        const hasRoundTrip = result.issues.some(
          (i) => i.code === "round-trip-mismatch",
        );
        richTextRejections.push({
          sourceContentfulId: entry.sys.id,
          contentType,
          field,
          snapshot: snapshotKind,
          locale,
          stage: hasRoundTrip ? "round-trip" : "convert",
          messages: result.issues.map((i) => i.message),
        });
        continue;
      }

      out[locale] = result.doc;

      // Scan converted doc for broken links on draft snapshot (or published if only recording once)
      if (snapshotKind === "draft") {
        brokenLinks.push(
          ...scanBrokenLinksInTipTap(result.doc, {
            sourceContentfulId: entry.sys.id,
            contentType,
            field,
            locale,
          }),
        );
      }
    }

    return Object.keys(out).length > 0
      ? (out as Localized<RichTextDoc>)
      : undefined;
  };

  // Transform a single entry snapshot (draft or published) into Mongo fields
  const transformSnapshot = (
    entry: ContentfulEntry,
    contentType: string,
    snapshotKind: "draft" | "published",
  ): Record<string, unknown> => {
    const owner = `${contentType}:${entry.sys.id}`;

    switch (contentType) {
      case "author": {
        const avatarAssetId = getLinkId(entry, "avatar");
        const fields: AuthorFields = {
          name: getDefaultField<string>(entry, "name") ?? "",
          ...(avatarAssetId && {
            avatarMediaId: resolveMediaOrError(avatarAssetId, undefined, owner),
          }),
          ...(typeof getDefaultField(entry, "email") === "string" && {
            email: getDefaultField<string>(entry, "email"),
          }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "bibleVerse": {
        // Preserve ALL strings verbatim (including "RVR" and trailing spaces per owner decision)
        const book = getLocalizedString(entry, "book") ?? { "es-AR": "" };
        const chapter = parseIntField(getDefaultField(entry, "chapter"));
        const fromVerse = parseIntField(getDefaultField(entry, "fromVerse"));
        const toVerse = parseIntField(getDefaultField(entry, "toVerse"));
        if (chapter === undefined || fromVerse === undefined) {
          errors.push(
            `Bible verse ${entry.sys.id} (${snapshotKind}) has non-numeric chapter/fromVerse`,
          );
        }
        const fields: BibleVerseFields = {
          book,
          chapter: chapter ?? 1,
          fromVerse: fromVerse ?? 1,
          ...(toVerse !== undefined && { toVerse }),
          text: getLocalizedString(entry, "verseContent"),
          version: getLocalizedString(entry, "bibleVersion"),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "section": {
        const targetPageLink = getLinkId(entry, "targetPage");
        const targetPage = resolvePageSlug(
          targetPageLink,
          snapshotKind,
          owner,
          false,
        );
        const imageAssetId = getLinkId(entry, "image");
        const imageAssetIds = getLinkIds(entry, "images");
        const images = imageAssetIds
          .map((id) => resolveMediaOrError(id, undefined, owner))
          .filter((id): id is string => id !== undefined);
        const rawUrlParams = getDefaultField<string>(entry, "urlParameters");

        const fields: SectionFields = {
          machineName: getDefaultField<string>(entry, "machineName") ?? "",
          layout: getDefaultField<SectionFields["layout"]>(entry, "layout"),
          headline: getLocalizedString(entry, "headline"),
          subHeadline: getLocalizedString(entry, "subHeadline"),
          body: convertLocalizedRichText(
            entry,
            "body",
            "inline",
            snapshotKind,
            contentType,
          ),
          ctaText: getLocalizedString(entry, "ctaText"),
          ...(targetPage && { targetPage }),
          ...(typeof rawUrlParams === "string" &&
            rawUrlParams.length > 0 && { urlParameters: rawUrlParams }),
          ...(imageAssetId && {
            image: resolveMediaOrError(imageAssetId, undefined, owner),
          }),
          ...(images.length > 0 && { images }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "contentCollection": {
        const itemIds = getLinkIds(entry, "contentItems");
        const items: BeliefItemFields[] = [];
        for (const itemId of itemIds) {
          const itemEntry = resolveLinkedEntry(itemId, snapshotKind);
          if (!itemEntry) {
            errors.push(
              `Missing linked beliefItem "${itemId}" on ${owner} (${snapshotKind})`,
            );
            continue;
          }
          const verseCfId = getLinkId(itemEntry, "bibleVerse");
          const bibleVerseId = verseCfId ? entryIdMap.get(verseCfId) : undefined;
          if (verseCfId && !bibleVerseId) {
            errors.push(
              `Missing mapped bibleVerse "${verseCfId}" on beliefItem "${itemId}"`,
            );
          }
          const imgCfId = getLinkId(itemEntry, "image");
          items.push(
            stripUndefinedDeep({
              title: getLocalizedString(itemEntry, "title"),
              description: convertLocalizedRichText(
                itemEntry,
                "description",
                "inline",
                snapshotKind,
                "beliefItem",
              ),
              ...(bibleVerseId && { bibleVerseId }),
              kind: getDefaultField<BeliefItemFields["kind"]>(
                itemEntry,
                "kind",
              ),
              ...(imgCfId && {
                imageId: resolveMediaOrError(
                  imgCfId,
                  undefined,
                  `beliefItem:${itemId}`,
                ),
              }),
            }),
          );
        }

        const fields: BeliefCollectionFields = {
          machineName: getDefaultField<string>(entry, "machineName") ?? "",
          title: getLocalizedString(entry, "title"),
          description: convertLocalizedRichText(
            entry,
            "description",
            "inline",
            snapshotKind,
            contentType,
          ),
          items,
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "eventBanner": {
        const eventLinkId = getLinkId(entry, "eventInfo");
        const eventEntry = resolveLinkedEntry(eventLinkId, snapshotKind);
        const imageAssetId = getLinkId(entry, "image");
        const rawDate = eventEntry
          ? parseIsoDateOnly(getDefaultField(eventEntry, "date"))
          : undefined;
        const fields: EventBannerFields = {
          machineName: getDefaultField<string>(entry, "machineName") ?? "",
          ...(eventEntry && {
            event: stripUndefinedDeep({
              name: getLocalizedString(eventEntry, "name"),
              dayOfWeek: getLocalizedString(eventEntry, "dayOfWeek"),
              note: getLocalizedString(eventEntry, "note"),
              time: getDefaultField<string>(eventEntry, "time"),
              ...(rawDate && { date: rawDate }),
            }),
          }),
          ...(imageAssetId && {
            image: resolveMediaOrError(imageAssetId, undefined, owner),
          }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "seo": {
        const imageAssetId = getLinkId(entry, "image");
        const fields: SeoEntryFields = {
          machineName: getDefaultField<string>(entry, "machineName") ?? "",
          title: getLocalizedString(entry, "title"),
          description: getLocalizedString(entry, "description"),
          keywords: getLocalizedStringArray(entry, "keywords"),
          ...(imageAssetId && {
            imageId: resolveMediaOrError(imageAssetId, undefined, owner),
          }),
          siteName: getLocalizedString(entry, "siteName"),
          type: getDefaultField<string>(entry, "type"),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "navigationMenu": {
        const groupIds = getLinkIds(entry, "menuItems");
        const menuItems: MenuItemFields[] = [];
        for (const groupId of groupIds) {
          const groupEntry = resolveLinkedEntry(groupId, snapshotKind);
          if (!groupEntry) {
            errors.push(
              `Missing linked menuGroup "${groupId}" on ${owner} (${snapshotKind})`,
            );
            continue;
          }
          const pageLinkId = getLinkId(groupEntry, "groupLink");
          const slug = resolvePageSlug(
            pageLinkId,
            snapshotKind,
            `menuGroup:${groupId}`,
            true,
          );
          menuItems.push(
            stripUndefinedDeep({
              groupName: getLocalizedString(groupEntry, "groupName"),
              ...(slug && { groupLink: slug }),
            }),
          );
        }
        const fields: NavigationMenuFields = {
          kind: GLOBAL_KIND.navigationMenu,
          machineName:
            getDefaultField<string>(entry, "machineName") ?? "main-menu",
          menuItems,
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "footer": {
        const logoAssetId = getLinkId(entry, "logo");
        const socialLinkIds = getLinkIds(entry, "socialLinks");
        const socialLinks: SocialLinkFields[] = [];
        for (const socialId of socialLinkIds) {
          const socialEntry = resolveLinkedEntry(socialId, snapshotKind);
          if (!socialEntry) {
            errors.push(
              `Missing linked socialLink "${socialId}" on ${owner} (${snapshotKind})`,
            );
            continue;
          }
          const platform = getDefaultField<SocialLinkFields["platform"]>(
            socialEntry,
            "platform",
          );
          const url = getDefaultField<string>(socialEntry, "url");
          if (platform && url) {
            socialLinks.push({ platform, url });
          }
        }
        const fields: FooterFields = {
          kind: GLOBAL_KIND.footer,
          machineName: "footer",
          ...(logoAssetId && {
            logo: resolveMediaOrError(logoAssetId, undefined, owner),
          }),
          shortDescription: getLocalizedString(entry, "shortDescription"),
          ...(socialLinks.length > 0 && { socialLinks }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "singleEmailForm": {
        const fields: SingleEmailFormFields = {
          kind: GLOBAL_KIND.singleEmailForm,
          machineName:
            getDefaultField<string>(entry, "machineName") ??
            "single-email-subscribe",
          title: getLocalizedString(entry, "title"),
          shortDescription: getLocalizedString(entry, "shortDescription"),
          ctaText: getLocalizedString(entry, "ctaText"),
          inputPlaceholder: getLocalizedString(entry, "inputPlaceholder"),
          successMessage: getLocalizedString(entry, "successMessage"),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "contactForm": {
        const imageAssetId = getLinkId(entry, "image");
        const verseCfId = getLinkId(entry, "bibleVerse");
        const bibleVerseId = verseCfId ? entryIdMap.get(verseCfId) : undefined;
        if (verseCfId && !bibleVerseId) {
          errors.push(
            `Missing mapped bibleVerse "${verseCfId}" on ${owner} (${snapshotKind})`,
          );
        }
        const fieldLinkIds = getLinkIds(entry, "fields");
        const formFields: ContactFormFieldItem[] = [];
        for (const fieldId of fieldLinkIds) {
          const fieldEntry = resolveLinkedEntry(fieldId, snapshotKind);
          if (!fieldEntry) {
            errors.push(
              `Missing linked formField "${fieldId}" on ${owner} (${snapshotKind})`,
            );
            continue;
          }
          formFields.push(
            stripUndefinedDeep({
              inputId: getDefaultField<string>(fieldEntry, "inputId") ?? "",
              type: getDefaultField<string>(fieldEntry, "type") ?? "",
              required: Boolean(getDefaultField(fieldEntry, "required")),
              name: getLocalizedString(fieldEntry, "name"),
              placeholder: getLocalizedString(fieldEntry, "placeholder"),
              values: getLocalizedStringArray(fieldEntry, "values"),
            }),
          );
        }

        const fields: ContactFormFields = {
          kind: GLOBAL_KIND.contactForm,
          machineName: "contact-form",
          title: getLocalizedString(entry, "title"),
          description: getLocalizedString(entry, "description"),
          ctaText: getLocalizedString(entry, "ctaText"),
          ...(imageAssetId && {
            image: resolveMediaOrError(imageAssetId, undefined, owner),
          }),
          ...(bibleVerseId && { bibleVerseId }),
          agreementNote: convertLocalizedRichText(
            entry,
            "agreementNote",
            "inlineLink",
            snapshotKind,
            contentType,
          ),
          fields: formFields,
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "locationComponent": {
        const coords = getDefaultField<{ lat?: number; lon?: number }>(
          entry,
          "location",
        );
        const fields: LocationFields = {
          kind: GLOBAL_KIND.location,
          machineName: "location",
          addressLine1: getDefaultField<string>(entry, "addressLine1"),
          neighborhood: getDefaultField<string>(entry, "neighborhood"),
          city: getDefaultField<string>(entry, "city"),
          country: getDefaultField<string>(entry, "country"),
          mapEmbedUrl: getDefaultField<string>(entry, "mapEmbedUrl"),
          googleMapsUrl: getDefaultField<string>(entry, "googleMapsUrl"),
          ...(typeof coords?.lat === "number" && { lat: coords.lat }),
          ...(typeof coords?.lon === "number" && { lon: coords.lon }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "blogPostPage": {
        const featuredAssetId = getLinkId(entry, "featuredImage");
        const authorCfId = getLinkId(entry, "author");
        const authorId = authorCfId ? entryIdMap.get(authorCfId) : undefined;
        if (authorCfId && !authorId) {
          errors.push(
            `Missing mapped author "${authorCfId}" on ${owner} (${snapshotKind})`,
          );
        }
        const relatedPostIds = getLinkIds(entry, "relatedBlogPosts")
          .map((id) => entryIdMap.get(id))
          .filter((id): id is string => id !== undefined);

        const fields: PostFields = {
          slug: getDefaultField<string>(entry, "slug"),
          title: getLocalizedString(entry, "title") ?? { "es-AR": "" },
          subtitle: getLocalizedString(entry, "subtitle"),
          category: getDefaultField<string>(entry, "category"),
          ...(featuredAssetId && {
            featuredImageId: resolveMediaOrError(
              featuredAssetId,
              undefined,
              owner,
            ),
          }),
          content: convertLocalizedRichText(
            entry,
            "content",
            "article",
            snapshotKind,
            contentType,
          ),
          ...(authorId && { authorId }),
          publishedDate: parseIsoDateOnly(
            getDefaultField(entry, "publishedDate"),
          ),
          seoTitle: getLocalizedString(entry, "seoTitle"),
          seoDescription: getLocalizedString(entry, "seoDescription"),
          keywords: getLocalizedStringArray(entry, "keywords"),
          ...(relatedPostIds.length > 0 && { relatedPostIds }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "churchInfoTopic": {
        const featuredAssetId = getLinkId(entry, "featuredImage");
        const slug = getLocalizedString(entry, "slug");
        const isPrivacy =
          slug?.["es-AR"] === "privacidad" || slug?.["en-US"] === "privacy";
        const body = convertLocalizedRichText(
          entry,
          "body",
          "article",
          snapshotKind,
          contentType,
        );

        if (isPrivacy && snapshotKind === "draft" && body) {
          const rawBodyMap = getFieldLocaleMap(entry, "body");
          for (const locale of LOCALES) {
            const rawDoc = rawBodyMap?.[locale];
            const convertedDoc = body[locale];
            if (!rawDoc || !convertedDoc) continue;
            const beforePlainText = extractPlainTextFromContentful(rawDoc);
            const afterPlainText = extractPlainTextFromTipTap(convertedDoc);
            const identicalAfterWhitespaceNormalization =
              collapseAsciiWhitespace(beforePlainText) ===
              collapseAsciiWhitespace(afterPlainText);
            privacyPolicyChecks.push({
              sourceContentfulId: entry.sys.id,
              locale,
              identicalAfterWhitespaceNormalization,
              beforePlainText,
              afterPlainText,
            });
            if (!identicalAfterWhitespaceNormalization) {
              errors.push(
                `Privacy policy (${locale}) plain text changed beyond whitespace during conversion`,
              );
            }
          }
        }

        const fields: TopicFields = {
          name: getLocalizedString(entry, "name") ?? { "es-AR": "" },
          shortDescription: getLocalizedString(entry, "shortDescription"),
          body,
          slug,
          ...(featuredAssetId && {
            featuredImageId: resolveMediaOrError(
              featuredAssetId,
              undefined,
              owner,
            ),
          }),
          ...(isPrivacy && { protected: true }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      case "sermon": {
        const featuredAssetId = getLinkId(entry, "featuredImage");
        const audioAssetId = getLinkId(entry, "audio");
        const pdfLinkByLocale = getLocalizedAssetLinkIds(entry, "pdfSummary");
        const pdfSummaryMediaId: Partial<Localized<string>> = {};
        for (const locale of LOCALES) {
          const pdfAssetId = pdfLinkByLocale[locale];
          if (!pdfAssetId) continue;
          const mediaId = resolveMediaOrError(
            pdfAssetId,
            locale,
            `${owner}:pdfSummary:${locale}`,
          );
          if (mediaId) {
            pdfSummaryMediaId[locale] = mediaId;
          }
        }

        const preacherCfId = getLinkId(entry, "preacher");
        const preacherId = preacherCfId
          ? entryIdMap.get(preacherCfId)
          : undefined;
        if (preacherCfId && !preacherId) {
          errors.push(
            `Missing mapped preacher "${preacherCfId}" on ${owner} (${snapshotKind})`,
          );
        }

        const additionalPreacherIds = getLinkIds(entry, "additionalPreachers")
          .map((id) => entryIdMap.get(id))
          .filter((id): id is string => id !== undefined);

        const interpreterCfId = getLinkId(entry, "interpreter");
        const interpreterId = interpreterCfId
          ? entryIdMap.get(interpreterCfId)
          : undefined;

        const scriptureRefIds = getLinkIds(entry, "scriptureReferences")
          .map((id) => {
            const mapped = entryIdMap.get(id);
            if (!mapped) {
              errors.push(
                `Missing mapped bibleVerse "${id}" on ${owner} (${snapshotKind})`,
              );
            }
            return mapped;
          })
          .filter((id): id is string => id !== undefined);

        const relatedSermonIds = getLinkIds(entry, "relatedSermons")
          .map((id) => entryIdMap.get(id))
          .filter((id): id is string => id !== undefined);

        const rawAudioLangs = getDefaultField(entry, "audioLanguages");
        const audioLanguages = Array.isArray(rawAudioLangs)
          ? rawAudioLangs.filter(
              (l): l is Locale => l === "es-AR" || l === "en-US",
            )
          : undefined;

        const rawDuration = getDefaultField(entry, "durationSeconds");
        const durationSeconds =
          typeof rawDuration === "number" && Number.isFinite(rawDuration)
            ? rawDuration
            : undefined;

        const fields: SermonFields = {
          slug: getDefaultField<string>(entry, "slug"),
          title: getLocalizedString(entry, "title") ?? { "es-AR": "" },
          thesis: getLocalizedString(entry, "thesis"),
          mainPoints: getLocalizedStringArray(entry, "mainPoints"),
          excerpt: getLocalizedString(entry, "excerpt"),
          sermonDate: parseIsoDateOnly(getDefaultField(entry, "sermonDate")),
          ...(durationSeconds !== undefined && { durationSeconds }),
          content: convertLocalizedRichText(
            entry,
            "content",
            "sermon",
            snapshotKind,
            contentType,
          ),
          ...(featuredAssetId && {
            featuredImageId: resolveMediaOrError(
              featuredAssetId,
              undefined,
              owner,
            ),
          }),
          ...(audioAssetId && {
            audioMediaId: resolveMediaOrError(audioAssetId, undefined, owner),
          }),
          ...(audioLanguages && audioLanguages.length > 0 && { audioLanguages }),
          ...(Object.keys(pdfSummaryMediaId).length > 0 && {
            pdfSummaryMediaId: pdfSummaryMediaId as Localized<string>,
          }),
          ...(preacherId && { preacherId }),
          ...(additionalPreacherIds.length > 0 && { additionalPreacherIds }),
          ...(interpreterId && { interpreterId }),
          ...(scriptureRefIds.length > 0 && { scriptureRefIds }),
          seoTitle: getLocalizedString(entry, "seoTitle"),
          seoDescription: getLocalizedString(entry, "seoDescription"),
          keywords: getLocalizedStringArray(entry, "keywords"),
          ...(relatedSermonIds.length > 0 && { relatedSermonIds }),
        };
        return stripUndefinedDeep(fields) as unknown as Record<string, unknown>;
      }

      default:
        return {};
    }
  };

  // Pass 2: transform non-sermon docs first so author & verse snapshots are ready for sermon contentHash!
  const authorDocsById = new Map<
    string,
    { draft: AuthorFields; published?: AuthorFields }
  >();
  const verseDocsById = new Map<
    string,
    { draft: BibleVerseFields; published?: BibleVerseFields }
  >();

  const draftAndPublishedByEntry = new Map<
    string,
    { draft: Record<string, unknown>; published?: Record<string, unknown> }
  >();

  for (const item of activeTopLevel) {
    if (item.contentType === "sermon") continue;
    const draft = transformSnapshot(item.cmaEntry, item.contentType, "draft");
    const published =
      item.state === "published"
        ? structuredClone(draft)
        : item.state === "changed" && item.cdaEntry
          ? transformSnapshot(item.cdaEntry, item.contentType, "published")
          : undefined;

    draftAndPublishedByEntry.set(item.cmaEntry.sys.id, { draft, published });

    if (item.collection === COLLECTIONS.authors) {
      authorDocsById.set(item.docId, {
        draft: draft as unknown as AuthorFields,
        published: published as unknown as AuthorFields | undefined,
      });
    } else if (item.collection === COLLECTIONS.bibleVerses) {
      verseDocsById.set(item.docId, {
        draft: draft as unknown as BibleVerseFields,
        published: published as unknown as BibleVerseFields | undefined,
      });
    }
  }

  const computeSermonHashForFields = (
    fields: SermonFields,
    snapshotKind: "draft" | "published",
  ): string => {
    const getAuthorName = (id: string | undefined): string | undefined => {
      if (!id) return undefined;
      const entry = authorDocsById.get(id);
      const snap =
        snapshotKind === "published"
          ? (entry?.published ?? entry?.draft)
          : entry?.draft;
      return snap?.name;
    };

    const preacherName = getAuthorName(fields.preacherId);
    const additionalPreacherNames = (fields.additionalPreacherIds ?? [])
      .map((id) => getAuthorName(id))
      .filter((name): name is string => typeof name === "string" && name.length > 0);

    const buildLocaleInput = (locale: Locale): TipTapSermonHashLocaleInput => {
      const scriptureReferences: TipTapSermonHashScriptureRef[] = [];
      for (const verseId of fields.scriptureRefIds ?? []) {
        const entry = verseDocsById.get(verseId);
        const verse =
          snapshotKind === "published"
            ? (entry?.published ?? entry?.draft)
            : entry?.draft;
        if (!verse) continue;
        scriptureReferences.push({
          book: verse.book?.[locale] ?? verse.book?.["es-AR"] ?? "",
          chapter: verse.chapter,
          fromVerse: verse.fromVerse,
          toVerse: verse.toVerse ?? null,
          verseContent: verse.text?.[locale] ?? verse.text?.["es-AR"] ?? "",
        });
      }

      return {
        title: fields.title?.[locale] ?? fields.title?.["es-AR"] ?? "",
        sermonDate: fields.sermonDate ?? "",
        content: fields.content?.[locale] ?? fields.content?.["es-AR"] ?? null,
        scriptureReferences,
        preacherName,
        additionalPreacherNames,
      };
    };

    return computeTipTapSermonContentHash(
      buildLocaleInput("es-AR"),
      buildLocaleInput("en-US"),
    );
  };

  // Transform sermons and attach canonical `contentHash`
  for (const item of activeTopLevel) {
    if (item.contentType !== "sermon") continue;
    const draft = transformSnapshot(
      item.cmaEntry,
      item.contentType,
      "draft",
    ) as unknown as SermonFields;
    draft.contentHash = computeSermonHashForFields(draft, "draft");

    let published: SermonFields | undefined;
    if (item.state === "published") {
      published = structuredClone(draft);
      published.contentHash = computeSermonHashForFields(published, "published");
    } else if (item.state === "changed" && item.cdaEntry) {
      published = transformSnapshot(
        item.cdaEntry,
        item.contentType,
        "published",
      ) as unknown as SermonFields;
      published.contentHash = computeSermonHashForFields(published, "published");
    }

    draftAndPublishedByEntry.set(item.cmaEntry.sys.id, {
      draft: stripUndefinedDeep(draft) as unknown as Record<string, unknown>,
      published: published
        ? (stripUndefinedDeep(published) as unknown as Record<string, unknown>)
        : undefined,
    });
  }

  // Pass 3: validate every draft & published snapshot against `@idcr/content` schemas, compute `_naturalKey` & `_refs`
  const documents: PlannedContentDocument[] = [];

  for (const item of activeTopLevel) {
    const pair = draftAndPublishedByEntry.get(item.cmaEntry.sys.id);
    if (!pair) continue;

    const concreteType = resolveConcreteType(item.collection, pair.draft);
    if (!concreteType) {
      errors.push(
        `Could not resolve concrete content type for ${item.collection}:${item.cmaEntry.sys.id}`,
      );
      continue;
    }

    const schemaBundle = CONTENT_SCHEMAS[concreteType];
    const draftParsed = schemaBundle.draft.safeParse(pair.draft);
    if (!draftParsed.success) {
      errors.push(
        `Draft schema validation failed for ${item.contentType}:${item.cmaEntry.sys.id}: ${draftParsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
      continue;
    }

    let validatedPublished: Record<string, unknown> | undefined;
    if (pair.published !== undefined) {
      const pubConcreteType = resolveConcreteType(
        item.collection,
        pair.published,
      );
      if (!pubConcreteType) {
        errors.push(
          `Could not resolve published concrete type for ${item.collection}:${item.cmaEntry.sys.id}`,
        );
        continue;
      }
      const pubParsed = CONTENT_SCHEMAS[pubConcreteType].publishable.safeParse(
        pair.published,
      );
      if (!pubParsed.success) {
        errors.push(
          `Publishable schema validation failed for ${item.contentType}:${item.cmaEntry.sys.id}: ${pubParsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
        );
        continue;
      }
      validatedPublished = stripUndefinedDeep(
        pubParsed.data as unknown as Record<string, unknown>,
      );
    }

    const validatedDraft = stripUndefinedDeep(
      draftParsed.data as unknown as Record<string, unknown>,
    );

    const epoch = new Date(0);
    const createdAt = parseDateOrFallback(item.cmaEntry.sys.createdAt, epoch);
    const updatedAt = parseDateOrFallback(
      item.cmaEntry.sys.updatedAt,
      createdAt,
    );
    const publishedAtRaw =
      item.cmaEntry.sys.publishedAt ?? item.cdaEntry?.sys.publishedAt;
    const firstPublishedAtRaw =
      item.cmaEntry.sys.firstPublishedAt ??
      item.cdaEntry?.sys.firstPublishedAt ??
      publishedAtRaw;

    const publishedAt =
      validatedPublished !== undefined
        ? parseDateOrFallback(publishedAtRaw, updatedAt)
        : undefined;
    const firstPublishedAt =
      validatedPublished !== undefined
        ? parseDateOrFallback(firstPublishedAtRaw, publishedAt ?? updatedAt)
        : undefined;

    const _naturalKey = computeNaturalKey(item.collection, validatedDraft);
    const _refs = extractReferences(COLLECTION_META[item.collection].contentType, {
      draft: validatedDraft as unknown as GlobalFields,
      published: validatedPublished as unknown as GlobalFields | undefined,
    });

    documents.push({
      collection: item.collection,
      sourceContentfulId: item.cmaEntry.sys.id,
      contentType: item.contentType,
      state: item.state,
      docId: item.docId,
      draft: validatedDraft,
      ...(validatedPublished !== undefined && { published: validatedPublished }),
      createdAt,
      updatedAt,
      ...(publishedAt !== undefined && { publishedAt }),
      ...(firstPublishedAt !== undefined && { firstPublishedAt }),
      ...(_naturalKey !== undefined && { _naturalKey }),
      _refs,
    });
  }

  return {
    documents,
    skippedEntries,
    richTextRejections,
    brokenLinks,
    privacyPolicyChecks,
    errors,
    stateCountsByContentType,
  };
}
