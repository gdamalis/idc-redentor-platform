import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import {
  RICH_TEXT_SCHEMAS,
  canonicalEqual,
  type RichTextDoc,
} from "@idcr/content";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { isLossyRichTextLoad } from "@src/components/content/rich-text/lossy-check";

const IMPORTED_BLOG_POST_BODY: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Un encuentro para toda la iglesia" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Te invitamos a sumarte con " },
        { type: "text", text: "fe", marks: [{ type: "bold" }] },
        { type: "text", text: " y " },
        { type: "text", text: "alegría", marks: [{ type: "italic" }] },
        { type: "text", text: " a nuestra " },
        {
          type: "text",
          text: "comunidad",
          marks: [{ type: "link", attrs: { href: "/community" } }],
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "«Porque donde dos o tres se reúnen en mi nombre, allí estoy yo.»",
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Cómo participar" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Anotate antes del domingo." }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Escribinos a " },
                {
                  type: "text",
                  text: "contacto@example.org",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "mailto:contacto@example.org" },
                    },
                  ],
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Llegá 15 minutos antes." }],
            },
          ],
        },
      ],
    },
  ],
};

const IMPORTED_PRIVACY_TOPIC_BODY: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "1. Datos que recopilamos" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Recopilamos únicamente los datos que nos enviás voluntariamente mediante los formularios del sitio.",
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
              content: [
                { type: "text", text: "Nombre y correo", marks: [{ type: "bold" }] },
                { type: "text", text: " para responder consultas." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Consultá más información en " },
        {
          type: "text",
          text: "nuestro sitio",
          marks: [{ type: "link", attrs: { href: "https://example.org" } }],
        },
        { type: "text", text: "." },
      ],
    },
  ],
};

describe("editorial article TipTap round-trip fidelity (AC1, EC8)", () => {
  it.each([
    ["imported blog post body", IMPORTED_BLOG_POST_BODY],
    ["imported privacy topic body", IMPORTED_PRIVACY_TOPIC_BODY],
  ])("preserves %s with zero schema or editor loss", (_label, inputDoc) => {
    const parsedBefore = RICH_TEXT_SCHEMAS.article.safeParse(inputDoc);
    expect(parsedBefore.success).toBe(true);

    const editor = new Editor({
      extensions: createRichTextExtensions("article"),
      content: inputDoc,
    });

    try {
      const emitted = editor.getJSON() as RichTextDoc;
      const parsedAfter = RICH_TEXT_SCHEMAS.article.safeParse(emitted);
      expect(parsedAfter.success).toBe(true);
      expect(isLossyRichTextLoad(inputDoc, emitted, "article")).toBe(false);

      // Second pass through a fresh editor must be strictly byte/canonically idempotent
      const secondEditor = new Editor({
        extensions: createRichTextExtensions("article"),
        content: emitted,
      });
      try {
        const secondEmitted = secondEditor.getJSON() as RichTextDoc;
        expect(canonicalEqual(emitted, secondEmitted)).toBe(true);
      } finally {
        secondEditor.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});
