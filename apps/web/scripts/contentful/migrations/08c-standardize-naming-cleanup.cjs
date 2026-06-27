// ICR-71 (T12) step 3 of 3 (cleanup): delete the old display fields now that internalName carries
// their values (08b) and is the display field (08a). Neither was queried/rendered. Run last.
// Idempotent (guarded by field presence).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));
  const hasField = (typeId, fieldId) =>
    (byId[typeId]?.fields || []).some((f) => f.id === fieldId);

  if (hasField("menuGroup", "internalTitle")) {
    migration.editContentType("menuGroup").deleteField("internalTitle");
  }
  if (hasField("seo", "name")) {
    migration.editContentType("seo").deleteField("name");
  }
};
