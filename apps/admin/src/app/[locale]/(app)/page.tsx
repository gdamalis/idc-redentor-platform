import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}
