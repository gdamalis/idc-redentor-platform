import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetchGraphQL so no real network calls are made
vi.mock("./fetch", () => ({
  fetchGraphQL: vi.fn(),
}));

import { fetchGraphQL } from "./fetch";
import { getSermon, getLatestSermons, getAllSermons, getAllSermonSlugs } from "./getSermons";

const mockFetchGraphQL = vi.mocked(fetchGraphQL);

const SERMON_ITEM = {
  title: "La gracia de Dios",
  slug: "la-gracia-de-dios",
  sermonDate: "2025-03-16",
  thesis: "Somos salvos por gracia mediante la fe.",
  mainPoints: ["Gracia definida", "Gracia aplicada", "Gracia vivida"],
  excerpt: "Un mensaje sobre la gracia de Dios.",
  durationSeconds: 2730,
  content: {
    json: { nodeType: "document", content: [] },
    links: {
      assets: {
        block: [{ sys: { id: "abc123" }, url: "https://images.ctfassets.net/img.jpg", title: "Imagen", width: 800, height: 600, contentType: "image/jpeg" }],
      },
    },
  },
  featuredImage: { url: "https://images.ctfassets.net/hero.jpg", title: "Hero" },
  audio: { url: "https://assets.ctfassets.net/sermon.mp3", title: "Audio", contentType: "audio/mpeg", fileName: "sermon.mp3", size: 45000000 },
  pdfSummary: { url: "https://assets.ctfassets.net/resumen.pdf", title: "Resumen", contentType: "application/pdf", fileName: "resumen.pdf", size: 120000 },
  preacher: {
    name: "Juan García",
    avatar: { url: "https://images.ctfassets.net/avatar.jpg", title: "Juan García" },
    email: "juan@example.com",
  },
  scriptureReferencesCollection: {
    items: [
      {
        book: "Efesios",
        chapter: 2,
        fromVerse: 8,
        toVerse: 9,
        verseContent: "Porque por gracia sois salvos por medio de la fe...",
        bibleVersion: "RVR60",
      },
      {
        book: "Romanos",
        chapter: 3,
        fromVerse: 24,
        toVerse: null,
        verseContent: "Siendo justificados gratuitamente por su gracia...",
        bibleVersion: "RVR60",
      },
    ],
  },
  seoTitle: "La gracia de Dios | IDC Redentor",
  seoDescription: "Un mensaje sobre la gracia.",
  keywords: ["gracia", "fe", "salvación"],
  relatedSermonsCollection: {
    items: [
      {
        title: "El amor de Cristo",
        slug: "el-amor-de-cristo",
        sermonDate: "2025-03-09",
        excerpt: "Sobre el amor de Cristo.",
        featuredImage: { url: "https://images.ctfassets.net/related.jpg", title: "Related" },
      },
    ],
  },
  sys: { id: "sermon-id-1", publishedAt: "2025-03-17T10:00:00Z" },
  __typename: "Sermon",
};

function makeCollectionResponse(items: unknown[]) {
  return { data: { sermonCollection: { items } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSermon", () => {
  it("returns a sermon mapped with scriptureReferences and relatedSermons arrays", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getSermon("la-gracia-de-dios", "es-AR");

    expect(result.title).toBe("La gracia de Dios");
    expect(result.slug).toBe("la-gracia-de-dios");
    expect(result.sermonDate).toBe("2025-03-16");
    expect(result.thesis).toBe("Somos salvos por gracia mediante la fe.");
    expect(result.mainPoints).toEqual(["Gracia definida", "Gracia aplicada", "Gracia vivida"]);
    expect(result.durationSeconds).toBe(2730);
    expect(result.sys.id).toBe("sermon-id-1");
    expect(result.sys.publishedAt).toBe("2025-03-17T10:00:00Z");
  });

  it("maps scriptureReferencesCollection.items → scriptureReferences array", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getSermon("la-gracia-de-dios", "es-AR");

    expect(Array.isArray(result.scriptureReferences)).toBe(true);
    expect(result.scriptureReferences).toHaveLength(2);
    expect(result.scriptureReferences![0]).toMatchObject({
      book: "Efesios",
      chapter: 2,
      fromVerse: 8,
      toVerse: 9,
      verseContent: "Porque por gracia sois salvos por medio de la fe...",
      bibleVersion: "RVR60",
    });
    expect(result.scriptureReferences![1].toVerse).toBeNull();
  });

  it("maps relatedSermonsCollection.items → relatedSermons array", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getSermon("la-gracia-de-dios", "es-AR");

    expect(Array.isArray(result.relatedSermons)).toBe(true);
    expect(result.relatedSermons).toHaveLength(1);
    expect(result.relatedSermons![0].slug).toBe("el-amor-de-cristo");
    expect(result.relatedSermons![0].title).toBe("El amor de Cristo");
  });

  it("maps audio and pdfSummary fields", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getSermon("la-gracia-de-dios", "es-AR");

    expect(result.audio).toMatchObject({
      url: "https://assets.ctfassets.net/sermon.mp3",
      contentType: "audio/mpeg",
      fileName: "sermon.mp3",
    });
    expect(result.pdfSummary).toMatchObject({
      url: "https://assets.ctfassets.net/resumen.pdf",
      title: "Resumen",
    });
  });

  it("maps preacher fields including optional avatar", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getSermon("la-gracia-de-dios", "es-AR");

    expect(result.preacher.name).toBe("Juan García");
    expect(result.preacher.email).toBe("juan@example.com");
    expect(result.preacher.avatar?.url).toBe("https://images.ctfassets.net/avatar.jpg");
  });

  it("passes isDraftMode flag to fetchGraphQL", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    await getSermon("la-gracia-de-dios", "es-AR", true);

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining('preview: true'),
      true,
    );
  });
});

describe("getLatestSermons", () => {
  it("returns an array of mapped sermons", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getLatestSermons("es-AR");

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].slug).toBe("la-gracia-de-dios");
  });

  it("includes slug_not filter when slug option provided", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getLatestSermons("es-AR", { slug: "otro-sermon" });

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("slug_not"),
      false,
    );
  });

  it("omits slug_not filter when no slug option provided", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([]));

    await getLatestSermons("es-AR");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.not.stringContaining("slug_not"),
      false,
    );
  });
});

describe("getAllSermons", () => {
  it("returns all mapped sermons ordered by sermonDate_DESC", async () => {
    mockFetchGraphQL.mockResolvedValueOnce(makeCollectionResponse([SERMON_ITEM]));

    const result = await getAllSermons("es-AR");

    expect(Array.isArray(result)).toBe(true);
    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("sermonDate_DESC"),
      false,
    );
  });
});

describe("getAllSermonSlugs", () => {
  it("returns an array of { slug, updatedAt } objects", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({
      data: {
        sermonCollection: {
          items: [
            { slug: "la-gracia-de-dios", sys: { publishedAt: "2025-03-17T10:00:00Z" } },
          ],
        },
      },
    });

    const result = await getAllSermonSlugs("es-AR");

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("la-gracia-de-dios");
    expect(result[0].updatedAt).toBe("2025-03-17T10:00:00Z");
  });

  it("always uses preview: false regardless of env", async () => {
    mockFetchGraphQL.mockResolvedValueOnce({ data: { sermonCollection: { items: [] } } });

    await getAllSermonSlugs("es-AR");

    expect(mockFetchGraphQL).toHaveBeenCalledWith(
      expect.stringContaining("preview: false"),
      false,
    );
  });
});
