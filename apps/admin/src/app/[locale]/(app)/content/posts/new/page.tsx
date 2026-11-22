import { renderShellEditPage } from "../../shell-helpers";

/** Replaced exclusively by Wave 4 (`ICR-199`). */
export default async function NewPostPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "posts",
    backHref: "/content/posts",
    backLabelKey: "types.posts",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
    defaultDraft: { title: { "es-AR": "" } },
  });
}
