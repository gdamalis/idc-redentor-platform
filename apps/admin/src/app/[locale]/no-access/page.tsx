import { getTranslations } from "next-intl/server";

export default async function NoAccessPage() {
  const t = await getTranslations("pages");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">{t("noAccess.title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("noAccess.description")}</p>
    </div>
  );
}
