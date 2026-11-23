import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ContentStatus } from "@idcr/content";
import { Link } from "@src/i18n/routing";
import { StatusChip } from "@src/components/content/status-chip";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@src/components/ui/table";
import { buildPersonInitials } from "@src/service/content/editorial/editorial-rules";

export interface AuthorListRow {
  readonly id: string;
  readonly href: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly avatarAlt?: string;
  readonly status: ContentStatus;
  readonly updated: string;
}

export interface AuthorsListViewProps {
  readonly newHref?: string;
  readonly currentQuery: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly rows: readonly AuthorListRow[];
}

function buildPageHref(q: string, page: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/content/authors?${qs}` : "/content/authors";
}

function AuthorAvatar({
  name,
  url,
  alt,
}: {
  readonly name: string;
  readonly url?: string;
  readonly alt?: string;
}) {
  if (url) {
    return (
      <div className="relative size-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        <Image
          src={url}
          alt={alt ?? name}
          fill
          unoptimized
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
      aria-hidden="true"
    >
      {buildPersonInitials(name)}
    </div>
  );
}

/**
 * Server-rendered `/content/authors` list (`F-editor-ux-decisions.md` §2.1):
 * Nombre (with avatar thumbnail or initials fallback), Estado, Actualizado (`lg+`),
 * URL-driven search (`?q=`), 25/page, stacked mobile cards below `md`.
 */
export async function AuthorsListView({
  newHref,
  currentQuery,
  page,
  pageSize,
  total,
  rows,
}: AuthorsListViewProps) {
  const t = await getTranslations("content");
  const hasFilters = Boolean(currentQuery.trim());
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
          <h1 className="text-2xl font-bold tracking-tight">
            {t("types.authors")}
          </h1>
        </div>

        {newHref && (
          <Button asChild className="w-full sm:w-auto">
            <Link href={newHref}>
              <Plus className="size-4" aria-hidden="true" />
              <span>{t("action.new.authors")}</span>
            </Link>
          </Button>
        )}
      </div>

      <form
        method="GET"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            defaultValue={currentQuery}
            placeholder={t("lists.searchByName")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="outline" size="sm">
            {t("action.confirm")}
          </Button>
          {hasFilters && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/content/authors">{t("action.clearFilters")}</Link>
            </Button>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            {hasFilters ? t("lists.empty.filtered") : t("lists.empty.authors")}
          </p>
          {hasFilters ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/content/authors">{t("action.clearFilters")}</Link>
            </Button>
          ) : (
            newHref && (
              <Button asChild size="sm">
                <Link href={newHref}>
                  <Plus className="size-4" aria-hidden="true" />
                  <span>{t("action.new.authors")}</span>
                </Link>
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("lists.columns.name")}</TableHead>
                  <TableHead>{t("lists.columns.status")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("lists.columns.updated")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="relative">
                    <TableCell className="font-medium">
                      <Link
                        href={row.href}
                        className="flex items-center gap-3 after:absolute after:inset-0 hover:underline"
                      >
                        <AuthorAvatar
                          name={row.name}
                          url={row.avatarUrl}
                          alt={row.avatarAlt}
                        />
                        <span>{row.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        status={row.status}
                        label={t(`status.${row.status}`)}
                      />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {row.updated}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-md border border-border bg-background p-3.5 transition-colors hover:bg-muted/40"
                >
                  <AuthorAvatar
                    name={row.name}
                    url={row.avatarUrl}
                    alt={row.avatarAlt}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium leading-snug text-foreground">
                      {row.name}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusChip
                        status={row.status}
                        label={t(`status.${row.status}`)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {row.updated}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

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
                    <Link href={buildPageHref(currentQuery, page - 1)}>
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
                    <Link href={buildPageHref(currentQuery, page + 1)}>
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
