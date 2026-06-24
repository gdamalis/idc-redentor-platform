import Image from "next/image";
import { Typography } from "@src/components/ui/typography";
import { Divider } from "@src/components/ui/divider";
import { Link } from "@src/i18n/routing";
import { formatDate } from "@src/utils/formatDate";
import type { Sermon } from "@src/types/Sermon";

interface RelatedSermonsProps {
  readonly sermons: NonNullable<Sermon["relatedSermons"]>;
  readonly locale: string;
}

export function RelatedSermons({ sermons, locale }: RelatedSermonsProps) {
  if (!sermons.length) return null;

  return (
    <div className="max-w-2xl pt-8">
      <div className="grid gap-4">
        {sermons.map((sermon) => (
          <div key={sermon.slug} className="flex relative w-full">
            <div className="w-full">
              <Divider className="my-6" />
              <Link href={`/predicas/${sermon.slug}`}>
                <article className="grid grid-cols-[minmax(0,1fr)_82px] md:grid-cols-[minmax(0,1fr)_160px] gap-8">
                  <div className="flex flex-col gap-2 relative">
                    <Typography component="p" variant="h4">
                      {sermon.title}
                    </Typography>
                    <Typography component="p" variant="body2">
                      {sermon.excerpt}
                    </Typography>
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-2 overflow-hidden text-sm leading-6 text-gray-500 dark:text-gray-300">
                      <time
                        dateTime={sermon.sermonDate}
                        className="uppercase text-xs"
                      >
                        {formatDate(sermon.sermonDate, locale)}
                      </time>
                    </div>
                  </div>
                  <div>
                    <Image
                      alt={sermon.featuredImage.title}
                      src={sermon.featuredImage.url}
                      width={780}
                      height={780}
                      className="h-auto md:h-full md:w-full rounded-md"
                    />
                  </div>
                </article>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
