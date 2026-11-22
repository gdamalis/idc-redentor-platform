import { renderShellEditPage } from "../shell-helpers";

/** Direct-to-editor singleton fixed entry. Replaced exclusively by Wave 4 (`ICR-198`). */
export default async function EventBannerPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderShellEditPage({
    locale,
    collection: "event_banners",
    fixedMachineName: "event-sunday-meetings",
    backHref: "/content",
    backLabelKey: "header.backToHub",
    editableField: { kind: "none" },
  });
}
