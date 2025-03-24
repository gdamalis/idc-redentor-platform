"use client";

import { Typography } from "@src/components/ui/typography";
import { useLocale, useTranslations } from "next-intl";

type AuthorInfoProps = {
  authorName: string;
  publishedDate: string;
};

export function AuthorInfo({
  authorName,
  publishedDate,
}: Readonly<AuthorInfoProps>) {
  const t = useTranslations("BlogPost");
  const locale = useLocale();

  const formattedDate = new Date(publishedDate).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const authorText = t("written-by");
  const dateText = t("on-date", { date: formattedDate });

  return (
    <div className="mt-4 text-sm text-gray-500">
      <Typography component="p" variant="body1">
        {authorText} <span className="font-semibold text-gray-900">{authorName}</span> {dateText}
      </Typography>
    </div>
  );
}
