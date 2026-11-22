import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { VerseEditor } from "@src/components/content/verse-editor";
import { redirect } from "@src/i18n/routing";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { requirePermission } from "@src/lib/rbac/require-permission";

export default async function NewVersePage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requirePermission("content:read");
  if (!authz.ok) {
    if (authz.reason === "forbidden") return <PermissionDenied />;
    redirect({
      href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
      locale,
    });
    return;
  }

  return (
    <VerseEditor
      initialStatus="draft"
      isTrialMode={isContentTrialMode()}
      permissions={{
        canWrite: authz.permissions.has("content:write"),
        canPublish: authz.permissions.has("content:publish"),
        canPublishProtected: authz.permissions.has("content:publish-protected"),
      }}
    />
  );
}
