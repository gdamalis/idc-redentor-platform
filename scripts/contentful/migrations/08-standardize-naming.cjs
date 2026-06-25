// ICR-71 (T12) step 1 of 3 (additive): standardize naming fields.
//   - menuGroup: add internalName + make it the display field (currently `internalTitle`, which is
//     only a CMS display field — never queried/rendered).
//   - seo: add internalName + make it the display field (currently `name`; never queried — getSeo
//     already filters by the existing machineName). seo already HAS machineName.
//   - navigationMenu: add machineName (required, unique) — it's currently looked up by internalName.
// 08b copies values into the new fields; 08c deletes the old display fields. Idempotent (guarded).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));
  const hasField = (typeId, fieldId) =>
    (byId[typeId]?.fields || []).some((f) => f.id === fieldId);

  if (byId["menuGroup"] && !hasField("menuGroup", "internalName")) {
    const mg = migration.editContentType("menuGroup");
    mg.createField("internalName").name("Internal Name").type("Symbol");
    mg.displayField("internalName");
  }

  if (byId["seo"] && !hasField("seo", "internalName")) {
    const seo = migration.editContentType("seo");
    seo.createField("internalName").name("Internal Name").type("Symbol");
    seo.displayField("internalName");
  }

  if (byId["navigationMenu"] && !hasField("navigationMenu", "machineName")) {
    migration
      .editContentType("navigationMenu")
      .createField("machineName")
      .name("Machine name")
      .type("Symbol")
      .required(true)
      .validations([{ unique: true }]);
  }
};
