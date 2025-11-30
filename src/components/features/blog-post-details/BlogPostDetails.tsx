import { Container } from "@src/components/ui/container";
import { BlogPost } from "@src/types/BlogPost";
import { BlogPostHeader } from "./BlogPostHeader";
import { BlogPostContent } from "./BlogPostContent";
import { RelatedArticles } from "./RelatedArticles";

type BlogPostDetailsProps = Readonly<{
  post: BlogPost;
  relatedPosts: BlogPost[];
  locale: string;
}>;

export default function BlogPostDetails({
  post,
  relatedPosts,
  locale,
}: BlogPostDetailsProps) {
  if (!post) {
    return null;
  }

  return (
    <Container className="pt-28 pb-20 lg:py-32">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <BlogPostHeader post={post} />
        <BlogPostContent post={post} />
        <RelatedArticles posts={relatedPosts} locale={locale} />
      </div>
    </Container>
  );
}
