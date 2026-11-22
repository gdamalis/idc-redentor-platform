import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-200`). */
export default async function EditSermonPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "sermons",
    docId: id,
    backHref: "/content/sermons",
    backLabelKey: "types.sermons",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
  });
}
