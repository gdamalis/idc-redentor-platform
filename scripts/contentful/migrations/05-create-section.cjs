// ICR-75 (T8) step 1 of 3: create the unified `section` type that merges componentHeroBanner +
// componentCta + componentTextBlock, distinguished by a `layout` enum (hero | cta | textBlock).
// Field unification:
//   headline      <- headline (all three)
//   subHeadline   <- hero.subHeadline + textBlock.subtitle
//   body          <- hero.bodyText + cta.subline + textBlock.body  (RichText)
//   ctaText       <- hero.ctaText + cta.ctaText
//   targetPage    <- hero.targetPage + cta.targetPage  (Link -> page)
//   urlParameters <- cta.urlParameters
//   image         <- hero.image  (single Asset)
//   images        <- textBlock.images  (Asset array, max 5)  [hero.additionalImages is dropped — dead]
// body validations = the UNION of the three source rich-text fields so all existing content republishes.
// Sequencing: run 05 -> node 05b-remap-section.mjs -> run 05c. Idempotent (guarded).

const BODY_VALIDATIONS = [
  {
    enabledMarks: ["bold", "italic", "underline"],
    message: "Only bold, italic, and underline marks are allowed",
  },
  {
    enabledNodeTypes: [
      "heading-3", "ordered-list", "unordered-list", "embedded-entry-block",
      "embedded-asset-block", "hyperlink", "entry-hyperlink",
    ],
    message:
      "Only heading 3, ordered list, unordered list, block entry, block asset, link to Url, and link to entry nodes are allowed",
  },
  { nodes: {} },
];

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  if (items.some((t) => t.sys.id === "section")) return;

  const section = migration
    .createContentType("section")
    .name("Section")
    .description(
      "A page section: hero banner, call-to-action, or text block (merged via the layout enum).",
    )
    .displayField("internalName");

  section.createField("internalName").name("Internal Name").type("Symbol");
  section
    .createField("machineName")
    .name("Machine name")
    .type("Symbol")
    .required(true)
    .validations([{ unique: true }]);
  section
    .createField("layout")
    .name("Layout")
    .type("Symbol")
    .required(true)
    .validations([{ in: ["hero", "cta", "textBlock"] }]);
  section.createField("headline").name("Headline").type("Symbol").localized(true);
  section.createField("subHeadline").name("Sub headline").type("Symbol").localized(true);
  section
    .createField("body")
    .name("Body")
    .type("RichText")
    .localized(true)
    .validations(BODY_VALIDATIONS);
  section.createField("ctaText").name("CTA text").type("Symbol").localized(true);
  section
    .createField("targetPage")
    .name("Target page")
    .type("Link")
    .linkType("Entry")
    .validations([{ linkContentType: ["page"] }]);
  section.createField("urlParameters").name("URL parameters").type("Symbol");
  section.createField("image").name("Image").type("Link").linkType("Asset");
  section
    .createField("images")
    .name("Images")
    .type("Array")
    .items({ type: "Link", linkType: "Asset" })
    .validations([{ size: { max: 5 } }]);
};
