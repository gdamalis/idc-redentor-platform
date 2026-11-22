import { describe, expect, it } from "vitest";
import {
  MEDIA_REFERENCING_COLLECTIONS,
  REFERENCING_COLLECTIONS_BY_TARGET,
  computeNaturalKey,
  diffChangedFields,
  diffSnapshotFields,
  findImmutableFieldViolation,
  isEntryProtected,
  isProtectedFlagToggled,
  isVisibleFixedEntry,
  resolveConcreteType,
  stripUndefinedDeep,
} from "./guards";

describe("content guards", () => {
  it("derives referencing collections directly from @idcr/content REFERENCE_PATHS", () => {
    expect(REFERENCING_COLLECTIONS_BY_TARGET.authors).toEqual([
      "posts",
      "sermons",
    ]);
    expect(REFERENCING_COLLECTIONS_BY_TARGET.bible_verses).toEqual([
      "belief_collections",
      "globals",
      "sermons",
    ]);
    expect(REFERENCING_COLLECTIONS_BY_TARGET.posts).toEqual(["posts"]);
    expect(REFERENCING_COLLECTIONS_BY_TARGET.sermons).toEqual(["sermons"]);
    expect(MEDIA_REFERENCING_COLLECTIONS).toContain("posts");
    expect(MEDIA_REFERENCING_COLLECTIONS).toContain("sermons");
    expect(MEDIA_REFERENCING_COLLECTIONS).toContain("authors");
    expect(MEDIA_REFERENCING_COLLECTIONS).toContain("sections");
  });

  it("enforces downgrade-proof protection on belief_collections and topics", () => {
    expect(isEntryProtected("belief_collections", {})).toBe(true);
    expect(isEntryProtected("posts", { protected: true })).toBe(false);
    expect(isEntryProtected("topics", { protected: false })).toBe(false);
    expect(isEntryProtected("topics", { protected: true })).toBe(true);
    expect(
      isEntryProtected("topics", { protected: false }, { protected: true }),
    ).toBe(true);
    expect(
      isEntryProtected("topics", {}, undefined, { protected: true }),
    ).toBe(true);

    expect(
      isProtectedFlagToggled("topics", { protected: true }, { protected: false }),
    ).toBe(true);
    expect(
      isProtectedFlagToggled("topics", { protected: true }, { protected: undefined }),
    ).toBe(true);
    expect(
      isProtectedFlagToggled("topics", {}, { protected: true }),
    ).toBe(true);
    expect(
      isProtectedFlagToggled("topics", { protected: true }, { protected: true }),
    ).toBe(false);
    expect(
      isProtectedFlagToggled("topics", { protected: true }, { name: { "es-AR": "X" } }),
    ).toBe(false);
  });

  it("enforces fixed-entry visibility and immutability including contactForm.fields structure", () => {
    expect(isVisibleFixedEntry("sections", { machineName: "our-mission" })).toBe(true);
    expect(isVisibleFixedEntry("sections", { machineName: "unknown-sec" })).toBe(false);
    expect(isVisibleFixedEntry("seo_entries", { machineName: "seo-predicas" })).toBe(false);
    expect(isVisibleFixedEntry("posts", { title: { "es-AR": "A" } })).toBe(true);

    expect(
      findImmutableFieldViolation(
        "sections",
        { machineName: "our-mission", layout: "hero" },
        { machineName: "other" },
        [],
      ),
    ).toBe("machineName");
    expect(
      findImmutableFieldViolation(
        "sections",
        { machineName: "our-mission", layout: "hero" },
        { layout: "cta" },
        [],
      ),
    ).toBe("layout");
    expect(
      findImmutableFieldViolation(
        "globals",
        { kind: "footer", machineName: "footer" },
        { kind: "location" },
        [],
      ),
    ).toBe("kind");

    const contactDraft = {
      kind: "contactForm",
      machineName: "contact-form",
      fields: [
        { inputId: "name", type: "text", required: true, name: { "es-AR": "Nombre" } },
        { inputId: "email", type: "email", required: true, name: { "es-AR": "Email" } },
      ],
    };

    // Editing label/placeholder/values only is allowed
    expect(
      findImmutableFieldViolation(
        "globals",
        contactDraft,
        {
          fields: [
            {
              inputId: "name",
              type: "text",
              required: true,
              name: { "es-AR": "Tu nombre" },
              placeholder: { "es-AR": "Juan" },
            },
            {
              inputId: "email",
              type: "email",
              required: true,
              name: { "es-AR": "Correo" },
            },
          ],
        },
        [],
      ),
    ).toBeNull();

    // Changing order, count, inputId, type, or required is refused
    expect(
      findImmutableFieldViolation(
        "globals",
        contactDraft,
        { fields: [contactDraft.fields[1], contactDraft.fields[0]] },
        [],
      ),
    ).toBe("fields");
    expect(
      findImmutableFieldViolation(
        "globals",
        contactDraft,
        { fields: [contactDraft.fields[0]] },
        [],
      ),
    ).toBe("fields");
    expect(
      findImmutableFieldViolation(
        "globals",
        contactDraft,
        {
          fields: [
            { ...contactDraft.fields[0], required: false },
            contactDraft.fields[1],
          ],
        },
        [],
      ),
    ).toBe("fields");
  });

  it("diffs changed vs unchanged fields and separates explicit undefined into unsetFields", () => {
    const existing = {
      title: { "es-AR": "Hola", "en-US": "Hello" },
      subtitle: { "es-AR": "Sub" },
      slug: "hola",
    };

    // Identical keys in different order -> zero changes
    expect(
      diffChangedFields(existing, {
        title: { "en-US": "Hello", "es-AR": "Hola" },
        slug: "hola",
      }),
    ).toEqual({ changedFields: [], setPatch: {}, unsetFields: [] });

    // Clearing optional field puts it in unsetFields, never setPatch
    expect(
      diffChangedFields(existing, {
        title: { "es-AR": "Hola 2" },
        subtitle: undefined,
        slug: "hola",
      }),
    ).toEqual({
      changedFields: ["subtitle", "title"],
      setPatch: { title: { "es-AR": "Hola 2" } },
      unsetFields: ["subtitle"],
    });

    // Full snapshot diff captures keys present in prev only ($unset) AND keys present in next only
    expect(
      diffSnapshotFields(
        { title: { "es-AR": "A" }, subtitle: { "es-AR": "Removed" } },
        { title: { "es-AR": "A" }, category: "Events" },
      ),
    ).toEqual(["category", "subtitle"]);
  });

  it("strips undefined deeply and resolves concrete global kinds and natural keys", () => {
    expect(
      stripUndefinedDeep({ a: 1, b: undefined, nested: { c: "ok", d: undefined } }),
    ).toEqual({ a: 1, nested: { c: "ok" } });

    expect(resolveConcreteType("globals", { kind: "contactForm" })).toBe("contactForm");
    expect(resolveConcreteType("globals", { kind: "bogus" })).toBeNull();
    expect(resolveConcreteType("posts", {})).toBe("post");

    expect(
      computeNaturalKey("bible_verses", {
        book: { "es-AR": "Joel" },
        chapter: 2,
        fromVerse: 13,
        version: { "es-AR": "NVI" },
      }),
    ).toBe("joel|2|13|13|nvi");
    expect(
      computeNaturalKey("bible_verses", {
        book: { "es-AR": "Joel" },
        chapter: 2,
        fromVerse: 13,
      }),
    ).toBeUndefined();
  });
});
