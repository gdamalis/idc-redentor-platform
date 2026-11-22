import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-200`). */
export default async function NewSermonPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "sermons",
    backHref: "/content/sermons",
    backLabelKey: "types.sermons",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
    defaultDraft: { title: { "es-AR": "" } },
  });
}
