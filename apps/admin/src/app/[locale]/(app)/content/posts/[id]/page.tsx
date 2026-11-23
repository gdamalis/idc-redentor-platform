import { notFound } from "next/navigation";
import type { Locale } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { PostEditor } from "@src/components/content/editorial/post-editor";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { postService } from "@src/service/content/collections";
import { loadPostEditorHydration } from "@src/service/content/editorial/editorial-loaders.service";
import { resolvePublicLiveUrl } from "@src/service/content/editorial/editorial-rules";
import {
  extractPermissions,
  requireContentPageAuth,
  serializeDocView,
} from "../../shell-helpers";

export default async function EditPostPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const panelLocale: Locale = locale === "en-US" ? "en-US" : "es-AR";
  const caller = callerFromAuthorized(authz);
  const loaded = await postService.getById(caller, id);
  if (!loaded.ok) notFound();

  const hydration = await loadPostEditorHydration(caller, loaded.doc.draft);
  const liveUrl = resolvePublicLiveUrl({
    collection: "posts",
    published: loaded.doc.published,
    locale: panelLocale,
  });

  return (
    <PostEditor
      docId={loaded.doc._id}
      initialDoc={serializeDocView(loaded)}
      initialStatus={loaded.status}
      initialValues={loaded.doc.draft}
      initialFeaturedImage={hydration.initialFeaturedImage}
      initialAuthor={hydration.initialAuthor}
      initialRelatedPosts={hydration.initialRelatedPosts}
      permissions={{
        ...extractPermissions(authz),
        canManageMedia: authz.permissions.has("media:manage"),
      }}
      isTrialMode={isContentTrialMode()}
      isPublishEmailsEnabled={isPublishEmailsEnabled()}
      liveUrl={liveUrl}
    />
  );
}
