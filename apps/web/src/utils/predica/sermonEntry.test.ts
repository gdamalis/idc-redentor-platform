/**
 * Unit tests for the deterministic Contentful entry builders used by the
 * predica-publisher: blocksToRichTextDocument, buildBibleVerseFields, and
 * buildSermonEntryFields. These guard the locale-wrapping and rich-text shape
 * that the live Contentful CMA validates on create_entry.
 */
import { describe, it, expect } from "vitest";
import {
  blocksToRichTextDocument,
  buildBibleVerseFields,
  buildBibleVerseInternalName,
  buildSermonEntryFields,
  type ContentBlock,
  type SermonDocument,
  type SermonLocaleContent,
  type SermonScriptureRef,
} from "@src/utils/predica/sermonEntry";

// ── blocksToRichTextDocument ────────────────────────────────────────────────

describe("blocksToRichTextDocument", () => {
  it("returns a valid empty document for no blocks", () => {
    const doc = blocksToRichTextDocument([]);
    expect(doc).toEqual({ nodeType: "document", data: {}, content: [] });
  });

  it("maps h2/h3/p to heading-2/heading-3/paragraph with a text node", () => {
    const doc = blocksToRichTextDocument([
      { type: "h2", text: "Movimiento" },
      { type: "h3", text: "Sub-punto" },
      { type: "p", text: "Cuerpo." },
    ]);
    expect(doc.content.map((n) => n.nodeType)).toEqual([
      "heading-2",
      "heading-3",
      "paragraph",
    ]);
    const h2 = doc.content[0];
    expect(h2.content?.[0]).toEqual({
      nodeType: "text",
      value: "Movimiento",
      marks: [],
      data: {},
    });
  });

  it("wraps blockquote text in a paragraph child", () => {
    const [quote] = blocksToRichTextDocument([
      { type: "blockquote", text: "Dios es amor." },
    ]).content;
    expect(quote.nodeType).toBe("blockquote");
    expect(quote.content?.[0].nodeType).toBe("paragraph");
    expect(quote.content?.[0].content?.[0].value).toBe("Dios es amor.");
  });

  it("builds unordered and ordered lists with list-item > paragraph", () => {
    const [ul] = blocksToRichTextDocument([
      { type: "ul", items: ["uno", "dos"] },
    ]).content;
    expect(ul.nodeType).toBe("unordered-list");
    expect(ul.content).toHaveLength(2);
    expect(ul.content?.[0].nodeType).toBe("list-item");
    expect(ul.content?.[0].content?.[0].nodeType).toBe("paragraph");

    const [ol] = blocksToRichTextDocument([
      { type: "ol", items: ["a"] },
    ]).content;
    expect(ol.nodeType).toBe("ordered-list");
  });

  it("maps an embeddedAsset block to an embedded-asset-block node linking the asset id", () => {
    const [node] = blocksToRichTextDocument([
      { type: "embeddedAsset", assetId: "AUD1" },
    ]).content;
    expect(node.nodeType).toBe("embedded-asset-block");
    expect(node.content).toEqual([]);
    expect(node.data).toEqual({
      target: { sys: { type: "Link", linkType: "Asset", id: "AUD1" } },
    });
  });

  it("interleaves embeddedAsset blocks between text blocks in order", () => {
    const doc = blocksToRichTextDocument([
      { type: "h2", text: "Jonathan — Mini" },
      { type: "embeddedAsset", assetId: "AUD1" },
      { type: "embeddedAsset", assetId: "PDF1" },
      { type: "p", text: "Texto breve." },
    ]);
    expect(doc.content.map((n) => n.nodeType)).toEqual([
      "heading-2",
      "embedded-asset-block",
      "embedded-asset-block",
      "paragraph",
    ]);
  });

  it("gives every block a data object and every text node empty marks", () => {
    const blocks: ContentBlock[] = [
      { type: "h2", text: "T" },
      { type: "p", text: "P" },
      { type: "ul", items: ["x"] },
    ];
    const collect = (nodes: ReturnType<typeof blocksToRichTextDocument>["content"]): void => {
      for (const node of nodes) {
        expect(node.data).toEqual({});
        if (node.nodeType === "text") {
          expect(node.marks).toEqual([]);
        }
        if (node.content) {
          collect(node.content);
        }
      }
    };
    collect(blocksToRichTextDocument(blocks).content);
  });
});

// ── buildBibleVerseInternalName ─────────────────────────────────────────────

