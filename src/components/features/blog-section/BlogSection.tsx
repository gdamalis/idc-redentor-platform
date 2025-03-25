import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

import { BlogPost } from "@src/types/BlogPost";

type BlogSectionProps = {
  posts: BlogPost[];
};

export const BlogSection = ({ posts }: BlogSectionProps) => {
  const locale = useLocale();
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
            <article
              key={post.sys.id}
              className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80"
            >
              <Image
                alt={post.featuredImage.title}
                src={post.featuredImage.url}
                width={780}
                height={780}
                className="absolute inset-0 -z-10 h-full w-full object-cover"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
              <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />

              <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
                <time dateTime={post.publishedDate} className="mr-8">
                  {new Date(post.publishedDate)
                    .toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                </time>
                <div className="-ml-4 flex items-center gap-x-4">
                  <svg
                    viewBox="0 0 2 2"
                    className="-ml-0.5 h-0.5 w-0.5 flex-none fill-white/50"
                  >
                    <circle r={1} cx={1} cy={1} />
                  </svg>
                  <div className="flex gap-x-2.5">
                    <Image
                      alt={post.author.avatar.title}
                      src={post.author.avatar.url}
                      width={24}
                      height={24}
                      className="h-6 w-6 flex-none rounded-full bg-white/10"
                    />
                    {post.author.name}
                  </div>
                </div>
              </div>
              <Typography
                component="h3"
                variant="h3"
                className="mt-3 text-lg font-semibold leading-6 text-white"
              >
                <Link href={`/blog/${post.slug}`}>
                  <span className="absolute inset-0" />
                  {post.title}
                </Link>
              </Typography>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
