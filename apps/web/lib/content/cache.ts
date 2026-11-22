import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";

/** Shared cache tag attached to every published read in `apps/web/lib/content/`. */
export const SITE_CONTENT_CACHE_TAG = "site-content";

type CachedSlot<T> = { found: true; value: T } | { found: false };

/**
 * Wraps a content reader with:
 * - Published path: `React.cache` (per-request dedupe) around `unstable_cache` (cross-request
 *   shared cache tagged `"site-content"`). Values are wrapped in `{ found }` so `undefined`
 *   serializes cleanly through Next's `JSON.stringify` cache serializer.
 * - Draft path: `React.cache` ONLY — never reads from, or writes to, `unstable_cache`.
 *
 * Callers MUST branch on `isDraftMode` BEFORE entering `readPublished`, and MUST NEVER call
 * `draftMode()` or `cookies()` inside `fetcher`.
 */
export function createCachedReader<
  TArgs extends readonly (string | undefined)[],
  TResult,
>(
  keyPrefix: string,
  fetcher: (...args: TArgs) => Promise<TResult>,
): {
  readonly readPublished: (...args: TArgs) => Promise<TResult>;
  readonly readDraft: (...args: TArgs) => Promise<TResult>;
} {
  const sharedPublished = unstable_cache(
    async (...args: TArgs): Promise<CachedSlot<TResult>> => {
      const value = await fetcher(...args);
      if (value === undefined) {
        return { found: false };
      }
      return { found: true, value };
    },
    ["content", keyPrefix],
    { tags: [SITE_CONTENT_CACHE_TAG] },
  );

  const readPublished = cache(async (...args: TArgs): Promise<TResult> => {
    const slot = await sharedPublished(...args);
    return slot.found ? slot.value : (undefined as TResult);
  });

  const readDraft = cache(async (...args: TArgs): Promise<TResult> => {
    return fetcher(...args);
  });

  return { readPublished, readDraft };
}

/**
 * Immediately expires all `"site-content"` cached entries (`{ expire: 0 }`) so the very next
 * read after an admin publish returns the new version instead of serving stale content once more.
 */
export function revalidateSiteContent(): void {
  revalidateTag(SITE_CONTENT_CACHE_TAG, { expire: 0 });
}
