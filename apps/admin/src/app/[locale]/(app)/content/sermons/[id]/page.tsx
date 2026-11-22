import { notFound } from "next/navigation";
import {
  extractReferences,
  type Locale,
  type MediaDoc,
} from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { SermonEditor } from "@src/components/content/sermons/sermon-editor";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import {
  formatShortDate,
} from "@src/lib/content/status-helpers";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  authorService,
  bibleVerseService,
  sermonService,
} from "@src/service/content";
import { getMediaByIds } from "@src/service/media";
import {
  deriveSermonPdfUiState,
  getContentPdfJob,
} from "@src/service/content/sermons/pdf-jobs.service";
import type {
  BibleVersePickerItem,
  ContentPickerOption,
} from "../../actions";
import type { SerializedMediaDoc } from "../../media/actions";
import {
  extractPermissions,
  requireContentPageAuth,
  serializeDocView,
} from "../../shell-helpers";
import type { SerializedSermonPdfStatus } from "../actions";

function serializeMedia(doc: MediaDoc): SerializedMediaDoc {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
}

function buildLiveSermonUrl(
  slug: string | undefined,
  locale: string,
): string | undefined {
  if (!slug) return undefined;
  const base = (
    process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() || "https://www.idcredentor.org"
  ).replace(/\/+$/, "");
  return `${base}/${locale}/predicas/${slug}`;
}

/**
 * Full bilingual sermon editor route (`ICR-200`).
 * Pre-hydrates every referenced media doc (including all embedded body audio/PDF
 * cards), authors, Bible verses (+ usage counts), related sermons, and PDF job
 * status on the server so imported sermons open with zero client waterfall.
 */
