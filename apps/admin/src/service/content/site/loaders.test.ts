import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ContentCaller } from "@src/lib/content/caller";

const { mockGetMediaByIds, mockGetVerseById, mockGetGlobalByMachineName } =
  vi.hoisted(() => ({
    mockGetMediaByIds: vi.fn(),
    mockGetVerseById: vi.fn(),
    mockGetGlobalByMachineName: vi.fn(),
  }));

vi.mock("@src/service/media", () => ({
  getMediaByIds: mockGetMediaByIds,
}));

vi.mock("@src/service/content/collections", () => ({
  bibleVerseService: { getById: mockGetVerseById },
  globalService: { getByMachineName: mockGetGlobalByMachineName },
}));

import {
  loadSharedLocation,
  preloadMediaMap,
  preloadVersesMap,
} from "./loaders";

const caller: ContentCaller = {
  kind: "user",
  userId: "u1",
  email: "editor@example.org",
  permissions: new Set(["content:read"]),
};

describe("site content server loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates media IDs and serializes createdAt to ISO string", async () => {
    const createdAt = new Date("2026-11-20T12:00:00.000Z");
    mockGetMediaByIds.mockResolvedValue({
      ok: true,
      items: [
        {
          _id: "m1",
          pathname: "media/m1/hero.jpg",
          url: "https://store.public.blob.vercel-storage.com/media/m1/hero.jpg",
          contentType: "image/jpeg",
          size: 1024,
          sha256: "a".repeat(64),
          filename: "hero.jpg",
          title: { "es-AR": "Portada" },
          alt: { "es-AR": "Iglesia" },
          createdBy: "u1",
          createdAt,
        },
      ],
    });

    const result = await preloadMediaMap(caller, ["m1", undefined, " ", "m1"]);
    expect(mockGetMediaByIds).toHaveBeenCalledWith(caller, ["m1"]);
    expect(result.m1?.createdAt).toBe("2026-11-20T12:00:00.000Z");
  });

  it("skips service call when no valid media or verse IDs are supplied", async () => {
    expect(await preloadMediaMap(caller, [undefined, ""])).toEqual({});
    expect(await preloadVersesMap(caller, [undefined, "  "])).toEqual({});
    expect(mockGetMediaByIds).not.toHaveBeenCalled();
    expect(mockGetVerseById).not.toHaveBeenCalled();
  });

  it("preloads Bible verses and ignores missing IDs gracefully", async () => {
    mockGetVerseById
      .mockResolvedValueOnce({
        ok: true,
        status: "published",
        doc: {
          _id: "v1",
          revision: 2,
          draft: {
            book: { "es-AR": "Juan", "en-US": "John" },
            chapter: 3,
            fromVerse: 16,
            version: { "es-AR": "RVR1960", "en-US": "NIV" },
          },
        },
      })
      .mockResolvedValueOnce({ ok: false, reason: "not-found" });

    const map = await preloadVersesMap(caller, ["v1", "v2", "v1"]);
    expect(mockGetVerseById).toHaveBeenCalledTimes(2);
    expect(map.v1?.fields.version?.["es-AR"]).toBe("RVR1960");
    expect(map.v2).toBeUndefined();
  });

  it("loads shared location summary or returns null if unseeded", async () => {
    mockGetGlobalByMachineName.mockResolvedValueOnce({
      ok: true,
      doc: {
        draft: {
          kind: "location",
          machineName: "location",
          addressLine1: "Perón 4385",
          neighborhood: "Almagro",
          city: "Buenos Aires",
          country: "Argentina",
          googleMapsUrl: "https://maps.google.com/?q=idcr",
        },
      },
    });
    expect(await loadSharedLocation(caller)).toEqual({
      addressLine1: "Perón 4385",
      neighborhood: "Almagro",
      city: "Buenos Aires",
      country: "Argentina",
      googleMapsUrl: "https://maps.google.com/?q=idcr",
    });

    mockGetGlobalByMachineName.mockResolvedValueOnce({
      ok: false,
      reason: "not-found",
    });
    expect(await loadSharedLocation(caller)).toBeNull();
  });
});
