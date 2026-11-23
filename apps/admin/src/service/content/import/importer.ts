import { canonicalEqual, type CollectionName } from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import type { ContentCollectionName } from "@src/lib/content/errors";
import {
  ALL_CONTENT_COLLECTIONS,
  extractEntryLabel,
  stripUndefinedDeep,
} from "@src/lib/content/guards";
import type { StoredContentEnvelope } from "@src/service/content/content-core.service";
import { ensureContentIndexes } from "@src/service/content/indexes";
import { getContentDb } from "@src/service/database.service";
import {
  createServerMedia,
  defaultMediaServiceDeps,
  ensureMediaIndexes,
  type MediaServiceDeps,
} from "@src/service/media/media.service";
import { validateImportBlobStore, validateImportTargetDb } from "./guards";
import { executeMediaImport, planMediaImport } from "./media-import";
import {
  collectReferencedAssetIds,
  planContentImport,
  type PlannedContentDocument,
} from "./transform";
import {
  IMPORTER_SERVICE_ID,
  IMPORTER_SERVICE_LABEL,
  type ImportReport,
  type LoadedContentfulSnapshot,
  type RunImportOptions,
  type ScratchDocumentReport,
  type TypeCountSummary,
} from "./types";

export interface ImporterDeps {
  readonly getContentDb?: () => Db;
  readonly mediaServiceDeps?: MediaServiceDeps;
  readonly createServerMediaFn?: typeof createServerMedia;
  readonly ensureIndexes?: (
    collection: ContentCollectionName,
    db: Db,
  ) => Promise<void>;
  readonly ensureMediaIndexesFn?: (db: Db) => Promise<void>;
  readonly blobReadWriteToken?: string | undefined;
  readonly now?: () => Date;
}

function datesEqual(a: Date | undefined, b: Date | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.getTime() === b.getTime();
}

/**
 * Idempotency comparator (`ICR-203` AC3):
 * Compares every content and timestamp field (`draft`, `published`, `publishedAt`,
 * `firstPublishedAt`, `createdAt`, `updatedAt`, `_naturalKey`, `_refs`) deep-equal.
 * If identical, the importer performs ZERO writes so `revision` and `updatedBy` stay untouched.
 */
export function isStoredEnvelopeUpToDate(
  existing: StoredContentEnvelope<Record<string, unknown>>,
  planned: PlannedContentDocument,
): boolean {
  return (
    canonicalEqual(existing.draft, planned.draft) &&
    canonicalEqual(existing.published, planned.published) &&
    datesEqual(existing.createdAt, planned.createdAt) &&
    datesEqual(existing.updatedAt, planned.updatedAt) &&
    datesEqual(existing.publishedAt, planned.publishedAt) &&
    datesEqual(existing.firstPublishedAt, planned.firstPublishedAt) &&
    existing._naturalKey === planned._naturalKey &&
    canonicalEqual(existing._refs, planned._refs)
  );
}

/**
 * Runs the idempotent Contentful -> MongoDB + Vercel Blob importer.
 *
 * Safety invariants:
 * - Dry-run by default (`options.apply` defaults to `false`).
 * - Positive `website*` DB allowlist + explicit `--prod` required for `"website"`.
 * - Refuses all writes if any rich-text conversion/validation/round-trip failure,
 *   schema validation failure, broken link resolution failure, or conflicting duplicate
 *   asset title is detected.
 * - Never writes to `content_pdf_jobs`.
 * - Never modifies or deletes scratch documents lacking `sourceContentfulId`.
 */
