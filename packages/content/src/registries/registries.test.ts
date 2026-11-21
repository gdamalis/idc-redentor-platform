import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../model/collections";
import { extractReferences } from "../references";
import { CONTENT_SCHEMAS } from "../schemas";
import type { BlockRegistry, MarkRegistry } from "./blocks";
import {
  FIXED_ENTRIES,
  findFixedEntry,
  getFixedEntriesByType,
  isRegisteredFixedEntry,
} from "./fixed-entries";
import { isSitePageSlug, SITE_PAGES } from "./pages";
import { REFERENCE_PATHS, type ConcreteContentType } from "./reference-paths";

describe("SITE_PAGES and FIXED_ENTRIES registry integrity", () => {
  it("points every fixed entry appearsOn and previewPage at a registered site page", () => {
    const seen = new Set<string>();
    for (const entry of FIXED_ENTRIES) {
      const key = `${entry.type}:${entry.machineName}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);

      expect(isSitePageSlug(entry.previewPage)).toBe(true);
      expect(entry.appearsOn.length).toBeGreaterThan(0);
      for (const page of entry.appearsOn) {
        expect(isSitePageSlug(page)).toBe(true);
        expect(SITE_PAGES[page]).toBeDefined();
      }
      expect(entry.name["es-AR"].trim().length).toBeGreaterThan(0);
      expect(entry.name["en-US"].trim().length).toBeGreaterThan(0);
    }
  });

  it("includes every real site fixed entry and excludes dead seo-predicas", () => {
    expect(isRegisteredFixedEntry("section", "our-mission")).toBe(true);
    expect(isRegisteredFixedEntry("section", "connect-with-us")).toBe(true);
    expect(isRegisteredFixedEntry("section", "info-community")).toBe(true);
    expect(isRegisteredFixedEntry("section", "info-connect")).toBe(true);
    expect(
      isRegisteredFixedEntry("beliefCollection", "collection-our-mission"),
    ).toBe(true);
    expect(isRegisteredFixedEntry("beliefCollection", "our-creed")).toBe(true);
    expect(isRegisteredFixedEntry("eventBanner", "event-sunday-meetings")).toBe(
      true,
    );
    expect(isRegisteredFixedEntry("seoEntry", "seo-home")).toBe(true);
    expect(isRegisteredFixedEntry("seoEntry", "seo-predicas")).toBe(false);
    expect(isRegisteredFixedEntry("global", "main-menu")).toBe(true);
    expect(isRegisteredFixedEntry("global", "single-email-subscribe")).toBe(
      true,
    );
    expect(isRegisteredFixedEntry("global", "footer")).toBe(true);
    expect(isRegisteredFixedEntry("global", "contact-form")).toBe(true);
    expect(isRegisteredFixedEntry("global", "location")).toBe(true);
    expect(findFixedEntry("section", "unregistered")).toBeUndefined();
    expect(getFixedEntriesByType("seoEntry")).toHaveLength(5);
  });

  it("aligns every REFERENCE_PATHS field with the corresponding draft schema shape", () => {
    const concreteTypes = Object.keys(REFERENCE_PATHS) as ConcreteContentType[];
    for (const type of concreteTypes) {
      const schema = CONTENT_SCHEMAS[type].draft as {
        _zod?: { def?: { shape?: Record<string, unknown> } };
      };
      const shape = schema._zod?.def?.shape ?? {};
      for (const spec of REFERENCE_PATHS[type]) {
        expect(Object.prototype.hasOwnProperty.call(shape, spec.field)).toBe(
          true,
        );
      }
    }
  });

  it("provides exhaustive BlockRegistry and MarkRegistry types", () => {
    const blocks: BlockRegistry<string> = {
      paragraph: "P",
      heading: "H",
      blockquote: "BQ",
      bulletList: "UL",
      orderedList: "OL",
      listItem: "LI",
      embeddedMedia: "EM",
    };
    const marks: MarkRegistry<string> = { bold: "B", italic: "I", link: "A" };
    expect(Object.keys(blocks)).toHaveLength(7);
    expect(Object.keys(marks)).toHaveLength(3);
  });
});

describe("extractReferences — one test per reference kind across draft/published & both locales", () => {
  it("extracts section single `image` and array `images` across draft & published", () => {
    const refs = extractReferences("section", {
      draft: {
        machineName: "our-mission",
        image: "m-draft",
        images: ["m-arr-1", "m-arr-2"],
      },
      published: {
        machineName: "our-mission",
        image: "m-pub",
        images: ["m-arr-2", "m-arr-3"],
      },
    });
    expect(refs.mediaIds).toEqual([
      "m-arr-1",
      "m-arr-2",
      "m-arr-3",
      "m-draft",
      "m-pub",
    ]);
    expect(refs.contentRefs).toEqual([]);
  });

  it("extracts beliefCollection embedded item `imageId` and `bibleVerseId`", () => {
    const refs = extractReferences("beliefCollection", {
      draft: {
        machineName: "our-creed",
        items: [{ imageId: "m-item-draft", bibleVerseId: "v-draft" }],
      },
      published: {
        machineName: "our-creed",
        items: [{ imageId: "m-item-pub", bibleVerseId: "v-pub" }],
      },
    });
    expect(refs.mediaIds).toEqual(["m-item-draft", "m-item-pub"]);
    expect(refs.contentRefs).toEqual([
      { collection: COLLECTIONS.bibleVerses, id: "v-draft" },
      { collection: COLLECTIONS.bibleVerses, id: "v-pub" },
    ]);
  });

  it("extracts eventBanner `image`", () => {
    const refs = extractReferences("eventBanner", {
      draft: { machineName: "event-sunday-meetings", image: "m-event-draft" },
      published: { machineName: "event-sunday-meetings", image: "m-event-pub" },
    });
    expect(refs.mediaIds).toEqual(["m-event-draft", "m-event-pub"]);
  });

  it("extracts post `featuredImageId`, `authorId`, and `relatedPostIds`", () => {
    const refs = extractReferences("post", {
      draft: {
        title: { "es-AR": "P" },
        featuredImageId: "m-post-1",
        authorId: "a-1",
        relatedPostIds: ["p-2", "p-3"],
      },
      published: {
        title: { "es-AR": "P" },
        featuredImageId: "m-post-0",
        authorId: "a-0",
        relatedPostIds: ["p-1"],
      },
    });
    expect(refs.mediaIds).toEqual(["m-post-0", "m-post-1"]);
    expect(refs.contentRefs).toEqual([
      { collection: COLLECTIONS.authors, id: "a-0" },
      { collection: COLLECTIONS.authors, id: "a-1" },
      { collection: COLLECTIONS.posts, id: "p-1" },
      { collection: COLLECTIONS.posts, id: "p-2" },
      { collection: COLLECTIONS.posts, id: "p-3" },
    ]);
  });

  it("extracts every sermon plain media/content id, localized `pdfSummaryMediaId`, and `embeddedMedia` in both locales and snapshots", () => {
    const embedDoc = (id: string) => ({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Seg" }] },
        { type: "embeddedMedia", attrs: { mediaId: id } },
      ],
    });

    const refs = extractReferences("sermon", {
      draft: {
        title: { "es-AR": "S" },
        featuredImageId: "m-feat-draft",
        audioMediaId: "m-audio-draft",
        pdfSummaryMediaId: {
          "es-AR": "m-pdf-es-draft",
          "en-US": "m-pdf-en-draft",
        },
        preacherId: "a-preacher",
        additionalPreacherIds: ["a-co-1"],
        interpreterId: "a-interp",
        scriptureRefIds: ["v-1", "v-2"],
        relatedSermonIds: ["s-rel-1"],
        content: {
          "es-AR": embedDoc("m-embed-es-draft"),
          "en-US": embedDoc("m-embed-en-draft"),
        },
      },
      published: {
        title: { "es-AR": "S" },
        featuredImageId: "m-feat-pub",
        audioMediaId: "m-audio-pub",
        pdfSummaryMediaId: { "es-AR": "m-pdf-es-pub", "en-US": "m-pdf-en-pub" },
        preacherId: "a-preacher",
        scriptureRefIds: ["v-pub"],
        relatedSermonIds: ["s-rel-pub"],
        content: {
          "es-AR": embedDoc("m-embed-es-pub"),
          "en-US": embedDoc("m-embed-en-pub"),
        },
      },
    });

    expect(refs.mediaIds).toEqual([
      "m-audio-draft",
      "m-audio-pub",
      "m-embed-en-draft",
      "m-embed-en-pub",
      "m-embed-es-draft",
      "m-embed-es-pub",
      "m-feat-draft",
      "m-feat-pub",
      "m-pdf-en-draft",
      "m-pdf-en-pub",
      "m-pdf-es-draft",
      "m-pdf-es-pub",
    ]);

    expect(refs.contentRefs).toEqual([
      { collection: COLLECTIONS.authors, id: "a-co-1" },
      { collection: COLLECTIONS.authors, id: "a-interp" },
      { collection: COLLECTIONS.authors, id: "a-preacher" },
      { collection: COLLECTIONS.bibleVerses, id: "v-1" },
      { collection: COLLECTIONS.bibleVerses, id: "v-2" },
      { collection: COLLECTIONS.bibleVerses, id: "v-pub" },
      { collection: COLLECTIONS.sermons, id: "s-rel-1" },
      { collection: COLLECTIONS.sermons, id: "s-rel-pub" },
    ]);
  });

  it("extracts author `avatarMediaId`, topic `featuredImageId`, and seoEntry `imageId`", () => {
    expect(
      extractReferences("author", {
        draft: { name: "A", avatarMediaId: "m-av" },
      }).mediaIds,
    ).toEqual(["m-av"]);
    expect(
      extractReferences("topic", {
        draft: { name: { "es-AR": "T" }, featuredImageId: "m-top" },
      }).mediaIds,
    ).toEqual(["m-top"]);
    expect(
      extractReferences("seoEntry", {
        draft: { machineName: "seo-home", imageId: "m-seo" },
      }).mediaIds,
    ).toEqual(["m-seo"]);
  });

  it("extracts globals (`footer.logo`, `contactForm.image`, `contactForm.bibleVerseId`) via both union and concrete types", () => {
    const footerDoc = {
      draft: { kind: "footer", machineName: "footer", logo: "m-logo-draft" },
      published: { kind: "footer", machineName: "footer", logo: "m-logo-pub" },
    };
    expect(extractReferences("global", footerDoc).mediaIds).toEqual([
      "m-logo-draft",
      "m-logo-pub",
    ]);
    expect(extractReferences("footer", footerDoc).mediaIds).toEqual([
      "m-logo-draft",
      "m-logo-pub",
    ]);

    const contactDoc = {
      draft: {
        kind: "contactForm",
        machineName: "contact-form",
        image: "m-contact-draft",
        bibleVerseId: "v-contact-draft",
      },
      published: {
        kind: "contactForm",
        machineName: "contact-form",
        image: "m-contact-pub",
        bibleVerseId: "v-contact-pub",
      },
    };
    const refs = extractReferences("global", contactDoc);
    expect(refs.mediaIds).toEqual(["m-contact-draft", "m-contact-pub"]);
    expect(refs.contentRefs).toEqual([
      { collection: COLLECTIONS.bibleVerses, id: "v-contact-draft" },
      { collection: COLLECTIONS.bibleVerses, id: "v-contact-pub" },
    ]);
  });
});
