import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { RICH_TEXT_SCHEMAS } from "../rich-text/schema";
import {
  RICH_TEXT_PROFILE_NAMES,
  RICH_TEXT_PROFILES,
  type RichTextDoc,
  type RichTextProfile,
} from "../rich-text/spec";
import { createRichTextExtensions, CustomLink, TIPTAP_EDITOR_DEFAULTS } from "./index";

const VALID_SAMPLES: Record<RichTextProfile, RichTextDoc> = {
  inline: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Texto " },
          { type: "text", text: "negrita", marks: [{ type: "bold" }] },
          { type: "text", text: " y " },
          { type: "text", text: "cursiva", marks: [{ type: "italic" }] },
        ],
      },
    ],
  },
  inlineLink: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Política de privacidad",
            marks: [{ type: "link", attrs: { href: "/privacidad" } }],
          },
        ],
      },
    ],
  },
  article: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Título" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Subtítulo" }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Cita" }] }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Uno" }] },
              {
                type: "orderedList",
                attrs: { start: 1, type: null },
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Uno A" }] }],
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
            text: "Correo",
            marks: [{ type: "link", attrs: { href: "mailto:hola@example.org" } }],
          },
        ],
      },
    ],
  },
  sermon: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Prédica" }] },
      { type: "paragraph", content: [{ type: "text", text: "Introducción" }] },
      { type: "embeddedMedia", attrs: { mediaId: "media-audio-1" } },
    ],
  },
};

describe("createRichTextExtensions (TipTap v3 <-> Zod spec parity)", () => {
  it.each(RICH_TEXT_PROFILE_NAMES)(
    "produces the exact node and mark set declared in RICH_TEXT_PROFILES.%s",
    (profile) => {
      const schema = getSchema(createRichTextExtensions(profile));
      const spec = RICH_TEXT_PROFILES[profile];

      expect(Object.keys(schema.nodes).sort()).toEqual([...spec.nodes].sort());
      expect(Object.keys(schema.marks).sort()).toEqual([...spec.marks].sort());

      // Disallowed StarterKit v3 nodes/marks are absent from every profile
      for (const bannedNode of ["hardBreak", "horizontalRule", "codeBlock", "image", "table", "postLink"]) {
        expect(schema.nodes[bannedNode]).toBeUndefined();
      }
      for (const bannedMark of ["underline", "strike", "code", "postLink"]) {
        expect(schema.marks[bannedMark]).toBeUndefined();
      }
    },
  );

  it.each(RICH_TEXT_PROFILE_NAMES)(
    "accepts valid sample JSON in both ProseMirror schema and Zod for %s",
    (profile) => {
      const sample = VALID_SAMPLES[profile];
      expect(RICH_TEXT_SCHEMAS[profile].safeParse(sample).success).toBe(true);

      const schema = getSchema(createRichTextExtensions(profile));
      const pmDoc = PMNode.fromJSON(schema, sample);
      expect(() => pmDoc.check()).not.toThrow();

      // Round-tripped JSON from ProseMirror still passes the Zod schema
      const roundTripped = pmDoc.toJSON();
      expect(RICH_TEXT_SCHEMAS[profile].safeParse(roundTripped).success).toBe(true);
    },
  );

  it("configures CustomLink with href-only attrs (no target/rel) and XSS-safe isAllowedUri", () => {
    const schema = getSchema(createRichTextExtensions("article"));
    const linkSpec = schema.marks.link.spec;
    expect(Object.keys(linkSpec.attrs ?? {})).toEqual(["href"]);

    const { isAllowedUri, openOnClick, defaultProtocol } = CustomLink.options;
    expect(openOnClick).toBe(false);
    expect(defaultProtocol).toBe("https");
    expect(TIPTAP_EDITOR_DEFAULTS).toEqual({
      immediatelyRender: false,
      openOnClick: false,
      defaultProtocol: "https",
    });

    const ctx = {
      defaultValidate: () => true,
      protocols: ["http", "https", "mailto"],
      defaultProtocol: "https",
    };
    expect(isAllowedUri("https://idcredentor.org", ctx)).toBe(true);
    expect(isAllowedUri("/privacidad", ctx)).toBe(true);
    expect(isAllowedUri("mailto:hola@example.org", ctx)).toBe(true);
    expect(isAllowedUri("javascript:alert(1)", ctx)).toBe(false);
    expect(isAllowedUri("data:text/html,hi", ctx)).toBe(false);
    expect(isAllowedUri("tel:+54911", ctx)).toBe(false);
  });
});
