import type { AllowedMediaContentType } from "@src/lib/media/policy";

/**
 * Server-side file magic-byte verification for `/api/predica/media/confirm`
 * (`ICR-204` Approach #3, Lesson H #3, PM R3).
 *
 * Fetches only the first 16 bytes (`Range: bytes=0-15`) of a verified public
 * Vercel Blob URL with `redirect: "error"` and a 10s timeout so 200 MB audio
 * files never stream through the Vercel function.
 */

const MAGIC_BYTES_TIMEOUT_MS = 10_000;

function matchesBytesAt(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

/**
 * Pure magic-byte signature check against the 6 allowed media MIME types:
 * - `image/png`: `89 50 4E 47 0D 0A 1A 0A`
 * - `image/jpeg`: `FF D8 FF`
 * - `image/webp`: `RIFF` at 0..3 + `WEBP` at 8..11
 * - `application/pdf`: `%PDF-` (`25 50 44 46 2D`)
 * - `audio/mpeg`: `ID3` (`49 44 33`) OR valid MPEG audio frame sync
 *   (`byte[0] === 0xFF`, `(byte[1] & 0xE0) === 0xE0`, version !== `01`, layer !== `00`)
 * - `audio/mp4`: ISO BMFF `ftyp` box at bytes 4..7 (`66 74 79 70`)
 */
export function matchesMediaMagicBytes(
  contentType: AllowedMediaContentType,
  bytes: Uint8Array,
): boolean {
  switch (contentType) {
    case "image/png":
      return matchesBytesAt(bytes, 0, [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

    case "image/jpeg":
      return matchesBytesAt(bytes, 0, [0xff, 0xd8, 0xff]);

    case "image/webp":
      return (
        matchesBytesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
        matchesBytesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
      );

    case "application/pdf":
      return matchesBytesAt(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d]);

    case "audio/mpeg": {
      // ID3v2 tag header ("ID3")
      if (matchesBytesAt(bytes, 0, [0x49, 0x44, 0x33])) {
        return true;
      }
      // Raw MPEG audio frame sync: 11 sync bits (0xFFE0), valid version (!= 01), valid layer (!= 00)
      if (bytes.length >= 2) {
        const b0 = bytes[0] ?? 0;
        const b1 = bytes[1] ?? 0;
        const hasSync = b0 === 0xff && (b1 & 0xe0) === 0xe0;
        const versionBits = (b1 >> 3) & 0x03;
        const layerBits = (b1 >> 1) & 0x03;
        if (hasSync && versionBits !== 0x01 && layerBits !== 0x00) {
          return true;
        }
      }
      return false;
    }

    case "audio/mp4":
      return matchesBytesAt(bytes, 4, [0x66, 0x74, 0x79, 0x70]);
  }
}

export type MagicByteVerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "mismatch" | "fetch-failed"; readonly detail: string };

export interface MagicByteVerifyDeps {
  readonly fetchFn: typeof fetch;
}

const defaultMagicByteVerifyDeps: MagicByteVerifyDeps = {
  fetchFn: fetch,
};

/**
 * Fetches bytes `0..15` of an ALREADY-VERIFIED public Vercel Blob URL with
 * `redirect: "error"` and a 10s AbortSignal timeout (`R3`), and checks that
 * the leading bytes match `expectedContentType`.
 */
export async function verifyBlobMagicBytes(
  verifiedBlobUrl: string,
  expectedContentType: AllowedMediaContentType,
  deps: MagicByteVerifyDeps = defaultMagicByteVerifyDeps,
): Promise<MagicByteVerifyResult> {
  try {
    const response = await deps.fetchFn(verifiedBlobUrl, {
      method: "GET",
      headers: { Range: "bytes=0-15" },
      redirect: "error",
      signal: AbortSignal.timeout(MAGIC_BYTES_TIMEOUT_MS),
    });

    if (response.status !== 200 && response.status !== 206) {
      return {
        ok: false,
        reason: "fetch-failed",
        detail: `Magic-byte range fetch failed with HTTP ${response.status}`,
      };
    }

    const buf = new Uint8Array(await response.arrayBuffer());
    const head = buf.slice(0, 16);
    if (!matchesMediaMagicBytes(expectedContentType, head)) {
      return {
        ok: false,
        reason: "mismatch",
        detail: `Uploaded file bytes do not match declared content type (${expectedContentType})`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "fetch-failed",
      detail:
        err instanceof Error
          ? `Magic-byte verification failed: ${err.message}`
          : "Magic-byte verification failed",
    };
  }
}
