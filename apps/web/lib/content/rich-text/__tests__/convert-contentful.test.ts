import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import {
  LIMITS,
  validateRichText,
  type RichTextProfile,
} from "@idcr/content";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { describe, expect, it } from "vitest";
import {
  convertContentfulRichText,
  normalizeNewlinesToSpaces,
} from "../convert-contentful";

const cfText = (value: string, marks: Array<{ type: string }> = []) => ({
  nodeType: "text",
  value,
  marks,
  data: {},
});

const cfParagraph = (...children: unknown[]) => ({
  nodeType: "paragraph",
  data: {},
  content: children,
});

const cfDoc = (...blocks: unknown[]) => ({
  nodeType: "document",
  data: {},
  content: blocks,
});

function assertRoundTripsInTipTap(doc: unknown, profile: RichTextProfile) {
  expect(validateRichText(doc, profile)).toEqual([]);
  const schema = getSchema(createRichTextExtensions(profile));
  const pmDoc = PMNode.fromJSON(schema, doc as Record<string, unknown>);
  expect(() => pmDoc.check()).not.toThrow();
  expect(pmDoc.toJSON()).toEqual(doc);
}

describe("normalizeNewlinesToSpaces", () => {
  it("replaces LF, CR, and CRLF with single spaces without regexes", () => {
    expect(normalizeNewlinesToSpaces("plain text")).toBe("plain text");
    expect(normalizeNewlinesToSpaces("line1\nline2")).toBe("line1 line2");
    expect(normalizeNewlinesToSpaces("line1\r\nline2\rline3")).toBe(
      "line1 line2 line3",
    );
    expect(normalizeNewlinesToSpaces("a\n\nb")).toBe("a  b");
  });
});

