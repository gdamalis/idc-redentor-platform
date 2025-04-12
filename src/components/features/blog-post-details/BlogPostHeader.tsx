import { Typography } from "@src/components/ui/typography";
import { Divider } from "@src/components/ui/divider";
import { AuthorInfo } from "./AuthorInfo";
import { BlogPost } from "@src/types/BlogPost";

type BlogPostHeaderProps = Readonly<{
  post: Pick<BlogPost, "title" | "subtitle" | "author" | "publishedDate">;
}>;

export function BlogPostHeader({ post }: BlogPostHeaderProps) {
  return (
    <div className="flex flex-col gap-y-3">
      <Typography
        component="p"
        variant="overline"
        className="font-semibold text-blue-600 dark:text-blue-400"
      >
        Blog
      </Typography>
      <Typography
        component="h1"
        variant="h1"
        className="leading-tight"
      >
        {post.title}
      </Typography>

      {post.subtitle && (
        <Typography
          component="p"
          variant="body"
        >
          {post.subtitle}
        </Typography>
      )}

      <AuthorInfo
        authorDetails={post.author}
        publishedDate={post.publishedDate}
      />

      <Divider className="my-6" />
    </div>
  );
} 