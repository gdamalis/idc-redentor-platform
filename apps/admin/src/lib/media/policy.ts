import { isEmptyValue, LIMITS, slugify, type MediaDoc } from "@idcr/content";

export const MEDIA_KIND = {
  image: "image",
  pdf: "pdf",
  audio: "audio",
} as const;

export type MediaKind = (typeof MEDIA_KIND)[keyof typeof MEDIA_KIND];

export const MEDIA_KINDS: readonly MediaKind[] = [
  MEDIA_KIND.image,
  MEDIA_KIND.pdf,
  MEDIA_KIND.audio,
];

export const MEDIA_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
] as const;

export type AllowedMediaContentType = (typeof MEDIA_ALLOWED_TYPES)[number];

const ALLOWED_TYPE_SET: ReadonlySet<string> = new Set(MEDIA_ALLOWED_TYPES);

/** Per-kind upload size caps in bytes (01-decisions.md: 15 MB image, 25 MB PDF, 200 MB audio). */
export const MEDIA_SIZE_CAPS: Readonly<Record<MediaKind, number>> = {
  image: 15 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
};

export const MEDIA_TYPES_BY_KIND: Readonly<
  Record<MediaKind, readonly AllowedMediaContentType[]>
> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  pdf: ["application/pdf"],
  audio: ["audio/mpeg", "audio/mp4"],
};

const CANONICAL_EXTENSION_BY_TYPE: Readonly<
  Record<AllowedMediaContentType, string>
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

const ALLOWED_EXTENSIONS_BY_TYPE: Readonly<
  Record<AllowedMediaContentType, readonly string[]>
> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "mp4"],
};

const CONTENT_TYPE_ALIASES: Readonly<Record<string, AllowedMediaContentType>> = {
  "image/jpg": "image/jpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
};

export const CANONICAL_MEDIA_ID_RE = /^[0-9a-f]{24}$/;
const MEDIA_PATHNAME_RE =
  /^media\/([0-9a-f]{24})\/([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]{2,5})$/;
const PUBLIC_BLOB_HOST_RE = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;
const MAX_STEM_LENGTH = 80;

/**
 * Normalizes MIME types reported by browsers (e.g. macOS/Chrome `audio/x-m4a` -> `audio/mp4`,
 * strips optional parameters like `; charset=...`).
 */
export function normalizeMediaContentType(raw: string): string {
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  return CONTENT_TYPE_ALIASES[base] ?? base;
}

export function isAllowedMediaContentType(
  contentType: string,
): contentType is AllowedMediaContentType {
  return ALLOWED_TYPE_SET.has(normalizeMediaContentType(contentType));
}

export function getMediaKindForContentType(
  contentType: string,
): MediaKind | null {
  const normalized = normalizeMediaContentType(contentType);
  if (normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp") {
    return MEDIA_KIND.image;
  }
  if (normalized === "application/pdf") {
    return MEDIA_KIND.pdf;
  }
  if (normalized === "audio/mpeg" || normalized === "audio/mp4") {
    return MEDIA_KIND.audio;
  }
  return null;
}

export function getMediaSizeCapForContentType(
  contentType: string,
): number | null {
  const kind = getMediaKindForContentType(contentType);
  return kind ? MEDIA_SIZE_CAPS[kind] : null;
}

/** Audio uploads always use multipart direct-to-Blob upload (ICR-196 Approach). */
export function isMultipartUpload(contentType: string): boolean {
  return getMediaKindForContentType(contentType) === MEDIA_KIND.audio;
}

export function getAcceptAttributeForKinds(
  kinds: readonly MediaKind[],
): string {
  const tokens: string[] = [];
  for (const kind of kinds) {
    for (const mime of MEDIA_TYPES_BY_KIND[kind]) {
      tokens.push(mime);
      for (const ext of ALLOWED_EXTENSIONS_BY_TYPE[mime]) {
        tokens.push(`.${ext}`);
      }
    }
    if (kind === MEDIA_KIND.audio) {
      tokens.push("audio/x-m4a");
    }
  }
  return [...new Set(tokens)].join(",");
}

function stripFilenameDirectoryAndExt(filename: string): string {
  const normalized = filename.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1).trim();
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0) return base;
  return base.slice(0, dotIdx);
}

/**
 * Deterministic, collision-free Vercel Blob key: `media/<mediaId>/<slugified-stem>.<ext>`.
 * Every upload receives a fresh 24-hex ObjectId so identical filenames never collide or overwrite.
 */
export function buildMediaPathname(
  mediaId: string,
  filename: string,
  contentType: AllowedMediaContentType,
): string {
  if (!CANONICAL_MEDIA_ID_RE.test(mediaId)) {
    throw new RangeError("buildMediaPathname: mediaId must be a lowercase 24-hex ObjectId");
  }
  const rawStem = stripFilenameDirectoryAndExt(filename);
  const slug = slugify(rawStem).slice(0, MAX_STEM_LENGTH).replace(/-+$/, "");
  const safeStem = slug.length > 0 ? slug : "file";
  const ext = CANONICAL_EXTENSION_BY_TYPE[contentType];
  return `media/${mediaId}/${safeStem}.${ext}`;
}

/** Validates pathname format, mediaId ownership, and extension-to-MIME consistency. */
export function isValidMediaPathname(
  pathname: string,
  mediaId: string,
  contentType: AllowedMediaContentType,
): boolean {
  if (pathname.length === 0 || pathname.length > LIMITS.slugMax) return false;
  if (!CANONICAL_MEDIA_ID_RE.test(mediaId)) return false;
  const match = MEDIA_PATHNAME_RE.exec(pathname);
  if (!match) return false;
  const [, pathId, , ext] = match;
  if (pathId !== mediaId) return false;
  if (!ext) return false;
  return ALLOWED_EXTENSIONS_BY_TYPE[contentType].includes(ext);
}

/** Ensures a persisted Blob URL belongs to Vercel Blob's public store origin and matches `expectedPathname`. */
export function isAllowedPublicBlobUrl(
  url: string,
  expectedPathname: string,
): boolean {
  if (!url || url.length > LIMITS.hrefMax) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    if (parsed.search || parsed.hash) return false;
    if (!PUBLIC_BLOB_HOST_RE.test(parsed.hostname)) return false;
    return parsed.pathname === `/${expectedPathname}`;
  } catch {
    return false;
  }
}

/**
 * AC3 guard: images cannot be picked until they have a Spanish alt description
 * OR are explicitly marked decorative. PDFs and audio are always pickable.
 */
export function isMediaSelectable(
  doc: Pick<MediaDoc, "contentType" | "alt" | "decorative">,
): boolean {
  if (!doc.contentType.toLowerCase().startsWith("image/")) {
    return true;
  }
  return doc.decorative === true || !isEmptyValue(doc.alt?.["es-AR"]);
}

/** Derives a human-readable default display name from an uploaded filename. */
export function filenameStemToDefaultTitle(filename: string): string {
  const stem = stripFilenameDirectoryAndExt(filename)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.shortTextMax);
  return stem.length > 0 ? stem : "Archivo";
}

export function formatFileSize(bytes: number, locale = "es-AR"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const formatted =
    unitIdx === 0
      ? Math.round(value).toString()
      : new Intl.NumberFormat(locale, {
          maximumFractionDigits: value >= 100 ? 0 : 1,
          minimumFractionDigits: 0,
        }).format(value);
  return `${formatted} ${units[unitIdx]}`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
