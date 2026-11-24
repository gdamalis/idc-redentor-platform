"use client";

import { Typography } from "@src/components/ui/typography";
import { Divider } from "@src/components/ui/divider";
import { AuthorInfo } from "./AuthorInfo";
import type { BlogPostView } from "@lib/content/types";
import { useTranslations } from "next-intl";

type BlogPostHeaderProps = Readonly<{
  post: Pick<
    BlogPostView,
    "title" | "subtitle" | "author" | "publishedDate" | "category"
  >;
}>;

export function BlogPostHeader({ post }: BlogPostHeaderProps) {
  const t = useTranslations("BlogPost.categories");

  // Translate the category if it exists, otherwise fallback to "Blog"
  const displayCategory = post.category
    ? t(post.category as "Events" | "Spiritual Growth" | "Community") ||
      post.category
    : "Blog";

  return (
    <div className="flex flex-col gap-y-3">
      <Typography
        component="p"
        variant="overline"
        className="font-semibold text-primary"
      >
        {displayCategory}
      </Typography>
      <Typography component="h1" variant="h1" className="leading-tight">
        {post.title}
      </Typography>

      {post.subtitle && (
        <Typography component="p" variant="body">
          {post.subtitle}
        </Typography>
      )}

      {post.author && (
        <AuthorInfo
          authorDetails={post.author}
          publishedDate={post.publishedDate}
        />
      )}

      <Divider className="my-6" />
    </div>
  );
}
