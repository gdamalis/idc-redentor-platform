import { beforeEach, describe, expect, it, vi } from "vitest";

const { disable, getBlogPostPage, getSermon, getChurchInfoTopic } = vi.hoisted(
  () => ({
    disable: vi.fn(),
    getBlogPostPage: vi.fn(),
    getSermon: vi.fn(),
    getChurchInfoTopic: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ disable })),
}));

vi.mock("@lib/content/getBlogPostPages", () => ({
  getBlogPostPage,
}));

vi.mock("@lib/content/getSermons", () => ({
  getSermon,
}));

vi.mock("@lib/content/getChurchInfoTopic", () => ({
  getChurchInfoTopic,
}));

import { POST } from "./route";

function makeFormPost(pathValue?: string) {
  const body = new FormData();
  if (pathValue !== undefined) {
    body.set("path", pathValue);
  }
  return new Request("https://example.com/api/preview/exit", {
    method: "POST",
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/preview/exit", () => {
  it("disables Draft Mode and 303-redirects to static routes (including /blog and /predicas before :topic check)", async () => {
    for (const staticPath of [
      "/es-AR",
      "/en-US",
      "/es-AR/blog",
      "/es-AR/predicas",
      "/en-US/community",
      "/en-US/come-meet-us",
      "/es-AR/who-is-jesus",
    ]) {
      const res = await POST(makeFormPost(staticPath));
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe(staticPath);
      expect(res.headers.get("Cache-Control")).toBe(
        "private, no-cache, no-store, max-age=0, must-revalidate",
      );
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }

    expect(disable).toHaveBeenCalledTimes(7);
    // Static routes MUST match before the /:topic dynamic check (zero DB queries!)
    expect(getChurchInfoTopic).not.toHaveBeenCalled();
    expect(getBlogPostPage).not.toHaveBeenCalled();
    expect(getSermon).not.toHaveBeenCalled();
  });

  it("returns to the same dynamic address when a published copy exists", async () => {
    getBlogPostPage.mockResolvedValueOnce({ slug: "mi-post" });
    const blogRes = await POST(makeFormPost("/es-AR/blog/mi-post"));
    expect(blogRes.status).toBe(303);
    expect(blogRes.headers.get("Location")).toBe("/es-AR/blog/mi-post");
    expect(getBlogPostPage).toHaveBeenCalledWith("mi-post", "es-AR", false);

    getSermon.mockResolvedValueOnce({ slug: "la-gracia" });
    const sermonRes = await POST(makeFormPost("/en-US/predicas/la-gracia"));
    expect(sermonRes.status).toBe(303);
    expect(sermonRes.headers.get("Location")).toBe("/en-US/predicas/la-gracia");
    expect(getSermon).toHaveBeenCalledWith("la-gracia", "en-US", false);

    getChurchInfoTopic.mockResolvedValueOnce({ slug: "privacy" });
    const topicRes = await POST(makeFormPost("/en-US/privacy"));
    expect(topicRes.status).toBe(303);
    expect(topicRes.headers.get("Location")).toBe("/en-US/privacy");
    expect(getChurchInfoTopic).toHaveBeenCalledWith("privacy", "en-US", false);
  });

  it("falls back to that locale's home page when the entry has no published copy (draft-only)", async () => {
    getBlogPostPage.mockResolvedValueOnce(undefined);
    const blogRes = await POST(makeFormPost("/en-US/blog/unpublished-draft"));
    expect(blogRes.status).toBe(303);
    expect(blogRes.headers.get("Location")).toBe("/en-US");

    getSermon.mockResolvedValueOnce(undefined);
    const sermonRes = await POST(makeFormPost("/es-AR/predicas/borrador-nuevo"));
    expect(sermonRes.status).toBe(303);
    expect(sermonRes.headers.get("Location")).toBe("/es-AR");

    getChurchInfoTopic.mockResolvedValueOnce(undefined);
    const topicRes = await POST(makeFormPost("/en-US/draft-topic"));
    expect(topicRes.status).toBe(303);
    expect(topicRes.headers.get("Location")).toBe("/en-US");
  });

  it("falls back safely to /es-AR on off-site, invalid, or missing path (open-redirect guard)", async () => {
    for (const unsafe of [
      "https://evil.com/es-AR",
      "//evil.com/es-AR",
      "/fr-FR/blog",
      "",
    ]) {
      const res = await POST(makeFormPost(unsafe));
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/es-AR");
    }

    const emptyPost = await POST(
      new Request("https://example.com/api/preview/exit", { method: "POST" }),
    );
    expect(emptyPost.status).toBe(303);
    expect(emptyPost.headers.get("Location")).toBe("/es-AR");
    expect(disable).toHaveBeenCalledTimes(5);
  });

  it("falls back to locale home if the published check throws (never traps editor in 500)", async () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getSermon.mockRejectedValueOnce(new Error("DB down"));
      const res = await POST(makeFormPost("/en-US/predicas/la-gracia"));
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe("/en-US");
    } finally {
      consoleErr.mockRestore();
    }
  });
});
