"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Calendar, User, ArrowRight } from "lucide-react";

import { Typography } from "@src/components/ui/typography";
import { Button } from "@src/components/ui/button";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import { formatDate } from "@src/utils/formatDate";
import { Card, CardContent } from "@src/components/ui/card";

type BlogPostCardProps = {
  post: BlogPost;
  index?: number;
};

export const BlogPostCard = ({ post, index = 0 }: BlogPostCardProps) => {
  const locale = useLocale();
  const t = useTranslations("article");
  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/blog/${post.slug}`}>
        <Card className="group flex flex-col h-full overflow-hidden rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer">
          <div className="relative h-48 overflow-hidden">
            <Image
              alt={post.featuredImage.title}
              src={post.featuredImage.url}
              width={780}
              height={780}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {post.category && (
              <div className="absolute top-4 left-4">
                <span className="bg-background/90 backdrop-blur text-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {post.category}
                </span>
              </div>
            )}
          </div>
          
          <CardContent className="p-6 flex flex-col grow">
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {post.author.name}
              </span>
            </div>
            
            <Typography
              component="h3"
              variant="h3"
              className="font-serif text-xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors"
            >
              {post.title}
            </Typography>
            
            {post.subtitle && (
              <Typography
                component="p"
                variant="body1"
                className="text-muted-foreground text-sm mb-6 line-clamp-3 grow"
              >
                {post.subtitle}
              </Typography>
            )}

            <Button variant="ghost" className="w-full justify-between group-hover:bg-primary/5">
              {t("read-more")} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
};
