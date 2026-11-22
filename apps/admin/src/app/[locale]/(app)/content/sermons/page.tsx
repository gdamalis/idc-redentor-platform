import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  ContentListView,
  type ContentListRow,
} from "@src/components/content/content-list-view";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { getEntryEditorHref, getNewEntryHref } from "@src/lib/content/routes";
import {
  countMissingEnglishInDraft,
  formatAdminTimestamp,
  formatShortDate,
  isNeedsReviewDraft,
} from "@src/lib/content/status-helpers";
import { authorService, sermonService } from "@src/service/content/collections";
import {
  LIST_PAGE_SIZE,
  parseListSearchParams,
  requireContentPageAuth,
} from "../shell-helpers";

export default async function SermonsListPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const sp = parseListSearchParams(await searchParams);
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const [listed, authors] = await Promise.all([
    sermonService.list(caller, {
      page: 1,
      pageSize: 500,
      ...(sp.status ? { status: sp.status as "draft" | "changed" | "published" } : {}),
    }),
    authorService.list(caller, { page: 1, pageSize: 500 }),
  ]);

  const authorMap = new Map<string, string>();
  if (authors.ok) {
    for (const a of authors.items) {
      authorMap.set(a.doc._id, a.doc.draft.name);
    }
  }

  const needle = sp.q.toLowerCase();
  const filtered = (listed.ok ? listed.items : [])
    .filter((item) => {
      if (!needle) return true;
      const d = item.doc.draft;
      return [d.title["es-AR"], d.title["en-US"], d.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      const da = a.doc.draft.sermonDate ?? "";
      const db = b.doc.draft.sermonDate ?? "";
      if (da !== db) return db.localeCompare(da);
      return b.doc.updatedAt.getTime() - a.doc.updatedAt.getTime();
    });

  const total = filtered.length;
  const start = (sp.page - 1) * LIST_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIST_PAGE_SIZE);

  const rows: ContentListRow[] = pageItems.map((item) => {
    const d = item.doc.draft;
    const date = formatShortDate(d.sermonDate, locale);
    const preacher =
      (d.preacherId ? authorMap.get(d.preacherId) : undefined) ?? "—";
    const updated = `${formatAdminTimestamp(item.doc.updatedAt, locale)} · ${item.updatedByLabel || item.doc.updatedBy}`;
    const missingEnglish = countMissingEnglishInDraft(d) > 0;
    return {
      id: item.doc._id,
      href: getEntryEditorHref("sermons", item.doc._id),
      title: d.title["es-AR"] || item.doc._id,
      status: item.status,
      isNeedsReview: isNeedsReviewDraft(item.doc),
      missingEnglish,
      showLanguageBadges: true,
      mobileSecondary: `${date} · ${preacher}`,
      cells: {
        date,
        preacher,
        updated,
      },
    };
  });

  return (
    <ContentListView
      baseHref="/content/sermons"
      title={t("types.sermons")}
      newHref={
        authz.permissions.has("content:write")
          ? getNewEntryHref("sermons")
          : undefined
      }
      newLabel={t("action.new.sermons")}
      enableSearch
      enableStatusFilter
      searchPlaceholder={t("lists.searchByTitle")}
      currentQuery={sp.q}
      currentStatus={sp.status}
      page={sp.page}
      pageSize={LIST_PAGE_SIZE}
      total={total}
      emptyMessage={t("lists.empty.sermons")}
      columns={[
        { key: "title", label: t("lists.columns.title") },
        { key: "date", label: t("lists.columns.date") },
        { key: "preacher", label: t("lists.columns.preacher") },
        { key: "status", label: t("lists.columns.status") },
        { key: "languages", label: t("lists.columns.languages") },
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
