import { describe, expect, it } from "vitest";
import { LIMITS } from "../limits";
import { isAllowedHref } from "./href";
import { RICH_TEXT_SCHEMAS } from "./schema";
import type { RichTextDoc, RichTextNode } from "./spec";

const p = (
  text: string,
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>,
) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

describe("isAllowedHref", () => {
  it.each([
    "https://idcredentor.org",
    "HTTPS://IDCREDENTOR.ORG/predicas?a=1#top",
    "http://example.com",
    "mailto:contacto@idcredentor.org",
    "MAILTO:contacto@idcredentor.org",
    "/",
    "/privacidad",
    "/es-AR/predicas/salmo-23",
  ])("accepts %s", (href) => {
    expect(isAllowedHref(href)).toBe(true);
  });

  it.each([
    "",
    "https://",
    "http://",
    "mailto:",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " data:text/html,<script>alert(1)</script>",
    "data:text/html,hi",
    "vbscript:msgbox(1)",
    "tel:+5491112345678",
    "//evil.com/phish",
    "/\\evil.com",
    "relative/path",
    "https://example.com/has space",
    "https://example.com/\u0000",
    "https://example.com/\u200b",
    `https://example.com/${"a".repeat(LIMITS.hrefMax)}`,
    null,
    123,
  ])("rejects %j", (href) => {
    expect(isAllowedHref(href)).toBe(false);
  });
});

