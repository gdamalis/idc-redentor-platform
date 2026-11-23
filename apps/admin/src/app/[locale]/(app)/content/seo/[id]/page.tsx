import type { SeoEntryFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { SeoEntryEditor } from "@src/components/content/site/seo-entry-editor";
import { preloadMediaMap } from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function EditSeoEntryPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadFixedEditorPageData<SeoEntryFields>({
    locale,
    collection: "seo_entries",
    docId: id,
    backHref: "/content/seo",
    backLabelKey: "types.seo",
  });

  if (data.forbidden) return <PermissionDenied />;

  const initialMediaById = await preloadMediaMap(data.caller, [
    data.initialValues.imageId,
  ]);

  return (
    <SeoEntryEditor
      initialDoc={data.initialDoc}
      initialStatus={data.initialStatus}
      initialValues={data.initialValues}
      initialMediaById={initialMediaById}
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
