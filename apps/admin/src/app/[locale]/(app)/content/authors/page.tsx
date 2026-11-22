import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  ContentListView,
  type ContentListRow,
} from "@src/components/content/content-list-view";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { getEntryEditorHref, getNewEntryHref } from "@src/lib/content/routes";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import { authorService } from "@src/service/content/collections";
import {
  LIST_PAGE_SIZE,
  parseListSearchParams,
  requireContentPageAuth,
} from "../shell-helpers";

export default async function AuthorsListPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const sp = parseListSearchParams(await searchParams);
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const listed = await authorService.list(caller, { page: 1, pageSize: 500 });
  const needle = sp.q.toLowerCase();
  const filtered = (listed.ok ? listed.items : [])
    .filter((item) => {
      if (!needle) return true;
      return item.doc.draft.name.toLowerCase().includes(needle);
    })
    .sort((a, b) => a.doc.draft.name.localeCompare(b.doc.draft.name, locale));

  const total = filtered.length;
  const start = (sp.page - 1) * LIST_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIST_PAGE_SIZE);

  const rows: ContentListRow[] = pageItems.map((item) => {
    const updated = `${formatAdminTimestamp(item.doc.updatedAt, locale)} · ${item.updatedByLabel || item.doc.updatedBy}`;
    return {
      id: item.doc._id,
      href: getEntryEditorHref("authors", item.doc._id),
      title: item.doc.draft.name,
      status: item.status,
      mobileSecondary: updated,
      cells: { updated },
    };
  });

  return (
    <ContentListView
      baseHref="/content/authors"
      title={t("types.authors")}
      newHref={
        authz.permissions.has("content:write")
          ? getNewEntryHref("authors")
          : undefined
      }
      newLabel={t("action.new.authors")}
      enableSearch
      searchPlaceholder={t("lists.searchByName")}
      currentQuery={sp.q}
      currentStatus=""
      page={sp.page}
      pageSize={LIST_PAGE_SIZE}
      total={total}
      emptyMessage={t("lists.empty.authors")}
      columns={[
        { key: "name", label: t("lists.columns.name") },
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
