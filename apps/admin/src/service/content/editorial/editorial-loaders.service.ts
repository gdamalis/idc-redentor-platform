import type {
  AuthorFields,
  ContentStatus,
  MediaDoc,
  PostFields,
} from "@idcr/content";
import type { ContentCaller } from "@src/lib/content/caller";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { authorService, postService } from "@src/service/content/collections";
import type { ContentDocumentView } from "@src/service/content/content-core.service";
import { getMediaByIds } from "@src/service/media/media.service";
import { listUsers } from "@src/service/user.service";

export interface AuthorSummary {
  readonly id: string;
  readonly name: string;
  readonly status: ContentStatus;
  readonly avatarUrl?: string;
}

export interface RelatedPostSummary {
  readonly id: string;
  readonly title: string;
  readonly status: ContentStatus;
  readonly publishedDate?: string;
}

export interface LinkedPlatformUser {
  readonly id: string;
  readonly displayName?: string;
  readonly email: string;
}

export interface AuthorListAvatar {
  readonly url: string;
  readonly alt: string;
}

export function serializeMediaDoc(doc: MediaDoc): SerializedMediaDoc {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Hydrates initial display metadata for `PostEditor` on the server:
 * featured image doc, selected author summary (with optional avatar URL), and
 * selected related post summaries (with status chips).
 */
export async function loadPostEditorHydration(
  caller: ContentCaller,
  draft: PostFields,
): Promise<{
  readonly initialFeaturedImage: SerializedMediaDoc | null;
  readonly initialAuthor: AuthorSummary | null;
  readonly initialRelatedPosts: readonly RelatedPostSummary[];
}> {
  const mediaIds: string[] = [];
  if (draft.featuredImageId) mediaIds.push(draft.featuredImageId);

  const [authorRes, relatedResults] = await Promise.all([
    draft.authorId
      ? authorService.getById(caller, draft.authorId)
      : Promise.resolve(null),
    draft.relatedPostIds && draft.relatedPostIds.length > 0
      ? Promise.all(
          draft.relatedPostIds.map((id) => postService.getById(caller, id)),
        )
      : Promise.resolve([]),
  ]);

  if (authorRes?.ok && authorRes.doc.draft.avatarMediaId) {
    mediaIds.push(authorRes.doc.draft.avatarMediaId);
  }

  const mediaById = new Map<string, SerializedMediaDoc>();
  if (mediaIds.length > 0) {
    const mediaRes = await getMediaByIds(caller, mediaIds);
    if (mediaRes.ok) {
      for (const item of mediaRes.items) {
        mediaById.set(item._id, serializeMediaDoc(item));
      }
    }
  }

  const initialFeaturedImage = draft.featuredImageId
    ? (mediaById.get(draft.featuredImageId) ?? null)
    : null;

  let initialAuthor: AuthorSummary | null = null;
  if (authorRes?.ok) {
    const avatarMedia = authorRes.doc.draft.avatarMediaId
      ? mediaById.get(authorRes.doc.draft.avatarMediaId)
      : undefined;
    initialAuthor = {
      id: authorRes.doc._id,
      name: authorRes.doc.draft.name,
      status: authorRes.status,
      ...(avatarMedia?.url ? { avatarUrl: avatarMedia.url } : {}),
    };
  }

  const initialRelatedPosts: RelatedPostSummary[] = [];
  for (const res of relatedResults) {
    if (!res.ok) continue;
    initialRelatedPosts.push({
      id: res.doc._id,
      title: res.doc.draft.title["es-AR"] || res.doc._id,
      status: res.status,
      ...(res.doc.draft.publishedDate
        ? { publishedDate: res.doc.draft.publishedDate }
        : {}),
    });
  }

  return {
    initialFeaturedImage,
    initialAuthor,
    initialRelatedPosts,
  };
}

/**
 * Hydrates initial display metadata for `AuthorEditor` on the server.
 * STRICT RBAC: `admin.users` is queried ONLY when `canReadUsers === true`
 * (zero PII leak to editors lacking `users:read`).
 */
export async function loadAuthorEditorHydration(
  caller: ContentCaller,
  draft: AuthorFields,
  canReadUsers: boolean,
): Promise<{
  readonly initialAvatar: SerializedMediaDoc | null;
  readonly initialLinkedUser: LinkedPlatformUser | null;
}> {
  const [mediaRes, users] = await Promise.all([
    draft.avatarMediaId
      ? getMediaByIds(caller, [draft.avatarMediaId])
      : Promise.resolve(null),
    canReadUsers && draft.userId ? listUsers() : Promise.resolve(null),
  ]);

  const initialAvatar =
    mediaRes?.ok && mediaRes.items[0]
      ? serializeMediaDoc(mediaRes.items[0])
      : null;

  let initialLinkedUser: LinkedPlatformUser | null = null;
  if (users && draft.userId) {
    const found = users.find((u) => u._id.toHexString() === draft.userId);
    if (found) {
      initialLinkedUser = {
        id: found._id.toHexString(),
        email: found.email,
        ...(found.displayName ? { displayName: found.displayName } : {}),
      };
    }
  }

  return { initialAvatar, initialLinkedUser };
}

/**
 * Batch-hydrates avatar thumbnails for `/content/authors` in one `getMediaByIds` call.
 */
export async function loadAuthorListAvatars(
  caller: ContentCaller,
  authors: readonly ContentDocumentView<AuthorFields>[],
): Promise<Readonly<Record<string, AuthorListAvatar>>> {
  const ids = authors
    .map((item) => item.doc.draft.avatarMediaId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length === 0) return {};

  const res = await getMediaByIds(caller, ids);
  if (!res.ok) return {};

  const map: Record<string, AuthorListAvatar> = {};
  for (const media of res.items) {
    map[media._id] = {
      url: media.url,
      alt: media.alt?.["es-AR"] || media.title["es-AR"] || media.filename,
    };
  }
  return map;
}
