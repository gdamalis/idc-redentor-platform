import { getTranslations } from "next-intl/server";
import { Link } from "@src/i18n/routing";
import { SignOutButton } from "@src/components/shell/sign-out-button";

export default async function NoAccessPage() {
  const t = await getTranslations("auth.noAccess");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">
          {t("backToLogin")}
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
