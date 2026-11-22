import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  ContentListView,
  type ContentListRow,
} from "@src/components/content/content-list-view";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { getEntryEditorHref, getNewEntryHref } from "@src/lib/content/routes";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import { topicService } from "@src/service/content/collections";
import {
  LIST_PAGE_SIZE,
  parseListSearchParams,
  requireContentPageAuth,
} from "../shell-helpers";

export default async function TopicsListPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const sp = parseListSearchParams(await searchParams);
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const listed = await topicService.list(caller, { page: 1, pageSize: 500 });
  const sorted = (listed.ok ? listed.items : []).sort((a, b) =>
    (a.doc.draft.name["es-AR"] ?? "").localeCompare(
      b.doc.draft.name["es-AR"] ?? "",
      locale,
    ),
  );

  const total = sorted.length;
  const start = (sp.page - 1) * LIST_PAGE_SIZE;
  const pageItems = sorted.slice(start, start + LIST_PAGE_SIZE);

  const rows: ContentListRow[] = pageItems.map((item) => {
    const d = item.doc.draft;
    const slugs = [d.slug?.["es-AR"], d.slug?.["en-US"]]
      .filter(Boolean)
      .map((s) => `/${s}`)
      .join(" · ");
    const updated = `${formatAdminTimestamp(item.doc.updatedAt, locale)} · ${item.updatedByLabel || item.doc.updatedBy}`;
    return {
      id: item.doc._id,
      href: getEntryEditorHref("topics", item.doc._id),
      title: d.name["es-AR"] || item.doc._id,
      status: item.status,
      isProtected:
        d.protected === true || item.doc.published?.protected === true,
      mobileSecondary: slugs || "—",
      cells: {
        slug: slugs || "—",
        updated,
      },
    };
  });

  return (
    <ContentListView
      baseHref="/content/topics"
      title={t("types.topics")}
      newHref={
        authz.permissions.has("content:write")
          ? getNewEntryHref("topics")
          : undefined
      }
      newLabel={t("action.new.topics")}
      currentQuery=""
      currentStatus=""
      page={sp.page}
      pageSize={LIST_PAGE_SIZE}
      total={total}
      emptyMessage={t("lists.empty.topics")}
      columns={[
        { key: "name", label: t("lists.columns.name") },
        { key: "slug", label: t("lists.columns.slug") },
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
