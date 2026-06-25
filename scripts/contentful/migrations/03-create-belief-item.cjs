// ICR-67 (T7) step 1 of 3: create the `beliefItem` type that merges `credo` + `valueItem`.
//
// credo and valueItem are field-identical (internalName, title, description, bibleVerse[freeform
// RichText], image, machineName) — only credo.bibleVerse is required. beliefItem replicates credo's
// field shape (validations copied verbatim) with bibleVerse OPTIONAL (valueItems have none) and adds
// a `kind` enum ("Creed" | "Value"). bibleVerse stays freeform RichText here for parity; Task 4
// (ICR-68) converts it to the structured bibleVerse link.
//
// This step also RELAXES contentCollection.contentItems to allow beliefItem alongside credo/valueItem
// so the CMA remap (03b) can repoint the collections; migration 03c tightens it back to [beliefItem].
//
// Sequencing: run 03 (this) -> node 03b-remap-belief-item.mjs -> run 03c. Idempotent (guarded).

const RT_MARKS = {
  enabledMarks: [
    "bold", "italic", "underline", "code", "superscript", "subscript", "strikethrough",
  ],
  message:
    "Only bold, italic, underline, code, superscript, subscript, and strikethrough marks are allowed",
};
const DESCRIPTION_VALIDATIONS = [
  RT_MARKS,
  {
    enabledNodeTypes: [
      "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6",
      "ordered-list", "unordered-list", "hr", "blockquote", "embedded-entry-block",
      "embedded-asset-block", "table", "hyperlink", "entry-hyperlink", "asset-hyperlink",
      "embedded-entry-inline",
    ],
    message:
      "Only heading 1, heading 2, heading 3, heading 4, heading 5, heading 6, ordered list, unordered list, horizontal rule, quote, block entry, asset, table, link to Url, link to entry, link to asset, and inline entry nodes are allowed",
  },
  { nodes: {} },
];
const BIBLE_VERSE_VALIDATIONS = [
  RT_MARKS,
  {
    enabledNodeTypes: [
      "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6",
      "ordered-list", "unordered-list", "hr", "blockquote", "embedded-entry-block",
      "embedded-asset-block", "table", "asset-hyperlink", "embedded-entry-inline",
      "entry-hyperlink", "hyperlink",
    ],
    message:
      "Only heading 1, heading 2, heading 3, heading 4, heading 5, heading 6, ordered list, unordered list, horizontal rule, quote, block entry, asset, table, link to asset, inline entry, link to entry, and link to Url nodes are allowed",
  },
  { nodes: {} },
];

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));

  if (!byId["beliefItem"]) {
    const belief = migration
      .createContentType("beliefItem")
      .name("Belief Item")
      .description(
        "A creed statement or a mission/value item (merged from credo + valueItem).",
      )
      .displayField("internalName");
    belief.createField("internalName").name("Internal Name").type("Symbol");
    belief.createField("title").name("Title").type("Symbol").localized(true).required(true);
    belief
      .createField("description")
      .name("Description")
      .type("RichText")
      .localized(true)
      .validations(DESCRIPTION_VALIDATIONS);
    belief
      .createField("bibleVerse")
      .name("Bible verse")
      .type("RichText")
      .localized(true)
      .required(false)
      .validations(BIBLE_VERSE_VALIDATIONS);
    belief.createField("image").name("Image").type("Link").linkType("Asset");
    belief
      .createField("machineName")
      .name("Machine name")
      .type("Symbol")
      .required(true)
      .validations([{ unique: true }]);
    belief
      .createField("kind")
      .name("Kind")
      .type("Symbol")
      .validations([{ in: ["Creed", "Value"] }]);
  }

  // Relax the collection link validation so 03b can point contentItems at beliefItem entries.
  if (byId["contentCollection"]) {
    migration
      .editContentType("contentCollection")
      .editField("contentItems")
      .items({
        type: "Link",
        linkType: "Entry",
        validations: [{ linkContentType: ["credo", "valueItem", "beliefItem"] }],
      });
  }
};
