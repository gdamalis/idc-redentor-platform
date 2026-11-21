import {
  bibleVerseKey,
  COLLECTIONS,
  CONTENT_SCHEMAS,
  deriveStatus,
  extractReferences,
  FIXED_ENTRIES,
} from "@idcr/content";
import {
  createRichTextExtensions,
  TIPTAP_EDITOR_DEFAULTS,
} from "@idcr/content/tiptap";
import { describe, expect, it } from "vitest";

// Contract: the admin app resolves both the main `@idcr/content` entry and the `./tiptap` subpath.
// No runtime import in app code until ICR-195 / ICR-197 add the content services and editors.
describe("@idcr/content (apps/admin)", () => {
  it("resolves schemas, helpers, registries, and TipTap extensions", () => {
    expect(COLLECTIONS.sermons).toBe("sermons");
    expect(CONTENT_SCHEMAS.sermon.update.parse({})).toEqual({});
    expect(deriveStatus({ draft: { a: 1 } })).toBe("draft");
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
      extractReferences("author", { draft: { name: "A", avatarMediaId: "m1" } })
        .mediaIds,
    ).toEqual(["m1"]);
    expect(createRichTextExtensions("sermon").length).toBeGreaterThan(0);
    expect(TIPTAP_EDITOR_DEFAULTS.immediatelyRender).toBe(false);
  });
});
