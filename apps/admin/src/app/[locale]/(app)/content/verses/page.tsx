import { getTranslations } from "next-intl/server";
import type { Locale } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  ContentListView,
  type ContentListRow,
} from "@src/components/content/content-list-view";
import { callerFromAuthorized } from "@src/lib/content/caller";
import {
  compareBibleVerses,
  formatVerseReference,
  getVerseVersionLabel,
} from "@src/lib/content/bible-books";
import { getEntryEditorHref, getNewEntryHref } from "@src/lib/content/routes";
import { bibleVerseService } from "@src/service/content/collections";
import {
  LIST_PAGE_SIZE,
  parseListSearchParams,
  requireContentPageAuth,
} from "../shell-helpers";

export default async function VersesListPage({
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

  const panelLocale = (locale === "en-US" ? "en-US" : "es-AR") as Locale;
  const sp = parseListSearchParams(await searchParams);
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const listed = await bibleVerseService.list(caller, {
    page: 1,
    pageSize: 500,
  });
  const allItems = listed.ok ? listed.items : [];
  const needle = sp.q.toLowerCase();

  const filtered = allItems
    .filter((item) => {
      if (!needle) return true;
      const d = item.doc.draft;
      const haystack = [
        d.book["es-AR"],
        d.book["en-US"],
        `${d.chapter}:${d.fromVerse}${d.toVerse ? `-${d.toVerse}` : ""}`,
        getVerseVersionLabel(d, "es-AR"),
        getVerseVersionLabel(d, "en-US"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => compareBibleVerses(a.doc.draft, b.doc.draft));

  const total = filtered.length;
  const start = (sp.page - 1) * LIST_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIST_PAGE_SIZE);

  // Resolve usage count only for the visible page (<= 25 entries)
  const usageCounts = await Promise.all(
    pageItems.map(async (item) => {
      const res = await bibleVerseService.findUsages(caller, item.doc._id);
      return res.ok ? res.usedBy.length : 0;
    }),
  );

  const rows: ContentListRow[] = pageItems.map((item, idx) => {
    const ref = formatVerseReference(item.doc.draft, panelLocale);
    const version = getVerseVersionLabel(item.doc.draft, panelLocale) || "—";
    const usedCount = usageCounts[idx] ?? 0;
    const usedText = t("lists.usedInCount", { count: usedCount });
    return {
      id: item.doc._id,
      href: getEntryEditorHref("bible_verses", item.doc._id),
      title: ref,
      status: item.status,
      mobileSecondary: `${version} · ${usedText}`,
      cells: {
        version,
        usedIn: usedText,
      },
    };
  });

  return (
    <ContentListView
      baseHref="/content/verses"
      title={t("types.verses")}
      newHref={
        authz.permissions.has("content:write")
          ? getNewEntryHref("bible_verses")
          : undefined
      }
      newLabel={t("action.new.verses")}
      enableSearch
      searchPlaceholder={t("lists.searchByVerse")}
      currentQuery={sp.q}
      currentStatus=""
      page={sp.page}
      pageSize={LIST_PAGE_SIZE}
      total={total}
      emptyMessage={t("lists.empty.verses")}
      columns={[
        { key: "reference", label: t("lists.columns.reference") },
        { key: "version", label: t("lists.columns.version") },
        { key: "usedIn", label: t("lists.columns.usedIn") },
        { key: "status", label: t("lists.columns.status") },
      ]}
      rows={rows}
    />
  );
}
