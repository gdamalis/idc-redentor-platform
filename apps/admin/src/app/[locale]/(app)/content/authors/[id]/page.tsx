import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function EditAuthorPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "authors",
    docId: id,
    backHref: "/content/authors",
    backLabelKey: "types.authors",
    editableField: {
      kind: "plainText",
      key: "name",
      labelKey: "lists.columns.name",
    },
  });
}
