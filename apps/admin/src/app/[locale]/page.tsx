import { ThemeToggle } from "@src/components/theme/theme-toggle";
import { getTranslations } from "next-intl/server";

export default async function AdminHomePage() {
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl">{t("title")}</h1>
        <ThemeToggle />
      </div>
      <p className="max-w-md text-muted-foreground">{t("subtitle")}</p>
    </main>
  );
}
