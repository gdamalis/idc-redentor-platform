import { describe, expect, it } from "vitest";
import {
  MEDIA_KIND,
  MEDIA_SIZE_CAPS,
  buildMediaPathname,
  filenameStemToDefaultTitle,
  formatDuration,
  formatFileSize,
  getAcceptAttributeForKinds,
  getMediaKindForContentType,
  getMediaSizeCapForContentType,
  isAllowedMediaContentType,
  isAllowedPublicBlobUrl,
  isMediaSelectable,
  isMultipartUpload,
  isValidMediaPathname,
  normalizeMediaContentType,
} from "./policy";

const SAMPLE_ID = "507f1f77bcf86cd799439011";

describe("media policy", () => {
  it("normalizes browser MIME quirks and validates allowlist", () => {
    expect(normalizeMediaContentType("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeMediaContentType("image/jpg; charset=utf-8")).toBe("image/jpeg");
    expect(isAllowedMediaContentType("image/jpeg")).toBe(true);
    expect(isAllowedMediaContentType("image/png")).toBe(true);
    expect(isAllowedMediaContentType("image/webp")).toBe(true);
    expect(isAllowedMediaContentType("application/pdf")).toBe(true);
    expect(isAllowedMediaContentType("audio/mpeg")).toBe(true);
    expect(isAllowedMediaContentType("audio/mp4")).toBe(true);
    expect(isAllowedMediaContentType("audio/x-m4a")).toBe(true);
    expect(isAllowedMediaContentType("image/svg+xml")).toBe(false);
    expect(isAllowedMediaContentType("text/html")).toBe(false);
    expect(isAllowedMediaContentType("application/javascript")).toBe(false);
  });

  it("maps kinds, size caps, and multipart flag accurately", () => {
    expect(getMediaKindForContentType("image/webp")).toBe(MEDIA_KIND.image);
    expect(getMediaKindForContentType("application/pdf")).toBe(MEDIA_KIND.pdf);
    expect(getMediaKindForContentType("audio/mpeg")).toBe(MEDIA_KIND.audio);
    expect(getMediaKindForContentType("video/mp4")).toBeNull();

    expect(getMediaSizeCapForContentType("image/png")).toBe(15 * 1024 * 1024);
    expect(getMediaSizeCapForContentType("application/pdf")).toBe(25 * 1024 * 1024);
    expect(getMediaSizeCapForContentType("audio/mpeg")).toBe(200 * 1024 * 1024);
    expect(MEDIA_SIZE_CAPS.audio).toBe(209_715_200);

    expect(isMultipartUpload("audio/mpeg")).toBe(true);
    expect(isMultipartUpload("audio/x-m4a")).toBe(true);
    expect(isMultipartUpload("image/jpeg")).toBe(false);
    expect(isMultipartUpload("application/pdf")).toBe(false);
  });

  it("builds deterministic collision-free pathnames and validates them", () => {
    const path = buildMediaPathname(SAMPLE_ID, "Prédica Domingo #1 (Final).MP3", "audio/mpeg");
    expect(path).toBe(`media/${SAMPLE_ID}/predica-domingo-1-final.mp3`);
    expect(isValidMediaPathname(path, SAMPLE_ID, "audio/mpeg")).toBe(true);

    // Mismatched mediaId or MIME extension fails
    expect(isValidMediaPathname(path, "507f1f77bcf86cd799439012", "audio/mpeg")).toBe(false);
    expect(isValidMediaPathname(path, SAMPLE_ID, "image/png")).toBe(false);
    expect(isValidMediaPathname(`media/${SAMPLE_ID}/../evil.mp3`, SAMPLE_ID, "audio/mpeg")).toBe(false);

    // Fallback when stem has no alphanumerics
    expect(buildMediaPathname(SAMPLE_ID, "???.jpg", "image/jpeg")).toBe(
      `media/${SAMPLE_ID}/file.jpg`,
    );

    // Invalid mediaId throws
    expect(() => buildMediaPathname("not-an-objectid", "a.jpg", "image/jpeg")).toThrow();
  });

  it("validates public Vercel Blob URLs strictly", () => {
    const pathname = `media/${SAMPLE_ID}/foto.jpg`;
    expect(
      isAllowedPublicBlobUrl(
        `https://abc123def.public.blob.vercel-storage.com/${pathname}`,
        pathname,
      ),
    ).toBe(true);
    expect(
      isAllowedPublicBlobUrl(
        `https://evil.example.com/${pathname}`,
        pathname,
      ),
    ).toBe(false);
    expect(
      isAllowedPublicBlobUrl(
        `http://abc123def.public.blob.vercel-storage.com/${pathname}`,
        pathname,
      ),
    ).toBe(false);
    expect(
      isAllowedPublicBlobUrl(
        `https://abc123def.public.blob.vercel-storage.com/media/${SAMPLE_ID}/other.jpg`,
        pathname,
      ),
    ).toBe(false);
    expect(
      isAllowedPublicBlobUrl(
        `https://abc123def.public.blob.vercel-storage.com/${pathname}?foo=1`,
        pathname,
      ),
    ).toBe(false);
  });

  it("enforces AC3 image alt/decorative pickability rule", () => {
    expect(isMediaSelectable({ contentType: "application/pdf" })).toBe(true);
    expect(isMediaSelectable({ contentType: "audio/mpeg" })).toBe(true);
    expect(isMediaSelectable({ contentType: "image/jpeg" })).toBe(false);
    expect(
      isMediaSelectable({ contentType: "image/jpeg", alt: { "es-AR": "   " } }),
    ).toBe(false);
    expect(
      isMediaSelectable({ contentType: "image/jpeg", alt: { "es-AR": "Bautismo en el río" } }),
    ).toBe(true);
    expect(
      isMediaSelectable({ contentType: "image/png", decorative: true }),
    ).toBe(true);
  });

  it("formats accept attributes, default titles, sizes, and durations", () => {
    expect(getAcceptAttributeForKinds([MEDIA_KIND.image])).toContain("image/webp");
    expect(getAcceptAttributeForKinds([MEDIA_KIND.audio])).toContain("audio/x-m4a");
    expect(filenameStemToDefaultTitle("retiro_jovenes-2026.jpg")).toBe("retiro jovenes 2026");
    expect(formatFileSize(1536, "en-US")).toBe("1.5 KB");
    expect(formatDuration(2285)).toBe("38:05");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(undefined)).toBe("");
  });
});
