import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { AuthorEditor } from "@src/components/content/editorial/author-editor";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  extractPermissions,
  requireContentPageAuth,
} from "../../shell-helpers";

export default async function NewAuthorPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  return (
    <AuthorEditor
      initialStatus="draft"
      initialValues={{ name: "" }}
      initialAvatar={null}
      initialLinkedUser={null}
      permissions={{
        ...extractPermissions(authz),
        canManageMedia: authz.permissions.has("media:manage"),
        canReadUsers: authz.permissions.has("users:read"),
      }}
      isTrialMode={isContentTrialMode()}
    />
  );
}
