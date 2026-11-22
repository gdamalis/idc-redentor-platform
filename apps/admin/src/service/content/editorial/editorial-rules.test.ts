import { describe, expect, it } from "vitest";
import {
  POST_CATEGORIES,
  SITE_PAGE_SLUGS,
  type RichTextDoc,
} from "@idcr/content";
import {
  POST_CATEGORY_MESSAGE_KEYS,
  RESERVED_TOPIC_SLUGS,
  buildPersonInitials,
  extractPlainTextFromRichText,
  isAllowedPostCategory,
  isReservedTopicSlug,
  normalizeKeywords,
  normalizeOptionalString,
  resolvePublicLiveUrl,
  toPlainRichTextDoc,
} from "./editorial-rules";

describe("editorial-rules", () => {
  it("accepts strictly the 3 site-translatable POST_CATEGORIES", () => {
    for (const cat of POST_CATEGORIES) {
      expect(isAllowedPostCategory(cat)).toBe(true);
      expect(POST_CATEGORY_MESSAGE_KEYS[cat]).toBeTruthy();
    }
    expect(isAllowedPostCategory("")).toBe(false);
    expect(isAllowedPostCategory("events")).toBe(false);
    expect(isAllowedPostCategory("Comunity")).toBe(false);
    expect(isAllowedPostCategory("Other")).toBe(false);
    expect(isAllowedPostCategory(undefined)).toBe(false);
  });

  it("treats all SITE_PAGE_SLUGS plus api as reserved topic slugs", () => {
    for (const slug of SITE_PAGE_SLUGS) {
      expect(isReservedTopicSlug(slug)).toBe(true);
    }
    expect(isReservedTopicSlug("api")).toBe(true);
    expect(isReservedTopicSlug("BLOG")).toBe(true);
    expect(RESERVED_TOPIC_SLUGS).toContain("blog");
    expect(RESERVED_TOPIC_SLUGS).toContain("predicas");
    expect(RESERVED_TOPIC_SLUGS).toContain("community");

    expect(isReservedTopicSlug("privacidad")).toBe(false);
    expect(isReservedTopicSlug("privacy")).toBe(false);
    expect(isReservedTopicSlug("terminos-de-uso")).toBe(false);
  });

  it("normalizes optional strings and keyword lists", () => {
    expect(normalizeOptionalString(undefined)).toBeUndefined();
    expect(normalizeOptionalString("   ")).toBeUndefined();
    expect(normalizeOptionalString("  hola@example.org  ")).toBe(
      "hola@example.org",
    );

    expect(normalizeKeywords(undefined)).toBeUndefined();
    expect(normalizeKeywords(["", "  "])).toBeUndefined();
    expect(normalizeKeywords([" fe ", "", "comunidad"])).toEqual([
      "fe",
      "comunidad",
    ]);
  });

  it("extracts plain text blocks from a TipTap document", () => {
    const text = extractPlainTextFromRichText({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Título" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hola " },
            { type: "text", text: "iglesia", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });
    expect(text).toBe("Título\n\nHola iglesia");
    expect(extractPlainTextFromRichText(undefined)).toBe("");
  });

  it("builds person initials cleanly", () => {
    expect(buildPersonInitials("Juan Pérez")).toBe("JP");
    expect(buildPersonInitials("María del Valle Gómez")).toBe("MG");
    expect(buildPersonInitials("Ana")).toBe("AN");
    expect(buildPersonInitials("   ")).toBe("?");
  });

  it("resolves public live URLs for published posts and localized topics", () => {
    expect(
      resolvePublicLiveUrl({
        collection: "posts",
        published: { title: { "es-AR": "Hola" }, slug: "hola-mundo" },
        locale: "es-AR",
        baseUrl: "https://staging.idcredentor.org/",
      }),
    ).toBe("https://staging.idcredentor.org/es-AR/blog/hola-mundo");

    expect(
      resolvePublicLiveUrl({
        collection: "topics",
        published: {
          name: { "es-AR": "Privacidad", "en-US": "Privacy" },
          slug: { "es-AR": "privacidad", "en-US": "privacy" },
        },
        locale: "en-US",
        baseUrl: "https://staging.idcredentor.org",
      }),
    ).toBe("https://staging.idcredentor.org/en-US/privacy");

    expect(
      resolvePublicLiveUrl({
        collection: "topics",
        published: {
          name: { "es-AR": "Privacidad" },
          slug: { "es-AR": "privacidad" },
        },
        locale: "en-US",
        baseUrl: "https://staging.idcredentor.org",
      }),
    ).toBe("https://staging.idcredentor.org/es-AR/privacidad");

    expect(
      resolvePublicLiveUrl({
        collection: "posts",
        published: undefined,
        locale: "es-AR",
        baseUrl: "https://staging.idcredentor.org",
      }),
    ).toBeUndefined();
  });

  it("converts ProseMirror null-prototype attrs into plain objects for Server Actions", () => {
    const headingAttrs = Object.assign(Object.create(null), { level: 2 });
    const linkAttrs = Object.assign(Object.create(null), {
      href: "https://example.org",
    });
    const rawDoc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: headingAttrs,
          content: [{ type: "text", text: "Título" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Sitio",
              marks: [{ type: "link", attrs: linkAttrs }],
            },
          ],
        },
      ],
    };

    const plain = toPlainRichTextDoc(rawDoc);
    const h = plain.content?.[0] as { attrs?: Record<string, unknown> };
    const p = plain.content?.[1] as {
      content?: Array<{ marks?: Array<{ attrs?: Record<string, unknown> }> }>;
    };
    expect(Object.getPrototypeOf(h.attrs)).toBe(Object.prototype);
    expect(h.attrs).toEqual({ level: 2 });
    expect(Object.getPrototypeOf(p.content?.[0]?.marks?.[0]?.attrs)).toBe(
      Object.prototype,
    );
    expect(p.content?.[0]?.marks?.[0]?.attrs).toEqual({
      href: "https://example.org",
    });
  });
});
