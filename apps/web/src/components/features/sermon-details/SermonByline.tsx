"use client";

import Image from "next/image";
import { useLocale } from "next-intl";
import { Typography } from "@src/components/ui/typography";
import { formatDate } from "@src/utils/formatDate";
import { getInitials } from "@src/components/features/blog-post-details/AuthorInfo";

interface Preacher {
  name: string;
  avatar?: {
    url: string;
    title: string;
  };
}

interface SermonBylineProps {
  /** Ordered preachers: the primary first, then any co-preachers. */
  readonly preachers: Preacher[];
  readonly publishedDate: string;
}

/**
 * Byline for a multi-preacher service (e.g. four short messages in one post).
 * Renders an overlapping avatar/initials group and the names joined by " · ".
 * The single-preacher path keeps using {@link AuthorInfo} unchanged.
 */
export function SermonByline({ preachers, publishedDate }: SermonBylineProps) {
  const locale = useLocale();
  const formattedDate = formatDate(publishedDate, locale);

  return (
    <div className="flex items-center gap-4 text-gray-500">
      <div className="flex -space-x-2">
        {preachers.map((preacher) => (
          <div
            key={preacher.name}
            className="relative h-9 w-9 overflow-hidden rounded-full ring-2 ring-background"
          >
            {preacher.avatar ? (
              <Image
                src={preacher.avatar.url}
                alt={preacher.avatar.title}
                fill
                className="object-cover object-top"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs font-semibold"
                aria-label={`${preacher.name} avatar`}
              >
                {getInitials(preacher.name)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Typography
          component="p"
          variant="overline"
          className="font-semibold tracking-wide dark:text-gray-300"
        >
          {preachers.map((preacher) => preacher.name).join(" · ")}
        </Typography>
        <Typography component="p" variant="overline" className="tracking-wide">
          {formattedDate}
        </Typography>
      </div>
    </div>
  );
}
