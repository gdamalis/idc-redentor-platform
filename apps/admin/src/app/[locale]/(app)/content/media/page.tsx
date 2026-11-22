import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { Notice } from "@src/components/ui/notice";
import { Link } from "@src/i18n/routing";
import { requireContentPageAuth } from "../shell-helpers";

/** Placeholder route replaced exclusively by Wave 3 (`ICR-196`). */
export default async function MediaLibraryPlaceholderPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const t = await getTranslations("content");

  return (
    <div className="space-y-4">
      <Link
        href="/content"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{t("header.backToHub")}</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{t("types.media")}</h1>
      <Notice variant="info">{t("lists.mediaPlaceholder")}</Notice>
    </div>
  );
}
