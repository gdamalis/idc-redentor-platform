import type { Likes } from "@src/service/like.service";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";

interface PostActionsProps {
  readonly slug: string;
  readonly basePath: string;
  readonly likeKey: string;
  readonly title: string;
  readonly featuredImageUrl: string;
  /** Absent when the likes DB is unavailable — the like control is then omitted entirely. */
  readonly likes?: Likes;
}

export function PostActions({
  slug,
  basePath,
  likeKey,
  title,
  featuredImageUrl,
  likes,
}: PostActionsProps) {
  return (
    <div className="flex items-center gap-3 py-6 border-t border-border">
      {likes && (
        <LikeButton
          slug={likeKey}
          initialCount={likes.count}
          initialHasLiked={likes.hasLiked}
        />
      )}
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
