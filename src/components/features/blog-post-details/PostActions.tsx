import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";

interface PostActionsProps {
  readonly slug: string;
  readonly title: string;
  readonly featuredImageUrl: string;
  readonly initialLikeCount: number;
  readonly initialHasLiked: boolean;
}

export function PostActions({
  slug,
  title,
  featuredImageUrl,
  initialLikeCount,
  initialHasLiked,
}: PostActionsProps) {
  return (
    <div className="flex items-center gap-3 py-6 border-t border-border">
      <LikeButton
        slug={slug}
        initialCount={initialLikeCount}
        initialHasLiked={initialHasLiked}
      />
      <ShareButton slug={slug} title={title} featuredImageUrl={featuredImageUrl} />
    </div>
  );
}
