import type { SectionFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { SectionEditor } from "@src/components/content/site/section-editor";
import { preloadMediaMap } from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function EditSectionPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadFixedEditorPageData<SectionFields>({
    locale,
    collection: "sections",
    docId: id,
    backHref: "/content/sections",
    backLabelKey: "types.sections",
  });

  if (data.forbidden) return <PermissionDenied />;

  const initialMediaById = await preloadMediaMap(data.caller, [
    data.initialValues.image,
    ...(data.initialValues.images ?? []),
  ]);

  return (
    <SectionEditor
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
