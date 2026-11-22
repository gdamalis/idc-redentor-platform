// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AuthorFields, BibleVerseFields, SermonFields } from "@idcr/content";
import {
  PDF_WORKER_CALLER,
  collectSermonPdfMediaIds,
  computeSermonHashForSnapshot,
  computeSermonHashFromResolved,
  hasEnglishPdfContent,
  normalizeSermonAudioLanguages,
} from "./sermon-hash.service";

const AUTHOR_1: AuthorFields = { name: "Juan Pérez" };
const AUTHOR_2: AuthorFields = { name: "María Gómez" };
const VERSE_1: BibleVerseFields = {
  book: { "es-AR": "Efesios", "en-US": "Ephesians" },
  chapter: 2,
  fromVerse: 8,
  toVerse: 9,
  text: {
    "es-AR": "Porque por gracia han sido salvados.",
    "en-US": "For it is by grace you have been saved.",
  },
  version: { "es-AR": "NVI", "en-US": "NIV" },
};

const BASE_SERMON: SermonFields = {
  slug: "la-gracia",
  title: { "es-AR": "La gracia", "en-US": "Grace" },
  thesis: { "es-AR": "Tesis original" },
  excerpt: { "es-AR": "Extracto" },
  sermonDate: "2026-11-15",
  preacherId: "a1",
  additionalPreacherIds: ["a2"],
  scriptureRefIds: ["v1"],
  content: {
    "es-AR": {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }],
    },
    "en-US": {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    },
  },
};

describe("sermon-hash.service", () => {
  it("keeps PDF_WORKER_CALLER least-privilege (no publish permissions)", () => {
    expect(PDF_WORKER_CALLER.kind).toBe("service");
    expect(PDF_WORKER_CALLER.permissions.has("content:read")).toBe(true);
    expect(PDF_WORKER_CALLER.permissions.has("content:write")).toBe(true);
    expect(PDF_WORKER_CALLER.permissions.has("media:manage")).toBe(true);
    expect(PDF_WORKER_CALLER.permissions.has("content:publish")).toBe(false);
    expect(PDF_WORKER_CALLER.permissions.has("content:publish-protected")).toBe(
      false,
    );
  });

  it("normalizes audioLanguages defaulting empty/unknown to ['es-AR']", () => {
    expect(normalizeSermonAudioLanguages(undefined)).toEqual(["es-AR"]);
    expect(normalizeSermonAudioLanguages([])).toEqual(["es-AR"]);
    expect(normalizeSermonAudioLanguages(["fr-FR"])).toEqual(["es-AR"]);
    expect(normalizeSermonAudioLanguages(["en-US", "en-US"])).toEqual(["en-US"]);
    expect(normalizeSermonAudioLanguages(["es-AR", "en-US"])).toEqual([
      "es-AR",
      "en-US",
    ]);
  });

  it("collects unique non-empty PDF media IDs across both locales", () => {
    expect(collectSermonPdfMediaIds(undefined)).toEqual([]);
    expect(collectSermonPdfMediaIds({ "es-AR": "m1", "en-US": "m2" })).toEqual([
      "m1",
      "m2",
    ]);
    expect(collectSermonPdfMediaIds({ "es-AR": "m1", "en-US": "m1" })).toEqual([
      "m1",
    ]);
  });

  it("detects whether English PDF content exists", () => {
    expect(hasEnglishPdfContent(BASE_SERMON)).toBe(true);
    expect(
      hasEnglishPdfContent({
        title: { "es-AR": "Solo español" },
        content: {
          "es-AR": {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "X" }] }],
          },
        },
      }),
    ).toBe(false);
  });

  it("produces identical hashes when only non-PDF fields change, and distinct hashes on PDF edits", async () => {
    const resolved = {
      authorsById: new Map([
        ["a1", AUTHOR_1],
        ["a2", AUTHOR_2],
      ]),
      versesById: new Map([["v1", VERSE_1]]),
    };

    const h1 = computeSermonHashFromResolved(BASE_SERMON, resolved);
    const hNonPdf = computeSermonHashFromResolved(
      {
        ...BASE_SERMON,
        seoTitle: { "es-AR": "Nuevo SEO" },
        seoDescription: { "es-AR": "Nueva desc" },
        thesis: { "es-AR": "Otra tesis" },
        excerpt: { "es-AR": "Otro extracto" },
        featuredImageId: "img1",
        audioMediaId: "aud1",
        audioLanguages: ["es-AR", "en-US"],
        durationSeconds: 1800,
        relatedSermonIds: ["s99"],
        slug: "otro-slug",
      },
      resolved,
    );
    expect(hNonPdf).toBe(h1);

    const hBodyChanged = computeSermonHashFromResolved(
      {
        ...BASE_SERMON,
        content: {
          ...BASE_SERMON.content!,
          "es-AR": {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Editado" }] },
            ],
          },
        },
      },
      resolved,
    );
    expect(hBodyChanged).not.toBe(h1);

    const getAuthorById = vi.fn(async (_c, id: string) => ({
      ok: true as const,
      doc: {
        _id: id,
        draft: id === "a1" ? AUTHOR_1 : AUTHOR_2,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
      status: "published" as const,
    }));
    const getVerseById = vi.fn(async (_c, id: string) => ({
      ok: true as const,
      doc: {
        _id: id,
        draft: VERSE_1,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "u1",
      },
      status: "published" as const,
    }));

    const fetched = await computeSermonHashForSnapshot(
      PDF_WORKER_CALLER,
      BASE_SERMON,
      {
        getAuthorById: getAuthorById as never,
        getVerseById: getVerseById as never,
      },
    );
    expect(fetched.contentHash).toBe(h1);
    expect(getAuthorById).toHaveBeenCalledTimes(2);
    expect(getVerseById).toHaveBeenCalledTimes(1);
  });
});
