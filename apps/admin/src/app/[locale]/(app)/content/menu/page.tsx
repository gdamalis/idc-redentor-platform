import { notFound } from "next/navigation";
import type { GlobalFields, NavigationMenuFields } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { NavigationMenuEditor } from "@src/components/content/site/navigation-menu-editor";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function MenuGlobalPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const data = await loadFixedEditorPageData<GlobalFields>({
    locale,
    collection: "globals",
    machineName: "main-menu",
    backHref: "/content",
    backLabelKey: "header.backToHub",
  });

  if (data.forbidden) return <PermissionDenied />;
  if (data.initialValues.kind !== "navigationMenu") notFound();

  return (
    <NavigationMenuEditor
      initialDoc={data.initialDoc as SerializedContentDoc<NavigationMenuFields>}
      initialStatus={data.initialStatus}
      initialValues={data.initialValues}
      backHref={data.backHref}
      backLabel={data.backLabel}
      friendlyTitle={data.friendlyTitle}
      machineName={data.machineName}
      appearsOn={data.appearsOn}
      liveUrl={data.liveUrl}
      permissions={data.permissions}
      isTrialMode={data.isTrialMode}
      isPublishEmailsEnabled={data.isPublishEmailsEnabled}
    />
  );
}
