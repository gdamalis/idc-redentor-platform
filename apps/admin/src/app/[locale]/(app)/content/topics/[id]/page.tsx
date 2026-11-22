import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function EditTopicPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "topics",
    docId: id,
    backHref: "/content/topics",
    backLabelKey: "types.topics",
    editableField: {
      kind: "localizedText",
      key: "name",
      labelKey: "lists.columns.name",
    },
  });
}
