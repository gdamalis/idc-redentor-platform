// ICR-67 (T7) step 3 of 3: finalize the credo+valueItem -> beliefItem merge.
// Run AFTER 03b has migrated all entries and repointed the collections. Tightens
// contentCollection.contentItems back to [beliefItem] only and deletes the now-empty
// credo + valueItem types. Idempotent (guarded by existence).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));

  if (byId["contentCollection"]) {
    migration
      .editContentType("contentCollection")
      .editField("contentItems")
      .items({
        type: "Link",
        linkType: "Entry",
        validations: [{ linkContentType: ["beliefItem"] }],
      });
  }

  if (byId["credo"]) migration.deleteContentType("credo");
  if (byId["valueItem"]) migration.deleteContentType("valueItem");
};
