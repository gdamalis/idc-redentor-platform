import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@idcr/content";
import { normalizeContentfulAssetUrl } from "./guards";
import type {
  ContentfulAsset,
  ContentfulAssetFile,
  ContentfulEntry,
  ContentfulSnapshotManifest,
  LoadedContentfulSnapshot,
  SnapshotDownloadedAssetFile,
} from "./types";

const LOCALES: readonly Locale[] = ["es-AR", "en-US"];

export interface ExportSnapshotOptions {
  readonly spaceId: string;
  readonly environment?: string;
  readonly cmaToken: string;
  readonly cdaToken: string;
  readonly outputDir: string;
  readonly fetchImpl?: typeof fetch;
}

interface PaginatedPayload<T> {
  readonly total?: number;
  readonly items?: readonly T[];
}

async function fetchPaginatedContentful<T>(
  baseUrl: string,
  token: string,
  extraParams: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T[]> {
  const items: T[] = [];
  let skip = 0;
  const limit = 200;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("skip", String(skip));
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v);
    }

    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new Error(
        `Contentful GET ${url.pathname} failed with HTTP ${res.status}`,
      );
    }
    const payload = (await res.json()) as PaginatedPayload<T>;
    const batch = payload.items ?? [];
    total = payload.total ?? batch.length;
    items.push(...batch);
    skip += batch.length;
    if (batch.length === 0) break;
  }

  return items;
}

function safeExtension(fileName: string, contentType: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0) {
    const ext = fileName
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (ext.length > 0 && ext.length <= 6) return ext;
  }
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

/**
 * Read-only (GET-only) Contentful snapshot exporter.
 *
 * Reads:
 * - CMA (`/entries`, `/assets`, `/content_types`) for all entry states (`published`,
 *   `changed`, `draft`, `archived`), `sys.version`/`publishedVersion`/`archivedVersion`,
 *   and latest draft fields.
 * - CDA (`/entries?locale=*&include=0`) for live published snapshots (needed when an
 *   entry is in `changed` state so published and newer draft stay distinct).
 * - Downloads every asset binary file (normalizing protocol-relative CMA URLs) to
 *   `<outputDir>/assets/` and records SHA-256 hashes in `<outputDir>/manifest.json`.
 *
 * NEVER writes to Contentful. Output MUST stay in a git-ignored directory (e.g. `artifacts/`).
 */
export async function exportContentfulSnapshot(
  options: ExportSnapshotOptions,
): Promise<ContentfulSnapshotManifest> {
  const env = options.environment ?? "master";
  const fetchImpl = options.fetchImpl ?? fetch;

  const cmaBase = `https://api.contentful.com/spaces/${options.spaceId}/environments/${env}`;
  const cdaBase = `https://cdn.contentful.com/spaces/${options.spaceId}/environments/${env}`;

  const [cmaEntries, cmaAssets, contentTypes, cdaPublishedEntries] =
    await Promise.all([
      fetchPaginatedContentful<ContentfulEntry>(
        `${cmaBase}/entries`,
        options.cmaToken,
        {},
        fetchImpl,
      ),
      fetchPaginatedContentful<ContentfulAsset>(
        `${cmaBase}/assets`,
        options.cmaToken,
        {},
        fetchImpl,
      ),
      fetchPaginatedContentful<{ readonly sys: { readonly id: string } }>(
        `${cmaBase}/content_types`,
        options.cmaToken,
        {},
        fetchImpl,
      ),
      fetchPaginatedContentful<ContentfulEntry>(
        `${cdaBase}/entries`,
        options.cdaToken,
        { locale: "*", include: "0" },
        fetchImpl,
      ),
    ]);

  await mkdir(path.join(options.outputDir, "assets"), { recursive: true });

  const downloadedFiles: SnapshotDownloadedAssetFile[] = [];

  for (const asset of cmaAssets) {
    const fileMap = asset.fields.file ?? {};
    for (const locale of LOCALES) {
      const fileDesc = fileMap[locale] as ContentfulAssetFile | undefined;
      if (!fileDesc?.url) continue;

      const normalizedUrl = normalizeContentfulAssetUrl(fileDesc.url);
      const res = await fetchImpl(normalizedUrl, { method: "GET" });
      if (!res.ok) {
        throw new Error(
          `Failed to download asset ${asset.sys.id} (${locale}) from Contentful CDN: HTTP ${res.status}`,
        );
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const ext = safeExtension(fileDesc.fileName, fileDesc.contentType);
      const relativePath = path.posix.join(
        "assets",
        `${asset.sys.id}-${locale}-${sha256.slice(0, 12)}.${ext}`,
      );
      const fullPath = path.join(options.outputDir, relativePath);
      await writeFile(fullPath, bytes);

      downloadedFiles.push({
        assetId: asset.sys.id,
        locale,
        relativePath,
        url: normalizedUrl,
        fileName: fileDesc.fileName,
        contentType: fileDesc.contentType,
        size: bytes.byteLength,
        sha256,
        ...(fileDesc.details?.image?.width !== undefined && {
          width: fileDesc.details.image.width,
        }),
        ...(fileDesc.details?.image?.height !== undefined && {
          height: fileDesc.details.image.height,
        }),
      });
    }
  }

  const manifest: ContentfulSnapshotManifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    spaceId: options.spaceId,
    environment: env,
    defaultLocale: "es-AR",
    locales: LOCALES,
    contentTypeIds: contentTypes.map((ct) => ct.sys.id).sort(),
    cmaEntries,
    cdaPublishedEntries,
    cmaAssets,
    downloadedFiles,
  };

  await writeFile(
    path.join(options.outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

/** Loads a frozen snapshot from disk and validates manifest structure. */
export async function loadContentfulSnapshotFromDir(
  snapshotDir: string,
): Promise<LoadedContentfulSnapshot> {
  const resolvedRoot = path.resolve(snapshotDir);
  const manifestPath = path.join(resolvedRoot, "manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ContentfulSnapshotManifest>;

  if (
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.cmaEntries) ||
    !Array.isArray(parsed.cdaPublishedEntries) ||
    !Array.isArray(parsed.cmaAssets) ||
    !Array.isArray(parsed.downloadedFiles)
  ) {
    throw new Error(
      `Invalid Contentful snapshot manifest at ${manifestPath}: expected schemaVersion 1 with cmaEntries, cdaPublishedEntries, cmaAssets, and downloadedFiles arrays.`,
    );
  }

  const manifest = parsed as ContentfulSnapshotManifest;

  return {
    manifest,
    loadFileBytes: async (file: SnapshotDownloadedAssetFile) => {
      const target = path.resolve(resolvedRoot, file.relativePath);
      if (
        target !== resolvedRoot &&
        !target.startsWith(`${resolvedRoot}${path.sep}`)
      ) {
        throw new Error(
          `Refusing to read snapshot asset outside snapshot directory: ${file.relativePath}`,
        );
      }
      return readFile(target);
    },
  };
}
