import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function NewAuthorPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "authors",
    backHref: "/content/authors",
    backLabelKey: "types.authors",
    editableField: {
      kind: "plainText",
      key: "name",
      labelKey: "lists.columns.name",
    },
    defaultDraft: { name: "" },
  });
}
