import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchGraphQL so no real network calls are made
vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getContentCollection } from "./getContentCollection";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

const BELIEF_ITEM_1 = {
  title: "La Trinidad",
  description: { json: { nodeType: "document", content: [] } },
  bibleVerse: { json: { nodeType: "document", content: [] } },
  image: { url: "https://images.ctfassets.net/trinity.jpg", title: "Trinidad" },
  kind: "Creed",
};

const BELIEF_ITEM_2 = {
  title: "Servicio al prójimo",
  description: { json: { nodeType: "document", content: [] } },
  bibleVerse: { json: { nodeType: "document", content: [] } },
  image: { url: "https://images.ctfassets.net/service.jpg", title: "Servicio" },
  kind: "Value",
};

function makeCollectionResponse(items: unknown[]) {
  return {
    data: {
      contentCollectionCollection: {
        items: [
          {
            title: "Nuestras creencias",
            description: { json: { nodeType: "document", content: [] } },
            image: null,
            contentItemsCollection: { items },
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContentCollection", () => {
  it("returns creedItems mapped from beliefItem-shaped entries", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([BELIEF_ITEM_1, BELIEF_ITEM_2]),
    );

    const result = await getContentCollection("creed", "es-AR");

    expect(result.title).toBe("Nuestras creencias");
    expect(Array.isArray(result.creedItems)).toBe(true);
    expect(result.creedItems).toHaveLength(2);
  });

  it("passes through title and description on each beliefItem", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([BELIEF_ITEM_1]),
    );

    const result = await getContentCollection("creed", "es-AR");

    expect(result.creedItems[0].title).toBe("La Trinidad");
    expect(result.creedItems[0].description.json.nodeType).toBe("document");
  });

  it("passes through bibleVerse and image on each beliefItem", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([BELIEF_ITEM_1]),
    );

    const result = await getContentCollection("creed", "es-AR");

    expect(result.creedItems[0].bibleVerse?.json.nodeType).toBe("document");
    expect(result.creedItems[0].image?.url).toBe(
      "https://images.ctfassets.net/trinity.jpg",
    );
    expect(result.creedItems[0].image?.title).toBe("Trinidad");
  });

  it("passes through the kind field on each beliefItem", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(
      makeCollectionResponse([BELIEF_ITEM_1, BELIEF_ITEM_2]),
    );

    const result = await getContentCollection("creed", "es-AR");

    expect(result.creedItems[0].kind).toBe("Creed");
    expect(result.creedItems[1].kind).toBe("Value");
  });

  it("queries with the correct machineName and locale", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("values", "en-US");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('machineName: "values"'),
      false,
    );
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('locale: "en-US"'),
      false,
    );
  });

  it("passes isDraftMode flag to fetchGraphQL", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR", true);

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("preview: true"),
      true,
    );
  });

  it("queries ... on BeliefItem fragment (not Credo or ValueItem)", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("... on BeliefItem");
    expect(query).not.toContain("... on Credo");
    expect(query).not.toContain("... on ValueItem");
  });

  it("includes the kind field in the GraphQL query", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getContentCollection("creed", "es-AR");

    const query = mockFetchGraphQL.mock.calls[0][0] as string;
    expect(query).toContain("kind");
  });
});
