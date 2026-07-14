import { Container } from "@src/components/ui/container";
import { BlogPost } from "@src/types/BlogPost";
import type { Likes } from "@src/service/like.service";
import { BlogPostHeader } from "./BlogPostHeader";
import { BlogPostContent } from "./BlogPostContent";
import { PostActions } from "./PostActions";
import { RelatedArticles } from "./RelatedArticles";

type BlogPostDetailsProps = Readonly<{
  post: BlogPost;
  relatedPosts: BlogPost[];
  locale: string;
  likes?: Likes;
}>;

export default function BlogPostDetails({
  post,
  relatedPosts,
  locale,
  likes,
}: BlogPostDetailsProps) {
  if (!post) {
    return null;
  }

  return (
    <Container className="pt-28 pb-20 lg:py-32">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <BlogPostHeader post={post} />
        <BlogPostContent post={post} />
        <PostActions
          slug={post.slug}
          basePath="blog"
          likeKey={post.slug}
          title={post.title}
          featuredImageUrl={post.featuredImage.url}
          likes={likes}
        />
        <RelatedArticles posts={relatedPosts} locale={locale} sourceSlug={post.slug} />
      </div>
    </Container>
  );
}
