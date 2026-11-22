import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-198`). */
export default async function EditSectionPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "sections",
    docId: id,
    backHref: "/content/sections",
    backLabelKey: "types.sections",
    editableField: {
      kind: "localizedText",
      key: "headline",
      labelKey: "lists.columns.title",
    },
  });
}
