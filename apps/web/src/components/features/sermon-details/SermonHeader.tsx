"use client";

import { useLocale, useTranslations } from "next-intl";
import { Typography } from "@src/components/ui/typography";
import { Divider } from "@src/components/ui/divider";
import { AuthorInfo } from "@src/components/features/blog-post-details/AuthorInfo";
import { SermonByline } from "./SermonByline";
import { formatDateLong } from "@src/utils/formatDate";
import type { Sermon } from "@src/types/Sermon";

interface SermonHeaderProps {
  readonly sermon: Pick<
    Sermon,
    "title" | "thesis" | "preacher" | "additionalPreachers" | "sermonDate"
  >;
}

export function SermonHeader({ sermon }: SermonHeaderProps) {
  const t = useTranslations("Sermons");
  const locale = useLocale();
  const formattedDate = formatDateLong(sermon.sermonDate, locale);

  // A multi-preacher service (e.g. four short messages) lists every preacher;
  // a normal sermon keeps the single-author card unchanged.
  const preachers = [sermon.preacher, ...(sermon.additionalPreachers ?? [])];

  return (
    <div className="flex flex-col gap-y-3">
      {/* Date overline */}
      <Typography
        component="p"
        variant="overline"
        className="font-semibold text-primary"
      >
        {formattedDate}
      </Typography>

      {/* Title */}
      <Typography component="h1" variant="h1" className="leading-tight">
        {sermon.title}
      </Typography>

      {/* Thesis as subtitle/lead */}
      {sermon.thesis && (
        <Typography component="p" variant="body">
          {sermon.thesis}
        </Typography>
      )}

      {/* Preacher */}
      <div className="flex flex-col gap-1">
        <Typography
          component="p"
          variant="overline"
          className="text-xs text-muted-foreground uppercase tracking-wide"
        >
          {t("preached-by")}
        </Typography>
        {preachers.length > 1 ? (
          <SermonByline preachers={preachers} publishedDate={sermon.sermonDate} />
        ) : (
          <AuthorInfo
            authorDetails={sermon.preacher}
            publishedDate={sermon.sermonDate}
          />
        )}
      </div>

      <Divider className="my-6" />
    </div>
  );
}
