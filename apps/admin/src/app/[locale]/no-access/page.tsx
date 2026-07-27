import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@src/components/shell/sign-out-button";

// Public church website — offered as somewhere useful to go for a visitor who
// was correctly refused admin access (signing out already returns them to
// /login, so a second "back to sign in" link is redundant). Falls back to the
// production site so an unset env var can never break the page.
const CHURCH_WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://www.idcredentor.org";

export default async function NoAccessPage() {
  const t = await getTranslations("auth.noAccess");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex items-center gap-4">
        <a
          href={CHURCH_WEBSITE_URL}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          {t("backToWebsite")}
        </a>
        <SignOutButton />
      </div>
    </div>
  );
}
