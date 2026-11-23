import { notFound } from "next/navigation";
import type { FooterFields, GlobalFields } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { FooterEditor } from "@src/components/content/site/footer-editor";
import {
  loadSharedLocation,
  preloadMediaMap,
} from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function FooterGlobalPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const data = await loadFixedEditorPageData<GlobalFields>({
    locale,
    collection: "globals",
    machineName: "footer",
    backHref: "/content",
    backLabelKey: "header.backToHub",
  });

  if (data.forbidden) return <PermissionDenied />;
  if (data.initialValues.kind !== "footer") notFound();

  const [initialMediaById, sharedLocation] = await Promise.all([
    preloadMediaMap(data.caller, [data.initialValues.logo]),
    loadSharedLocation(data.caller),
  ]);

  return (
    <FooterEditor
      initialDoc={data.initialDoc as SerializedContentDoc<FooterFields>}
      initialStatus={data.initialStatus}
      initialValues={data.initialValues}
      initialMediaById={initialMediaById}
      sharedLocation={sharedLocation}
      backHref={data.backHref}
      backLabel={data.backLabel}
      friendlyTitle={data.friendlyTitle}
      machineName={data.machineName}
      appearsOn={data.appearsOn}
      liveUrl={data.liveUrl}
      permissions={data.permissions}
      canManageMedia={data.canManageMedia}
      isTrialMode={data.isTrialMode}
      isPublishEmailsEnabled={data.isPublishEmailsEnabled}
    />
  );
}
