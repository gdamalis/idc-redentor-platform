import { Container } from "@src/components/ui/container";
import { BlogPost } from "@src/types/BlogPost";
import { BlogPostHeader } from "./BlogPostHeader";
import { BlogPostContent } from "./BlogPostContent";
import { RelatedArticles } from "./RelatedArticles";
import { formatDate } from "@src/utils/formatDate";

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

  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <Container className="py-16 lg:py-20">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <BlogPostHeader post={post} />
        <BlogPostContent post={post} />
        <RelatedArticles posts={relatedPosts} formattedDate={formattedDate} />
      </div>
    </Container>
  );
}
