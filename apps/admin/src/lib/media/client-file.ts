/**
 * Browser-safe file inspection helpers for media uploads (ICR-196):
 * - Streaming 4 MiB chunked SHA-256 for large files (> 16 MiB, constant ~4 MiB peak RAM
 *   so 200 MB sermon audio hashes safely on mobile browsers) and Web Crypto `crypto.subtle`
 *   for smaller files (<= 16 MiB).
 * - Image natural `width` / `height` reader.
 * - Audio `durationSeconds` reader.
 */

export const SUBTLE_SHA256_MAX_BYTES = 16 * 1024 * 1024;
export const STREAM_SHA256_CHUNK_BYTES = 4 * 1024 * 1024;

// Standard FIPS 180-4 SHA-256 initial hash values & round constants.
const SHA256_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export interface StreamingSha256Hasher {
  update(chunk: Uint8Array): StreamingSha256Hasher;
  digestHex(): string;
}

/** Zero-dependency incremental FIPS 180-4 SHA-256 hasher factory for chunked browser reads. */
export function createStreamingSha256(): StreamingSha256Hasher {
  const state = new Uint32Array(SHA256_H);
  const buffer = new Uint8Array(64);
  const words = new Uint32Array(64);
  let bufferLen = 0;
  let totalBytes = 0;

  const compress = (block: Uint8Array, offset: number): void => {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      words[i] =
        (((block[j] ?? 0) << 24) |
          ((block[j + 1] ?? 0) << 16) |
          ((block[j + 2] ?? 0) << 8) |
          (block[j + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = words[i - 15] ?? 0;
      const w2 = words[i - 2] ?? 0;
      const s0 =
        ((w15 >>> 7) | (w15 << 25)) ^
        ((w15 >>> 18) | (w15 << 14)) ^
        (w15 >>> 3);
      const s1 =
        ((w2 >>> 17) | (w2 << 15)) ^
        ((w2 >>> 19) | (w2 << 13)) ^
        (w2 >>> 10);
      words[i] = ((words[i - 16] ?? 0) + s0 + (words[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (words[i] ?? 0)) >>> 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  };

  const hasher: StreamingSha256Hasher = {
    update(chunk: Uint8Array): StreamingSha256Hasher {
      totalBytes += chunk.length;
      let offset = 0;

      if (bufferLen > 0) {
        const take = Math.min(64 - bufferLen, chunk.length);
        buffer.set(chunk.subarray(0, take), bufferLen);
        bufferLen += take;
        offset += take;
        if (bufferLen === 64) {
          compress(buffer, 0);
          bufferLen = 0;
        }
      }

      while (offset + 64 <= chunk.length) {
        compress(chunk, offset);
        offset += 64;
      }

      if (offset < chunk.length) {
        const remaining = chunk.subarray(offset);
        buffer.set(remaining, 0);
        bufferLen = remaining.length;
      }

      return hasher;
    },

    digestHex(): string {
      const bitLen = totalBytes * 8;
      const highBits = Math.floor(bitLen / 0x1_0000_0000);
      const lowBits = bitLen >>> 0;

      // Append 0x80 followed by zeros until length % 64 === 56, then 64-bit big-endian bit length.
      const padLen = bufferLen < 56 ? 56 - bufferLen : 120 - bufferLen;
      const finalBlock = new Uint8Array(padLen + 8);
      finalBlock[0] = 0x80;
      const view = new DataView(finalBlock.buffer);
      view.setUint32(padLen, highBits, false);
      view.setUint32(padLen + 4, lowBits, false);
      hasher.update(finalBlock);

      let hex = "";
      for (let i = 0; i < 8; i += 1) {
        hex += (state[i] ?? 0).toString(16).padStart(8, "0");
      }
      return hex;
    },
  };

  return hasher;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes lowercase 64-char hex SHA-256 of a `File`/`Blob`.
 * Uses Web Crypto `crypto.subtle` for files <= 16 MiB and 4 MiB chunked
 * `createStreamingSha256` above that threshold (or when `crypto.subtle` is unavailable).
 */
export async function computeFileSha256(
  file: Blob,
  options: {
    readonly subtleThresholdBytes?: number;
    readonly chunkBytes?: number;
  } = {},
): Promise<string> {
  const subtleThreshold = options.subtleThresholdBytes ?? SUBTLE_SHA256_MAX_BYTES;
  const chunkSize = options.chunkBytes ?? STREAM_SHA256_CHUNK_BYTES;

  if (
    file.size <= subtleThreshold &&
    typeof globalThis.crypto?.subtle?.digest === "function"
  ) {
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return bufferToHex(digest);
  }

  const hasher = createStreamingSha256();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const buf = await slice.arrayBuffer();
    hasher.update(new Uint8Array(buf));
  }
  return hasher.digestHex();
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/** Reads positive integer pixel dimensions from an image `Blob` in the browser. */
export async function readImageDimensions(
  file: Blob,
): Promise<ImageDimensions | undefined> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file);
      const width = Math.round(bitmap.width);
      const height = Math.round(bitmap.height);
      bitmap.close();
      if (width > 0 && height > 0) return { width, height };
    } catch {
      // Fall through to HTMLImageElement probe.
    }
  }

  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<ImageDimensions | undefined>((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(undefined), 10_000);
      img.onload = () => {
        clearTimeout(timer);
        const width = Math.round(img.naturalWidth);
        const height = Math.round(img.naturalHeight);
        resolve(width > 0 && height > 0 ? { width, height } : undefined);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(undefined);
      };
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Reads duration in whole seconds from an audio `Blob` via a detached `<audio>` element. */
export async function readAudioDuration(
  file: Blob,
  timeoutMs = 10_000,
): Promise<number | undefined> {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number | undefined>((resolve) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      let settled = false;
      const finish = (value: number | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.removeAttribute("src");
        audio.load();
        resolve(value);
      };
      const timer = setTimeout(() => finish(undefined), timeoutMs);
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        finish(Number.isFinite(d) && d >= 0 ? Math.round(d) : undefined);
      };
      audio.onerror = () => finish(undefined);
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
