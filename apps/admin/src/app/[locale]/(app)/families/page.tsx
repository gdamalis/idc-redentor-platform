import { PlaceholderPage } from "@src/components/shell/placeholder-page";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { redirect } from "@src/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function FamiliesPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requirePermission("families:read");
  if (!authz.ok) {
    if (authz.reason === "forbidden") return <PermissionDenied />;
    redirect({
      href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
      locale,
    });
  }

  const tNav = await getTranslations("nav");
  const tPages = await getTranslations("pages");

  return <PlaceholderPage heading={`${tNav("families")} — ${tPages("comingSoon")}`} />;
}
