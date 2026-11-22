import type { EventBannerFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { EventBannerEditor } from "@src/components/content/site/event-banner-editor";
import {
  loadSharedLocation,
  preloadMediaMap,
} from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function EventBannerPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const data = await loadFixedEditorPageData<EventBannerFields>({
    locale,
    collection: "event_banners",
    machineName: "event-sunday-meetings",
    backHref: "/content",
    backLabelKey: "header.backToHub",
  });

  if (data.forbidden) return <PermissionDenied />;

  const [initialMediaById, sharedLocation] = await Promise.all([
    preloadMediaMap(data.caller, [data.initialValues.image]),
    loadSharedLocation(data.caller),
  ]);

  return (
    <EventBannerEditor
      initialDoc={data.initialDoc}
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
