import { beforeEach, describe, expect, it, vi } from "vitest";
import type { revalidateTag as RealRevalidateTag } from "next/cache";
import { createNextCacheHarness } from "./test-helpers";

const harness = vi.hoisted(() => ({
  current: null as ReturnType<typeof createNextCacheHarness> | null,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  // In Vitest (outside RSC render), pass through React.cache so tests exercise the cross-request
  // unstable_cache layer cleanly across sequential calls.
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (...args: Parameters<ReturnType<typeof createNextCacheHarness>["unstable_cache"]>) =>
    harness.current!.unstable_cache(...args),
  revalidateTag: (...args: Parameters<ReturnType<typeof createNextCacheHarness>["revalidateTag"]>) =>
    harness.current!.revalidateTag(...args),
}));

import {
  createCachedReader,
  revalidateSiteContent,
  SITE_CONTENT_CACHE_TAG,
} from "../cache";

// Compile-time contract check against the REAL installed Next.js 16 `revalidateTag` signature:
// ensures `{ expire: 0 }` remains a valid second argument on upgrades.
const _assertRevalidateSignature: (
  fn: typeof RealRevalidateTag,
) => void = (fn) => {
  fn(SITE_CONTENT_CACHE_TAG, { expire: 0 });
};
void _assertRevalidateSignature;

describe("createCachedReader & revalidateSiteContent", () => {
  beforeEach(() => {
    harness.current = createNextCacheHarness();
  });

  it("caches published reads across calls and preserves undefined via the CachedSlot wrapper", async () => {
    let calls = 0;
    const reader = createCachedReader(
      "test-item",
      async (key: string): Promise<{ value: string } | undefined> => {
        calls += 1;
        if (key === "missing") return undefined;
        return { value: `v-${calls}` };
      },
    );

    expect(await reader.readPublished("a")).toEqual({ value: "v-1" });
    expect(await reader.readPublished("a")).toEqual({ value: "v-1" });
    expect(calls).toBe(1);

    expect(await reader.readPublished("missing")).toBeUndefined();
    expect(await reader.readPublished("missing")).toBeUndefined();
    expect(calls).toBe(2);
  });

  it("never serves draft reads from, or writes draft reads to, the shared cache (tested both ways)", async () => {
    let publishedTitle = "Published v1";
    let draftTitle = "Draft v1";
    let dbCalls = 0;

    const reader = createCachedReader(
      "draft-isolation",
      async (mode: string) => {
        dbCalls += 1;
        return { title: mode === "draft" ? draftTitle : publishedTitle };
      },
    );

    // Direction 1: warm published cache first -> draft read MUST bypass cache and hit DB
    expect(await reader.readPublished("published")).toEqual({
      title: "Published v1",
    });
    expect(dbCalls).toBe(1);
    const cacheCallsAfterPub = harness.current!.unstableCacheCalls.length;

    expect(await reader.readDraft("draft")).toEqual({ title: "Draft v1" });
    expect(dbCalls).toBe(2);
    expect(harness.current!.unstableCacheCalls.length).toBe(cacheCallsAfterPub);

    // Direction 2: draft read mutates again -> published read MUST NOT see draft data
    draftTitle = "Draft v2";
    expect(await reader.readDraft("draft")).toEqual({ title: "Draft v2" });
    expect(dbCalls).toBe(3);
    expect(harness.current!.unstableCacheCalls.length).toBe(cacheCallsAfterPub);

    // Published cache is still intact and untainted by draft
    publishedTitle = "Published v2 (unrevalidated)";
    expect(await reader.readPublished("published")).toEqual({
      title: "Published v1",
    });
    expect(dbCalls).toBe(3);
  });

  it("expires site-content immediately so the very next read after revalidateSiteContent returns fresh content", async () => {
    let version = 1;
    const reader = createCachedReader("invalidation", async (slug: string) => ({
      slug,
      title: `Version ${version}`,
    }));

    expect(await reader.readPublished("hello")).toEqual({
      slug: "hello",
      title: "Version 1",
    });

    version = 2;
    // Still cached before invalidation
    expect(await reader.readPublished("hello")).toEqual({
      slug: "hello",
      title: "Version 1",
    });

    revalidateSiteContent();

    expect(harness.current!.revalidateTagCalls).toEqual([
      { tag: SITE_CONTENT_CACHE_TAG, profile: { expire: 0 } },
    ]);

    // Very next read MUST return Version 2 (not stale Version 1)
    expect(await reader.readPublished("hello")).toEqual({
      slug: "hello",
      title: "Version 2",
    });
  });

  it("never caches rejected promises from transient DB errors", async () => {
    let shouldFail = true;
    const reader = createCachedReader("error-noncache", async () => {
      if (shouldFail) throw new Error("DB down");
      return { ok: true };
    });

    await expect(reader.readPublished()).rejects.toThrow("DB down");
    shouldFail = false;
    expect(await reader.readPublished()).toEqual({ ok: true });
  });
});
