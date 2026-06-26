// ICR-85: constrain footer entry-link validations. `footer.socialLinks` (Array<Link:Entry>) and
// `footer.location` (Link:Entry) carry NO linkContentType validation, yet getFooter.ts already
// resolves them as `... on SocialLink` / `... on LocationComponent` — so a mis-linked entry would
// silently drop out of the footer. Add the linkContentType guardrails the code already assumes.
// Purely additive: no required/optional change, no entry edits. Idempotent (skips when the
// validation is already present), guarded by field presence.

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const footer = items.find((t) => t.sys.id === "footer");
  if (!footer) return;

  const field = (id) => (footer.fields || []).find((f) => f.id === id);
  const missingLinkContentType = (validations) =>
    !(validations || []).some((v) => v.linkContentType);

  const socialLinks = field("socialLinks");
  const location = field("location");
  const fixSocial =
    socialLinks && missingLinkContentType(socialLinks.items?.validations);
  const fixLocation = location && missingLinkContentType(location.validations);

  if (!fixSocial && !fixLocation) return;

  const footerType = migration.editContentType("footer");

  if (fixSocial) {
    footerType.editField("socialLinks").items({
      type: "Link",
      linkType: "Entry",
      validations: [{ linkContentType: ["socialLink"] }],
    });
  }

  if (fixLocation) {
    footerType
      .editField("location")
      .validations([{ linkContentType: ["locationComponent"] }]);
  }
};