describe("RICH_TEXT_SCHEMAS", () => {
  it("accepts every allowed construct per profile", () => {
    const inlineDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hola " },
            {
              type: "text",
              text: "mundo",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(inlineDoc).success).toBe(true);

    const inlineLinkDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Privacidad",
              marks: [{ type: "link", attrs: { href: "/privacidad" } }],
            },
          ],
        },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(inlineLinkDoc).success).toBe(
      false,
    );
    expect(RICH_TEXT_SCHEMAS.inlineLink.safeParse(inlineLinkDoc).success).toBe(
      true,
    );

    const articleDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Título" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Subtítulo" }],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Cita" }] },
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
                  content: [{ type: "text", text: "Nivel 1" }],
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
                          content: [{ type: "text", text: "Nivel 2" }],
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
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Escribinos",
              marks: [
                { type: "link", attrs: { href: "mailto:hola@example.org" } },
              ],
            },
          ],
        },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.article.safeParse(articleDoc).success).toBe(true);
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(articleDoc).success).toBe(false);
    expect(RICH_TEXT_SCHEMAS.inlineLink.safeParse(articleDoc).success).toBe(
      false,
    );

    const sermonDoc: RichTextDoc = {
      type: "doc",
      content: [
        ...articleDoc.content,
        { type: "embeddedMedia", attrs: { mediaId: "media-audio-1" } },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.sermon.safeParse(sermonDoc).success).toBe(true);
    expect(RICH_TEXT_SCHEMAS.article.safeParse(sermonDoc).success).toBe(false);
  });

  it("explicitly rejects disallowed nodes and marks across all profiles", () => {
    const disallowedNodes = [
      { type: "hardBreak" },
      { type: "horizontalRule" },
      { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
      { type: "image", attrs: { src: "https://example.com/a.jpg" } },
      { type: "table", content: [] },
      { type: "postLink", attrs: { postId: "p1" } },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "H1" }],
      },
      {
        type: "heading",
        attrs: { level: 4 },
        content: [{ type: "text", text: "H4" }],
      },
      {
        type: "heading",
        attrs: { level: 5 },
        content: [{ type: "text", text: "H5" }],
      },
      {
        type: "heading",
        attrs: { level: 6 },
        content: [{ type: "text", text: "H6" }],
      },
      { type: "unknownWidget" },
    ];
    for (const node of disallowedNodes) {
      const doc = { type: "doc", content: [node] };
      expect(RICH_TEXT_SCHEMAS.sermon.safeParse(doc).success).toBe(false);
    }

    // hardBreak inside paragraph
    expect(
      RICH_TEXT_SCHEMAS.sermon.safeParse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "a" }, { type: "hardBreak" }],
          },
        ],
      }).success,
    ).toBe(false);

    const disallowedMarks = [
      "underline",
      "strike",
      "code",
      "postLink",
      "textStyle",
      "unknownMark",
    ];
    for (const mark of disallowedMarks) {
      const doc = { type: "doc", content: [p("hola", [{ type: mark }])] };
      expect(RICH_TEXT_SCHEMAS.sermon.safeParse(doc).success).toBe(false);
    }
  });

  it("rejects XSS links and extra link attributes (target/rel)", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "tel:123",
      "//evil.com",
    ]) {
      const doc = {
        type: "doc",
        content: [p("click", [{ type: "link", attrs: { href } }])],
      };
      expect(RICH_TEXT_SCHEMAS.article.safeParse(doc).success).toBe(false);
      expect(RICH_TEXT_SCHEMAS.inlineLink.safeParse(doc).success).toBe(false);
    }

    // Stamped target/rel must be refused
    const withTarget = {
      type: "doc",
      content: [
        p("click", [
          {
            type: "link",
            attrs: { href: "https://example.com", target: "_blank" },
          },
        ]),
      ],
    };
    const withRel = {
      type: "doc",
      content: [
        p("click", [
          {
            type: "link",
            attrs: { href: "https://example.com", rel: "nofollow" },
          },
        ]),
      ],
    };
    expect(RICH_TEXT_SCHEMAS.article.safeParse(withTarget).success).toBe(false);
    expect(RICH_TEXT_SCHEMAS.article.safeParse(withRel).success).toBe(false);
  });

  it("rejects heading in inline profile and invalid parent/child nesting", () => {
    const headingDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Hi" }],
        },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(headingDoc).success).toBe(false);
    expect(RICH_TEXT_SCHEMAS.inlineLink.safeParse(headingDoc).success).toBe(
      false,
    );

    // Blockquote may only contain paragraphs (not headings or nested blockquotes)
    const badQuote = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "No" }],
            },
          ],
        },
      ],
    };
    expect(RICH_TEXT_SCHEMAS.article.safeParse(badQuote).success).toBe(false);

    // embeddedMedia with missing or empty mediaId
    expect(
      RICH_TEXT_SCHEMAS.sermon.safeParse({
        type: "doc",
        content: [{ type: "embeddedMedia", attrs: { mediaId: "" } }],
      }).success,
    ).toBe(false);
    expect(
      RICH_TEXT_SCHEMAS.sermon.safeParse({
        type: "doc",
        content: [{ type: "embeddedMedia" }],
      }).success,
    ).toBe(false);
  });

  it("enforces MAX_NODE_DEPTH while allowing two-deep and three-deep nested lists", () => {
    const makeNestedLists = (levels: number): RichTextDoc => {
      let inner: RichTextNode = {
        type: "paragraph",
        content: [{ type: "text", text: "leaf" }],
      };
      for (let i = 0; i < levels; i += 1) {
        const listItemContent: RichTextNode[] =
          i === 0
            ? [inner]
            : [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `lvl ${levels - i}` }],
                },
                inner,
              ];
        inner = {
          type: "bulletList",
          content: [{ type: "listItem", content: listItemContent }],
        };
      }
      return { type: "doc", content: [inner] };
    };

    // 2 levels: doc(1) -> ul(2) -> li(3) -> ul(4) -> li(5) -> p(6) -> text(7) <= 10
    expect(
      RICH_TEXT_SCHEMAS.article.safeParse(makeNestedLists(2)).success,
    ).toBe(true);
    // 3 levels: text at depth 9 <= 10
    expect(
      RICH_TEXT_SCHEMAS.article.safeParse(makeNestedLists(3)).success,
    ).toBe(true);
    // 4 levels: text at depth 11 > 10 -> rejected
    expect(
      RICH_TEXT_SCHEMAS.article.safeParse(makeNestedLists(4)).success,
    ).toBe(false);
  });

  it("enforces text length and node count caps", () => {
    const tooLongText = {
      type: "doc",
      content: [p("a".repeat(LIMITS.maxTextNodeLength + 1))],
    };
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(tooLongText).success).toBe(false);

    const tooManyNodes = {
      type: "doc",
      content: Array.from({ length: LIMITS.maxNodes + 1 }, () => ({
        type: "paragraph",
      })),
    };
    expect(RICH_TEXT_SCHEMAS.inline.safeParse(tooManyNodes).success).toBe(
      false,
    );
  });
});
