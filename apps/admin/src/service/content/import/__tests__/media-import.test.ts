import { createHash } from "node:crypto";
import { COLLECTIONS } from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import {
  executeMediaImport,
  planMediaImport,
  type ContentfulSnapshotManifest,
  type LoadedContentfulSnapshot,
  type StoredImportedMediaDoc,
} from "../index";

function sha(text: string): string {
  return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

function makeInMemoryMediaDb() {
  const docs: StoredImportedMediaDoc[] = [];

  const matches = (
    doc: StoredImportedMediaDoc,
    filter: Record<string, unknown>,
  ): boolean => {
    for (const [key, cond] of Object.entries(filter)) {
      const val = (doc as unknown as Record<string, unknown>)[key];
      if (
        cond &&
        typeof cond === "object" &&
        "$in" in (cond as Record<string, unknown>)
      ) {
        const arr = (cond as { $in: unknown[] }).$in;
        if (!arr.includes(val)) return false;
      } else if (val instanceof ObjectId && cond instanceof ObjectId) {
        if (!val.equals(cond)) return false;
      } else if (val !== cond) {
        return false;
      }
    }
    return true;
  };

  const collection = {
    find: (filter: Record<string, unknown>) => ({
      toArray: async () => docs.filter((d) => matches(d, filter)),
    }),
    findOne: async (filter: Record<string, unknown>) =>
      docs.find((d) => matches(d, filter)) ?? null,
    insertOne: async (doc: StoredImportedMediaDoc) => {
      docs.push(doc);
      return { insertedId: doc._id };
    },
    updateOne: async (
      filter: Record<string, unknown>,
      update: {
        $addToSet?: {
          sourceContentfulIds?: { $each?: string[] };
          sourceContentfulUrls?: { $each?: string[] };
        };
      },
    ) => {
      const target = docs.find((d) => matches(d, filter));
      if (!target) return { matchedCount: 0, modifiedCount: 0 };
      let modified = 0;
      const addIds = update.$addToSet?.sourceContentfulIds?.$each ?? [];
      if (addIds.length > 0) {
        const current = new Set(target.sourceContentfulIds ?? []);
        for (const item of addIds) {
          if (!current.has(item)) {
            current.add(item);
            modified = 1;
          }
        }
        target.sourceContentfulIds = [...current];
      }
      const addUrls = update.$addToSet?.sourceContentfulUrls?.$each ?? [];
      if (addUrls.length > 0) {
        const current = new Set(target.sourceContentfulUrls ?? []);
        for (const item of addUrls) {
          if (!current.has(item)) {
            current.add(item);
            modified = 1;
          }
        }
        target.sourceContentfulUrls = [...current];
      }
      return { matchedCount: 1, modifiedCount: modified };
    },
  };

  const db = {
    databaseName: "website-staging",
    collection: (name: string) => {
      if (name !== COLLECTIONS.media) {
        throw new Error(`Unexpected collection ${name}`);
      }
      return collection;
    },
  } as unknown as Db;

  return { db, docs };
}

describe("planMediaImport & executeMediaImport (AC2, AC3, AC4)", () => {
  const bytesMap: Record<string, Buffer> = {
    "assets/logo-1.png": Buffer.from("PNG-LOGO-SAME-BYTES"),
    "assets/logo-2.png": Buffer.from("PNG-LOGO-SAME-BYTES"),
    "assets/audio-1.mp3": Buffer.from("MP3-SERMON-ONE"),
    "assets/audio-2.mp3": Buffer.from("MP3-SERMON-TWO"),
    "assets/pdf-es.pdf": Buffer.from("PDF-SPANISH-CONTENT"),
    "assets/pdf-en.pdf": Buffer.from("PDF-ENGLISH-CONTENT"),
    "assets/orphan.jpg": Buffer.from("JPG-ORPHAN-BYTES"),
  };

  const manifest: ContentfulSnapshotManifest = {
    schemaVersion: 1,
    exportedAt: "2026-11-22T00:00:00.000Z",
    spaceId: "space-test",
    environment: "master",
    defaultLocale: "es-AR",
    locales: ["es-AR", "en-US"],
    contentTypeIds: [],
    cmaEntries: [],
    cdaPublishedEntries: [],
    cmaAssets: [
      {
        // Same bytes across es-AR and en-US (mergedLocaleFiles) + duplicated by asset-logo-dup
        sys: {
          id: "asset-logo-1",
          createdAt: "2025-01-10T10:00:00.000Z",
          updatedAt: "2025-01-10T10:00:00.000Z",
        },
        fields: {
          title: { "es-AR": "Logo Redentor", "en-US": "Redeemer Logo" },
        },
      },
      {
        sys: {
          id: "asset-logo-dup",
          createdAt: "2025-01-11T10:00:00.000Z",
          updatedAt: "2025-01-11T10:00:00.000Z",
        },
        fields: {
          title: { "es-AR": "Logo Redentor", "en-US": "Redeemer Logo" },
        },
      },
      {
        // Two different MP3 files with identical filename "audio.mp3"
        sys: {
          id: "asset-audio-1",
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
        fields: { title: { "es-AR": "Audio Prédica 1" } },
      },
      {
        sys: {
          id: "asset-audio-2",
          createdAt: "2026-07-08T10:00:00.000Z",
          updatedAt: "2026-07-08T10:00:00.000Z",
        },
        fields: { title: { "es-AR": "Audio Prédica 2" } },
      },
      {
        // Localized PDF with differing es-AR vs en-US bytes
        sys: {
          id: "asset-pdf-bilingual",
          createdAt: "2026-07-01T12:00:00.000Z",
          updatedAt: "2026-07-01T12:00:00.000Z",
        },
        fields: {
          title: { "es-AR": "Resumen Prédica", "en-US": "Sermon Summary" },
        },
      },
      {
        // Unreferenced image asset
        sys: {
          id: "asset-orphan",
          createdAt: "2025-05-01T00:00:00.000Z",
          updatedAt: "2025-05-01T00:00:00.000Z",
        },
        fields: { title: { "es-AR": "Foto Sin Uso" } },
      },
    ],
    downloadedFiles: [
      {
        assetId: "asset-logo-1",
        locale: "es-AR",
        relativePath: "assets/logo-1.png",
        url: "https://images.ctfassets.net/s/asset-logo-1/1/redentor_logo.png",
        fileName: "redentor_logo.png",
        contentType: "image/png",
        size: bytesMap["assets/logo-1.png"]!.byteLength,
        sha256: sha("PNG-LOGO-SAME-BYTES"),
        width: 512,
        height: 512,
      },
      {
        assetId: "asset-logo-1",
        locale: "en-US",
        relativePath: "assets/logo-1.png",
        url: "https://images.ctfassets.net/s/asset-logo-1/2/redentor_logo.png",
        fileName: "redentor_logo.png",
        contentType: "image/png",
        size: bytesMap["assets/logo-1.png"]!.byteLength,
        sha256: sha("PNG-LOGO-SAME-BYTES"),
        width: 512,
        height: 512,
      },
      {
        assetId: "asset-logo-dup",
        locale: "es-AR",
        relativePath: "assets/logo-2.png",
        url: "https://images.ctfassets.net/s/asset-logo-dup/1/redentor_logo.png",
        fileName: "redentor_logo.png",
        contentType: "image/png",
        size: bytesMap["assets/logo-2.png"]!.byteLength,
        sha256: sha("PNG-LOGO-SAME-BYTES"),
        width: 512,
        height: 512,
      },
      {
        assetId: "asset-audio-1",
        locale: "es-AR",
        relativePath: "assets/audio-1.mp3",
        url: "https://assets.ctfassets.net/s/asset-audio-1/1/audio.mp3",
        fileName: "audio.mp3",
        contentType: "audio/mpeg",
        size: bytesMap["assets/audio-1.mp3"]!.byteLength,
        sha256: sha("MP3-SERMON-ONE"),
      },
      {
        assetId: "asset-audio-2",
        locale: "es-AR",
        relativePath: "assets/audio-2.mp3",
        url: "https://assets.ctfassets.net/s/asset-audio-2/1/audio.mp3",
        fileName: "audio.mp3",
        contentType: "audio/mpeg",
        size: bytesMap["assets/audio-2.mp3"]!.byteLength,
        sha256: sha("MP3-SERMON-TWO"),
      },
      {
        assetId: "asset-pdf-bilingual",
        locale: "es-AR",
        relativePath: "assets/pdf-es.pdf",
        url: "https://assets.ctfassets.net/s/asset-pdf-bilingual/1/predica.es-AR.pdf",
        fileName: "predica.es-AR.pdf",
        contentType: "application/pdf",
        size: bytesMap["assets/pdf-es.pdf"]!.byteLength,
        sha256: sha("PDF-SPANISH-CONTENT"),
      },
      {
        assetId: "asset-pdf-bilingual",
        locale: "en-US",
        relativePath: "assets/pdf-en.pdf",
        url: "https://assets.ctfassets.net/s/asset-pdf-bilingual/2/predica.en-US.pdf",
        fileName: "predica.en-US.pdf",
        contentType: "application/pdf",
        size: bytesMap["assets/pdf-en.pdf"]!.byteLength,
        sha256: sha("PDF-ENGLISH-CONTENT"),
      },
      {
        assetId: "asset-orphan",
        locale: "es-AR",
        relativePath: "assets/orphan.jpg",
        url: "https://images.ctfassets.net/s/asset-orphan/1/orphan.jpg",
        fileName: "orphan.jpg",
        contentType: "image/jpeg",
        size: bytesMap["assets/orphan.jpg"]!.byteLength,
        sha256: sha("JPG-ORPHAN-BYTES"),
        width: 1200,
        height: 800,
      },
    ],
  };

  const snapshot: LoadedContentfulSnapshot = {
    manifest,
    loadFileBytes: async (file) => bytesMap[file.relativePath]!,
  };

  it("dedupes by SHA-256, splits differing-locale files, avoids same-filename collisions, and is idempotent on re-run", async () => {
    const referenced = new Set([
      "asset-logo-1",
      "asset-logo-dup",
      "asset-audio-1",
      "asset-audio-2",
      "asset-pdf-bilingual",
    ]);

    const plan = planMediaImport(manifest, referenced);
    // 6 assets -> 1 merged logo + 2 distinct audio.mp3 + 2 split PDFs + 1 orphan = 6 distinct SHA-256 groups
    expect(plan.groups).toHaveLength(6);
    expect(plan.mergedLocaleFiles).toHaveLength(1);
    expect(plan.mergedDuplicateAssets).toHaveLength(1);
    expect(plan.conflictingDuplicateAssets).toHaveLength(0);
    expect(plan.splitLocaleAssets).toHaveLength(1);
    expect(plan.unreferencedAssets.map((u) => u.assetId)).toEqual([
      "asset-orphan",
    ]);

    const { db, docs } = makeInMemoryMediaDb();
    const createServerMediaMock = vi.fn(async (_caller, input, deps) => {
      const id = new ObjectId();
      const sha256 = createHash("sha256")
        .update(input.buffer ?? input.body)
        .digest("hex");
      const pathname = `media/${id.toHexString()}/${input.filename}`;
      const stored: StoredImportedMediaDoc = {
        _id: id,
        pathname,
        url: `https://staging.public.blob.vercel-storage.com/${pathname}`,
        filename: input.filename,
        contentType: input.contentType,
        size: (input.buffer ?? input.body).byteLength,
        sha256,
        ...(input.width !== undefined && { width: input.width }),
        ...(input.height !== undefined && { height: input.height }),
        title: input.title,
        ...(input.alt !== undefined && { alt: input.alt }),
        createdBy: "service:contentful-import",
        createdAt: deps?.now ? deps.now() : new Date(),
      };
      docs.push(stored);
      return {
        ok: true as const,
        status: "created" as const,
        reused: false as const,
        doc: { ...stored, _id: id.toHexString() },
      };
    });

    // Run 1: apply
    const first = await executeMediaImport(
      snapshot,
      plan,
      { apply: true },
      { getDb: () => db, createServerMediaFn: createServerMediaMock as never },
    );

    expect(first.summary.created).toBe(6);
    expect(first.summary.reused).toBe(0);
    expect(createServerMediaMock).toHaveBeenCalledTimes(6);

    // Logo deduped: both Contentful asset IDs resolve to the SAME Mongo mediaId
    expect(first.lookup.resolveMediaId("asset-logo-1")).toBe(
      first.lookup.resolveMediaId("asset-logo-dup"),
    );

    // Same filename "audio.mp3" -> TWO distinct mediaIds and pathnames
    const audio1Id = first.lookup.resolveMediaId("asset-audio-1");
    const audio2Id = first.lookup.resolveMediaId("asset-audio-2");
    expect(audio1Id).toBeDefined();
    expect(audio2Id).toBeDefined();
    expect(audio1Id).not.toBe(audio2Id);

    // Differing locale PDFs -> TWO distinct mediaIds per locale, scoped tags & exact URLs (C1)
    const pdfEsId = first.lookup.resolveMediaId("asset-pdf-bilingual", "es-AR");
    const pdfEnId = first.lookup.resolveMediaId("asset-pdf-bilingual", "en-US");
    expect(pdfEsId).toBeDefined();
    expect(pdfEnId).toBeDefined();
    expect(pdfEsId).not.toBe(pdfEnId);

    const pdfEsDoc = docs.find((d) => d._id.toHexString() === pdfEsId);
    const pdfEnDoc = docs.find((d) => d._id.toHexString() === pdfEnId);
    expect(pdfEsDoc?.sourceContentfulIds).toEqual(["asset-pdf-bilingual:es-AR"]);
    expect(pdfEnDoc?.sourceContentfulIds).toEqual(["asset-pdf-bilingual:en-US"]);
    expect(pdfEsDoc?.sourceContentfulUrls).toEqual([
      "https://assets.ctfassets.net/s/asset-pdf-bilingual/1/predica.es-AR.pdf",
    ]);
    expect(pdfEnDoc?.sourceContentfulUrls).toEqual([
      "https://assets.ctfassets.net/s/asset-pdf-bilingual/2/predica.en-US.pdf",
    ]);

    // Image asset copies title -> alt and preserves original createdAt & width/height
    const logoDoc = docs.find((d) => d._id.toHexString() === first.lookup.resolveMediaId("asset-logo-1"));
    expect(logoDoc?.alt).toEqual({ "es-AR": "Logo Redentor", "en-US": "Redeemer Logo" });
    expect(logoDoc?.width).toBe(512);
    expect(logoDoc?.height).toBe(512);
    expect(logoDoc?.createdAt.toISOString()).toBe("2025-01-10T10:00:00.000Z");
    expect(logoDoc?.sourceContentfulIds).toEqual(
      expect.arrayContaining(["asset-logo-1", "asset-logo-dup"]),
    );
    expect(logoDoc?.sourceContentfulUrls).toEqual(
      expect.arrayContaining([
        "https://images.ctfassets.net/s/asset-logo-1/1/redentor_logo.png",
        "https://images.ctfassets.net/s/asset-logo-1/2/redentor_logo.png",
        "https://images.ctfassets.net/s/asset-logo-dup/1/redentor_logo.png",
      ]),
    );

    // Run 2: apply again -> ZERO uploads, ZERO metadata writes
    createServerMediaMock.mockClear();
    const second = await executeMediaImport(
      snapshot,
      plan,
      { apply: true },
      { getDb: () => db, createServerMediaFn: createServerMediaMock as never },
    );
    expect(createServerMediaMock).not.toHaveBeenCalled();
    expect(second.summary.created).toBe(0);
    expect(second.summary.reused).toBe(6);
    expect(second.summary.metadataLinked).toBe(0);
    expect(second.summary.uploadedBytes).toBe(0);
  });

  it("flags conflicting titles across SHA-256 duplicate assets", () => {
    const conflictingManifest: ContentfulSnapshotManifest = {
      ...manifest,
      cmaAssets: [
        manifest.cmaAssets[0]!,
        {
          ...manifest.cmaAssets[1]!,
          fields: { title: { "es-AR": "Otro Título Distinto" } },
        },
      ],
      downloadedFiles: manifest.downloadedFiles.slice(0, 3),
    };

    const plan = planMediaImport(conflictingManifest, new Set());
    expect(plan.conflictingDuplicateAssets).toHaveLength(1);
    expect(plan.conflictingDuplicateAssets[0]?.assetIds).toEqual([
      "asset-logo-1",
      "asset-logo-dup",
    ]);
  });

  it("skips archived fileless CMA assets without reporting missingAssetFiles (C2)", () => {
    const withArchivedAsset: ContentfulSnapshotManifest = {
      ...manifest,
      cmaAssets: [
        ...manifest.cmaAssets,
        {
          sys: {
            id: "asset-archived-fileless",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-02T00:00:00.000Z",
            archivedVersion: 1,
          },
          fields: { title: { "es-AR": "Archivo Archivado" } },
        },
      ],
    };

    const plan = planMediaImport(withArchivedAsset, new Set());
    expect(plan.missingAssetFiles).toEqual([]);
    expect(plan.groups).toHaveLength(6);
  });
});
