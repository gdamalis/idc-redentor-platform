import type { SermonFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { SermonEditor } from "@src/components/content/sermons/sermon-editor";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  extractPermissions,
  requireContentPageAuth,
} from "../../shell-helpers";

/**
 * Create-sermon editor route (`ICR-200`).
 * Nothing is written to MongoDB until the editor explicitly saves or publishes.
 */
export default async function NewSermonPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const initialValues: SermonFields = {
    title: { "es-AR": "" },
    audioLanguages: ["es-AR"],
  };

  return (
    <SermonEditor
      initialStatus="draft"
      initialValues={initialValues}
      permissions={extractPermissions(authz)}
      canManageMedia={authz.permissions.has("media:manage")}
      isTrialMode={isContentTrialMode()}
      isPublishEmailsEnabled={isPublishEmailsEnabled()}
      initialAuthors={{}}
      initialVerses={[]}
      verseUsageCounts={{}}
      initialRelatedSermons={{}}
      initialMedia={{}}
      initialPdfStatus={{
        stateByLocale: { "es-AR": "none", "en-US": "none" },
        isPending: false,
        version: 0,
        pdfs: {},
      }}
    />
  );
}
