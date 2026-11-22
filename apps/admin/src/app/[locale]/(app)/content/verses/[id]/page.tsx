import { notFound } from "next/navigation";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { VerseEditor } from "@src/components/content/verse-editor";
import { redirect } from "@src/i18n/routing";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { bibleVerseService } from "@src/service/content/collections";

export default async function EditVersePage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const authz = await requirePermission("content:read");
  if (!authz.ok) {
    if (authz.reason === "forbidden") return <PermissionDenied />;
    redirect({
      href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
      locale,
    });
    return;
  }

  const caller = callerFromAuthorized(authz);
  const [loaded, usages] = await Promise.all([
    bibleVerseService.getById(caller, id),
    bibleVerseService.findUsages(caller, id),
  ]);
  if (!loaded.ok) notFound();

  const { doc, status, updatedByLabel } = loaded;

  return (
    <VerseEditor
      docId={doc._id}
      initialStatus={status}
      initialDoc={{
        _id: doc._id,
        draft: doc.draft,
        ...(doc.published !== undefined && { published: doc.published }),
        ...(doc.publishedAt !== undefined && {
          publishedAt: doc.publishedAt.toISOString(),
        }),
        ...(doc.firstPublishedAt !== undefined && {
          firstPublishedAt: doc.firstPublishedAt.toISOString(),
        }),
        revision: doc.revision,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        updatedBy: doc.updatedBy,
        ...(updatedByLabel !== undefined && { updatedByLabel }),
      }}
      usageCount={usages.ok ? usages.usedBy.length : 0}
      isTrialMode={isContentTrialMode()}
      permissions={{
        canWrite: authz.permissions.has("content:write"),
        canPublish: authz.permissions.has("content:publish"),
        canPublishProtected: authz.permissions.has("content:publish-protected"),
      }}
    />
  );
}
