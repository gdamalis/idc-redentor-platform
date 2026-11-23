import { notFound } from "next/navigation";
import type { ContactFormFields, GlobalFields } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { ContactFormEditor } from "@src/components/content/site/contact-form-editor";
import {
  preloadMediaMap,
  preloadVersesMap,
} from "@src/service/content/site/loaders";
import { loadFixedEditorPageData } from "@src/service/content/site/page-loader";

export default async function ContactFormGlobalPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const data = await loadFixedEditorPageData<GlobalFields>({
    locale,
    collection: "globals",
    machineName: "contact-form",
    backHref: "/content",
    backLabelKey: "header.backToHub",
  });

  if (data.forbidden) return <PermissionDenied />;
  if (data.initialValues.kind !== "contactForm") notFound();

  const [initialMediaById, initialVersesById] = await Promise.all([
    preloadMediaMap(data.caller, [data.initialValues.image]),
    preloadVersesMap(data.caller, [data.initialValues.bibleVerseId]),
  ]);

  return (
    <ContactFormEditor
      initialDoc={data.initialDoc as SerializedContentDoc<ContactFormFields>}
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
