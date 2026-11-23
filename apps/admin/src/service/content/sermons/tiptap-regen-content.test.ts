// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RichTextDoc } from "@idcr/content";
import {
  computeTipTapSermonContentHash,
  tiptapToContentBlocks,
  type TipTapSermonHashLocaleInput,
} from "./tiptap-regen-content";

const SAMPLE_DOC_ES: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Movimiento 1" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "La " },
        { type: "text", text: "gracia", marks: [{ type: "bold" }] },
        { type: "text", text: " nos alcanza." },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Aplicación" }],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Porque por gracia sois salvos." }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Uno" }] },
          ],
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Dos" }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Primero" }] },
          ],
        },
      ],
    },
    {
      type: "embeddedMedia",
      attrs: { mediaId: "65f000000000000000000001" },
    },
  ],
};

describe("tiptapToContentBlocks", () => {
  it("maps every supported TipTap block node to canonical PDF blocks", () => {
    expect(tiptapToContentBlocks(SAMPLE_DOC_ES)).toEqual([
      { type: "h2", text: "Movimiento 1" },
      { type: "p", text: "La gracia nos alcanza." },
      { type: "h3", text: "Aplicación" },
      { type: "blockquote", text: "Porque por gracia sois salvos." },
      { type: "ul", items: ["Uno", "Dos"] },
      { type: "ol", items: ["Primero"] },
      { type: "embeddedAsset", assetId: "65f000000000000000000001" },
    ]);
  });

  it("returns empty array for absent/empty docs and skips unsupported nodes", () => {
    expect(tiptapToContentBlocks(undefined)).toEqual([]);
    expect(tiptapToContentBlocks(null)).toEqual([]);
    expect(tiptapToContentBlocks({ type: "doc", content: [] })).toEqual([]);
    expect(
      tiptapToContentBlocks({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1" }] } as never,
          { type: "horizontalRule" } as never,
        ],
      }),
    ).toEqual([]);
  });
});

describe("computeTipTapSermonContentHash (ICR-202 parity)", () => {
  const baseEs: TipTapSermonHashLocaleInput = {
    title: "La gracia que alcanza",
    sermonDate: "2026-11-15",
    content: SAMPLE_DOC_ES,
    preacherName: "Juan Pérez",
    additionalPreacherNames: ["María Gómez"],
    scriptureReferences: [
      {
        book: "Efesios",
        chapter: 2,
        fromVerse: 8,
        toVerse: 9,
        verseContent: "Porque por gracia ustedes han sido salvados.",
      },
    ],
  };

  const baseEn: TipTapSermonHashLocaleInput = {
    title: "Grace That Reaches",
    sermonDate: "2026-11-15",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Grace reaches us." }],
        },
      ],
    },
    preacherName: "Juan Pérez",
    additionalPreacherNames: ["María Gómez"],
    scriptureReferences: [
      {
        book: "Ephesians",
        chapter: 2,
        fromVerse: 8,
        toVerse: 9,
        verseContent: "For it is by grace you have been saved.",
      },
    ],
  };

  it("matches the exact ICR-202 canonical JSON SHA-256 vector", () => {
    const expectedCanonical =
      '{"byline":["Juan Pérez","María Gómez"],' +
      '"content":{"en-US":[{"text":"Grace reaches us.","type":"p"}],' +
      '"es-AR":[{"text":"Movimiento 1","type":"h2"},' +
      '{"text":"La gracia nos alcanza.","type":"p"},' +
      '{"text":"Aplicación","type":"h3"},' +
      '{"text":"Porque por gracia sois salvos.","type":"blockquote"},' +
      '{"items":["Uno","Dos"],"type":"ul"},' +
      '{"items":["Primero"],"type":"ol"},' +
      '{"assetId":"65f000000000000000000001","type":"embeddedAsset"}]},' +
      '"scripture":[{"book":{"en-US":"Ephesians","es-AR":"Efesios"},' +
      '"chapter":2,"fromVerse":8,"toVerse":9,' +
      '"verseContent":{"en-US":"For it is by grace you have been saved.",' +
      '"es-AR":"Porque por gracia ustedes han sido salvados."}}],' +
      '"sermonDate":"2026-11-15",' +
      '"title":{"en-US":"Grace That Reaches","es-AR":"La gracia que alcanza"}}';

    const expectedHex = createHash("sha256")
      .update(expectedCanonical)
      .digest("hex");

    expect(computeTipTapSermonContentHash(baseEs, baseEn)).toBe(expectedHex);
  });

  it("ignores formatting-only marks (bold/italic) in content", () => {
    const italicVariant: TipTapSermonHashLocaleInput = {
      ...baseEs,
      content: {
        ...SAMPLE_DOC_ES,
        content: SAMPLE_DOC_ES.content.map((n, idx) =>
          idx === 1
            ? {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "La gracia nos alcanza.",
                    marks: [{ type: "italic" }],
                  },
                ],
              }
            : n,
        ),
      },
    };
    expect(computeTipTapSermonContentHash(italicVariant, baseEn)).toBe(
      computeTipTapSermonContentHash(baseEs, baseEn),
    );
  });

  it("mutates hash whenever any rendered PDF field changes", () => {
    const baseline = computeTipTapSermonContentHash(baseEs, baseEn);

    expect(
      computeTipTapSermonContentHash({ ...baseEs, title: "Otro título" }, baseEn),
    ).not.toBe(baseline);
    expect(
      computeTipTapSermonContentHash(baseEs, { ...baseEn, title: "Other title" }),
    ).not.toBe(baseline);
    expect(
      computeTipTapSermonContentHash(
        { ...baseEs, sermonDate: "2026-11-22" },
        baseEn,
      ),
    ).not.toBe(baseline);
    expect(
      computeTipTapSermonContentHash(
        { ...baseEs, preacherName: "Otro Predicador" },
        baseEn,
      ),
    ).not.toBe(baseline);
    expect(
      computeTipTapSermonContentHash(
        {
          ...baseEs,
          scriptureReferences: [
            {
              book: "Efesios",
              chapter: 2,
              fromVerse: 8,
              toVerse: 10,
              verseContent: "Texto cambiado",
            },
          ],
        },
        baseEn,
      ),
    ).not.toBe(baseline);
  });
});
