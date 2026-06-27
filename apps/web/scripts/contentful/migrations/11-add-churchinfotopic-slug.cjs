// ICR-74/43 (T2): add a localized `slug` to churchInfoTopic so the bilingual /[locale]/[topic] route
// can resolve it (es "privacidad" / en "privacy"). The type currently has no slug/machineName.
// 11b sets the slug values. Idempotent (guarded).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const topic = items.find((t) => t.sys.id === "churchInfoTopic");
  const hasSlug = topic && topic.fields.some((f) => f.id === "slug");

  if (topic && !hasSlug) {
    migration
      .editContentType("churchInfoTopic")
      .createField("slug")
      .name("Slug")
      .type("Symbol")
      .localized(true)
      .validations([{ regexp: { pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } }]);
  }
};
