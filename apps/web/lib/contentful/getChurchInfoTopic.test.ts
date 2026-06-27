import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getChurchInfoTopic } from "./getChurchInfoTopic";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

const MOCK_TOPIC = {
  name: "Política de Privacidad",
  slug: "privacidad",
  shortDescription: "Cómo usamos tus datos.",
  featuredImage: { url: "https://images.ctfassets.net/img.jpg", title: "Privacy" },
  body: {
    json: { nodeType: "document", content: [] },
    links: {
      assets: { block: [], hyperlink: [] },
      entries: { block: [], hyperlink: [] },
    },
  },
  sys: { id: "abc123", publishedAt: "2026-01-01T00:00:00Z" },
  __typename: "ChurchInfoTopic",
};

function makeResponse(item: unknown) {
  return {
    data: {
      churchInfoTopicCollection: {
        items: [item],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getChurchInfoTopic", () => {
  it("rejects non-kebab-case slugs without querying (GraphQL injection guard)", async () => {
    for (const bad of [
      'privacy" }) { __typename } #',
      "Privacy",
      "a b",
      "../secret",
      '"',
    ]) {
      expect(await getChurchInfoTopic(bad, "es-AR")).toBeUndefined();
    }
    expect(mockFetchGraphQL).not.toHaveBeenCalled();
  });

  it("returns the first item from the collection", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    const result = await getChurchInfoTopic("privacidad", "es-AR");

    expect(result).toBeDefined();
    expect(result?.name).toBe("Política de Privacidad");
    expect(result?.slug).toBe("privacidad");
  });

  it("returns body.json on the item", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    const result = await getChurchInfoTopic("privacidad", "es-AR");

    expect(result?.body).toBeDefined();
    expect(result?.body.json.nodeType).toBe("document");
  });

  it("returns links.assets and links.entries on body", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    const result = await getChurchInfoTopic("privacidad", "es-AR");

    expect(Array.isArray(result?.body.links.assets.block)).toBe(true);
    expect(Array.isArray(result?.body.links.entries.block)).toBe(true);
  });

  it("returns undefined when the collection is empty", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: { churchInfoTopicCollection: { items: [] } },
    });

    const result = await getChurchInfoTopic("nonexistent", "es-AR");

    expect(result).toBeUndefined();
  });

  it("queries churchInfoTopicCollection with slug, locale, and limit: 1", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    await getChurchInfoTopic("privacidad", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("churchInfoTopicCollection");
    expect(query).toContain('slug: "privacidad"');
    expect(query).toContain('locale: "es-AR"');
    expect(query).toContain("limit: 1");
  });

  it("passes preview: false and isDraftMode=false by default", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    await getChurchInfoTopic("privacidad", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("preview: false");
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.any(String),
      false,
    );
  });

  it("passes preview: true and isDraftMode=true when draft is enabled", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    await getChurchInfoTopic("privacidad", "es-AR", true);

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("preview: true");
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.any(String),
      true,
    );
  });

  it("selects body { json links } in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    await getChurchInfoTopic("privacy", "en-US");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("body {");
    expect(query).toContain("links {");
    expect(query).toContain("assets {");
    expect(query).toContain("entries {");
  });

  it("selects featuredImage and shortDescription", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    await getChurchInfoTopic("privacy", "en-US");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("featuredImage");
    expect(query).toContain("shortDescription");
  });

  it("returns shortDescription when present", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    const result = await getChurchInfoTopic("privacidad", "es-AR");

    expect(result?.shortDescription).toBe("Cómo usamos tus datos.");
  });

  it("returns featuredImage when present", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeResponse(MOCK_TOPIC));

    const result = await getChurchInfoTopic("privacidad", "es-AR");

    expect(result?.featuredImage?.url).toBe("https://images.ctfassets.net/img.jpg");
    expect(result?.featuredImage?.title).toBe("Privacy");
  });
});
