import { notFound } from "next/navigation";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { AuthorEditor } from "@src/components/content/editorial/author-editor";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { authorService } from "@src/service/content/collections";
import { loadAuthorEditorHydration } from "@src/service/content/editorial/editorial-loaders.service";
import {
  extractPermissions,
  requireContentPageAuth,
  serializeDocView,
} from "../../shell-helpers";

export default async function EditAuthorPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const caller = callerFromAuthorized(authz);
  const loaded = await authorService.getById(caller, id);
  if (!loaded.ok) notFound();

  const canReadUsers = authz.permissions.has("users:read");
  const hydration = await loadAuthorEditorHydration(
    caller,
    loaded.doc.draft,
    canReadUsers,
  );

  return (
    <AuthorEditor
      docId={loaded.doc._id}
      initialDoc={serializeDocView(loaded)}
      initialStatus={loaded.status}
      initialValues={loaded.doc.draft}
      initialAvatar={hydration.initialAvatar}
      initialLinkedUser={hydration.initialLinkedUser}
      permissions={{
        ...extractPermissions(authz),
        canManageMedia: authz.permissions.has("media:manage"),
        canReadUsers,
      }}
      isTrialMode={isContentTrialMode()}
    />
  );
}
