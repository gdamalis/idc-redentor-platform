import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Plus, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ContentStatus } from "@idcr/content";
import { Link } from "@src/i18n/routing";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import { Select } from "@src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@src/components/ui/table";
import {
  MissingEnChip,
  NeedsReviewChip,
  ProtectedChip,
  StatusChip,
} from "./status-chip";

export interface ContentListColumn {
  readonly key: string;
  readonly label: string;
  /** Hides the column below `lg` (e.g. "Actualizado" per wireframe §3.1). */
  readonly desktopWideOnly?: boolean;
}

export interface ContentListRow {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  /** Optional monospace fixed-entry machineName rendered under title with lock icon. */
  readonly machineName?: string;
  readonly status: ContentStatus;
  readonly isNeedsReview?: boolean;
  readonly isProtected?: boolean;
  readonly missingEnglish?: boolean;
  readonly showLanguageBadges?: boolean;
  /** One-line secondary summary for mobile stacked cards (< md). */
  readonly mobileSecondary?: string;
  /** Cell text keyed by `ContentListColumn.key`. */
  readonly cells: Readonly<Record<string, string>>;
}

export interface ContentListViewProps {
  readonly baseHref: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly newHref?: string;
  readonly newLabel?: string;
  readonly searchPlaceholder?: string;
  readonly enableSearch?: boolean;
  readonly enableStatusFilter?: boolean;
  readonly currentQuery: string;
  readonly currentStatus: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly columns: readonly ContentListColumn[];
  readonly rows: readonly ContentListRow[];
  readonly emptyMessage: string;
}

function buildPageHref(
  baseHref: string,
  params: { q?: string; status?: string; page?: number },
): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `${baseHref}?${qs}` : baseHref;
}

/**
 * Server-rendered responsive list view (`F-editor-ux-decisions.md` §2.1,
 * wireframes §3.1–3.2): URL-driven search/status/page, semantic `<Table>` at
 * `>= md`, stacked cards below `md`, zero row actions, zero bulk actions.
 */
export async function ContentListView({
  baseHref,
  title,
  subtitle,
  newHref,
  newLabel,
  searchPlaceholder,
  enableSearch = false,
  enableStatusFilter = false,
  currentQuery,
  currentStatus,
  page,
  pageSize,
  total,
  columns,
  rows,
  emptyMessage,
}: ContentListViewProps) {
  const t = await getTranslations("content");
  const hasFilters = Boolean(currentQuery.trim() || currentStatus.trim());
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/content"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>{t("header.backToHub")}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {newHref && newLabel && (
          <Button asChild className="w-full sm:w-auto">
            <Link href={newHref}>
              <Plus className="size-4" aria-hidden="true" />
              <span>{newLabel}</span>
            </Link>
          </Button>
        )}
      </div>

      {(enableSearch || enableStatusFilter) && (
        <form
          method="GET"
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          {enableSearch && (
            <div className="relative flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="q"
                defaultValue={currentQuery}
                placeholder={searchPlaceholder ?? t("lists.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          )}

          {enableStatusFilter && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="content-status-filter"
                className="shrink-0 text-sm text-muted-foreground"
              >
                {t("lists.statusFilterLabel")}:
              </label>
              <Select
                id="content-status-filter"
                name="status"
                defaultValue={currentStatus}
                className="sm:w-52"
              >
                <option value="">{t("lists.statusAll")}</option>
                <option value="draft">{t("status.draft")}</option>
                <option value="changed">{t("status.changed")}</option>
                <option value="published">{t("status.published")}</option>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="outline" size="sm">
              {t("action.confirm")}
            </Button>
            {hasFilters && (
              <Button asChild variant="ghost" size="sm">
                <Link href={baseHref}>{t("action.clearFilters")}</Link>
              </Button>
            )}
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            {hasFilters ? t("lists.empty.filtered") : emptyMessage}
          </p>
          {hasFilters ? (
            <Button asChild variant="outline" size="sm">
              <Link href={baseHref}>{t("action.clearFilters")}</Link>
            </Button>
          ) : (
            newHref &&
            newLabel && (
              <Button asChild size="sm">
                <Link href={newHref}>
                  <Plus className="size-4" aria-hidden="true" />
                  <span>{newLabel}</span>
                </Link>
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          {/* Desktop table (>= md) */}
          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={
                        col.desktopWideOnly ? "hidden lg:table-cell" : undefined
                      }
                    >
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="relative">
                    {columns.map((col, idx) => {
                      if (idx === 0) {
                        return (
                          <TableCell key={col.key} className="font-medium">
                            <Link
                              href={row.href}
                              className="block after:absolute after:inset-0 hover:underline"
                            >
                              <span>{row.title}</span>
                              {row.machineName && (
                                <span className="mt-0.5 flex items-center gap-1 font-mono text-xs font-normal text-muted-foreground">
                                  <Lock className="size-3" aria-hidden="true" />
                                  {row.machineName}
                                </span>
                              )}
                            </Link>
                          </TableCell>
                        );
                      }

                      if (col.key === "status") {
                        return (
                          <TableCell key={col.key}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusChip
                                status={row.status}
                                label={t(`status.${row.status}`)}
                              />
                              {row.isProtected && (
                                <ProtectedChip label={t("chip.protected")} />
                              )}
                              {row.isNeedsReview && (
                                <NeedsReviewChip label={t("chip.needsReview")} />
                              )}
                            </div>
                          </TableCell>
                        );
                      }

                      if (col.key === "languages" && row.showLanguageBadges) {
                        return (
                          <TableCell key={col.key}>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                                {t("chip.es")}
                              </span>
                              {row.missingEnglish ? (
                                <MissingEnChip label={t("chip.missingEn")} />
                              ) : (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                                  {t("chip.en")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      }

                      return (
                        <TableCell
                          key={col.key}
                          className={
                            col.desktopWideOnly
                              ? "hidden text-muted-foreground lg:table-cell"
                              : "text-muted-foreground"
                          }
                        >
                          {row.cells[col.key] ?? "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards (< md) */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="block rounded-md border border-border bg-background p-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="font-medium leading-snug text-foreground">
                    {row.title}
                  </div>
                  {row.machineName && (
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden="true" />
                      {row.machineName}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusChip
                      status={row.status}
                      label={t(`status.${row.status}`)}
                    />
                    {row.isProtected && (
                      <ProtectedChip label={t("chip.protected")} />
                    )}
                    {row.isNeedsReview && (
                      <NeedsReviewChip label={t("chip.needsReview")} />
                    )}
                    {row.showLanguageBadges && row.missingEnglish && (
                      <MissingEnChip label={t("chip.missingEn")} />
                    )}
                  </div>
                  {row.mobileSecondary && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {row.mobileSecondary}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row">
            <span>{t("lists.showingRange", { from, to, total })}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  asChild={page > 1}
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                >
                  {page > 1 ? (
                    <Link
                      href={buildPageHref(baseHref, {
                        q: currentQuery,
                        status: currentStatus,
                        page: page - 1,
                      })}
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      <span>{t("action.previous")}</span>
                    </Link>
                  ) : (
                    <>
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      <span>{t("action.previous")}</span>
                    </>
                  )}
                </Button>
                <Button
                  asChild={page < totalPages}
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                >
                  {page < totalPages ? (
                    <Link
                      href={buildPageHref(baseHref, {
                        q: currentQuery,
                        status: currentStatus,
                        page: page + 1,
                      })}
                    >
                      <span>{t("action.next")}</span>
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <>
                      <span>{t("action.next")}</span>
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
