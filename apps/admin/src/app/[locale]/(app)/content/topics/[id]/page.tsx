import { notFound } from "next/navigation";
import type { Locale } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { TopicEditor } from "@src/components/content/editorial/topic-editor";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { topicService } from "@src/service/content/collections";
import { resolvePublicLiveUrl } from "@src/service/content/editorial/editorial-rules";
import {
  extractPermissions,
  requireContentPageAuth,
  serializeDocView,
} from "../../shell-helpers";

export default async function EditTopicPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const panelLocale: Locale = locale === "en-US" ? "en-US" : "es-AR";
  const caller = callerFromAuthorized(authz);
  const loaded = await topicService.getById(caller, id);
  if (!loaded.ok) notFound();

  const liveUrl = resolvePublicLiveUrl({
    collection: "topics",
    published: loaded.doc.published,
    locale: panelLocale,
  });

  return (
    <TopicEditor
      docId={loaded.doc._id}
      initialDoc={serializeDocView(loaded)}
      initialStatus={loaded.status}
      initialValues={loaded.doc.draft}
      permissions={extractPermissions(authz)}
      isTrialMode={isContentTrialMode()}
      liveUrl={liveUrl}
    />
  );
}
