import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { PostEditor } from "@src/components/content/editorial/post-editor";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  extractPermissions,
  requireContentPageAuth,
} from "../../shell-helpers";

export default async function NewPostPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  return (
    <PostEditor
      initialStatus="draft"
      initialValues={{ title: { "es-AR": "" } }}
      initialFeaturedImage={null}
      initialAuthor={null}
      initialRelatedPosts={[]}
      permissions={{
        ...extractPermissions(authz),
        canManageMedia: authz.permissions.has("media:manage"),
      }}
      isTrialMode={isContentTrialMode()}
      isPublishEmailsEnabled={isPublishEmailsEnabled()}
    />
  );
}
