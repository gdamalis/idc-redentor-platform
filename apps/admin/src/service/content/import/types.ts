import type { CollectionName, Locale } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";

export const IMPORTER_SERVICE_ID = "service:contentful-import";
export const IMPORTER_SERVICE_LABEL = "Importación automática de Contentful";

export const ENTRY_STATES = [
  "published",
  "changed",
  "draft",
  "archived",
] as const;

export type ContentfulEntryState = (typeof ENTRY_STATES)[number];

/** Minimal CMA/CDA sys metadata preserved in a frozen Contentful snapshot. */
export interface ContentfulSys {
  readonly id: string;
  readonly type?: string;
  readonly contentType?: { readonly sys: { readonly id: string } };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt?: string;
  readonly firstPublishedAt?: string;
  readonly version?: number;
  readonly publishedVersion?: number;
  readonly archivedVersion?: number;
}

export interface ContentfulLink {
  readonly sys: {
    readonly type: "Link";
    readonly linkType: "Entry" | "Asset";
    readonly id: string;
  };
}

export interface ContentfulEntry {
  readonly sys: ContentfulSys;
  readonly fields: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface ContentfulAssetFile {
  readonly url: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly details?: {
    readonly size?: number;
    readonly image?: {
      readonly width?: number;
      readonly height?: number;
    };
  };
}

export interface ContentfulAsset {
  readonly sys: ContentfulSys;
  readonly fields: {
    readonly title?: Readonly<Record<string, string | undefined>>;
    readonly description?: Readonly<Record<string, string | undefined>>;
    readonly file?: Readonly<Record<string, ContentfulAssetFile | undefined>>;
  };
}

/**
 * Local binary file record inside a frozen Contentful snapshot.
 * `relativePath` is relative to the snapshot directory (stored in git-ignored `artifacts/`).
 */
export interface SnapshotDownloadedAssetFile {
  readonly assetId: string;
  readonly locale: Locale;
  readonly relativePath: string;
  readonly url: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ContentfulSnapshotManifest {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly spaceId: string;
  readonly environment: string;
  readonly defaultLocale: Locale;
  readonly locales: readonly Locale[];
  readonly contentTypeIds: readonly string[];
  /** All CMA entries (latest draft state + sys version metadata for state classification). */
  readonly cmaEntries: readonly ContentfulEntry[];
  /** All CDA published entries (the live published snapshot for `published` and `changed` entries). */
  readonly cdaPublishedEntries: readonly ContentfulEntry[];
  /** All CMA assets (localized titles/descriptions/file descriptors + sys timestamps). */
  readonly cmaAssets: readonly ContentfulAsset[];
  /** Manifest of downloaded binary files keyed by `(assetId, locale)`. */
  readonly downloadedFiles: readonly SnapshotDownloadedAssetFile[];
}

export interface LoadedContentfulSnapshot {
  readonly manifest: ContentfulSnapshotManifest;
  readonly loadFileBytes: (
    file: SnapshotDownloadedAssetFile,
  ) => Promise<Buffer>;
}

export interface BrokenLinkFinding {
  readonly sourceContentfulId: string;
  readonly contentType: string;
  readonly field: string;
  readonly locale: Locale;
  readonly href: string;
  readonly reason: string;
}

export interface RichTextRejectionFinding {
  readonly sourceContentfulId: string;
  readonly contentType: string;
  readonly field: string;
  readonly snapshot: "draft" | "published";
  readonly locale: Locale;
  readonly stage: "convert" | "validate" | "round-trip";
  readonly messages: readonly string[];
}

export interface MergedLocaleAssetReport {
  readonly assetId: string;
  readonly sha256: string;
  readonly locales: readonly Locale[];
}

export interface MergedDuplicateAssetReport {
  readonly sha256: string;
  readonly canonicalAssetId: string;
  readonly mergedAssetIds: readonly string[];
  readonly filename: string;
}

export interface ConflictingDuplicateAssetReport {
  readonly sha256: string;
  readonly assetIds: readonly string[];
  readonly titlesByAsset: Readonly<
    Record<string, Readonly<Record<string, string | undefined>>>
  >;
}

export interface SplitLocaleAssetReport {
  readonly assetId: string;
  readonly files: readonly {
    readonly locale: Locale;
    readonly sha256: string;
    readonly fileName: string;
  }[];
}

export interface UnreferencedAssetReport {
  readonly assetId: string;
  readonly mediaId?: string;
  readonly titleEs?: string;
  readonly fileName: string;
}

export interface SkippedEntryReport {
  readonly contentfulId: string;
  readonly contentType: string;
  readonly reason: "archived" | "flattened-page" | "unused-seo-predicas" | "embedded-child" | "unknown-content-type";
  readonly detail?: string;
}

export interface ScratchDocumentReport {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly label: string;
}

export interface PrivacyPolicyTextCheck {
  readonly sourceContentfulId: string;
  readonly locale: Locale;
  readonly identicalAfterWhitespaceNormalization: boolean;
  readonly beforePlainText: string;
  readonly afterPlainText: string;
}

export interface TypeCountSummary {
  readonly contentfulTotal: number;
  readonly published: number;
  readonly changed: number;
  readonly draft: number;
  readonly archived: number;
  readonly plannedWrites: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
}

export interface MediaImportSummary {
  readonly totalContentfulAssets: number;
  readonly distinctFiles: number;
  readonly created: number;
  readonly reused: number;
  readonly metadataLinked: number;
  readonly uploadedBytes: number;
  readonly mergedLocaleFiles: readonly MergedLocaleAssetReport[];
  readonly mergedDuplicateAssets: readonly MergedDuplicateAssetReport[];
  readonly conflictingDuplicateAssets: readonly ConflictingDuplicateAssetReport[];
  readonly splitLocaleAssets: readonly SplitLocaleAssetReport[];
  readonly unreferencedAssets: readonly UnreferencedAssetReport[];
}

export interface ImportReport {
  readonly mode: "dry-run" | "apply";
  readonly targetDatabase: string;
  readonly snapshotExportedAt: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly countsByContentType: Readonly<Record<string, TypeCountSummary>>;
  readonly countsByCollection: Readonly<
    Partial<
      Record<
        CollectionName,
        {
          readonly totalPlanned: number;
          readonly published: number;
          readonly changed: number;
          readonly draftOnly: number;
          readonly inserted: number;
          readonly updated: number;
          readonly unchanged: number;
        }
      >
    >
  >;
  readonly media: MediaImportSummary;
  readonly skippedEntries: readonly SkippedEntryReport[];
  readonly richTextRejections: readonly RichTextRejectionFinding[];
  readonly brokenLinks: readonly BrokenLinkFinding[];
  readonly scratchDocuments: readonly ScratchDocumentReport[];
  readonly privacyPolicyChecks: readonly PrivacyPolicyTextCheck[];
  readonly totalDocumentWrites: number;
  readonly totalBlobUploads: number;
}

export interface RunImportOptions {
  /** Default `false`: dry-run reports everything and writes nothing. */
  readonly apply?: boolean;
  /** Required when target database is bare production `"website"`. */
  readonly allowProd?: boolean;
  /** Allows `website-test`, `website-qa`, `website-e2e` without `--prod`. */
  readonly allowTestDb?: boolean;
  /**
   * Default `false`: refuses apply if two distinct Contentful assets share identical
   * bytes (SHA-256) but disagree on localized title (`ICR-203` OQ2).
   */
  readonly allowConflictingDuplicateTitles?: boolean;
}
