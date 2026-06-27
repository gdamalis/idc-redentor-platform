// ICR-66 (T1 + T3): delete the unused componentQuote type and strip the phantom
// `nt_mergetag` embedded-entry-inline validation ref from surviving rich-text fields.
//
// Confirmed live against agent-sandbox (2026-06-25):
//   - componentQuote: " [UNUSED] Quote component", 0 entries (its nt_mergetag/topicPerson
//     phantom refs disappear with the type).
//   - componentHeroBanner.bodyText + componentCta.subline: RichText whose validations contain a
//     { nodes: { "embedded-entry-inline": [{ linkContentType: ["nt_mergetag"] }] } } phantom plus
//     enabledNodeTypes: ["embedded-entry-inline"]. We drop both (no entry ever embedded inline, so
//     rendered output is unchanged) leaving marks + an empty node allowlist ("Nodes are not allowed").
//   - componentDuplex.{bodyText,targetPage} also carry nt_mergetag/post phantoms, but that whole type
//     is deleted in migration 02 (ICR-73), so they are intentionally NOT touched here.
//
// Idempotent: the delete is guarded by an existence check; re-stating validations is naturally re-runnable.

const RT_VALIDATIONS = [
  {
    enabledMarks: ["bold", "italic", "underline"],
    message: "Only bold, italic, and underline marks are allowed",
  },
  { enabledNodeTypes: [], message: "Nodes are not allowed" },
];

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const exists = (id) => items.some((t) => t.sys.id === id);

  // T1 — delete the unused quote type (0 entries).
  if (exists("componentQuote")) {
    migration.deleteContentType("componentQuote");
  }

  // T3 — strip the phantom nt_mergetag ref from the two surviving rich-text fields.
  migration
    .editContentType("componentHeroBanner")
    .editField("bodyText")
    .validations(RT_VALIDATIONS);
  migration
    .editContentType("componentCta")
    .editField("subline")
    .validations(RT_VALIDATIONS);
};
