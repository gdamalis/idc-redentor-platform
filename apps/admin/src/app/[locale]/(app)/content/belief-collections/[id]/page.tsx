import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-198`). */
export default async function EditBeliefCollectionPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "belief_collections",
    docId: id,
    backHref: "/content/belief-collections",
    backLabelKey: "types.beliefCollections",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
  });
}
