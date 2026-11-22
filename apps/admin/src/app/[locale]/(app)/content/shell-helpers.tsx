import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  SITE_PAGES,
  findFixedEntry,
  getFixedEntriesByType,
  type FixedEntryType,
  type Locale,
} from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  ContentListView,
  type ContentListRow,
} from "@src/components/content/content-list-view";
import {
  ContentShellEditor,
  type ShellEditableField,
} from "@src/components/content/content-shell-editor";
import { redirect } from "@src/i18n/routing";
import { callerFromAuthorized } from "@src/lib/content/caller";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { COLLECTION_META, extractEntryLabel, isEntryProtected } from "@src/lib/content/guards";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import { getEntryEditorHref } from "@src/lib/content/routes";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import {
  requirePermission,
  type Authorized,
} from "@src/lib/rbac/require-permission";
import type {
  ContentDocumentView,
} from "@src/service/content/content-core.service";
import {
  getContentById,
  getContentByNaturalKey,
  listContent,
} from "@src/service/content/content-core.service";
import type { SerializedContentDoc } from "./actions";

export const LIST_PAGE_SIZE = 25;

export async function requireContentPageAuth(
  locale: string,
): Promise<Authorized | null> {
  const authz = await requirePermission("content:read");
  if (authz.ok) return authz;
  if (authz.reason === "forbidden") return null;
  redirect({
    href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
    locale,
  });
  return null;
}

export function extractPermissions(authz: Authorized) {
  return {
    canWrite: authz.permissions.has("content:write"),
    canPublish: authz.permissions.has("content:publish"),
    canPublishProtected: authz.permissions.has("content:publish-protected"),
  };
}

export function serializeDocView<TFields>(
  view: ContentDocumentView<TFields>,
): SerializedContentDoc<TFields> {
  const { doc, updatedByLabel } = view;
  return {
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
    ...(doc.sourceContentfulId !== undefined && {
      sourceContentfulId: doc.sourceContentfulId,
    }),
  };
}

export function parseListSearchParams(sp: {
  readonly q?: string | string[];
  readonly status?: string | string[];
  readonly page?: string | string[];
}): { readonly q: string; readonly status: string; readonly page: number } {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  const q = first(sp.q).trim();
  const rawStatus = first(sp.status).trim();
  const status =
    rawStatus === "draft" || rawStatus === "changed" || rawStatus === "published"
      ? rawStatus
      : "";
  const parsedPage = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return { q, status, page };
}

export async function renderShellEditPage(input: {
  readonly locale: string;
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly fixedMachineName?: string;
  readonly backHref: string;
  readonly backLabelKey: string;
  readonly editableField: ShellEditableField;
  readonly defaultDraft?: Record<string, unknown>;
}) {
  const authz = await requireContentPageAuth(input.locale);
  if (!authz) return <PermissionDenied />;

  const t = await getTranslations("content");
  const panelLocale = (
    input.locale === "en-US" ? "en-US" : "es-AR"
  ) as Locale;
  const caller = callerFromAuthorized(authz);

  let view: ContentDocumentView<Record<string, unknown>> | null = null;
  if (input.docId) {
    const loaded = await getContentById<Record<string, unknown>>(
      caller,
      input.collection,
      input.docId,
    );
    if (!loaded.ok) notFound();
    view = loaded;
  } else if (input.fixedMachineName) {
    const loaded = await getContentByNaturalKey<Record<string, unknown>>(
      caller,
      input.collection as Exclude<ContentCollectionName, "authors">,
      input.fixedMachineName,
    );
    if (!loaded.ok) notFound();
    view = loaded;
  }

  const draft = view ? view.doc.draft : (input.defaultDraft ?? {});
  const isFixed = COLLECTION_META[input.collection].kind === "fixed";
  const machineName =
    typeof draft.machineName === "string"
      ? draft.machineName
      : input.fixedMachineName;
  const fixedMeta =
    isFixed && machineName
      ? findFixedEntry(
          COLLECTION_META[input.collection].contentType as FixedEntryType,
          machineName,
        )
      : undefined;

  const isProtected = isEntryProtected(
    input.collection,
    draft,
    view?.doc.published,
  );

  const fallbackTitle = fixedMeta
    ? fixedMeta.name[panelLocale]
    : view
      ? extractEntryLabel(input.collection, draft, view.doc._id)
      : t("header.newEntry");

  return (
    <ContentShellEditor
      collection={input.collection}
      docId={view?.doc._id}
      initialDoc={view ? serializeDocView(view) : undefined}
      initialStatus={view ? view.status : "draft"}
      initialValues={draft}
      backHref={input.backHref}
      backLabel={t(input.backLabelKey as never)}
      fallbackTitle={fallbackTitle}
      editableField={input.editableField}
      permissions={extractPermissions(authz)}
      isTrialMode={isContentTrialMode()}
      isPublishEmailsEnabled={isPublishEmailsEnabled()}
      isProtected={isProtected}
      protectedKind={
        input.collection === "belief_collections" ? "doctrine" : "legal"
      }
      fixedIdentifier={isFixed ? machineName : undefined}
      fixedLayout={
        input.collection === "sections" && typeof draft.layout === "string"
          ? draft.layout
          : undefined
      }
      fixedAppearsOn={fixedMeta?.appearsOn.map(
        (slug) => SITE_PAGES[slug].label[panelLocale],
      )}
    />
  );
}

