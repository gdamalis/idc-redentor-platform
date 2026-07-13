import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { useTranslations } from "next-intl";
import { cn } from "@idcr/ui";

import { BlogPost } from "@src/types/BlogPost";
import { BlogPostCard } from "./BlogPostCard";

type BlogSectionProps = {
  posts: BlogPost[];
  showHeader?: boolean;
};

export const BlogSection = ({ posts, showHeader = true }: BlogSectionProps) => {
  const t = useTranslations("Blog");

  return (
    <section className={cn("bg-background", showHeader ? "py-24" : "py-12")}>
      <Container>
        {showHeader && (
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Typography
              component="h2"
              variant="h2"
              className="font-serif text-4xl font-bold mb-4 text-foreground"
            >
              {t("title")}
            </Typography>
            <div className="h-1 w-20 bg-primary mx-auto rounded-full mb-6" />
            <Typography
              component="p"
              variant="body1"
              className="text-muted-foreground text-lg"
            >
              {t("description")}
            </Typography>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts
            .sort(
              (a, b) =>
                new Date(b.publishedDate).getTime() -
                new Date(a.publishedDate).getTime(),
            )
            .map((post, index) => (
              <BlogPostCard key={post.sys.id} post={post} index={index} />
            ))}
        </div>
      </Container>
    </section>
  );
};
