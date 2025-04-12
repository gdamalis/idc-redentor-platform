import {
  documentToReactComponents,
  Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { BlogPost } from "@src/types/BlogPost";
import { formatDate } from "@src/utils/formatDate";
import { FeaturedImage } from "./FeaturedImage";
import { RelatedArticles } from "./RelatedArticles";
import { BlogPostHeader } from "./BlogPostHeader";

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
      <Typography component="p" variant="body">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_2]: (node, children) => (
      <Typography component="h2" variant="h2">
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

  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <Container className="py-16 lg:py-20">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <BlogPostHeader post={post} />

        <div className="flex flex-col gap-y-4">
          <FeaturedImage
            url={post.featuredImage.url}
            title={post.featuredImage.title}
          />

          <div className="rich-text-content">
            {richTextContent || (
              <Typography component="p" variant="body1">
                {post.seoDescription}
              </Typography>
            )}
          </div>
        </div>

        <RelatedArticles posts={relatedPosts} formattedDate={formattedDate} />
      </div>
    </Container>
  );
}
