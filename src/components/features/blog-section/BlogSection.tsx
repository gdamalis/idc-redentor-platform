import { Typography } from "@src/components/ui/typography";
import { useTranslations } from "next-intl";

import { BlogPost } from "@src/types/BlogPost";
import { BlogPostCard } from "./BlogPostCard";

type BlogSectionProps = {
  posts: BlogPost[];
};

export const BlogSection = ({ posts }: BlogSectionProps) => {
  const t = useTranslations("Blog");

  return (
    <div className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Typography
            component="h2"
            variant="h2"
            className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
          >
            {t("title")}
          </Typography>
          <Typography
            component="p"
            variant="body1"
            className="mt-2 text-lg leading-8 text-gray-600"
          >
            {t("description")}
          </Typography>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {posts.map((post) => (
            <BlogPostCard key={post.sys.id} post={post} />
          ))}
        </div>
      </div>
    </div>
  );
};