describe("buildBibleVerseInternalName", () => {
  const base: SermonScriptureRef = {
    chapter: "2",
    fromVerse: "11",
    toVerse: "22",
    "es-AR": { book: "Efesios", verseContent: "Por tanto...", bibleVersion: "NVI" },
    "en-US": { book: "Ephesians", verseContent: "Therefore...", bibleVersion: "NIV" },
  };

  it("derives '<book es> <chapter>:<from>-<to> (<version es>)' for a verse range", () => {
    expect(buildBibleVerseInternalName(base)).toBe("Efesios 2:11-22 (NVI)");
  });

  it("omits the range when the reference is a single verse", () => {
    const single: SermonScriptureRef = {
      ...base,
      chapter: "2",
      fromVerse: "13",
      toVerse: undefined,
      "es-AR": { book: "Joel", verseContent: "...", bibleVersion: "NVI" },
      "en-US": { book: "Joel", verseContent: "...", bibleVersion: "NIV" },
    };
    expect(buildBibleVerseInternalName(single)).toBe("Joel 2:13 (NVI)");
  });

  it("is version-scoped so the same passage in a different translation never collides", () => {
    const rvr: SermonScriptureRef = {
      ...base,
      "es-AR": { ...base["es-AR"], bibleVersion: "RVR1960" },
    };
    expect(buildBibleVerseInternalName(base)).toBe("Efesios 2:11-22 (NVI)");
    expect(buildBibleVerseInternalName(rvr)).toBe("Efesios 2:11-22 (RVR1960)");
    expect(buildBibleVerseInternalName(base)).not.toBe(buildBibleVerseInternalName(rvr));
  });
});

// ── buildBibleVerseFields ───────────────────────────────────────────────────

describe("buildBibleVerseFields", () => {
  const ref: SermonScriptureRef = {
    // A bogus authored value — must be ignored in favour of the derived key.
    internalName: "Efesios 2:11-22 · some-old-slug",
    chapter: "2",
    fromVerse: "11",
    toVerse: "22",
    "es-AR": { book: "Efesios", verseContent: "Por tanto...", bibleVersion: "NVI" },
    "en-US": { book: "Ephesians", verseContent: "Therefore...", bibleVersion: "NIV" },
  };

  it("localizes book/verseContent/bibleVersion across both locales", () => {
    const fields = buildBibleVerseFields(ref);
    expect(fields.book).toEqual({ "es-AR": "Efesios", "en-US": "Ephesians" });
    expect(fields.bibleVersion).toEqual({ "es-AR": "NVI", "en-US": "NIV" });
    expect(fields.verseContent["en-US"]).toBe("Therefore...");
  });

  it("sets internalName to the DERIVED dedup key, ignoring any authored value", () => {
    const fields = buildBibleVerseFields(ref);
    expect(fields.internalName).toEqual({ "es-AR": "Efesios 2:11-22 (NVI)" });
  });

  it("keys non-localized chapter/fromVerse/toVerse by the default locale only", () => {
    const fields = buildBibleVerseFields(ref);
    expect(fields.chapter).toEqual({ "es-AR": "2" });
    expect(fields.fromVerse).toEqual({ "es-AR": "11" });
    expect(fields.toVerse).toEqual({ "es-AR": "22" });
  });

  it("omits toVerse when the reference is a single verse", () => {
    const single = { ...ref, toVerse: undefined };
    expect(buildBibleVerseFields(single).toVerse).toBeUndefined();
  });
});

// ── buildSermonEntryFields ──────────────────────────────────────────────────

function localeContent(suffix: string): SermonLocaleContent {
  return {
    title: `Title ${suffix}`,
    thesis: `Thesis ${suffix}`,
    mainPoints: [`Point ${suffix}`],
    excerpt: `Excerpt ${suffix}`,
    seoTitle: `SEO ${suffix}`,
    seoDescription: `Desc ${suffix}`,
    keywords: [`kw-${suffix}`],
    content: [{ type: "p", text: `Body ${suffix}` }],
  };
}

const sermon: SermonDocument = {
  slug: "el-perdon-de-jesus",
  sermonDate: "2026-06-07",
  preacher: "Jonathan Hanegan",
  internalName: "Prédica · 2026-06-07 · Jonathan Hanegan",
  durationSeconds: 1651,
  locales: { "es-AR": localeContent("es"), "en-US": localeContent("en") },
};

