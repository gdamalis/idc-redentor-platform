import {
  bibleVerseKey,
  COLLECTIONS,
  CONTENT_SCHEMAS,
  deriveStatus,
  extractReferences,
  FIXED_ENTRIES,
  RICH_TEXT_SCHEMAS,
} from "@idcr/content";
import { describe, expect, it } from "vitest";

// Contract: the public site resolves the shared content package (raw TS via transpilePackages).
// No runtime import in app code until ICR-201 swaps the read layer.
describe("@idcr/content (apps/web)", () => {
  it("resolves schemas, helpers, registries, and rich-text validation", () => {
    expect(COLLECTIONS.sermons).toBe("sermons");
    expect(CONTENT_SCHEMAS.post.update.parse({})).toEqual({});
    expect(deriveStatus({ draft: { a: 1 }, published: { a: 1 } })).toBe(
      "published",
    );
    expect(
      bibleVerseKey({
        book: "Joel",
        chapter: 2,
        fromVerse: 13,
        version: "NVI",
      }),
    ).toBe("joel|2|13|13|nvi");
    expect(FIXED_ENTRIES.length).toBeGreaterThan(0);
    expect(
      RICH_TEXT_SCHEMAS.inline.safeParse({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hola" }] },
        ],
      }).success,
    ).toBe(true);
    expect(
      extractReferences("post", {
        draft: { title: { "es-AR": "X" }, featuredImageId: "m1" },
      }).mediaIds,
    ).toEqual(["m1"]);
  });
});
