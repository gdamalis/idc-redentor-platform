import { createHash } from "node:crypto";
import { COLLECTIONS, type Locale, type Localized } from "@idcr/content";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { ServiceContentCaller } from "@src/lib/content/caller";
import {
  filenameStemToDefaultTitle,
  normalizeMediaContentType,
} from "@src/lib/media/policy";
import {
  createServerMedia,
  defaultMediaServiceDeps,
  type MediaServiceDeps,
  type StoredMediaDoc,
} from "@src/service/media/media.service";
import {
  IMPORTER_SERVICE_ID,
  IMPORTER_SERVICE_LABEL,
  type ConflictingDuplicateAssetReport,
  type ContentfulAsset,
  type ContentfulSnapshotManifest,
  type LoadedContentfulSnapshot,
  type MediaImportSummary,
  type MergedDuplicateAssetReport,
  type MergedLocaleAssetReport,
  type SnapshotDownloadedAssetFile,
  type SplitLocaleAssetReport,
  type UnreferencedAssetReport,
} from "./types";

const LOCALES: readonly Locale[] = ["es-AR", "en-US"];

export const IMPORTER_MEDIA_CALLER: ServiceContentCaller = {
  kind: "service",
  serviceId: IMPORTER_SERVICE_ID,
  label: IMPORTER_SERVICE_LABEL,
  permissions: new Set(["content:read", "content:write", "media:manage"]),
};

export interface PlannedMediaGroup {
  readonly sha256: string;
  /** Primary file descriptor whose bytes will be uploaded (all entries in the group share `sha256`). */
  readonly primaryFile: SnapshotDownloadedAssetFile;
  readonly canonicalAssetId: string;
  /** All `(assetId, locale?)` keys that map to this single deduplicated `media` record. */
  readonly bindings: readonly {
    readonly assetId: string;
    readonly locale?: Locale;
    readonly lookupKey: string;
    readonly sourceTag: string;
  }[];
  /** All normalized Contentful CDN URLs mapped to this deduplicated `media` record. */
  readonly sourceUrls: readonly string[];
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
  readonly title: Localized<string>;
  readonly alt?: Localized<string>;
  readonly createdAt: Date;
}

export interface MediaImportPlan {
  readonly totalContentfulAssets: number;
  readonly groups: readonly PlannedMediaGroup[];
  readonly mergedLocaleFiles: readonly MergedLocaleAssetReport[];
  readonly mergedDuplicateAssets: readonly MergedDuplicateAssetReport[];
  readonly conflictingDuplicateAssets: readonly ConflictingDuplicateAssetReport[];
  readonly splitLocaleAssets: readonly SplitLocaleAssetReport[];
  readonly unreferencedAssets: readonly UnreferencedAssetReport[];
  readonly missingAssetFiles: readonly string[];
}

export interface MediaLookup {
  readonly resolveMediaId: (
    assetId: string,
    locale?: Locale,
  ) => string | undefined;
  readonly allAssetIds: () => readonly string[];
}

export interface StoredImportedMediaDoc extends StoredMediaDoc {
  sourceContentfulIds?: string[];
  sourceContentfulUrls?: string[];
}

function buildAssetTitle(
  asset: ContentfulAsset,
  fallbackFileName: string,
): Localized<string> {
  const esRaw = asset.fields.title?.["es-AR"]?.trim();
  const enRaw = asset.fields.title?.["en-US"]?.trim();
  const es =
    esRaw && esRaw.length > 0
      ? esRaw
      : filenameStemToDefaultTitle(fallbackFileName);
  const title: Localized<string> = { "es-AR": es };
  if (enRaw && enRaw.length > 0) {
    title["en-US"] = enRaw;
  }
  return title;
}

function normalizedTitleSignature(title: Localized<string>): string {
  return JSON.stringify({
    "es-AR": (title["es-AR"] ?? "").trim(),
    "en-US": (title["en-US"] ?? "").trim(),
  });
}

function deterministicPreviewObjectId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

/**
 * Pure media deduplication & conflict planner:
 * - Merges identical-byte per-locale files within one asset (`mergedLocaleFiles`).
 * - Splits differing-byte per-locale files into separate `(assetId, locale)` bindings (`splitLocaleAssets`).
 * - Merges identical-byte files across distinct assets (`mergedDuplicateAssets`), flagging any
 *   localized title disagreements (`conflictingDuplicateAssets`) so dry-run halts cleanly (`ICR-203` OQ2).
 * - Copies asset `title` -> `alt` on images (preserving `width`/`height` for OG metadata).
 * - Records every unreferenced asset (`unreferencedAssets`) while still importing it.
 */
