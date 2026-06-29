"use client";

import { Typography } from "@src/components/ui/typography";
import { formatDate } from "@src/utils/formatDate";
import { useLocale } from "next-intl";
import Image from "next/image";

interface AuthorDetails {
  name: string;
  avatar?: {
    url: string;
    title: string;
  };
}

interface AuthorInfoProps {
  authorDetails: AuthorDetails;
  publishedDate: string;
}

/** Returns the initials from a full name, e.g. "Gabriel Damalis" → "GD". */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export function AuthorInfo({
  authorDetails,
  publishedDate,
}: Readonly<AuthorInfoProps>) {
  const locale = useLocale();

  const formattedDate = formatDate(publishedDate, locale);

  return (
    <div className="flex items-center gap-4 text-gray-500">
      <div className="flex items-center gap-2">
        <div className="relative h-9 w-9 overflow-hidden rounded-full">
          {authorDetails.avatar ? (
            <Image
              src={authorDetails.avatar.url}
              alt={authorDetails.avatar.title}
              fill
              className="object-cover object-top"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs font-semibold"
              aria-label={`${authorDetails.name} avatar`}
            >
              {getInitials(authorDetails.name)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Typography component="p" variant="overline" className="font-semibold tracking-wide dark:text-gray-300">
          {authorDetails.name}
        </Typography>
        <Typography component="p" variant="overline" className="tracking-wide">
          {formattedDate}
        </Typography>
      </div>
    </div>
  );
}
