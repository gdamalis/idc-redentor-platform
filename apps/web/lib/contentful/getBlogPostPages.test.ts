import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchGraphQL so no real network calls are made
vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getBlogPostPage, getLatestBlogPostPages } from "./getBlogPostPages";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBlogPostPage", () => {
  it("rejects malformed slugs and locales without querying (injection guard)", async () => {
    for (const badSlug of ['a" }) { __typename } #', "Bad Slug", "../x", '"']) {
      expect(await getBlogPostPage(badSlug, "es-AR")).toBeUndefined();
    }
    for (const badLocale of ["fr-FR", "/evil.com", '" }']) {
      expect(await getBlogPostPage("mi-post", badLocale)).toBeUndefined();
    }
    expect(mockFetchGraphQL).not.toHaveBeenCalled();
  });

  it("queries the collection with a valid slug + locale", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: { blogPostPageCollection: { items: [{ slug: "mi-post" }] } },
    });

    const result = await getBlogPostPage("mi-post", "es-AR");

    expect(result).toEqual({ slug: "mi-post" });
    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain('slug: "mi-post"');
    expect(query).toContain('locale: "es-AR"');
  });
});

describe("getLatestBlogPostPages", () => {
  it("omits the slug_not filter when the exclude slug is malformed (injection guard)", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: { blogPostPageCollection: { items: [] } },
    });

    await getLatestBlogPostPages("es-AR", { slug: 'x" }) { __typename } #' });

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.not.stringContaining("slug_not"),
      undefined,
    );
  });
});
