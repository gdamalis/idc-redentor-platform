import { PlaceholderPage } from "@src/components/shell/placeholder-page";
import { getTranslations } from "next-intl/server";

export default async function LoginPage() {
  const tPages = await getTranslations("pages");

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <PlaceholderPage heading={`${tPages("login.title")} — ${tPages("comingSoon")}`} />
    </div>
  );
}
