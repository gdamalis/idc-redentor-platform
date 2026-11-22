import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function NewTopicPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "topics",
    backHref: "/content/topics",
    backLabelKey: "types.topics",
    editableField: {
      kind: "localizedText",
      key: "name",
      labelKey: "lists.columns.name",
    },
    defaultDraft: { name: { "es-AR": "" } },
  });
}
