import { PlaceholderPage } from "@src/components/shell/placeholder-page";
import { getTranslations } from "next-intl/server";

export default async function PeoplePage() {
  const tNav = await getTranslations("nav");
  const tPages = await getTranslations("pages");

  return <PlaceholderPage heading={`${tNav("people")} — ${tPages("comingSoon")}`} />;
}
