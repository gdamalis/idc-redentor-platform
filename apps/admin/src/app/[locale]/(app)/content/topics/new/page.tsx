import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { TopicEditor } from "@src/components/content/editorial/topic-editor";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  extractPermissions,
  requireContentPageAuth,
} from "../../shell-helpers";

export default async function NewTopicPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  return (
    <TopicEditor
      initialStatus="draft"
      initialValues={{ name: { "es-AR": "" } }}
      permissions={extractPermissions(authz)}
      isTrialMode={isContentTrialMode()}
    />
  );
}