export function planMediaImport(
  manifest: ContentfulSnapshotManifest,
  referencedAssetIds: ReadonlySet<string>,
): MediaImportPlan {
  const filesByAsset = new Map<string, SnapshotDownloadedAssetFile[]>();
  for (const file of manifest.downloadedFiles) {
    const list = filesByAsset.get(file.assetId) ?? [];
    list.push(file);
    filesByAsset.set(file.assetId, list);
  }

  const mergedLocaleFiles: MergedLocaleAssetReport[] = [];
  const splitLocaleAssets: SplitLocaleAssetReport[] = [];
  const unreferencedAssets: UnreferencedAssetReport[] = [];
  const missingAssetFiles: string[] = [];

  interface AssetUnit {
    readonly asset: ContentfulAsset;
    readonly file: SnapshotDownloadedAssetFile;
    readonly localeBinding?: Locale;
    readonly sourceUrls: readonly string[];
    readonly title: Localized<string>;
  }

  const units: AssetUnit[] = [];

  const sortedAssets = [...manifest.cmaAssets].sort((a, b) =>
    a.sys.id.localeCompare(b.sys.id),
  );

  for (const asset of sortedAssets) {
    // Skip archived CMA assets so fileless archived assets never trigger missingAssetFiles
    if (
      asset.sys.archivedVersion !== undefined &&
      asset.sys.archivedVersion !== null
    ) {
      continue;
    }

    const assetFiles = filesByAsset.get(asset.sys.id) ?? [];
    const esFile = assetFiles.find((f) => f.locale === "es-AR");
    const enFile = assetFiles.find((f) => f.locale === "en-US");
    const primaryFile = esFile ?? enFile;

    if (!primaryFile) {
      missingAssetFiles.push(asset.sys.id);
      continue;
    }

    const title = buildAssetTitle(asset, primaryFile.fileName);

    if (!referencedAssetIds.has(asset.sys.id)) {
      unreferencedAssets.push({
        assetId: asset.sys.id,
        titleEs: title["es-AR"],
        fileName: primaryFile.fileName,
      });
    }

    if (esFile && enFile) {
      if (esFile.sha256 === enFile.sha256) {
        mergedLocaleFiles.push({
          assetId: asset.sys.id,
          sha256: esFile.sha256,
          locales: LOCALES,
        });
        units.push({
          asset,
          file: esFile,
          sourceUrls: [...new Set([esFile.url, enFile.url])],
          title,
        });
      } else {
        splitLocaleAssets.push({
          assetId: asset.sys.id,
          files: [
            {
              locale: "es-AR",
              sha256: esFile.sha256,
              fileName: esFile.fileName,
            },
            {
              locale: "en-US",
              sha256: enFile.sha256,
              fileName: enFile.fileName,
            },
          ],
        });
        units.push({
          asset,
          file: esFile,
          localeBinding: "es-AR",
          sourceUrls: [esFile.url],
          title,
        });
        units.push({
          asset,
          file: enFile,
          localeBinding: "en-US",
          sourceUrls: [enFile.url],
          title,
        });
      }
    } else {
      units.push({
        asset,
        file: primaryFile,
        ...(esFile ? {} : { localeBinding: primaryFile.locale }),
        sourceUrls: [primaryFile.url],
        title,
      });
    }
  }

  const unitsBySha = new Map<string, AssetUnit[]>();
  for (const unit of units) {
    const sha = unit.file.sha256.toLowerCase();
    const list = unitsBySha.get(sha) ?? [];
    list.push(unit);
    unitsBySha.set(sha, list);
  }

  const groups: PlannedMediaGroup[] = [];
  const mergedDuplicateAssets: MergedDuplicateAssetReport[] = [];
  const conflictingDuplicateAssets: ConflictingDuplicateAssetReport[] = [];

  for (const [sha256, rawGroupUnits] of unitsBySha.entries()) {
    // Deterministic canonical ordering: referenced assets first, then Contentful asset ID.
    const groupUnits = [...rawGroupUnits].sort((a, b) => {
      const aRef = referencedAssetIds.has(a.asset.sys.id) ? 0 : 1;
      const bRef = referencedAssetIds.has(b.asset.sys.id) ? 0 : 1;
      if (aRef !== bRef) return aRef - bRef;
      return a.asset.sys.id.localeCompare(b.asset.sys.id);
    });
    const first = groupUnits[0]!;
    const distinctAssetIds = [
      ...new Set(groupUnits.map((u) => u.asset.sys.id)),
    ];

    if (distinctAssetIds.length > 1) {
      const referencedInGroup = distinctAssetIds.filter((id) =>
        referencedAssetIds.has(id),
      );
      const titleSignatures = new Set(
        groupUnits.map((u) => normalizedTitleSignature(u.title)),
      );
      // If strictly one asset is referenced and the rest are unreferenced duplicates,
      // the referenced asset's title/metadata wins deterministically without a blocking conflict.
      const isAmbiguousTitleConflict =
        titleSignatures.size > 1 && referencedInGroup.length !== 1;
      if (isAmbiguousTitleConflict) {
        const titlesByAsset: Record<
          string,
          Readonly<Record<string, string | undefined>>
        > = {};
        for (const u of groupUnits) {
          titlesByAsset[u.asset.sys.id] = {
            "es-AR": u.title["es-AR"],
            "en-US": u.title["en-US"],
          };
        }
        conflictingDuplicateAssets.push({
          sha256,
          assetIds: [...distinctAssetIds].sort(),
          titlesByAsset,
        });
      } else {
        mergedDuplicateAssets.push({
          sha256,
          canonicalAssetId: first.asset.sys.id,
          mergedAssetIds: distinctAssetIds.filter(
            (id) => id !== first.asset.sys.id,
          ),
          filename: first.file.fileName,
        });
      }
    }

    const contentType = normalizeMediaContentType(first.file.contentType);
    const isImage = contentType.startsWith("image/");
    const createdAt = new Date(first.asset.sys.createdAt);

    const bindings = groupUnits.map((u) => ({
      assetId: u.asset.sys.id,
      ...(u.localeBinding !== undefined && { locale: u.localeBinding }),
      lookupKey: u.localeBinding
        ? `${u.asset.sys.id}:${u.localeBinding}`
        : u.asset.sys.id,
      sourceTag: u.localeBinding
        ? `${u.asset.sys.id}:${u.localeBinding}`
        : u.asset.sys.id,
    }));

    const sourceUrls = [
      ...new Set(groupUnits.flatMap((u) => u.sourceUrls)),
    ].sort();

    groups.push({
      sha256,
      primaryFile: first.file,
      canonicalAssetId: first.asset.sys.id,
      bindings,
      sourceUrls,
      filename: first.file.fileName,
      contentType,
      size: first.file.size,
      ...(first.file.width !== undefined && { width: first.file.width }),
      ...(first.file.height !== undefined && { height: first.file.height }),
      title: first.title,
      ...(isImage && { alt: first.title }),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0) : createdAt,
    });
  }

  return {
    totalContentfulAssets: manifest.cmaAssets.length,
    groups,
    mergedLocaleFiles,
    mergedDuplicateAssets,
    conflictingDuplicateAssets,
    splitLocaleAssets,
    unreferencedAssets,
    missingAssetFiles,
  };
}