describe("buildSermonEntryFields", () => {
  it("carries both locales for localized text fields", () => {
    const fields = buildSermonEntryFields(sermon, { preacherId: "PRE1" });
    expect(fields.title).toEqual({ "es-AR": "Title es", "en-US": "Title en" });
    expect(fields.keywords).toEqual({ "es-AR": ["kw-es"], "en-US": ["kw-en"] });
    expect(fields.content["es-AR"]).toMatchObject({ nodeType: "document" });
    expect(fields.content["en-US"]).toMatchObject({ nodeType: "document" });
  });

  it("keys non-localized fields by the default locale only", () => {
    const fields = buildSermonEntryFields(sermon, { preacherId: "PRE1" });
    expect(fields.slug).toEqual({ "es-AR": "el-perdon-de-jesus" });
    expect(fields.sermonDate).toEqual({ "es-AR": "2026-06-07" });
    expect(fields.durationSeconds).toEqual({ "es-AR": 1651 });
    expect(Object.keys(fields.slug)).toEqual(["es-AR"]);
  });

  it("links the preacher entry under the default locale", () => {
    const fields = buildSermonEntryFields(sermon, { preacherId: "PRE1" });
    expect(fields.preacher).toEqual({
      "es-AR": { sys: { type: "Link", linkType: "Entry", id: "PRE1" } },
    });
  });

  it("maps scripture refs to an array of entry links", () => {
    const fields = buildSermonEntryFields(sermon, {
      preacherId: "PRE1",
      scriptureRefIds: ["BV1", "BV2"],
    });
    expect(fields.scriptureReferences["es-AR"]).toEqual([
      { sys: { type: "Link", linkType: "Entry", id: "BV1" } },
      { sys: { type: "Link", linkType: "Entry", id: "BV2" } },
    ]);
  });

  it("localizes pdfSummary asset links per locale", () => {
    const fields = buildSermonEntryFields(sermon, {
      preacherId: "PRE1",
      pdfAssetIds: { "es-AR": "PDFES", "en-US": "PDFEN" },
    });
    expect(fields.pdfSummary).toEqual({
      "es-AR": { sys: { type: "Link", linkType: "Asset", id: "PDFES" } },
      "en-US": { sys: { type: "Link", linkType: "Asset", id: "PDFEN" } },
    });
  });

  it("links additionalPreachers as an array of entry links under the default locale", () => {
    const fields = buildSermonEntryFields(sermon, {
      preacherId: "PRE1",
      additionalPreacherIds: ["PRE2", "PRE3", "PRE4"],
    });
    expect(fields.additionalPreachers).toEqual({
      "es-AR": [
        { sys: { type: "Link", linkType: "Entry", id: "PRE2" } },
        { sys: { type: "Link", linkType: "Entry", id: "PRE3" } },
        { sys: { type: "Link", linkType: "Entry", id: "PRE4" } },
      ],
    });
  });

  it("omits additionalPreachers when there are no co-preachers", () => {
    expect(buildSermonEntryFields(sermon, { preacherId: "PRE1" }).additionalPreachers).toBeUndefined();
    expect(
      buildSermonEntryFields(sermon, { preacherId: "PRE1", additionalPreacherIds: [] }).additionalPreachers,
    ).toBeUndefined();
  });

  it("omits audio/featuredImage/scriptureReferences/pdfSummary when not resolved", () => {
    const fields = buildSermonEntryFields(sermon, { preacherId: "PRE1" });
    expect(fields.audio).toBeUndefined();
    expect(fields.featuredImage).toBeUndefined();
    expect(fields.scriptureReferences).toBeUndefined();
    expect(fields.pdfSummary).toBeUndefined();
  });

  it("applies the slug override (collision bump) instead of sermon.slug", () => {
    const fields = buildSermonEntryFields(sermon, { preacherId: "PRE1" }, { slug: "el-deseo-mas-profundo-de-dios-2" });
    expect(fields.slug).toEqual({ "es-AR": "el-deseo-mas-profundo-de-dios-2" });
    // Other non-localized fields are unaffected by the override.
    expect(fields.sermonDate).toEqual({ "es-AR": "2026-06-07" });
  });

  it("falls back to sermon.slug when no override is given", () => {
    expect(buildSermonEntryFields(sermon, { preacherId: "PRE1" }).slug).toEqual({
      "es-AR": "el-perdon-de-jesus",
    });
    expect(buildSermonEntryFields(sermon, { preacherId: "PRE1" }, {}).slug).toEqual({
      "es-AR": "el-perdon-de-jesus",
    });
  });

  it("includes audio + featuredImage links when resolved", () => {
    const fields = buildSermonEntryFields(sermon, {
      preacherId: "PRE1",
      audioAssetId: "AUD1",
      featuredImageAssetId: "IMG1",
    });
    expect(fields.audio).toEqual({
      "es-AR": { sys: { type: "Link", linkType: "Asset", id: "AUD1" } },
    });
    expect(fields.featuredImage).toEqual({
      "es-AR": { sys: { type: "Link", linkType: "Asset", id: "IMG1" } },
    });
  });
});