export async function runContentfulImport(
  snapshot: LoadedContentfulSnapshot,
  options: RunImportOptions = {},
  deps: ImporterDeps = {},
): Promise<ImportReport> {
  const startedAt = (deps.now ?? (() => new Date()))().toISOString();
  const apply = options.apply === true;
  const db = (deps.getContentDb ?? getContentDb)();

  const guard = validateImportTargetDb(db.databaseName, {
    allowProd: options.allowProd,
    allowTestDb: options.allowTestDb,
  });

  const blobToken =
    "blobReadWriteToken" in deps
      ? deps.blobReadWriteToken
      : process.env.BLOB_READ_WRITE_TOKEN;

  const blobGuard = guard.ok
    ? validateImportBlobStore(blobToken, {
        apply,
        isProd: guard.isProd,
        allowProd: options.allowProd,
        requireTokenOnApply: deps.createServerMediaFn === undefined,
      })
    : null;

  if (!guard.ok || (blobGuard && !blobGuard.ok)) {
    const refusalReason = !guard.ok
      ? guard.reason
      : blobGuard && !blobGuard.ok
        ? blobGuard.reason
        : "Refused by target guard";
    return {
      mode: apply ? "apply" : "dry-run",
      targetDatabase: db.databaseName,
      snapshotExportedAt: snapshot.manifest.exportedAt,
      startedAt,
      completedAt: (deps.now ?? (() => new Date()))().toISOString(),
      ok: false,
      errors: [refusalReason],
      countsByContentType: {},
      countsByCollection: {},
      media: {
        totalContentfulAssets: snapshot.manifest.cmaAssets.length,
        distinctFiles: 0,
        created: 0,
        reused: 0,
        metadataLinked: 0,
        uploadedBytes: 0,
        mergedLocaleFiles: [],
        mergedDuplicateAssets: [],
        conflictingDuplicateAssets: [],
        splitLocaleAssets: [],
        unreferencedAssets: [],
      },
      skippedEntries: [],
      richTextRejections: [],
      brokenLinks: [],
      scratchDocuments: [],
      privacyPolicyChecks: [],
      totalDocumentWrites: 0,
      totalBlobUploads: 0,
    };
  }

  // 1. Plan media deduplication & inspect unreferenced assets
  const referencedAssetIds = collectReferencedAssetIds(snapshot.manifest);
  const mediaPlan = planMediaImport(snapshot.manifest, referencedAssetIds);

  const errors: string[] = [];
  if (mediaPlan.missingAssetFiles.length > 0) {
    errors.push(
      `Snapshot is missing downloaded files for ${mediaPlan.missingAssetFiles.length} asset(s): ${mediaPlan.missingAssetFiles.join(", ")}`,
    );
  }
  if (
    mediaPlan.conflictingDuplicateAssets.length > 0 &&
    !options.allowConflictingDuplicateTitles
  ) {
    errors.push(
      `Found ${mediaPlan.conflictingDuplicateAssets.length} SHA-256 duplicate asset group(s) with differing localized titles; resolve or pass --allow-conflicting-duplicate-titles`,
    );
  }

  // 2. Load existing content documents across all 10 collections (for ID reuse, idempotency, & scratch listing)
  const existingByCollection = new Map<
    ContentCollectionName,
    Map<string, StoredContentEnvelope<Record<string, unknown>>>
  >();
  const existingIdsByCollection = new Map<
    ContentCollectionName,
    Map<string, string>
  >();
  const scratchDocuments: ScratchDocumentReport[] = [];

  for (const collection of ALL_CONTENT_COLLECTIONS) {
    const docs = (await db
      .collection<StoredContentEnvelope<Record<string, unknown>>>(collection)
      .find({})
      .toArray()) as StoredContentEnvelope<Record<string, unknown>>[];

    const bySource = new Map<
      string,
      StoredContentEnvelope<Record<string, unknown>>
    >();
    const idsBySource = new Map<string, string>();

    for (const doc of docs) {
      if (doc.sourceContentfulId) {
        bySource.set(doc.sourceContentfulId, doc);
        idsBySource.set(doc.sourceContentfulId, doc._id.toHexString());
      } else {
        scratchDocuments.push({
          collection,
          docId: doc._id.toHexString(),
          label: extractEntryLabel(collection, doc.draft, doc._id.toHexString()),
        });
      }
    }

    existingByCollection.set(collection, bySource);
    existingIdsByCollection.set(collection, idsBySource);
  }

  // 3. Dry-run media lookup first so ALL content transforms & lossless rich-text checks run BEFORE any Blob upload!
  const dryMediaResult = await executeMediaImport(
    snapshot,
    mediaPlan,
    { apply: false },
    {
      getDb: () => db,
      mediaServiceDeps: deps.mediaServiceDeps,
      createServerMediaFn: deps.createServerMediaFn,
    },
  );

  const preflightPlan = planContentImport(
    snapshot.manifest,
    dryMediaResult.lookup,
    existingIdsByCollection,
  );

  errors.push(...preflightPlan.errors);
  if (preflightPlan.richTextRejections.length > 0) {
    errors.push(
      `${preflightPlan.richTextRejections.length} rich-text field(s) failed conversion, schema validation, or TipTap round-trip`,
    );
  }

  // Fail closed BEFORE any Blob upload or MongoDB write if preflight has any error!
  const canApply = apply && errors.length === 0;

  let finalMediaResult = dryMediaResult;
  let finalPlan = preflightPlan;

  if (canApply) {
    const ensureMediaIdx =
      deps.ensureMediaIndexesFn ??
      ((targetDb: Db) => ensureMediaIndexes(() => targetDb));
    await ensureMediaIdx(db);

    finalMediaResult = await executeMediaImport(
      snapshot,
      mediaPlan,
      { apply: true },
      {
        getDb: () => db,
        mediaServiceDeps: deps.mediaServiceDeps ?? defaultMediaServiceDeps,
        createServerMediaFn: deps.createServerMediaFn,
      },
    );

    // Re-run pure transform with the real allocated Mongo mediaIds
    finalPlan = planContentImport(
      snapshot.manifest,
      finalMediaResult.lookup,
      existingIdsByCollection,
    );

    if (
      finalPlan.errors.length > 0 ||
      finalPlan.richTextRejections.length > 0
    ) {
      errors.push(...finalPlan.errors);
      if (finalPlan.richTextRejections.length > 0) {
        errors.push(
          `${finalPlan.richTextRejections.length} rich-text field(s) failed post-media transform`,
        );
      }
    }
  }

  // 4. Write (or simulate) content documents idempotently
  const writeCountersByType = new Map<
    string,
    { plannedWrites: number; inserted: number; updated: number; unchanged: number }
  >();
  const countsByCollection: Partial<
    Record<
      CollectionName,
      {
        totalPlanned: number;
        published: number;
        changed: number;
        draftOnly: number;
        inserted: number;
        updated: number;
        unchanged: number;
      }
    >
  > = {};

  let totalDocumentWrites = 0;

  if (canApply && errors.length === 0) {
    const ensureIdx =
      deps.ensureIndexes ??
      ((col: ContentCollectionName, targetDb: Db) =>
        ensureContentIndexes(col, () => targetDb));
    const touchedCollections = new Set(
      finalPlan.documents.map((d) => d.collection),
    );
    for (const col of touchedCollections) {
      await ensureIdx(col, db);
    }
  }

  for (const planned of finalPlan.documents) {
    const typeCounter = writeCountersByType.get(planned.contentType) ?? {
      plannedWrites: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
    };
    writeCountersByType.set(planned.contentType, typeCounter);

    const colCounter = (countsByCollection[planned.collection] ??= {
      totalPlanned: 0,
      published: 0,
      changed: 0,
      draftOnly: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
    });
    colCounter.totalPlanned += 1;
    if (planned.state === "published") colCounter.published += 1;
    else if (planned.state === "changed") colCounter.changed += 1;
    else colCounter.draftOnly += 1;

    const existing = existingByCollection
      .get(planned.collection)
      ?.get(planned.sourceContentfulId);

    if (existing && isStoredEnvelopeUpToDate(existing, planned)) {
      typeCounter.unchanged += 1;
      colCounter.unchanged += 1;
      continue;
    }

    typeCounter.plannedWrites += 1;

    if (!canApply || errors.length > 0) {
      if (existing) {
        typeCounter.updated += 1;
        colCounter.updated += 1;
      } else {
        typeCounter.inserted += 1;
        colCounter.inserted += 1;
      }
      continue;
    }

    const col = db.collection<StoredContentEnvelope<Record<string, unknown>>>(
      planned.collection,
    );

    if (!existing) {
      const envelope: StoredContentEnvelope<Record<string, unknown>> = {
        _id: new ObjectId(planned.docId),
        draft: stripUndefinedDeep(planned.draft),
        ...(planned.published !== undefined && {
          published: stripUndefinedDeep(planned.published),
        }),
        ...(planned.publishedAt !== undefined && {
          publishedAt: planned.publishedAt,
        }),
        ...(planned.firstPublishedAt !== undefined && {
          firstPublishedAt: planned.firstPublishedAt,
        }),
        revision: 1,
        createdAt: planned.createdAt,
        updatedAt: planned.updatedAt,
        updatedBy: IMPORTER_SERVICE_ID,
        updatedByLabel: IMPORTER_SERVICE_LABEL,
        sourceContentfulId: planned.sourceContentfulId,
        ...(planned._naturalKey !== undefined && {
          _naturalKey: planned._naturalKey,
        }),
        _refs: planned._refs,
      };
      await col.insertOne(envelope);
      typeCounter.inserted += 1;
      colCounter.inserted += 1;
      totalDocumentWrites += 1;
    } else {
      const $set: Record<string, unknown> = {
        draft: stripUndefinedDeep(planned.draft),
        revision: (existing.revision ?? 1) + 1,
        createdAt: planned.createdAt,
        updatedAt: planned.updatedAt,
        updatedBy: IMPORTER_SERVICE_ID,
        updatedByLabel: IMPORTER_SERVICE_LABEL,
        sourceContentfulId: planned.sourceContentfulId,
        _refs: planned._refs,
      };
      const $unset: Record<string, ""> = {};

      if (planned.published !== undefined) {
        $set.published = stripUndefinedDeep(planned.published);
      } else if (existing.published !== undefined) {
        $unset.published = "";
      }

      if (planned.publishedAt !== undefined) {
        $set.publishedAt = planned.publishedAt;
      } else if (existing.publishedAt !== undefined) {
        $unset.publishedAt = "";
      }

      if (planned.firstPublishedAt !== undefined) {
        $set.firstPublishedAt = planned.firstPublishedAt;
      } else if (existing.firstPublishedAt !== undefined) {
        $unset.firstPublishedAt = "";
      }

      if (planned._naturalKey !== undefined) {
        $set._naturalKey = planned._naturalKey;
      } else if (existing._naturalKey !== undefined) {
        $unset._naturalKey = "";
      }

      const updateOps: Record<string, unknown> = { $set };
      if (Object.keys($unset).length > 0) {
        updateOps.$unset = $unset;
      }

      await col.updateOne({ _id: existing._id }, updateOps);
      typeCounter.updated += 1;
      colCounter.updated += 1;
      totalDocumentWrites += 1;
    }
  }

  const countsByContentType: Record<string, TypeCountSummary> = {};
  for (const [ct, states] of Object.entries(
    finalPlan.stateCountsByContentType,
  ).sort(([a], [b]) => a.localeCompare(b))) {
    const wc = writeCountersByType.get(ct) ?? {
      plannedWrites: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
    };
    countsByContentType[ct] = {
      ...states,
      ...wc,
    };
  }

  const totalBlobUploads = canApply ? finalMediaResult.summary.created : 0;

  return {
    mode: apply ? "apply" : "dry-run",
    targetDatabase: guard.dbName,
    snapshotExportedAt: snapshot.manifest.exportedAt,
    startedAt,
    completedAt: (deps.now ?? (() => new Date()))().toISOString(),
    ok: errors.length === 0,
    errors,
    countsByContentType,
    countsByCollection,
    media: finalMediaResult.summary,
    skippedEntries: finalPlan.skippedEntries,
    richTextRejections: finalPlan.richTextRejections,
    brokenLinks: finalPlan.brokenLinks,
    scratchDocuments,
    privacyPolicyChecks: finalPlan.privacyPolicyChecks,
    totalDocumentWrites,
    totalBlobUploads,
  };
}

