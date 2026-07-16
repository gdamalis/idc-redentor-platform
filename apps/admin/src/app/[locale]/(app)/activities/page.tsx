import { PlaceholderPage } from "@src/components/shell/placeholder-page";
import { getTranslations } from "next-intl/server";

export default async function ActivitiesPage() {
  const tNav = await getTranslations("nav");
  const tPages = await getTranslations("pages");

  return <PlaceholderPage heading={`${tNav("activities")} — ${tPages("comingSoon")}`} />;
}
