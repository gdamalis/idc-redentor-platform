import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";

interface PostActionsProps {
  readonly slug: string;
  readonly basePath: string;
  readonly likeKey: string;
  readonly title: string;
  readonly featuredImageUrl: string;
  readonly initialLikeCount: number;
  readonly initialHasLiked: boolean;
}

export function PostActions({
  slug,
  basePath,
  likeKey,
  title,
  featuredImageUrl,
  initialLikeCount,
  initialHasLiked,
}: PostActionsProps) {
  return (
    <div className="flex items-center gap-3 py-6 border-t border-border">
      <LikeButton
        slug={likeKey}
        initialCount={initialLikeCount}
        initialHasLiked={initialHasLiked}
      />
      <ShareButton
        slug={slug}
        basePath={basePath}
        likeKey={likeKey}
        title={title}
        featuredImageUrl={featuredImageUrl}
      />
    </div>
  );
}