/**
 * Renders a fixed-entry list (`sections`, `belief_collections`, `seo_entries`)
 * sorted strictly in `FIXED_ENTRIES` registry order with friendly names,
 * read-only `machineName 🔒`, "Aparece en", and NO New button or filters (UX §2.1 & §2.8).
 */
export async function renderFixedListPage(input: {
  readonly locale: string;
  readonly collection: "sections" | "belief_collections" | "seo_entries";
  readonly fixedType: FixedEntryType;
  readonly baseHref: string;
  readonly titleKey: string;
}) {
  const authz = await requireContentPageAuth(input.locale);
  if (!authz) return <PermissionDenied />;

  const panelLocale = (input.locale === "en-US" ? "en-US" : "es-AR") as Locale;
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const listed = await listContent<Record<string, unknown>>(
    caller,
    input.collection,
    { page: 1, pageSize: 100 },
  );
  const byMachine = new Map<string, ContentDocumentView<Record<string, unknown>>>();
  if (listed.ok) {
    for (const item of listed.items) {
      const m = item.doc.draft.machineName;
      if (typeof m === "string") byMachine.set(m, item);
    }
  }

  const registryEntries = getFixedEntriesByType(input.fixedType);
  const rows: ContentListRow[] = [];

  for (const meta of registryEntries) {
    const view = byMachine.get(meta.machineName);
    if (!view) continue;
    const pages = meta.appearsOn.map((s) => SITE_PAGES[s].label[panelLocale]);
    const appearsOn =
      pages.length <= 2
        ? pages.join(", ")
        : `${pages.slice(0, 2).join(", ")}, +${pages.length - 2}`;
    const updated = `${formatAdminTimestamp(view.doc.updatedAt, input.locale)} · ${view.updatedByLabel || view.doc.updatedBy}`;

    rows.push({
      id: view.doc._id,
      href: getEntryEditorHref(input.collection, view.doc._id),
      title: meta.name[panelLocale],
      machineName: meta.machineName,
      status: view.status,
      isProtected: COLLECTION_META[input.collection].isProtectedByType,
      mobileSecondary: appearsOn,
      cells: {
        appearsOn,
        updated,
      },
    });
  }

  return (
    <ContentListView
      baseHref={input.baseHref}
      title={t(input.titleKey as never)}
      subtitle={t("fixed.note")}
      currentQuery=""
      currentStatus=""
      page={1}
      pageSize={LIST_PAGE_SIZE}
      total={rows.length}
      emptyMessage={t("lists.empty.fixed")}
      columns={[
        { key: "name", label: t("lists.columns.name") },
        { key: "appearsOn", label: t("lists.columns.appearsOn") },
        { key: "status", label: t("lists.columns.status") },
        {
          key: "updated",
          label: t("lists.columns.updated"),
          desktopWideOnly: true,
        },
      ]}
      rows={rows}
    />
  );
}