/** Renders a human-readable Markdown summary of an `ImportReport`. */
export function formatImportReportMarkdown(report: ImportReport): string {
  const lines: string[] = [
    `# Contentful Import Report (${report.mode.toUpperCase()})`,
    "",
    `- **Status:** ${report.ok ? "PASS" : "FAILED"}`,
    `- **Target Database:** \`${report.targetDatabase}\``,
    `- **Snapshot Exported At:** ${report.snapshotExportedAt}`,
    `- **Total Document Writes:** ${report.totalDocumentWrites}`,
    `- **Total Blob Uploads:** ${report.totalBlobUploads}`,
    "",
  ];

  if (report.errors.length > 0) {
    lines.push("## Errors", "");
    for (const err of report.errors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }

  lines.push(
    "## Content Types (Contentful -> MongoDB)",
    "",
    "| Content Type | Total | Published | Changed | Draft | Archived | Inserted | Updated | Unchanged |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const [ct, c] of Object.entries(report.countsByContentType)) {
    lines.push(
      `| \`${ct}\` | ${c.contentfulTotal} | ${c.published} | ${c.changed} | ${c.draft} | ${c.archived} | ${c.inserted} | ${c.updated} | ${c.unchanged} |`,
    );
  }
  lines.push("");

  lines.push(
    "## Media",
    "",
    `- Contentful assets: **${report.media.totalContentfulAssets}**`,
    `- Distinct SHA-256 files: **${report.media.distinctFiles}**`,
    `- Created: **${report.media.created}** · Reused: **${report.media.reused}** · Uploaded bytes: **${report.media.uploadedBytes}**`,
    `- Merged same-asset locale duplicates: **${report.media.mergedLocaleFiles.length}**`,
    `- Split differing-locale assets: **${report.media.splitLocaleAssets.length}**`,
    `- Merged cross-asset SHA-256 duplicates: **${report.media.mergedDuplicateAssets.length}**`,
    `- Conflicting duplicate titles: **${report.media.conflictingDuplicateAssets.length}**`,
    `- Unreferenced assets imported: **${report.media.unreferencedAssets.length}**`,
    "",
  );

  if (report.media.unreferencedAssets.length > 0) {
    lines.push("### Unreferenced Assets", "");
    for (const u of report.media.unreferencedAssets) {
      lines.push(
        `- \`${u.assetId}\` (${u.fileName})${u.titleEs ? ` — ${u.titleEs}` : ""}`,
      );
    }
    lines.push("");
  }

  if (report.skippedEntries.length > 0) {
    const nonEmbedded = report.skippedEntries.filter(
      (s) => s.reason !== "embedded-child",
    );
    if (nonEmbedded.length > 0) {
      lines.push("## Skipped / Flattened Entries", "");
      for (const s of nonEmbedded) {
        lines.push(
          `- \`${s.contentType}:${s.contentfulId}\` — **${s.reason}**${
            s.detail ? ` (${s.detail})` : ""
          }`,
        );
      }
      lines.push("");
    }
  }

  if (report.brokenLinks.length > 0) {
    lines.push("## Broken Links Preserved (Content Freeze)", "");
    for (const b of report.brokenLinks) {
      lines.push(
        `- \`${b.contentType}:${b.sourceContentfulId}\` (${b.field}, ${b.locale}): \`${b.href}\` — ${b.reason}`,
      );
    }
    lines.push("");
  }

  if (report.richTextRejections.length > 0) {
    lines.push("## Rich-Text Rejections", "");
    for (const r of report.richTextRejections) {
      lines.push(
        `- \`${r.contentType}:${r.sourceContentfulId}\` (${r.snapshot} ${r.field} ${r.locale}, stage=${r.stage}): ${r.messages.join("; ")}`,
      );
    }
    lines.push("");
  }

  if (report.privacyPolicyChecks.length > 0) {
    lines.push("## Privacy Policy Whitespace-Only Verification", "");
    for (const check of report.privacyPolicyChecks) {
      lines.push(
        `- **${check.locale}** (\`${check.sourceContentfulId}\`): ${
          check.identicalAfterWhitespaceNormalization
            ? "PASS (identical after whitespace normalization)"
            : "FAIL (non-whitespace text difference detected)"
        }`,
      );
    }
    lines.push("");
  }

  if (report.scratchDocuments.length > 0) {
    lines.push(
      "## Untouched Scratch Documents (No `sourceContentfulId`)",
      "",
    );
    for (const s of report.scratchDocuments) {
      lines.push(`- \`${s.collection}:${s.docId}\` — ${s.label}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
