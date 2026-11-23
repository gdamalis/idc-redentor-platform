import { describe, expect, it, vi } from "vitest";
import { matchesMediaMagicBytes, verifyBlobMagicBytes } from "./magic-bytes";

describe("matchesMediaMagicBytes", () => {
  it("accepts valid signatures for all 6 allowed media types (including both ID3 and raw frame-sync MP3)", () => {
    // PNG
    expect(
      matchesMediaMagicBytes(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      ),
    ).toBe(true);

    // JPEG
    expect(
      matchesMediaMagicBytes(
        "image/jpeg",
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      ),
    ).toBe(true);

    // WebP (RIFF....WEBP)
    expect(
      matchesMediaMagicBytes(
        "image/webp",
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
      ),
    ).toBe(true);

    // PDF (%PDF-)
    expect(
      matchesMediaMagicBytes(
        "application/pdf",
        new TextEncoder().encode("%PDF-1.7\n"),
      ),
    ).toBe(true);

    // MP3 with ID3v2 header
    expect(
      matchesMediaMagicBytes(
        "audio/mpeg",
        new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]),
      ),
    ).toBe(true);

    // MP3 with raw MPEG-1 Layer III frame sync (FF FB)
    expect(
      matchesMediaMagicBytes(
        "audio/mpeg",
        new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00]),
      ),
    ).toBe(true);

    // MP3 with MPEG-2 Layer III frame sync (FF F3)
    expect(
      matchesMediaMagicBytes(
        "audio/mpeg",
        new Uint8Array([0xff, 0xf3, 0x80, 0x00]),
      ),
    ).toBe(true);

    // M4A / MP4 (....ftyp)
    expect(
      matchesMediaMagicBytes(
        "audio/mp4",
        new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]),
      ),
    ).toBe(true);
  });

  it("rejects spoofed HTML/text payloads claiming allowed MIME types", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    expect(matchesMediaMagicBytes("image/png", html)).toBe(false);
    expect(matchesMediaMagicBytes("image/jpeg", html)).toBe(false);
    expect(matchesMediaMagicBytes("image/webp", html)).toBe(false);
    expect(matchesMediaMagicBytes("application/pdf", html)).toBe(false);
    expect(matchesMediaMagicBytes("audio/mpeg", html)).toBe(false);
    expect(matchesMediaMagicBytes("audio/mp4", html)).toBe(false);

    // Invalid MPEG sync bits (layer 00 -> FF F0)
    expect(matchesMediaMagicBytes("audio/mpeg", new Uint8Array([0xff, 0xf0]))).toBe(
      false,
    );
  });
});

describe("verifyBlobMagicBytes", () => {
  it("fetches bytes=0-15 with redirect:'error' and AbortSignal timeout (R3)", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new TextEncoder().encode("%PDF-1.7\n1 0 obj"), {
        status: 206,
      }),
    );

    const res = await verifyBlobMagicBytes(
      "https://store.public.blob.vercel-storage.com/media/abc/doc.pdf",
      "application/pdf",
      { fetchFn },
    );

    expect(res).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = fetchFn.mock.calls[0]!;
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ Range: "bytes=0-15" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns mismatch when remote bytes disagree with declared type", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new TextEncoder().encode("<!doctype html>"), { status: 206 }),
    );

    const res = await verifyBlobMagicBytes(
      "https://store.public.blob.vercel-storage.com/media/abc/fake.png",
      "image/png",
      { fetchFn },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("mismatch");
  });

  it("fails closed when fetch throws (e.g. redirect error or timeout)", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("redirect mode is set to error"));

    const res = await verifyBlobMagicBytes(
      "https://store.public.blob.vercel-storage.com/media/abc/a.mp3",
      "audio/mpeg",
      { fetchFn },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("fetch-failed");
  });
});
