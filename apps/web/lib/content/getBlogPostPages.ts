import {
  COLLECTIONS,
  isValidSlug,
  type Locale,
  type PostFields,
} from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import {
  isValidObjectIdHex,
  requireContentDb,
  toObjectIds,
  type StoredEnvelope,
} from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import {
  buildRichTextView,
  collectEmbeddedMediaIds,
  loadMediaMap,
  toImageView,
} from "./media";
import { loadAuthorMap, toAuthorView } from "./references";
import type {
  BlogPostView,
  RelatedBlogPostView,
  SlugEntryView,
} from "./types";

const LATEST_POSTS_LIMIT = 3;
const RELATED_POSTS_LIMIT = 3;

async function hydratePosts(
  db: Db,
  docs: Array<StoredEnvelope<PostFields>>,
  locale: Locale,
  isDraftMode: boolean,
): Promise<BlogPostView[]> {
  if (docs.length === 0) return [];

  const snap = snapshotKey(isDraftMode);
  const authorIds = new Set<string>();
  const relatedIds = new Set<string>();
  const mediaIds = new Set<string>();

  const pairs: Array<{
    doc: StoredEnvelope<PostFields>;
    fields: PostFields;
    contentDoc: ReturnType<typeof resolveLocalized<NonNullable<PostFields["content"]>["es-AR"]>>;
  }> = [];

  for (const doc of docs) {
    const fields = resolveSnapshot(doc, isDraftMode);
    if (!fields) continue;
    const contentDoc = resolveLocalized(fields.content, locale);
    collectEmbeddedMediaIds(contentDoc, mediaIds);
    if (fields.featuredImageId) mediaIds.add(fields.featuredImageId);
    if (fields.authorId) authorIds.add(fields.authorId);
    for (const relId of fields.relatedPostIds ?? []) {
      relatedIds.add(relId);
    }
    pairs.push({ doc, fields, contentDoc });
  }

  const relatedObjectIds = toObjectIds(relatedIds);
  const [authorMap, relatedDocs] = await Promise.all([
    loadAuthorMap(db, authorIds, isDraftMode),
    relatedObjectIds.length > 0
      ? db
          .collection<StoredEnvelope<PostFields>>(COLLECTIONS.posts)
          .find({ _id: { $in: relatedObjectIds }, [snap]: { $exists: true } })
          .toArray()
      : Promise.resolve([]),
  ]);

  for (const author of authorMap.values()) {
    if (author.avatarMediaId) mediaIds.add(author.avatarMediaId);
  }
  const relatedMap = new Map<string, PostFields>();
  for (const relDoc of relatedDocs) {
    const relFields = resolveSnapshot(relDoc, isDraftMode);
    if (relFields) {
      relatedMap.set(relDoc._id.toHexString(), relFields);
      if (relFields.featuredImageId) mediaIds.add(relFields.featuredImageId);
    }
  }

  const mediaMap = await loadMediaMap(db, mediaIds);

  return pairs.map(({ doc, fields, contentDoc }) => {
    const relatedItems: RelatedBlogPostView[] = [];
    for (const relId of fields.relatedPostIds ?? []) {
      if (relatedItems.length >= RELATED_POSTS_LIMIT) break;
      const rel = relatedMap.get(relId);
      if (!rel) continue;
      const item: RelatedBlogPostView = {
        title: resolveLocalized(rel.title, locale) ?? "",
        slug: rel.slug ?? "",
        publishedDate: rel.publishedDate ?? "",
      };
      const relSubtitle = resolveLocalized(rel.subtitle, locale);
      if (relSubtitle !== undefined) item.subtitle = relSubtitle;
      const relImg = rel.featuredImageId
        ? toImageView(mediaMap.get(rel.featuredImageId), locale)
        : undefined;
      if (relImg) item.featuredImage = relImg;
      relatedItems.push(item);
    }

    const view: BlogPostView = {
      title: resolveLocalized(fields.title, locale) ?? "",
      slug: fields.slug ?? "",
      publishedDate: fields.publishedDate ?? "",
      seoTitle: resolveLocalized(fields.seoTitle, locale) ?? "",
      seoDescription: resolveLocalized(fields.seoDescription, locale) ?? "",
      keywords: resolveLocalized(fields.keywords, locale) ?? [],
      relatedBlogPostsCollection: { items: relatedItems },
      sys: {
        id: doc._id.toHexString(),
        ...(doc.publishedAt ? { publishedAt: doc.publishedAt.toISOString() } : {}),
      },
      __typename: "BlogPostPage",
    };

    const subtitle = resolveLocalized(fields.subtitle, locale);
    if (subtitle !== undefined) view.subtitle = subtitle;
    if (fields.category !== undefined) view.category = fields.category;
    const featuredImage = fields.featuredImageId
      ? toImageView(mediaMap.get(fields.featuredImageId), locale)
      : undefined;
    if (featuredImage) view.featuredImage = featuredImage;
    const content = buildRichTextView(contentDoc, mediaMap, locale);
    if (content) view.content = content;
    const author = fields.authorId
      ? toAuthorView(authorMap.get(fields.authorId), mediaMap, locale)
      : undefined;
    if (author) view.author = author;

    return view;
  });
}

