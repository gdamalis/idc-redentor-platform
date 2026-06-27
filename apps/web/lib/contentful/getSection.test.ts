import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchGraphQL so no real network calls are made
vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getSection } from "./getSection";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

const MOCK_SECTION = {
  layout: "hero",
  headline: "Nuestra Misión",
  subHeadline: "Comunidad de fe",
  body: { json: { nodeType: "document", content: [] } },
  ctaText: "Conócenos",
  targetPage: { slug: "come-meet-us" },
  urlParameters: null,
  image: { url: "https://images.ctfassets.net/hero.jpg", title: "Hero image" },
  imagesCollection: {
    items: [
      { url: "https://images.ctfassets.net/img1.jpg", title: "Foto 1", width: 800, height: 600 },
      { url: "https://images.ctfassets.net/img2.jpg", title: "Foto 2", width: 400, height: 300 },
    ],
  },
  sys: { id: "abc123" },
  __typename: "Section",
};

function makeSectionResponse(item: unknown) {
  return {
    data: {
      sectionCollection: {
        items: [item],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSection", () => {
  it("returns the first section item from the collection", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    const result = await getSection("our-mission", "es-AR");

    expect(result).toBeDefined();
    expect(result?.headline).toBe("Nuestra Misión");
  });

  it("returns body.json on the section item", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    const result = await getSection("our-mission", "es-AR");

    expect(result?.body).toBeDefined();
    expect(result?.body?.json.nodeType).toBe("document");
  });

  it("returns imagesCollection.items array", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    const result = await getSection("info-community", "es-AR");

    expect(Array.isArray(result?.imagesCollection?.items)).toBe(true);
    expect(result?.imagesCollection?.items).toHaveLength(2);
    expect(result?.imagesCollection?.items[0].url).toBe(
      "https://images.ctfassets.net/img1.jpg",
    );
  });

  it("returns layout field", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    const result = await getSection("our-mission", "es-AR");

    expect(result?.layout).toBe("hero");
  });

  it("queries with the correct machineName and locale", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("connect-with-us", "en-US");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('machineName: "connect-with-us"'),
      false,
    );
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('locale: "en-US"'),
      false,
    );
  });

  it("passes isDraftMode=false (preview: false) by default", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("preview: false"),
      false,
    );
  });

  it("passes isDraftMode flag (preview: true) when enabled", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR", true);

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("preview: true"),
      true,
    );
  });

  it("queries sectionCollection (not componentHeroBannerCollection or componentCtaCollection)", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("sectionCollection");
    expect(query).not.toContain("componentHeroBannerCollection");
    expect(query).not.toContain("componentCtaCollection");
    expect(query).not.toContain("componentTextBlockCollection");
  });

  it("selects body { json } (not bodyText) in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("body {");
    expect(query).not.toContain("bodyText");
  });

  it("selects imagesCollection in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("imagesCollection");
  });

  it("uses ... on Page fragment for targetPage", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeSectionResponse(MOCK_SECTION));

    await getSection("our-mission", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("... on Page");
  });

  it("returns undefined when the collection is empty", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: { sectionCollection: { items: [] } },
    });

    const result = await getSection("nonexistent", "es-AR");

    expect(result).toBeUndefined();
  });
});
