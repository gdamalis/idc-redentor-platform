// ICR-75 (T8) step 3 of 3: finalize the promo-block merge. Run AFTER 05b migrated all entries to
// `section` and the getters were switched to getSection. Deletes the now-empty componentHeroBanner,
// componentCta, and componentTextBlock types. Idempotent (guarded by existence).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));

  for (const id of ["componentHeroBanner", "componentCta", "componentTextBlock"]) {
    if (byId[id]) migration.deleteContentType(id);
  }
};