export default async function EditSermonPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const caller = callerFromAuthorized(authz);
  const loaded = await sermonService.getById(caller, id);
  if (!loaded.ok) notFound();

  const draft = loaded.doc.draft;
  const published = loaded.doc.published;
  const refs = extractReferences("sermon", { draft, published });

  const authorIds = new Set<string>();
  for (const snap of published ? [draft, published] : [draft]) {
    if (snap.preacherId) authorIds.add(snap.preacherId);
    for (const pid of snap.additionalPreacherIds ?? []) authorIds.add(pid);
    if (snap.interpreterId) authorIds.add(snap.interpreterId);
  }

  const verseIdSet = new Set<string>(draft.scriptureRefIds ?? []);
  for (const vid of published?.scriptureRefIds ?? []) verseIdSet.add(vid);
  const verseIds = [...verseIdSet];

  const relatedIdSet = new Set<string>(draft.relatedSermonIds ?? []);
  for (const rid of published?.relatedSermonIds ?? []) relatedIdSet.add(rid);
  const relatedIds = [...relatedIdSet];

  const [mediaRes, authorEntries, verseEntries, relatedEntries, pdfJob] =
    await Promise.all([
      refs.mediaIds.length > 0
        ? getMediaByIds(caller, refs.mediaIds)
        : Promise.resolve({ ok: true as const, items: [] as MediaDoc[] }),
      Promise.all(
        [...authorIds].map(async (aid) => {
          const res = await authorService.getById(caller, aid);
          if (!res.ok) return null;
          return [
            aid,
            {
              id: res.doc._id,
              label: res.doc.draft.name,
              status: res.status,
              ...(res.doc.draft.avatarMediaId && {
                avatarMediaId: res.doc.draft.avatarMediaId,
              }),
            } satisfies ContentPickerOption,
          ] as const;
        }),
      ),
      Promise.all(
        verseIds.map(async (vid) => {
          const [vRes, usageRes] = await Promise.all([
            bibleVerseService.getById(caller, vid),
            bibleVerseService.findUsages(caller, vid),
          ]);
          if (!vRes.ok) return null;
          return {
            item: {
              id: vRes.doc._id,
              fields: vRes.doc.draft,
              status: vRes.status,
              revision: vRes.doc.revision,
            } satisfies BibleVersePickerItem,
            usageCount: usageRes.ok ? usageRes.usedBy.length : 0,
          };
        }),
      ),
      Promise.all(
        relatedIds.map(async (rid) => {
          const res = await sermonService.getById(caller, rid);
          if (!res.ok) return null;
          const secondaryParts = [
            res.doc.draft.sermonDate
              ? formatShortDate(res.doc.draft.sermonDate, locale)
              : undefined,
            res.doc.draft.slug,
          ].filter(Boolean);
          return [
            rid,
            {
              id: res.doc._id,
              label: res.doc.draft.title["es-AR"] || res.doc._id,
              ...(secondaryParts.length > 0 && {
                secondary: secondaryParts.join(" · "),
              }),
              status: res.status,
            } satisfies ContentPickerOption,
          ] as const;
        }),
      ),
      getContentPdfJob(loaded.doc._id),
    ]);

  const initialMedia: Record<string, SerializedMediaDoc> = {};
  if (mediaRes.ok) {
    for (const m of mediaRes.items) {
      initialMedia[m._id] = serializeMedia(m);
    }
  }

  const initialAuthors: Record<string, ContentPickerOption> = {};
  for (const entry of authorEntries) {
    if (entry) initialAuthors[entry[0]] = entry[1];
  }

  const initialVerses: BibleVersePickerItem[] = [];
  const verseUsageCounts: Record<string, number> = {};
  for (const entry of verseEntries) {
    if (!entry) continue;
    initialVerses.push(entry.item);
    verseUsageCounts[entry.item.id] = entry.usageCount;
  }

  const initialRelatedSermons: Record<string, ContentPickerOption> = {};
  for (const entry of relatedEntries) {
    if (entry) initialRelatedSermons[entry[0]] = entry[1];
  }

  const pdfMap: Partial<Record<Locale, SerializedMediaDoc>> = {};
  const esPdfId = draft.pdfSummaryMediaId?.["es-AR"];
  const enPdfId = draft.pdfSummaryMediaId?.["en-US"];
  if (esPdfId && initialMedia[esPdfId]) pdfMap["es-AR"] = initialMedia[esPdfId];
  if (enPdfId && initialMedia[enPdfId]) pdfMap["en-US"] = initialMedia[enPdfId];

  const esPdfState = deriveSermonPdfUiState({
    job: pdfJob,
    hasPdfForLocale: Boolean(pdfMap["es-AR"]),
  });
  const enPdfState = deriveSermonPdfUiState({
    job: pdfJob,
    hasPdfForLocale: Boolean(pdfMap["en-US"]),
  });

  const initialPdfStatus: SerializedSermonPdfStatus = {
    stateByLocale: { "es-AR": esPdfState, "en-US": enPdfState },
    isPending: esPdfState === "pending" || enPdfState === "pending",
    version: pdfJob?.version ?? 0,
    ...(pdfJob?.lastRenderedAt && {
      lastRenderedAt: pdfJob.lastRenderedAt.toISOString(),
    }),
    ...(pdfJob?.lastError && { lastError: pdfJob.lastError }),
    pdfs: pdfMap,
  };

  return (
    <SermonEditor
      docId={loaded.doc._id}
      initialDoc={serializeDocView(loaded)}
      initialStatus={loaded.status}
      initialValues={draft}
      permissions={extractPermissions(authz)}
      canManageMedia={authz.permissions.has("media:manage")}
      isTrialMode={isContentTrialMode()}
      isPublishEmailsEnabled={isPublishEmailsEnabled()}
      liveUrl={buildLiveSermonUrl(loaded.doc.published?.slug, locale)}
      initialAuthors={initialAuthors}
      initialVerses={initialVerses}
      verseUsageCounts={verseUsageCounts}
      initialRelatedSermons={initialRelatedSermons}
      initialMedia={initialMedia}
      initialPdfStatus={initialPdfStatus}
    />
  );
}