async function fetchLatestBlogPosts(
  locale: Locale,
  excludeSlug: string | undefined,
  isDraftMode: boolean,
): Promise<BlogPostView[]> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const filter: Record<string, unknown> = { [snap]: { $exists: true } };
  if (excludeSlug) {
    filter[`${snap}.slug`] = { $ne: excludeSlug };
  }

  // Published reads sort strictly by `published.publishedDate DESC, _id ASC` (matching
  // `getAllBlogPostSlugs` and `ICR-195`'s index) so unpublished `saveDraft`s never reorder
  // same-date published posts; draft mode adds secondary `updatedAt DESC` for undated drafts.
  const sortSpec: Record<string, 1 | -1> = isDraftMode
    ? { "draft.publishedDate": -1, updatedAt: -1, _id: 1 }
    : { "published.publishedDate": -1, _id: 1 };

  const docs = await db
    .collection<StoredEnvelope<PostFields>>(COLLECTIONS.posts)
    .find(filter)
    .sort(sortSpec)
    .limit(LATEST_POSTS_LIMIT)
    .toArray();

  return hydratePosts(db, docs, locale, isDraftMode);
}

async function fetchAllBlogPostSlugs(): Promise<SlugEntryView[]> {
  const db = await requireContentDb();
  // Consumed by the ISR sitemap (ICR-123): DB/query failures MUST propagate so Next.js keeps
  // serving the last good sitemap instead of caching an empty list. No 100-item cap.
  const docs = await db
    .collection<StoredEnvelope<PostFields>>(COLLECTIONS.posts)
    .find({
      published: { $exists: true },
      "published.slug": { $type: "string" },
    })
    .sort({ "published.publishedDate": -1, _id: 1 })
    .toArray();

  return docs.map((doc) => ({
    slug: doc.published!.slug!,
    updatedAt: (doc.publishedAt ?? doc.updatedAt).toISOString(),
  }));
}

async function fetchBlogPostBySlug(
  slug: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<BlogPostView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<PostFields>>(COLLECTIONS.posts)
    .findOne({ [`${snap}.slug`]: slug });
  if (!doc) return undefined;
  const [hydrated] = await hydratePosts(db, [doc], locale, isDraftMode);
  return hydrated;
}

async function fetchBlogPostById(
  id: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<BlogPostView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<PostFields>>(COLLECTIONS.posts)
    .findOne({ _id: new ObjectId(id), [snap]: { $exists: true } });
  if (!doc) return undefined;
  const [hydrated] = await hydratePosts(db, [doc], locale, isDraftMode);
  return hydrated;
}

const publishedLatestPosts = createCachedReader(
  "blog-latest",
  (locale: Locale, excludeSlug: string | undefined) =>
    fetchLatestBlogPosts(locale, excludeSlug, false),
);
const draftLatestPosts = createCachedReader(
  "blog-latest-draft",
  (locale: Locale, excludeSlug: string | undefined) =>
    fetchLatestBlogPosts(locale, excludeSlug, true),
);

const publishedAllBlogSlugs = createCachedReader(
  "blog-all-slugs",
  (_locale: Locale) => fetchAllBlogPostSlugs(),
);

const publishedBlogBySlug = createCachedReader(
  "blog-by-slug",
  (slug: string, locale: Locale) => fetchBlogPostBySlug(slug, locale, false),
);
const draftBlogBySlug = createCachedReader(
  "blog-by-slug-draft",
  (slug: string, locale: Locale) => fetchBlogPostBySlug(slug, locale, true),
);

const publishedBlogById = createCachedReader(
  "blog-by-id",
  (id: string, locale: Locale) => fetchBlogPostById(id, locale, false),
);
const draftBlogById = createCachedReader(
  "blog-by-id-draft",
  (id: string, locale: Locale) => fetchBlogPostById(id, locale, true),
);

export async function getLatestBlogPostPages(
  locale: string,
  options: {
    slug?: string;
    isDraftMode?: boolean;
  } = {},
): Promise<BlogPostView[]> {
  if (!isValidLocale(locale)) return [];
  const excludeSlug =
    options?.slug && isValidSlug(options.slug) ? options.slug : undefined;
  return options?.isDraftMode
    ? draftLatestPosts.readDraft(locale, excludeSlug)
    : publishedLatestPosts.readPublished(locale, excludeSlug);
}

export async function getAllBlogPostSlugs(
  locale: string,
): Promise<SlugEntryView[]> {
  if (!isValidLocale(locale)) return [];
  return publishedAllBlogSlugs.readPublished(locale);
}

export async function getBlogPostPage(
  slug: string,
  locale: string,
  isDraftMode = false,
): Promise<BlogPostView | undefined> {
  if (!isValidSlug(slug) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftBlogBySlug.readDraft(slug, locale)
    : publishedBlogBySlug.readPublished(slug, locale);
}

export async function getBlogPostPageById(
  id: string,
  locale: string,
  isDraftMode = false,
): Promise<BlogPostView | undefined> {
  if (!isValidObjectIdHex(id) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftBlogById.readDraft(id, locale)
    : publishedBlogById.readPublished(id, locale);
}
