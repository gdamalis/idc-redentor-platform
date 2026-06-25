// ICR-73 (T4 + T5 + T6): retire the vestigial page-builder render path.
//
//  - Delete the dead `componentDuplex` type. Its single orphan entry ("Nuestra Misión",
//    machineName our-mission-section) had no getter and rendered nowhere; it was deleted first
//    via a CMA step (contentful-migration cannot delete entries, and a destructive makeRequest
//    inside a migration would also fire during --dry-run, so entry cleanup is kept out of here).
//  - Slim `page` to a pure route/SEO registry by dropping the page-builder fields
//    (topSection, pageContent, extraSection). The blog index now renders its CTA directly via
//    getCtaComponent("connect-with-us"); the other pages never used these fields.
//    `page` keeps: internalName, pageName, slug, seo, machineName (and targetPage links from
//    componentCta/componentHeroBanner still resolve page.slug).
//
// Idempotent: the type delete is guarded by an existence check; field deletes are guarded by
// field presence.

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));
  const hasField = (typeId, fieldId) =>
    (byId[typeId]?.fields || []).some((f) => f.id === fieldId);

  // T6 — delete the dead duplex type (its orphan entry was removed first).
  if (byId["componentDuplex"]) {
    migration.deleteContentType("componentDuplex");
  }

  // T4/T5 — drop the page-builder fields; keep page as a route/SEO registry.
  if (byId["page"]) {
    const page = migration.editContentType("page");
    for (const fieldId of ["topSection", "pageContent", "extraSection"]) {
      if (hasField("page", fieldId)) page.deleteField(fieldId);
    }
  }
};
