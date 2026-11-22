import {
  POST_CATEGORIES,
  SITE_PAGE_SLUGS,
  isValidSlug,
  type Locale,
  type PostCategory,
  type PostFields,
  type RichTextDoc,
  type TopicFields,
} from "@idcr/content";

export const MAX_RELATED_POSTS = 3;

export const POST_CATEGORY_MESSAGE_KEYS = {
  Events: "events",
  "Spiritual Growth": "spiritualGrowth",
  Community: "community",
} as const satisfies Record<
  PostCategory,
  "events" | "spiritualGrowth" | "community"
>;

const POST_CATEGORY_SET = new Set<string>(POST_CATEGORIES);

/**
 * Top-level site route segments that a topic (`/[locale]/[topic]`) may NEVER
 * claim (`ICR-199` Edge Case 6): every static `SITE_PAGE_SLUGS` route plus `api`.
 */
export const RESERVED_TOPIC_SLUGS = [...SITE_PAGE_SLUGS, "api"] as const;

const RESERVED_TOPIC_SLUG_SET = new Set<string>(RESERVED_TOPIC_SLUGS);

/** True iff `value` is one of the 3 site-translatable blog post categories. */
export function isAllowedPostCategory(value: unknown): value is PostCategory {
  return typeof value === "string" && POST_CATEGORY_SET.has(value);
}

/** True iff `slug` collides with a reserved top-level site route. */
export function isReservedTopicSlug(slug: string): boolean {
  return RESERVED_TOPIC_SLUG_SET.has(slug.trim().toLowerCase());
}

/** Normalizes an optional text input so blank strings clear to `undefined`. */
export function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalizes a keyword list by trimming and omitting blank lines. */
export function normalizeKeywords(
  items: readonly string[] | undefined,
): string[] | undefined {
  if (!items) return undefined;
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Sanitizes localized SEO keywords (`C1`): trims items, drops blank rows per
 * locale, omits empty `en-US` so Spanish fallback works, and collapses to
 * `undefined` when both locales are empty.
 */
export function sanitizeLocalizedKeywords(
  keywords: PostFields["keywords"],
): PostFields["keywords"] {
  if (!keywords) return undefined;
  const es = normalizeKeywords(keywords["es-AR"]);
  const en = normalizeKeywords(keywords["en-US"]);
  if (!es && !en) return undefined;
  return {
    "es-AR": es ?? [],
    ...(en ? { "en-US": en } : {}),
  };
}

interface RichTextNodeLike {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly content?: unknown;
}

/**
 * Extracts a compact plain-text preview from a TipTap document for the
 * `"Original en español"` collapsible reference block (`F-editor-ux` §2.4).
 * Iterative to avoid recursion depth limits on large documents.
 */
export function extractPlainTextFromRichText(
  doc: RichTextDoc | undefined,
): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  const blocks: string[] = [];

  for (const topNode of doc.content) {
    const pieces: string[] = [];
    const stack: RichTextNodeLike[] = [topNode as RichTextNodeLike];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (typeof node.text === "string") {
        pieces.push(node.text);
      }
      if (Array.isArray(node.content)) {
        for (let i = node.content.length - 1; i >= 0; i -= 1) {
          stack.push(node.content[i] as RichTextNodeLike);
        }
      }
    }
    const line = pieces.join("").trim();
    if (line) blocks.push(line);
  }

  return blocks.join("\n\n");
}

/** Builds up to 2 uppercase initials for an author avatar fallback. */
export function buildPersonInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/**
 * Resolves the external `"Ver en el sitio"` URL for a published post or topic
 * using `NEXT_PUBLIC_WEBSITE_URL` (display link ONLY — never used for server
 * preview or revalidation). Returns `undefined` when unpublished or unconfigured.
 */
export function resolvePublicLiveUrl(input: {
  readonly collection: "posts" | "topics";
  readonly published?: PostFields | TopicFields;
  readonly locale: Locale;
  readonly baseUrl?: string;
}): string | undefined {
  if (!input.published) return undefined;
  const rawBase = (input.baseUrl ?? process.env.NEXT_PUBLIC_WEBSITE_URL ?? "").trim();
  if (!rawBase) return undefined;
  const base = rawBase.replace(/\/+$/, "");

  if (input.collection === "posts") {
    const slug = (input.published as PostFields).slug;
    if (!slug || !isValidSlug(slug)) return undefined;
    return `${base}/${input.locale}/blog/${slug}`;
  }

  const slugMap = (input.published as TopicFields).slug;
  const localizedSlug = slugMap?.[input.locale];
  if (localizedSlug && isValidSlug(localizedSlug)) {
    return `${base}/${input.locale}/${localizedSlug}`;
  }
  const fallbackEs = slugMap?.["es-AR"];
  if (fallbackEs && isValidSlug(fallbackEs)) {
    return `${base}/es-AR/${fallbackEs}`;
  }
  return undefined;
}
