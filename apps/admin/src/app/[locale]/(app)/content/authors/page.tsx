import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  AuthorsListView,
  type AuthorListRow,
} from "@src/components/content/editorial/authors-list-view";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { getEntryEditorHref, getNewEntryHref } from "@src/lib/content/routes";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import { authorService } from "@src/service/content/collections";
import { loadAuthorListAvatars } from "@src/service/content/editorial/editorial-loaders.service";
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
  const avatarMap = await loadAuthorListAvatars(caller, pageItems);

  const rows: AuthorListRow[] = pageItems.map((item) => {
    const avatar = item.doc.draft.avatarMediaId
      ? avatarMap[item.doc.draft.avatarMediaId]
      : undefined;
    const updated = `${formatAdminTimestamp(item.doc.updatedAt, locale)} · ${item.updatedByLabel || item.doc.updatedBy}`;
    return {
      id: item.doc._id,
      href: getEntryEditorHref("authors", item.doc._id),
      name: item.doc.draft.name,
      ...(avatar ? { avatarUrl: avatar.url, avatarAlt: avatar.alt } : {}),
      status: item.status,
      updated,
    };
  });

  return (
    <AuthorsListView
      newHref={
        authz.permissions.has("content:write")
          ? getNewEntryHref("authors")
          : undefined
      }
      currentQuery={sp.q}
      page={sp.page}
      pageSize={LIST_PAGE_SIZE}
      total={total}
      rows={rows}
    />
  );
}
