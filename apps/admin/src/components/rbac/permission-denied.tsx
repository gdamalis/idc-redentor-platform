import { getTranslations } from "next-intl/server";
import { Link } from "@src/i18n/routing";

/**
 * In-page 403 for an authenticated, provisioned user who lacks a specific
 * permission. Rendered INSIDE `AppShell` — unlike `/no-access` (no Mongo
 * account at all), the user keeps their nav, so `/no-access` keeps meaning
 * exactly one thing, per ICR-127's contract.
 */
export async function PermissionDenied() {
  const t = await getTranslations("rbac.denied");

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <Link
        href="/"
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        {t("backToDashboard")}
      </Link>
    </div>
  );
}
