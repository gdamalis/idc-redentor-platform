import {
  documentToReactComponents,
  Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";
import { Container } from "@src/components/ui/container";
import { Divider } from "@src/components/ui/divider";
import { Typography } from "@src/components/ui/typography";
import { BlogPost } from "@src/types/BlogPost";
import { formatDate } from "@src/utils/formatDate";
import { AuthorInfo } from "./AuthorInfo";
import { FeaturedImage } from "./FeaturedImage";
import { RelatedArticles } from "./RelatedArticles";

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
      <Typography
        component="h2"
        variant="h2"
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

  const formattedDate = formatDate(post.publishedDate, locale);

  return (
    <Container className="py-16 lg:py-28">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-4">
          <Typography
            component="p"
            variant="overline"
            className="font-semibold text-blue-600 dark:text-blue-400"
          >
            Blog
          </Typography>
          <Typography
            component="h1"
            variant="h1"
            className="text-4xl leading-tight"
          >
            {post.title}
          </Typography>

          {post.subtitle && (
            <Typography
              component="p"
              variant="body2"
            >
              {post.subtitle}
            </Typography>
          )}

          <AuthorInfo
            authorDetails={post.author}
            publishedDate={post.publishedDate}
          />

          <Divider className="my-4"/>
        </div>

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
          
          <Divider className="my-4"/>

          <RelatedArticles posts={relatedPosts} formattedDate={formattedDate} />
        </div>
      </div>
    </Container>
  );
}