export interface ExecuteMediaImportDeps {
  readonly getDb: () => Db;
  readonly mediaServiceDeps?: MediaServiceDeps;
  readonly createServerMediaFn?: typeof createServerMedia;
}

export interface ExecuteMediaImportResult {
  readonly lookup: MediaLookup;
  readonly summary: MediaImportSummary;
  readonly mediaIdByBinding: ReadonlyMap<string, string>;
}

/**
 * Executes (or dry-runs) the deduplicated media import:
 * - Dry-run: inspects existing `website*.media` by `sha256` without writing anything
 *   and produces a deterministic `MediaLookup` so downstream content transforms validate cleanly.
 * - Apply: uploads each new distinct SHA-256 through `ICR-196` `createServerMedia(..., { dedupeBySha256: true })`,
 *   preserving original Contentful `createdAt` and idempotently recording `sourceContentfulIds`
 *   (only writing if missing so re-runs perform 0 DB writes and 0 Blob uploads).
 */
export async function executeMediaImport(
  snapshot: LoadedContentfulSnapshot,
  plan: MediaImportPlan,
  options: { readonly apply: boolean },
  deps: ExecuteMediaImportDeps,
): Promise<ExecuteMediaImportResult> {
  const db = deps.getDb();
  const mediaCol = db.collection<StoredImportedMediaDoc>(COLLECTIONS.media);
  const existingDocs = await mediaCol
    .find(
      { sha256: { $in: plan.groups.map((g) => g.sha256) } },
      {
        projection: {
          _id: 1,
          sha256: 1,
          sourceContentfulIds: 1,
          sourceContentfulUrls: 1,
        },
      },
    )
    .toArray();

  const existingBySha = new Map<string, StoredImportedMediaDoc>();
  for (const doc of existingDocs) {
    existingBySha.set(doc.sha256.toLowerCase(), doc);
  }

  const mediaIdByBinding = new Map<string, string>();
  const mediaIdByAssetId = new Map<string, string>();

  let created = 0;
  let reused = 0;
  let metadataLinked = 0;
  let uploadedBytes = 0;

  const createFn = deps.createServerMediaFn ?? createServerMedia;
  const baseServiceDeps = deps.mediaServiceDeps ?? defaultMediaServiceDeps;

  for (const group of plan.groups) {
    const existing = existingBySha.get(group.sha256);
    // Keep split-locale bindings strictly scoped to `assetId:locale` so ES/EN PDFs never collide!
    const desiredTags = [
      ...new Set(group.bindings.map((b) => b.sourceTag)),
    ].sort();
    const desiredUrls = [...group.sourceUrls];

    let resolvedMediaId: string;

    if (!options.apply) {
      if (existing) {
        resolvedMediaId = existing._id.toHexString();
        reused += 1;
      } else {
        resolvedMediaId = deterministicPreviewObjectId(`media:${group.sha256}`);
        created += 1;
      }
    } else if (existing) {
      resolvedMediaId = existing._id.toHexString();
      reused += 1;

      const currentTags = new Set(existing.sourceContentfulIds ?? []);
      const missingTags = desiredTags.filter((tag) => !currentTags.has(tag));
      const currentUrls = new Set(existing.sourceContentfulUrls ?? []);
      const missingUrls = desiredUrls.filter((url) => !currentUrls.has(url));

      if (missingTags.length > 0 || missingUrls.length > 0) {
        const $addToSet: Record<string, { $each: string[] }> = {};
        if (missingTags.length > 0) {
          $addToSet.sourceContentfulIds = { $each: missingTags };
        }
        if (missingUrls.length > 0) {
          $addToSet.sourceContentfulUrls = { $each: missingUrls };
        }
        await mediaCol.updateOne({ _id: existing._id }, { $addToSet });
        metadataLinked += 1;
      }
    } else {
      const bytes = await snapshot.loadFileBytes(group.primaryFile);
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (actualSha !== group.sha256) {
        throw new Error(
          `Snapshot integrity error for asset ${group.canonicalAssetId} (${group.filename}): expected sha256 ${group.sha256}, got ${actualSha}`,
        );
      }

      const res = await createFn(
        IMPORTER_MEDIA_CALLER,
        {
          buffer: bytes,
          filename: group.filename,
          contentType: group.contentType,
          title: group.title,
          ...(group.alt !== undefined && { alt: group.alt }),
          ...(group.width !== undefined && { width: group.width }),
          ...(group.height !== undefined && { height: group.height }),
          dedupeBySha256: true,
        },
        {
          ...baseServiceDeps,
          now: () => group.createdAt,
        },
      );

      if (!res.ok) {
        throw new Error(
          `Failed to upload media for asset ${group.canonicalAssetId} (${group.filename}): ${res.reason}${
            "detail" in res ? ` (${res.detail})` : ""
          }`,
        );
      }

      resolvedMediaId = res.doc._id;
      if (res.reused) {
        reused += 1;
      } else {
        created += 1;
        uploadedBytes += bytes.byteLength;
      }

      const $addToSet: Record<string, { $each: string[] }> = {
        sourceContentfulIds: { $each: desiredTags },
      };
      if (desiredUrls.length > 0) {
        $addToSet.sourceContentfulUrls = { $each: desiredUrls };
      }
      await mediaCol.updateOne(
        { _id: new ObjectId(resolvedMediaId) },
        { $addToSet },
      );
      metadataLinked += 1;
    }

    for (const binding of group.bindings) {
      mediaIdByBinding.set(binding.lookupKey, resolvedMediaId);
      if (!binding.locale) {
        mediaIdByAssetId.set(binding.assetId, resolvedMediaId);
      } else if (!mediaIdByAssetId.has(binding.assetId)) {
        mediaIdByAssetId.set(binding.assetId, resolvedMediaId);
      }
    }
  }

  const lookup: MediaLookup = {
    resolveMediaId: (assetId: string, locale?: Locale) => {
      if (locale) {
        const specific = mediaIdByBinding.get(`${assetId}:${locale}`);
        if (specific) return specific;
      }
      return (
        mediaIdByBinding.get(assetId) ??
        mediaIdByBinding.get(`${assetId}:es-AR`) ??
        mediaIdByAssetId.get(assetId)
      );
    },
    allAssetIds: () => [...mediaIdByAssetId.keys()].sort(),
  };

  const unreferencedWithMediaIds: UnreferencedAssetReport[] =
    plan.unreferencedAssets.map((item) => ({
      ...item,
      mediaId: lookup.resolveMediaId(item.assetId),
    }));

  return {
    lookup,
    mediaIdByBinding,
    summary: {
      totalContentfulAssets: plan.totalContentfulAssets,
      distinctFiles: plan.groups.length,
      created,
      reused,
      metadataLinked,
      uploadedBytes,
      mergedLocaleFiles: plan.mergedLocaleFiles,
      mergedDuplicateAssets: plan.mergedDuplicateAssets,
      conflictingDuplicateAssets: plan.conflictingDuplicateAssets,
      splitLocaleAssets: plan.splitLocaleAssets,
      unreferencedAssets: unreferencedWithMediaIds,
    },
  };
}
