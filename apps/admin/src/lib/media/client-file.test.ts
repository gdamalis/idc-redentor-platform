import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStreamingSha256, computeFileSha256 } from "./client-file";

function nodeSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("createStreamingSha256 & computeFileSha256", () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 128, 1024, 65_537])(
    "matches node:crypto sha256 exactly for %i bytes",
    (length) => {
      const data = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        data[i] = (i * 31 + 17) & 0xff;
      }
      const hasher = createStreamingSha256();
      // Feed irregular slice sizes to exercise partial-block buffering
      let pos = 0;
      for (const step of [7, 13, 64, 19, 1000, 4096]) {
        if (pos >= data.length) break;
        const end = Math.min(pos + step, data.length);
        hasher.update(data.subarray(pos, end));
        pos = end;
      }
      if (pos < data.length) {
        hasher.update(data.subarray(pos));
      }
      expect(hasher.digestHex()).toBe(nodeSha256(data));
    },
  );

  it("matches node:crypto via both crypto.subtle and chunked streaming paths", async () => {
    const data = new Uint8Array(40_000);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (i * 13 + 5) & 0xff;
    }
    const expected = nodeSha256(data);
    const blob = new Blob([data], { type: "audio/mpeg" });

    // Subtle path (size <= threshold)
    const subtleHash = await computeFileSha256(blob, {
      subtleThresholdBytes: 100_000,
    });
    expect(subtleHash).toBe(expected);

    // Chunked streaming path (size > threshold, 8 KiB chunks)
    const streamedHash = await computeFileSha256(blob, {
      subtleThresholdBytes: 100,
      chunkBytes: 8_192,
    });
    expect(streamedHash).toBe(expected);
  });
});
