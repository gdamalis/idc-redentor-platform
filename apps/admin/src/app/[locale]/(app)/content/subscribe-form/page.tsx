import { renderShellEditPage } from "../shell-helpers";

/** Direct-to-editor singleton global. Replaced exclusively by Wave 4 (`ICR-198`). */
export default async function SubscribeFormGlobalPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "globals",
    fixedMachineName: "single-email-subscribe",
    backHref: "/content",
    backLabelKey: "header.backToHub",
    editableField: {
      kind: "localizedText",
      key: "title",
      labelKey: "lists.columns.title",
    },
  });
}
