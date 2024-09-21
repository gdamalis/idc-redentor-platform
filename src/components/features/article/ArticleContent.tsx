import { CtfRichText } from '@src/components/features/contentful';
import { BlogPostPage } from '@src/lib/__generated/sdk';

interface ArticleContentProps {
  article: BlogPostPage;
}
export const ArticleContent = ({ article }: ArticleContentProps) => {
  const { content } = article;

  return (
    <div>
      <CtfRichText json={content?.json} links={content?.links} />
    </div>
  );
};
