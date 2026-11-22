import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { TrialModeBanner } from "@src/components/content/trial-mode-banner";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { requireContentPageAuth } from "./shell-helpers";

export default async function ContentLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const trialMode = isContentTrialMode();
  const t = await getTranslations("content");

  return (
    <div className="flex flex-col gap-5">
      {trialMode && <TrialModeBanner message={t("trial.banner")} />}
      {children}
    </div>
  );
}
