import { Typography } from "@src/components/ui/typography";
import type { BlogPostView } from "@lib/content/types";
import { articlePreset, renderRichText } from "@lib/content/rich-text";
import { FeaturedImage } from "./FeaturedImage";

type BlogPostContentProps = Readonly<{
  post: Pick<
    BlogPostView,
    "content" | "featuredImage" | "seoDescription" | "keywords"
  >;
}>;

export function BlogPostContent({ post }: BlogPostContentProps) {
  let richTextContent = null;
  if (post.content) {
    try {
      richTextContent = renderRichText(post.content, articlePreset);
    } catch (error) {
      console.error("Error rendering rich text:", error);
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      {post.featuredImage && (
        <FeaturedImage
          url={post.featuredImage.url}
          title={post.featuredImage.title}
        />
      )}

      <div className="rich-text-content">
        {richTextContent || (
          <Typography component="p" variant="body1">
            {post.seoDescription}
          </Typography>
        )}
      </div>
    </div>
  );
}
