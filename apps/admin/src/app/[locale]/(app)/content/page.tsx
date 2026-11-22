import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ContentStatus, PostFields, SermonFields } from "@idcr/content";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import {
  NeedsReviewChip,
  ProtectedChip,
  StatusChip,
} from "@src/components/content/status-chip";
import { Link } from "@src/i18n/routing";
import { callerFromAuthorized } from "@src/lib/content/caller";
import {
  getDestinationsByGroup,
  getEntryEditorHref,
  type HubGroupKey,
} from "@src/lib/content/routes";
import {
  formatAdminTimestamp,
  isNeedsReviewDraft,
} from "@src/lib/content/status-helpers";
import {
  authorService,
  beliefCollectionService,
  bibleVerseService,
  postService,
  sectionService,
  seoEntryService,
  sermonService,
  topicService,
} from "@src/service/content/collections";
import { requireContentPageAuth } from "./shell-helpers";

interface ReviewShortcut {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly status: ContentStatus;
  readonly isServiceDraft: boolean;
  readonly updatedAt: Date;
}

const HUB_GROUPS: readonly HubGroupKey[] = [
  "publishing",
  "sitePages",
  "site",
  "library",
];

export default async function ContentHubPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const [sermons, posts, topics, sections, beliefs, seo, authors, verses] =
    await Promise.all([
      sermonService.list(caller, { page: 1, pageSize: 500 }),
      postService.list(caller, { page: 1, pageSize: 500 }),
      topicService.list(caller, { page: 1, pageSize: 500 }),
      sectionService.list(caller, { page: 1, pageSize: 500 }),
      beliefCollectionService.list(caller, { page: 1, pageSize: 500 }),
      seoEntryService.list(caller, { page: 1, pageSize: 500 }),
      authorService.list(caller, { page: 1, pageSize: 500 }),
      bibleVerseService.list(caller, { page: 1, pageSize: 500 }),
    ]);

  const counts: Partial<Record<string, number>> = {
    sermons: sermons.ok ? sermons.total : 0,
    posts: posts.ok ? posts.total : 0,
    topics: topics.ok ? topics.total : 0,
    sections: sections.ok ? sections.total : 0,
    beliefCollections: beliefs.ok ? beliefs.total : 0,
    seo: seo.ok ? seo.total : 0,
    authors: authors.ok ? authors.total : 0,
    verses: verses.ok ? verses.total : 0,
  };

  // "Para revisar": up to 5 sermons and posts in draft or changed status, newest first (UX §2.1)
  const reviewItems: ReviewShortcut[] = [];
  if (sermons.ok) {
    for (const item of sermons.items) {
      if (item.status === "published") continue;
      const d: SermonFields = item.doc.draft;
      reviewItems.push({
        id: `sermon:${item.doc._id}`,
        href: getEntryEditorHref("sermons", item.doc._id),
        title: d.title["es-AR"] || item.doc._id,
        typeLabel: t("types.sermons"),
        status: item.status,
        isServiceDraft: isNeedsReviewDraft(item.doc),
        updatedAt: item.doc.updatedAt,
      });
    }
  }
  if (posts.ok) {
    for (const item of posts.items) {
      if (item.status === "published") continue;
      const d: PostFields = item.doc.draft;
      reviewItems.push({
        id: `post:${item.doc._id}`,
        href: getEntryEditorHref("posts", item.doc._id),
        title: d.title["es-AR"] || item.doc._id,
        typeLabel: t("types.posts"),
        status: item.status,
        isServiceDraft: isNeedsReviewDraft(item.doc),
        updatedAt: item.doc.updatedAt,
      });
    }
  }
  reviewItems.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const topReview = reviewItems.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("hub.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hub.subtitle")}</p>
      </div>

      {/* Group 1: Para revisar */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("hub.groups.needsReview")}
        </h2>
        {topReview.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {t("hub.groups.needsReviewEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-background">
            {topReview.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.typeLabel} ·{" "}
                      {formatAdminTimestamp(item.updatedAt, locale)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <StatusChip
                      status={item.status}
                      label={t(`status.${item.status}`)}
                    />
                    {item.isServiceDraft && (
                      <NeedsReviewChip label={t("chip.needsReview")} />
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Groups 2–5: Publishing, Site pages, Site, Library */}
      {HUB_GROUPS.map((groupKey) => {
        const destinations = getDestinationsByGroup(groupKey);
        return (
          <section key={groupKey} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`hub.groups.${groupKey}`)}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {destinations.map((dest) => {
                const count = counts[dest.key];
                return (
                  <Link
                    key={dest.key}
                    href={dest.href}
                    className="group flex flex-col justify-between gap-3 rounded-md border border-border bg-background p-4 transition-colors hover:border-ring hover:bg-muted/30"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground group-hover:underline">
                          {t(`hub.destinations.${dest.key}`)}
                        </span>
                        {dest.isProtectedByType && (
                          <ProtectedChip label={t("chip.protected")} />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(`hub.destinations.${dest.key}Desc`)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {dest.isDirectEditor
                          ? t("hub.directEdit")
                          : count !== undefined
                            ? t("hub.entryCount", { count })
                            : ""}
                      </span>
                      <ArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
