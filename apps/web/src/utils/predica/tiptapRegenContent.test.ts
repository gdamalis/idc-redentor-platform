import { BLOCKS } from "@contentful/rich-text-types";
import type { Document } from "@contentful/rich-text-types";
import type { RichTextDoc } from "@idcr/content";
import { describe, expect, it } from "vitest";
import { convertContentfulRichText } from "@lib/content/rich-text/convert-contentful";
import type { Sermon } from "@src/types/Sermon";
import {
  computeSermonContentHash,
  richTextToContentBlocks,
} from "./regenContent";
import {
  computeTipTapSermonContentHash,
  tiptapToContentBlocks,
  type TipTapSermonHashLocaleInput,
} from "./tiptapRegenContent";

const cfText = (value: string, marks: Array<{ type: string }> = []) => ({
  nodeType: "text",
  value,
  marks,
  data: {},
});
const cfParagraph = (value: string) => ({
  nodeType: BLOCKS.PARAGRAPH,
  data: {},
  content: [cfText(value)],
});
const cfHeading = (level: 2 | 3, value: string) => ({
  nodeType: level === 2 ? BLOCKS.HEADING_2 : BLOCKS.HEADING_3,
  data: {},
  content: [cfText(value)],
});
const cfBlockquote = (value: string) => ({
  nodeType: BLOCKS.QUOTE,
  data: {},
  content: [cfParagraph(value)],
});
const cfList = (ordered: boolean, items: string[]) => ({
  nodeType: ordered ? BLOCKS.OL_LIST : BLOCKS.UL_LIST,
  data: {},
  content: items.map((text) => ({
    nodeType: BLOCKS.LIST_ITEM,
    data: {},
    content: [cfParagraph(text)],
  })),
});
const cfEmbeddedAsset = (assetId: string) => ({
  nodeType: BLOCKS.EMBEDDED_ASSET,
  data: { target: { sys: { type: "Link", linkType: "Asset", id: assetId } } },
  content: [],
});

const makeCfDoc = (content: unknown[]): Document =>
  ({ nodeType: BLOCKS.DOCUMENT, data: {}, content }) as Document;

function makeTipTapLocaleInput(
  overrides: Partial<TipTapSermonHashLocaleInput> = {},
): TipTapSermonHashLocaleInput {
  return {
    title: "El amor de Dios",
    sermonDate: "2026-06-07",
    preacherName: "Juan Pérez",
    additionalPreacherNames: [],
    scriptureReferences: [
      {
        book: "Juan",
        chapter: 3,
        fromVerse: 16,
        toVerse: null,
        verseContent: "Porque de tal manera amó Dios al mundo...",
      },
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Cuerpo del sermón." }],
        },
      ],
    },
    ...overrides,
  };
}

describe("tiptapToContentBlocks", () => {
  it("returns [] for null, undefined, or empty documents", () => {
    expect(tiptapToContentBlocks(null)).toEqual([]);
    expect(tiptapToContentBlocks(undefined)).toEqual([]);
    expect(tiptapToContentBlocks({ type: "doc", content: [] })).toEqual([]);
  });

  it("matches richTextToContentBlocks across every sermon block type once asset ids are mapped", () => {
    const cfDoc = makeCfDoc([
      cfParagraph("Cuerpo del sermón."),
      cfHeading(2, "Movimiento"),
      cfHeading(3, "Sub-punto"),
      cfBlockquote("Dios es amor."),
      cfList(false, ["uno", "dos"]),
      cfList(true, ["a", "b"]),
      cfEmbeddedAsset("cf-aud-1"),
    ]);

    const converted = convertContentfulRichText(cfDoc, {
      profile: "sermon",
      assetIdMap: { "cf-aud-1": "mongo-media-1" },
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const cfBlocks = richTextToContentBlocks(cfDoc).map((block) =>
      block.type === "embeddedAsset" && block.assetId === "cf-aud-1"
        ? { ...block, assetId: "mongo-media-1" }
        : block,
    );
    const tipTapBlocks = tiptapToContentBlocks(converted.doc);

    expect(tipTapBlocks).toEqual(cfBlocks);
    expect(tipTapBlocks).toEqual([
      { type: "p", text: "Cuerpo del sermón." },
      { type: "h2", text: "Movimiento" },
      { type: "h3", text: "Sub-punto" },
      { type: "blockquote", text: "Dios es amor." },
      { type: "ul", items: ["uno", "dos"] },
      { type: "ol", items: ["a", "b"] },
      { type: "embeddedAsset", assetId: "mongo-media-1" },
    ]);
  });

  it("strips marks when extracting block text and skips unknown top-level nodes without throwing", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "horizontalRule" },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "skip" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hola " },
            { type: "text", text: "mundo", marks: [{ type: "bold" }, { type: "italic" }] },
          ],
        },
      ],
    } as unknown as RichTextDoc;

    expect(tiptapToContentBlocks(doc)).toEqual([
      { type: "p", text: "Hola mundo" },
    ]);
  });
});

