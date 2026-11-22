import { renderShellEditPage } from "../shell-helpers";

/** Direct-to-editor singleton global. Replaced exclusively by Wave 4 (`ICR-198`). */
export default async function LocationGlobalPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "globals",
    fixedMachineName: "location",
    backHref: "/content",
    backLabelKey: "header.backToHub",
    editableField: {
      kind: "plainText",
      key: "addressLine1",
      labelKey: "lists.columns.slug",
    },
  });
}