describe("convertContentfulRichText", () => {
  it("converts every allowed node and mark in the sermon profile and round-trips through TipTap unchanged", () => {
    const input = cfDoc(
      {
        nodeType: "heading-2",
        data: {},
        content: [cfText("Título principal")],
      },
      {
        nodeType: "heading-3",
        data: {},
        content: [cfText("Subtítulo")],
      },
      cfParagraph(
        cfText("Texto con "),
        cfText("negrita", [{ type: "bold" }]),
        cfText(", "),
        cfText("cursiva", [{ type: "italic" }]),
        cfText(", "),
        cfText("ambas", [{ type: "italic" }, { type: "bold" }]),
        cfText(" y "),
        {
          nodeType: "hyperlink",
          data: { uri: "mailto:contacto@example.org" },
          content: [
            cfText("escríbenos "),
            cfText("aquí", [{ type: "bold" }]),
          ],
        },
        cfText(""),
      ),
      {
        nodeType: "blockquote",
        data: {},
        content: [cfParagraph(cfText("Una cita bíblica."))],
      },
      {
        nodeType: "unordered-list",
        data: {},
        content: [
          {
            nodeType: "list-item",
            data: {},
            content: [
              cfParagraph(cfText("Item 1")),
              {
                nodeType: "ordered-list",
                data: {},
                content: [
                  {
                    nodeType: "list-item",
                    data: {},
                    content: [cfParagraph(cfText("Sub-item 1.1"))],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        nodeType: "embedded-asset-block",
        data: { target: { sys: { type: "Link", linkType: "Asset", id: "cf-audio-1" } } },
        content: [],
      },
    );

    const res = convertContentfulRichText(input, {
      profile: "sermon",
      documentId: "sermon:test:es-AR",
      assetIdMap: { "cf-audio-1": "65f1a2b3c4d5e6f708091011" },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.issues).toEqual([]);
    expect(res.doc).toEqual({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Título principal" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Subtítulo" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Texto con " },
            { type: "text", text: "negrita", marks: [{ type: "bold" }] },
            { type: "text", text: ", " },
            { type: "text", text: "cursiva", marks: [{ type: "italic" }] },
            { type: "text", text: ", " },
            {
              type: "text",
              text: "ambas",
              // Canonical ProseMirror mark order: bold before italic
              marks: [{ type: "bold" }, { type: "italic" }],
            },
            { type: "text", text: " y " },
            {
              type: "text",
              text: "escríbenos ",
              marks: [
                { type: "link", attrs: { href: "mailto:contacto@example.org" } },
              ],
            },
            {
              type: "text",
              text: "aquí",
              marks: [
                { type: "link", attrs: { href: "mailto:contacto@example.org" } },
                { type: "bold" },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Una cita bíblica." }],
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 1" }],
                },
                {
                  type: "orderedList",
                  attrs: { start: 1, type: null },
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Sub-item 1.1" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "embeddedMedia",
          attrs: { mediaId: "65f1a2b3c4d5e6f708091011" },
        },
      ],
    });

    assertRoundTripsInTipTap(res.doc, "sermon");
  });

  it("merges adjacent text nodes with identical marks and replaces newlines with spaces", () => {
    const input = cfDoc(
      cfParagraph(
        cfText("Calle 123\nBuenos Aires"),
        cfText(" Argentina"),
        cfText("Bold 1", [{ type: "bold" }]),
        cfText(" Bold 2", [{ type: "bold" }]),
      ),
    );

    const res = convertContentfulRichText(input, { profile: "article" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.doc).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Calle 123 Buenos Aires Argentina" },
            {
              type: "text",
              text: "Bold 1 Bold 2",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    });
    assertRoundTripsInTipTap(res.doc, "article");
  });

  it("handles an empty document and an empty paragraph without crashing", () => {
    const emptyDoc = convertContentfulRichText(cfDoc(), { profile: "inline" });
    expect(emptyDoc.ok).toBe(true);
    if (emptyDoc.ok) {
      expect(emptyDoc.doc).toEqual({ type: "doc", content: [] });
      expect(validateRichText(emptyDoc.doc, "inline")).toEqual([]);
    }

    const emptyParagraph = convertContentfulRichText(
      cfDoc(cfParagraph(cfText(""))),
      { profile: "inline" },
    );
    expect(emptyParagraph.ok).toBe(true);
    if (emptyParagraph.ok) {
      expect(emptyParagraph.doc).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }],
      });
      assertRoundTripsInTipTap(emptyParagraph.doc, "inline");
    }
  });

  it("reports unsupported Contentful nodes without crashing (AC2)", () => {
    const unsupportedBlocks = [
      { nodeType: "heading-1", data: {}, content: [cfText("H1")] },
      { nodeType: "heading-4", data: {}, content: [cfText("H4")] },
      { nodeType: "hr", data: {}, content: [] },
      { nodeType: "table", data: {}, content: [] },
      {
        nodeType: "embedded-entry-block",
        data: { target: { sys: { id: "entry-1" } } },
        content: [],
      },
    ];

    for (const block of unsupportedBlocks) {
      const res = convertContentfulRichText(cfDoc(block), {
        profile: "sermon",
        documentId: "doc-unsupported",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.doc).toBeNull();
        expect(res.issues[0]).toMatchObject({
          documentId: "doc-unsupported",
          code: "unsupported-node",
          nodeType: block.nodeType,
          path: ["content", 0],
        });
      }
    }

    // Inline entry-hyperlink & asset-hyperlink
    for (const inlineType of ["entry-hyperlink", "asset-hyperlink", "embedded-entry-inline"]) {
      const res = convertContentfulRichText(
        cfDoc(
          cfParagraph({
            nodeType: inlineType,
            data: { target: { sys: { id: "id-1" } } },
            content: [cfText("ref")],
          }),
        ),
        { profile: "article", documentId: "doc-inline" },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.issues[0]).toMatchObject({
          documentId: "doc-inline",
          code: "unsupported-node",
          nodeType: inlineType,
        });
      }
    }
  });

  it("reports unsupported marks, profile mismatches, disallowed hrefs, and missing asset maps without crashing", () => {
    // Unsupported mark (underline, code, strikethrough)
    for (const badMark of ["underline", "code", "strikethrough", "superscript"]) {
      const res = convertContentfulRichText(
        cfDoc(cfParagraph(cfText("hi", [{ type: badMark }]))),
        { profile: "article" },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.issues[0]?.code).toBe("unsupported-mark");
        expect(res.issues[0]?.markType).toBe(badMark);
      }
    }

    // Heading in inline profile
    const headingInInline = convertContentfulRichText(
      cfDoc({ nodeType: "heading-2", data: {}, content: [cfText("No")] }),
      { profile: "inline" },
    );
    expect(headingInInline.ok).toBe(false);
    if (!headingInInline.ok) {
      expect(headingInInline.issues[0]?.code).toBe("disallowed-node-for-profile");
    }

    // Link in inline profile (only inlineLink allows links)
    const linkInInline = convertContentfulRichText(
      cfDoc(
        cfParagraph({
          nodeType: "hyperlink",
          data: { uri: "https://example.org" },
          content: [cfText("Click")],
        }),
      ),
      { profile: "inline" },
    );
    expect(linkInInline.ok).toBe(false);
    if (!linkInInline.ok) {
      expect(linkInInline.issues[0]?.code).toBe("disallowed-mark-for-profile");
    }

    // Embedded asset in article profile
    const assetInArticle = convertContentfulRichText(
      cfDoc({
        nodeType: "embedded-asset-block",
        data: { target: { sys: { id: "a1" } } },
        content: [],
      }),
      { profile: "article", assetIdMap: { a1: "m1" } },
    );
    expect(assetInArticle.ok).toBe(false);
    if (!assetInArticle.ok) {
      expect(assetInArticle.issues[0]?.code).toBe("disallowed-node-for-profile");
    }

    // Missing asset mapping in sermon profile
    const missingMap = convertContentfulRichText(
      cfDoc({
        nodeType: "embedded-asset-block",
        data: { target: { sys: { id: "unmapped" } } },
        content: [],
      }),
      { profile: "sermon", assetIdMap: new Map() },
    );
    expect(missingMap.ok).toBe(false);
    if (!missingMap.ok) {
      expect(missingMap.issues[0]?.code).toBe("missing-asset-mapping");
    }

    // Disallowed script-capable hrefs
    for (const badHref of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.com",
    ]) {
      const res = convertContentfulRichText(
        cfDoc(
          cfParagraph({
            nodeType: "hyperlink",
            data: { uri: badHref },
            content: [cfText("bad")],
          }),
        ),
        { profile: "inlineLink" },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.issues[0]?.code).toBe("disallowed-href");
      }
    }

    // Malformed / null inputs never throw
    expect(convertContentfulRichText(null, { profile: "article" }).ok).toBe(
      false,
    );
    expect(
      convertContentfulRichText("not-a-doc", { profile: "article" }).ok,
    ).toBe(false);
  });

  it("rejects excessive nesting depth and excessive node count safely", () => {
    let nested: Record<string, unknown> = cfParagraph(cfText("deep"));
    for (let i = 0; i < LIMITS.maxNodeDepth + 2; i += 1) {
      nested = {
        nodeType: "unordered-list",
        data: {},
        content: [
          {
            nodeType: "list-item",
            data: {},
            content: [cfParagraph(cfText(`lvl-${i}`)), nested],
          },
        ],
      };
    }
    const deepRes = convertContentfulRichText(cfDoc(nested), {
      profile: "article",
    });
    expect(deepRes.ok).toBe(false);
    if (!deepRes.ok) {
      expect(deepRes.issues.some((i) => i.code === "depth-exceeded")).toBe(true);
    }

    // Two adjacent identical-mark text nodes whose merged length exceeds LIMITS.maxTextNodeLength
    // must fail conversion instead of emitting split nodes ProseMirror would later merge (C2).
    const halfPlus = Math.floor(LIMITS.maxTextNodeLength / 2) + 100;
    const overMerged = convertContentfulRichText(
      cfDoc(
        cfParagraph(
          cfText("a".repeat(halfPlus), [{ type: "bold" }]),
          cfText("b".repeat(halfPlus), [{ type: "bold" }]),
        ),
      ),
      { profile: "article" },
    );
    expect(overMerged.ok).toBe(false);
    if (!overMerged.ok) {
      expect(overMerged.issues.length).toBeGreaterThan(0);
    }
  });
});
