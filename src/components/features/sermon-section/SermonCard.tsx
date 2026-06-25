"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Calendar, User } from "lucide-react";
import { PlayCircle } from "lucide-react";

import { Typography } from "@src/components/ui/typography";
import { Button } from "@src/components/ui/button";
import { Link } from "@src/i18n/routing";
import { Card, CardContent } from "@src/components/ui/card";
import { formatDate } from "@src/utils/formatDate";
import { cn } from "@src/utils/cn";
import type { Sermon } from "@src/types/Sermon";

interface SermonCardProps {
  sermon: Sermon;
  index?: number;
}

export function SermonCard({ sermon, index = 0 }: Readonly<SermonCardProps>) {
  const locale = useLocale();
  const t = useTranslations("Sermons");
  const formattedDate = formatDate(sermon.sermonDate, locale);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/predicas/${sermon.slug}`}>
        <Card className="group flex flex-col h-full overflow-hidden rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer">
          <div className="relative h-48 overflow-hidden bg-muted">
            {sermon.featuredImage && (
              <Image
                alt={sermon.featuredImage.title}
                src={sermon.featuredImage.url}
                width={780}
                height={780}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )}

            {/* Audio indicator badge */}
            {sermon.audio && (
              <div
                className="absolute top-4 right-4"
                aria-label="audio-indicator"
              >
                <span
                  className={cn(
                    "flex items-center gap-1 bg-background/90 backdrop-blur",
                    "text-foreground text-xs font-bold px-2 py-1 rounded-full shadow-sm",
                  )}
                >
                  <PlayCircle className="w-3 h-3 text-primary" aria-hidden />
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
                <User className="w-3 h-3" /> {sermon.preacher.name}
              </span>
            </div>

            <Typography
              component="h3"
              variant="h3"
              className="font-serif text-xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors"
            >
              {sermon.title}
            </Typography>

            {sermon.thesis && (
              <Typography
                component="p"
                variant="body1"
                className="text-muted-foreground text-sm mb-6 line-clamp-3 grow"
              >
                {sermon.thesis}
              </Typography>
            )}

            <Button
              variant="ghost"
              className="w-full justify-between group-hover:bg-primary/5"
            >
              {t("preached-by")} {sermon.preacher.name}
            </Button>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
