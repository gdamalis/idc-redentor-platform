import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function EditPostPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return renderShellEditPage({
    locale,
    collection: "posts",
    docId: id,
    backHref: "/content/posts",
    backLabelKey: "types.posts",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
  });
}