describe("computeTipTapSermonContentHash", () => {
  it("matches legacy computeSermonContentHash bit-for-bit when asset ids are identical", () => {
    const cfDocEs = makeCfDoc([
      cfHeading(2, "Inicio"),
      cfParagraph("Cuerpo del sermón."),
    ]);
    const cfDocEn = makeCfDoc([
      cfHeading(2, "Start"),
      cfParagraph("Sermon body."),
    ]);

    const ttEs = convertContentfulRichText(cfDocEs, { profile: "sermon" });
    const ttEn = convertContentfulRichText(cfDocEn, { profile: "sermon" });
    expect(ttEs.ok && ttEn.ok).toBe(true);
    if (!ttEs.ok || !ttEn.ok) return;

    const legacyEs: Sermon = {
      title: "El amor de Dios",
      slug: "el-amor-de-dios",
      sermonDate: "2026-06-07",
      preacher: { name: "Juan Pérez", email: "juan@example.com" },
      additionalPreachers: [{ name: "Ana Gómez", email: "ana@example.com" }],
      audioLanguages: ["es-AR"],
      scriptureReferences: [
        {
          book: "Juan",
          chapter: 3,
          fromVerse: 16,
          toVerse: 17,
          verseContent: "Porque de tal manera amó Dios al mundo...",
          bibleVersion: "NVI",
        },
      ],
      thesis: "Thesis",
      mainPoints: [],
      excerpt: "Excerpt",
      content: { json: cfDocEs, links: { assets: { block: [] } } },
      seoTitle: "SEO",
      seoDescription: "SEO",
      keywords: [],
      sys: { id: "s1" },
    };
    const legacyEn: Sermon = {
      ...legacyEs,
      title: "God's Love",
      scriptureReferences: [
        {
          book: "John",
          chapter: 3,
          fromVerse: 16,
          toVerse: 17,
          verseContent: "For God so loved the world...",
          bibleVersion: "NIV",
        },
      ],
      content: { json: cfDocEn, links: { assets: { block: [] } } },
    };

    const legacyHash = computeSermonContentHash(legacyEs, legacyEn);
    const tipTapHash = computeTipTapSermonContentHash(
      {
        title: "El amor de Dios",
        sermonDate: "2026-06-07",
        preacherName: "Juan Pérez",
        additionalPreacherNames: ["Ana Gómez"],
        scriptureReferences: legacyEs.scriptureReferences,
        content: ttEs.doc,
      },
      {
        title: "God's Love",
        sermonDate: "2026-06-07",
        preacherName: "Juan Pérez",
        additionalPreacherNames: ["Ana Gómez"],
        scriptureReferences: legacyEn.scriptureReferences,
        content: ttEn.doc,
      },
    );

    expect(tipTapHash).toBe(legacyHash);
  });

  it("changes whenever any rendered PDF field changes (AC7)", () => {
    const baseEs = makeTipTapLocaleInput();
    const baseEn = makeTipTapLocaleInput({ title: "God's Love" });
    const baseHash = computeTipTapSermonContentHash(baseEs, baseEn);

    // 1. es-AR title
    expect(
      computeTipTapSermonContentHash({ ...baseEs, title: "Otro título" }, baseEn),
    ).not.toBe(baseHash);

    // 2. en-US title
    expect(
      computeTipTapSermonContentHash(baseEs, { ...baseEn, title: "Another Title" }),
    ).not.toBe(baseHash);

    // 3. sermonDate
    expect(
      computeTipTapSermonContentHash(
        { ...baseEs, sermonDate: "2026-06-14" },
        { ...baseEn, sermonDate: "2026-06-14" },
      ),
    ).not.toBe(baseHash);

    // 4. body content text
    expect(
      computeTipTapSermonContentHash(
        {
          ...baseEs,
          content: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Texto editado." }] },
            ],
          },
        },
        baseEn,
      ),
    ).not.toBe(baseHash);

    // 5. embeddedMedia mediaId change (triggers new hash at Contentful -> Mongo import)
    const withEmbedA = makeTipTapLocaleInput({
      content: {
        type: "doc",
        content: [{ type: "embeddedMedia", attrs: { mediaId: "media-a" } }],
      },
    });
    const withEmbedB = makeTipTapLocaleInput({
      content: {
        type: "doc",
        content: [{ type: "embeddedMedia", attrs: { mediaId: "media-b" } }],
      },
    });
    expect(computeTipTapSermonContentHash(withEmbedA, baseEn)).not.toBe(
      computeTipTapSermonContentHash(withEmbedB, baseEn),
    );

    // 6. scripture reference change
    expect(
      computeTipTapSermonContentHash(
        {
          ...baseEs,
          scriptureReferences: [
            {
              book: "Juan",
              chapter: 3,
              fromVerse: 16,
              toVerse: 18,
              verseContent: "Porque de tal manera amó Dios al mundo...",
            },
          ],
        },
        baseEn,
      ),
    ).not.toBe(baseHash);

    // 7. preacher / additionalPreachers byline change
    expect(
      computeTipTapSermonContentHash(
        { ...baseEs, preacherName: "Pastor Carlos" },
        baseEn,
      ),
    ).not.toBe(baseHash);
    expect(
      computeTipTapSermonContentHash(
        { ...baseEs, additionalPreacherNames: ["Co-Predicador"] },
        baseEn,
      ),
    ).not.toBe(baseHash);
  });

  it("stays invariant when only formatting marks change and handles missing locales", () => {
    const plain = makeTipTapLocaleInput();
    const formatted = makeTipTapLocaleInput({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Cuerpo del sermón.",
                marks: [{ type: "bold" }],
              },
            ],
          },
        ],
      },
    });

    expect(computeTipTapSermonContentHash(formatted, undefined)).toBe(
      computeTipTapSermonContentHash(plain, undefined),
    );
    expect(() => computeTipTapSermonContentHash(undefined, undefined)).not.toThrow();
  });
});
