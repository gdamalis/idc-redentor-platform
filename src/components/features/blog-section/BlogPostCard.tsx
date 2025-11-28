import Image from "next/image";
import { useLocale } from "next-intl";

import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import { formatDate } from "@src/utils/formatDate";
import { Card, CardContent } from "@src/components/ui/card";

type BlogPostCardProps = {
  post: BlogPost;
};

export const BlogPostCard = ({ post }: BlogPostCardProps) => {
  const locale = useLocale();
  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <Link href={`/blog/${post.slug}`}>
      <Card className="group overflow-hidden rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer h-full">
        <div className="relative h-48 overflow-hidden">
          <Image
            alt={post.featuredImage.title}
            src={post.featuredImage.url}
            width={780}
            height={780}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-60" />
        </div>
        
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
            <time dateTime={post.publishedDate}>{formattedDate}</time>
            <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            <Typography component="span" variant="body2" className="text-muted-foreground">
              {post.author.name}
            </Typography>
          </div>
          
          <Typography
            component="h3"
            variant="h3"
            className="text-xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors"
          >
            {post.title}
          </Typography>
          
          {post.subtitle && (
            <Typography
              component="p"
              variant="body1"
              className="mt-3 text-muted-foreground line-clamp-2"
            >
              {post.subtitle}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};
