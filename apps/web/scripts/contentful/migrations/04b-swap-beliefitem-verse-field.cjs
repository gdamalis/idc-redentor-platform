// ICR-68 (T9) step 2 of 3: swap beliefItem.bibleVerse from freeform RichText -> Link(bibleVerse).
// Contentful can't change a field's type in place, so delete + recreate the same field id. Run AFTER
// 04 has captured every freeform verse into structured bibleVerse entries (the RichText content is
// dropped here). 04c then links each beliefItem.bibleVerse to its structured entry.
// Idempotent: only swaps while the field is still RichText.

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const belief = items.find((t) => t.sys.id === "beliefItem");
  const verseField = belief && belief.fields.find((f) => f.id === "bibleVerse");

  if (verseField && verseField.type === "RichText") {
    const ct = migration.editContentType("beliefItem");
    ct.deleteField("bibleVerse");
    ct.createField("bibleVerse")
      .name("Bible verse")
      .type("Link")
      .linkType("Entry")
      .validations([{ linkContentType: ["bibleVerse"] }]);
  }
};
