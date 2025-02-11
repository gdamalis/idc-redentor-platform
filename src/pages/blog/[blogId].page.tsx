import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

import { ContactCta } from '@src/components/features/contact-cta';
import {
  fetchDummyBlogPosts,
  fetchDummyOtherPosts,
  fetchDummySinglePost,
} from '@src/data/sample-blog-posts';
import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';
import { BlogPost } from '@src/types/BlogPost';

type BlogPostPageProps = {
  post: BlogPost;
  otherPosts: BlogPost[];
};

const BlogPostPage: NextPage<BlogPostPageProps> = ({ post, otherPosts }: BlogPostPageProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{post.title}</title>
        <meta name="description" content={post.description} />
        <meta name="keywords" content={post.keywords} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.ogDescription} />
        <meta property="og:image" content={post.imageUrl} />
        <meta property="og:url" content={`https://idcredentor.com/blog/${post.slug}`} />
        <link rel="canonical" href={`https://idcredentor.com/blog/${post.slug}`} />
      </Head>
      <div className="bg-white px-6 py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-base leading-7 text-gray-700">
          <p className="text-base font-semibold leading-7 text-blue-600">{post.category}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {post.title}
          </h1>
          <div className="mt-4 text-sm text-gray-500">
            <p>
              Escrito por <span className="font-semibold text-gray-900">{post.author.name}</span> el{' '}
              {post.date}
            </p>
          </div>

          <p className="mt-6 text-xl leading-8">{post.description}</p>

          <div className="mt-10 max-w-2xl">
            <p>{post.content}</p>

            {post.additionalContent?.map((content, index) => (
              <p key={index} className="mt-8">
                {content}
              </p>
            ))}

            {post.quote && (
              <figure className="mt-10 border-l border-blue-600 pl-9">
                <blockquote className="font-semibold text-gray-900">
                  <p>{post.quote}</p>
                </blockquote>
                {post.quoteAuthor && (
                  <figcaption className="mt-6 flex gap-x-4">
                    <Image
                      src={post.quoteAuthor.imageUrl}
                      alt={post.quoteAuthor.name}
                      width={24}
                      height={24}
                      className="h-6 w-6 flex-none rounded-full bg-gray-50"
                    />
                    <div className="text-sm leading-6">
                      <strong className="font-semibold text-gray-900">
                        {post.quoteAuthor.name}
                      </strong>{' '}
                      – {post.quoteAuthor.role}
                    </div>
                  </figcaption>
                )}
              </figure>
            )}

            <figure className="mt-16">
              <Image
                src={post.imageUrl}
                alt={post.title}
                width={800}
                height={450}
                className="aspect-video rounded-xl bg-gray-50 object-cover"
              />
              <figcaption className="mt-4 flex gap-x-2 text-sm leading-6 text-gray-500">
                <InformationCircleIcon
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 flex-none text-gray-300"
                />
                Imagen relacionada con el tema del blog.
              </figcaption>
            </figure>

            <div className="mt-16 max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {t('blogPostPage.morePosts')}
              </h2>
              <div className="mx-auto mt-16 grid max-w-2xl auto-rows-fr grid-cols-1 gap-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                {otherPosts.map((post: BlogPost) => (
                  <article
                    key={post.id}
                    className="relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48"
                  >
                    <Image
                      alt={post.title}
                      src={post.imageUrl}
                      width={780}
                      height={780}
                      className="absolute inset-0 -z-10 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-gray-900 via-gray-900/40" />
                    <div className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10" />

                    <div className="flex flex-wrap items-center gap-y-1 overflow-hidden text-sm leading-6 text-gray-300">
                      <time dateTime={post.datetime} className="mr-8">
                        {post.date}
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
                            alt={post.author.name}
                            src={post.author.imageUrl}
                            width={24}
                            height={24}
                            className="h-6 w-6 flex-none rounded-full bg-white/10"
                          />
                          {post.author.name}
                        </div>
                      </div>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-white">
                      <Link href={`/blog/${post.slug}`}>
                        <span className="absolute inset-0" />
                        {post.title}
                      </Link>
                    </h3>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <ContactCta />
    </>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await fetchDummyBlogPosts();

  const paths = posts.map(post => ({
    params: { blogId: post.slug.toString() },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params, locale }) => {
  const post = await fetchDummySinglePost(params?.blogId as string);
  const otherPosts = await fetchDummyOtherPosts(3);

  if (!post) {
    return {
      notFound: true,
    };
  }

  try {
    return {
      revalidate: revalidateDuration,
      props: {
        ...(await getServerSideTranslations(locale)),
        post,
        otherPosts,
      },
    };
  } catch {
    return {
      revalidate: revalidateDuration,
      notFound: true,
    };
  }
};

export default BlogPostPage;
