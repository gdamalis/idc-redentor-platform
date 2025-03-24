import {
  documentToReactComponents,
  Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { BlogPost } from "@src/types/BlogPost";
import Image from "next/image";
import { AuthorInfo } from "./AuthorInfo";

type BlogPostDetailsProps = Readonly<{
  post: BlogPost;
  relatedPosts: BlogPost[];
  locale: string;
}>;

const richTextOptions: Options = {
  renderMark: {
    [MARKS.BOLD]: (text) => <strong>{text}</strong>,
    [MARKS.ITALIC]: (text) => <em>{text}</em>,
  },
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node, children) => (
      <Typography component="p" variant="body1" className="my-4">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_2]: (node, children) => (
      <Typography
        component="h2"
        variant="h2"
        className="mt-8 mb-4 text-2xl font-bold"
      >
        {children}
      </Typography>
    ),
  },
};

export default function BlogPostDetails({
  post,
  relatedPosts,
  locale,
}: BlogPostDetailsProps) {
  if (!post) {
    return null;
  }

  let richTextContent = null;
  if (post.content?.json) {
    try {
      richTextContent = documentToReactComponents(
        post.content.json,
        richTextOptions,
      );
    } catch (error) {
      console.error("Error rendering rich text:", error);
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <Container className="py-16 lg:py-28">
      <div className="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <Typography
          component="p"
          variant="body1"
          className="text-base font-semibold leading-7 text-blue-600"
        >
          Blog
        </Typography>
        <Typography
          component="h1"
          variant="h1"
          className="mt-2 text-3xl font-bold tracking-tight leading-tighter text-gray-900 sm:text-4xl"
        >
          {post.title}
        </Typography>

        <AuthorInfo
          authorName={post.author.name}
          publishedDate={post.publishedDate}
        />

        {post.subtitle && (
          <Typography
            component="p"
            variant="body1"
            className="mt-6 text-xl leading-8"
          >
            {post.subtitle}
          </Typography>
        )}

        <div className="mt-10 max-w-2xl">
          <figure className="mb-16">
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.title}
              width={800}
              height={450}
              className="aspect-video rounded-xl bg-gray-50 object-cover"
            />
            <figcaption className="mt-2 flex gap-x-2 text-sm leading-6 text-gray-500">
              <InformationCircleIcon
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 flex-none text-gray-300"
              />
              {post.featuredImage.title}
            </figcaption>
          </figure>

          {/* Rich text content */}
          <div className="rich-text-content">
            {richTextContent || (
              <Typography component="p" variant="body1">
                {post.seoDescription}
              </Typography>
            )}
          </div>

          {relatedPosts.length > 0 && (
            <div className="mt-16 max-w-2xl">
              <Typography
                component="h2"
                variant="h2"
                className="text-2xl font-bold tracking-tight text-gray-900"
              >
                Related Articles
              </Typography>
              <div className="mx-auto mt-8 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                {relatedPosts.map((relatedPost) => (
                  <article
                    key={relatedPost.sys.id}
                    className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48"
                  >
                    <Image
                      alt={relatedPost.featuredImage.title}
                      src={relatedPost.featuredImage.url}
                      width={780}
                      height={780}
                      className="absolute inset-0 -z-10 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
                    <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />

                    <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
                      <time
                        dateTime={relatedPost.publishedDate}
                        className="mr-8"
                      >
                        {formatDate(relatedPost.publishedDate)}
                      </time>
                      {relatedPost.author && (
                        <div className="-ml-4 flex items-center gap-x-4">
                          <svg
                            viewBox="0 0 2 2"
                            className="-ml-0.5 h-0.5 w-0.5 flex-none fill-white/50"
                          >
                            <circle r={1} cx={1} cy={1} />
                          </svg>
                          <div className="flex gap-x-2.5">
                            {relatedPost.author.avatar && (
                              <Image
                                alt={relatedPost.author.avatar.title}
                                src={relatedPost.author.avatar.url}
                                width={24}
                                height={24}
                                className="h-6 w-6 flex-none rounded-full bg-white/10"
                              />
                            )}
                            {relatedPost.author.name}
                          </div>
                        </div>
                      )}
                    </div>
                    <Typography
                      component="h3"
                      variant="h3"
                      className="mt-3 text-lg font-semibold leading-6 text-white"
                    >
                      <Link href={`/blog/${relatedPost.slug}`}>
                        <span className="absolute inset-0" />
                        {relatedPost.title}
                      </Link>
                    </Typography>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
