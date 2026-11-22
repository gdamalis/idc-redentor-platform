import type { BeliefCollectionFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { BeliefCollectionEditor } from "@src/components/content/site/belief-collection-editor";
import {
  preloadMediaMap,
  preloadVersesMap,
} from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function EditBeliefCollectionPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadFixedEditorPageData<BeliefCollectionFields>({
    locale,
    collection: "belief_collections",
    docId: id,
    backHref: "/content/belief-collections",
    backLabelKey: "types.beliefCollections",
  });

  if (data.forbidden) return <PermissionDenied />;

  const items = data.initialValues.items ?? [];
  const [initialMediaById, initialVersesById] = await Promise.all([
    preloadMediaMap(
      data.caller,
      items.map((item) => item.imageId),
    ),
    preloadVersesMap(
      data.caller,
      items.map((item) => item.bibleVerseId),
    ),
  ]);

  return (
    <BeliefCollectionEditor
      initialDoc={data.initialDoc}
      initialStatus={data.initialStatus}
      initialValues={data.initialValues}
      initialMediaById={initialMediaById}
      initialVersesById={initialVersesById}
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
