import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, type RichTextDoc } from "@idcr/content";
import { ObjectId } from "mongodb";
import {
  createMockContentDb,
  createNextCacheHarness,
} from "./test-helpers";

const state = vi.hoisted(() => ({
  cache: null as ReturnType<typeof createNextCacheHarness> | null,
  mockDb: null as ReturnType<typeof createMockContentDb> | null,
  dbAvailable: true,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (
    cb: (...args: never[]) => Promise<unknown>,
    keyParts?: string[],
    options?: { revalidate?: number | false; tags?: string[] },
  ) => {
    const fixedKey = `${keyParts?.join(",") ?? ""}`;
    const tags = options?.tags ?? [];
    return (...args: never[]) =>
      state.cache!.invoke(fixedKey, tags, cb, args);
  },
  revalidateTag: (
    tag: string,
    profile: string | { expire?: number },
  ) => state.cache!.revalidateTag(tag, profile),
}));

vi.mock("@src/service/database.service", () => ({
  connect: vi.fn(async () => (state.dbAvailable ? ({} as never) : undefined)),
  getWebsiteDb: vi.fn(() => state.mockDb!.db),
}));

import { revalidateSiteContent } from "../cache";
import {
  getAllBlogPostSlugs,
  getBlogPostPage,
  getBlogPostPageById,
  getLatestBlogPostPages,
} from "../getBlogPostPages";
import { getChurchInfoTopic } from "../getChurchInfoTopic";
import {
  getAllSermons,
  getAllSermonSlugs,
  getLatestSermons,
  getSermon,
  getSermonById,
} from "../getSermons";

const ID_MEDIA_IMG = new ObjectId("660000000000000000000001");
const ID_MEDIA_AVATAR = new ObjectId("660000000000000000000002");
const ID_MEDIA_AUDIO = new ObjectId("660000000000000000000003");
const ID_MEDIA_PDF_ES = new ObjectId("660000000000000000000004");
const ID_MEDIA_PDF_EN = new ObjectId("660000000000000000000005");
const ID_MEDIA_EMBED = new ObjectId("660000000000000000000006");
const ID_AUTHOR_1 = new ObjectId("660000000000000000000011");
const ID_AUTHOR_2 = new ObjectId("660000000000000000000012");
const ID_AUTHOR_INT = new ObjectId("660000000000000000000013");
const ID_VERSE_1 = new ObjectId("660000000000000000000021");
const ID_VERSE_2 = new ObjectId("660000000000000000000022");
const ID_POST_1 = new ObjectId("660000000000000000000031");
const ID_POST_2 = new ObjectId("660000000000000000000032");
const ID_POST_3 = new ObjectId("660000000000000000000033");
const ID_POST_DRAFT = new ObjectId("660000000000000000000034");
const ID_TOPIC_PRIVACY = new ObjectId("660000000000000000000041");
const ID_SERMON_1 = new ObjectId("660000000000000000000051");
const ID_SERMON_2 = new ObjectId("660000000000000000000052");
const ID_SERMON_3 = new ObjectId("660000000000000000000053");
const ID_SERMON_DRAFT = new ObjectId("660000000000000000000054");

const T1 = new Date("2026-01-10T10:00:00.000Z");
const T2 = new Date("2026-02-10T10:00:00.000Z");
const T3 = new Date("2026-03-10T10:00:00.000Z");

const PLAIN_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }],
};

const SERMON_DOC_WITH_EMBED: RichTextDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
    {
      type: "embeddedMedia",
      attrs: { mediaId: ID_MEDIA_EMBED.toHexString(), kind: "audio" },
    },
  ],
};

function makeSeed() {
  return {
    [COLLECTIONS.media]: [
      {
        _id: ID_MEDIA_IMG,
        pathname: "media/img.jpg",
        url: "https://blob.example/img.jpg",
        filename: "img.jpg",
        contentType: "image/jpeg",
        size: 1000,
        sha256: "1".repeat(64),
        width: 1200,
        height: 630,
        title: { "es-AR": "Img ES" },
        alt: { "es-AR": "Imagen portada", "en-US": "Cover image" },
        createdBy: "admin",
        createdAt: T1,
      },
      {
        _id: ID_MEDIA_AVATAR,
        pathname: "media/av.jpg",
        url: "https://blob.example/av.jpg",
        filename: "av.jpg",
        contentType: "image/jpeg",
        size: 500,
        sha256: "2".repeat(64),
        title: { "es-AR": "Avatar" },
        alt: { "es-AR": "Foto pastor" },
        createdBy: "admin",
        createdAt: T1,
      },
      {
        _id: ID_MEDIA_AUDIO,
        pathname: "media/sermon.mp3",
        url: "https://blob.example/sermon.mp3",
        filename: "sermon.mp3",
        contentType: "audio/mpeg",
        size: 4_500_000,
        sha256: "3".repeat(64),
        title: { "es-AR": "Audio prédica" },
        createdBy: "admin",
        createdAt: T1,
      },
      {
        _id: ID_MEDIA_PDF_ES,
        pathname: "media/resumen-es.pdf",
        url: "https://blob.example/resumen-es.pdf",
        filename: "resumen-es.pdf",
        contentType: "application/pdf",
        size: 120_000,
        sha256: "4".repeat(64),
        title: { "es-AR": "Resumen ES" },
        createdBy: "admin",
        createdAt: T1,
      },
      {
        _id: ID_MEDIA_PDF_EN,
        pathname: "media/summary-en.pdf",
        url: "https://blob.example/summary-en.pdf",
        filename: "summary-en.pdf",
        contentType: "application/pdf",
        size: 118_000,
        sha256: "5".repeat(64),
        title: { "es-AR": "Resumen EN", "en-US": "Summary EN" },
        createdBy: "admin",
        createdAt: T1,
      },
      {
        _id: ID_MEDIA_EMBED,
        pathname: "media/segment.mp3",
        url: "https://blob.example/segment.mp3",
        filename: "segment.mp3",
        contentType: "audio/mpeg",
        size: 900_000,
        sha256: "6".repeat(64),
        title: { "es-AR": "Segmento 1", "en-US": "Segment 1" },
        createdBy: "admin",
        createdAt: T1,
      },
    ],
    [COLLECTIONS.authors]: [
      {
        _id: ID_AUTHOR_1,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: { name: "Juan Borrador", email: "juan@example.com" },
        published: {
          name: "Juan García",
          avatarMediaId: ID_MEDIA_AVATAR.toHexString(),
          email: "juan@example.com",
        },
      },
      {
        _id: ID_AUTHOR_2,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: { name: "Pedro López" },
        published: { name: "Pedro López" },
      },
      {
        _id: ID_AUTHOR_INT,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: { name: "Jonathan H." },
        published: { name: "Jonathan H." },
      },
    ],
    [COLLECTIONS.bibleVerses]: [
      {
        _id: ID_VERSE_1,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: {
          book: { "es-AR": "Efesios", "en-US": "Ephesians" },
          chapter: 2,
          fromVerse: 8,
          toVerse: 9,
          text: { "es-AR": "Por gracia sois salvos" },
          version: { "es-AR": "RVR1960" },
        },
        published: {
          book: { "es-AR": "Efesios", "en-US": "Ephesians" },
          chapter: 2,
          fromVerse: 8,
          toVerse: 9,
          text: { "es-AR": "Por gracia sois salvos" },
          version: { "es-AR": "RVR1960" },
        },
      },
      {
        _id: ID_VERSE_2,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: {
          book: { "es-AR": "Romanos" },
          chapter: 3,
          fromVerse: 24,
          text: { "es-AR": "Justificados gratuitamente" },
          version: { "es-AR": "NVI" },
        },
        published: {
          book: { "es-AR": "Romanos" },
          chapter: 3,
          fromVerse: 24,
          text: { "es-AR": "Justificados gratuitamente" },
          version: { "es-AR": "NVI" },
        },
      },
    ],
    [COLLECTIONS.posts]: [
      {
        _id: ID_POST_1,
        revision: 2,
        createdAt: T1,
        updatedAt: T3, // Re-published typo later than POST_2, but older publishedDate!
        updatedBy: "admin",
        publishedAt: T3,
        draft: {
          slug: "post-uno",
          title: { "es-AR": "Post Uno Borrador" },
          publishedDate: "2026-01-15",
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 1" },
          seoDescription: { "es-AR": "Desc 1" },
        },
        published: {
          slug: "post-uno",
          title: { "es-AR": "Post Uno", "en-US": "Post One" },
          subtitle: { "es-AR": "Sub ES" },
          category: "Community",
          publishedDate: "2026-01-15",
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 1" },
          seoDescription: { "es-AR": "Desc 1" },
          keywords: { "es-AR": ["fe"] },
          // Deliberately reversed order + includes draft-only post to test order & filtering
          relatedPostIds: [
            ID_POST_3.toHexString(),
            ID_POST_DRAFT.toHexString(),
            ID_POST_2.toHexString(),
          ],
        },
      },
      {
        _id: ID_POST_2,
        revision: 1,
        createdAt: T2,
        updatedAt: T2,
        updatedBy: "admin",
        publishedAt: T2,
        draft: {
          slug: "post-dos",
          title: { "es-AR": "Post Dos" },
          publishedDate: "2026-03-01",
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 2" },
          seoDescription: { "es-AR": "Desc 2" },
        },
        published: {
          slug: "post-dos",
          title: { "es-AR": "Post Dos" },
          publishedDate: "2026-03-01",
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 2" },
          seoDescription: { "es-AR": "Desc 2" },
        },
      },
      {
        _id: ID_POST_3,
        revision: 1,
        createdAt: T2,
        updatedAt: T2,
        updatedBy: "admin",
        publishedAt: T2,
        draft: {
          slug: "post-tres",
          title: { "es-AR": "Post Tres" },
          publishedDate: "2026-03-01", // Same date as POST_2 -> tie-break by _id ASC
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 3" },
          seoDescription: { "es-AR": "Desc 3" },
        },
        published: {
          slug: "post-tres",
          title: { "es-AR": "Post Tres" },
          publishedDate: "2026-03-01",
          authorId: ID_AUTHOR_1.toHexString(),
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          content: { "es-AR": PLAIN_DOC },
          seoTitle: { "es-AR": "SEO 3" },
          seoDescription: { "es-AR": "Desc 3" },
        },
      },
      {
        _id: ID_POST_DRAFT,
        revision: 1,
        createdAt: T3,
        updatedAt: T3,
        updatedBy: "admin",
        draft: {
          slug: "solo-borrador",
          title: { "es-AR": "Solo Borrador" },
          publishedDate: "2026-04-01",
        },
      },
    ],
    [COLLECTIONS.topics]: [
      {
        _id: ID_TOPIC_PRIVACY,
        revision: 1,
        createdAt: T1,
        updatedAt: T2,
        updatedBy: "admin",
        publishedAt: T2,
        draft: {
          name: { "es-AR": "Privacidad Borrador", "en-US": "Privacy Draft" },
          slug: { "es-AR": "privacidad", "en-US": "privacy" },
          body: { "es-AR": PLAIN_DOC },
        },
        published: {
          name: { "es-AR": "Política de Privacidad", "en-US": "Privacy Policy" },
          slug: { "es-AR": "privacidad", "en-US": "privacy" },
          shortDescription: { "es-AR": "Cómo usamos tus datos." },
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          body: { "es-AR": PLAIN_DOC },
        },
      },
    ],
    [COLLECTIONS.sermons]: [
      {
        _id: ID_SERMON_1,
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T1,
        draft: {
          slug: "la-gracia",
          title: { "es-AR": "La Gracia Borrador" },
          sermonDate: "2026-03-16",
          thesis: { "es-AR": "Tesis borrador" },
          mainPoints: { "es-AR": ["P1"] },
          excerpt: { "es-AR": "Extracto" },
          content: { "es-AR": SERMON_DOC_WITH_EMBED },
          preacherId: ID_AUTHOR_1.toHexString(),
        },
        published: {
          slug: "la-gracia",
          title: { "es-AR": "La Gracia", "en-US": "Grace" },
          sermonDate: "2026-03-16",
          thesis: { "es-AR": "Salvos por gracia" },
          mainPoints: { "es-AR": ["Gracia", "Fe"] },
          excerpt: { "es-AR": "Un mensaje sobre la gracia" },
          durationSeconds: 2730,
          content: { "es-AR": SERMON_DOC_WITH_EMBED },
          featuredImageId: ID_MEDIA_IMG.toHexString(),
          audioMediaId: ID_MEDIA_AUDIO.toHexString(),
          audioLanguages: ["es-AR", "en-US"],
          pdfSummaryMediaId: {
            "es-AR": ID_MEDIA_PDF_ES.toHexString(),
            "en-US": ID_MEDIA_PDF_EN.toHexString(),
          },
          preacherId: ID_AUTHOR_1.toHexString(),
          additionalPreacherIds: [ID_AUTHOR_2.toHexString()],
          interpreterId: ID_AUTHOR_INT.toHexString(),
          scriptureRefIds: [
            ID_VERSE_2.toHexString(),
            ID_VERSE_1.toHexString(),
          ],
          seoTitle: { "es-AR": "La Gracia | IDC" },
          seoDescription: { "es-AR": "SEO desc" },
          keywords: { "es-AR": ["gracia"] },
          relatedSermonIds: [
            ID_SERMON_3.toHexString(),
            ID_SERMON_DRAFT.toHexString(),
            ID_SERMON_2.toHexString(),
          ],
        },
      },
      {
        _id: ID_SERMON_2,
        revision: 1,
        createdAt: T2,
        updatedAt: T2,
        updatedBy: "admin",
        publishedAt: T2,
        draft: {
          slug: "el-amor",
          title: { "es-AR": "El Amor" },
          sermonDate: "2026-03-23",
          thesis: { "es-AR": "Tesis" },
          mainPoints: { "es-AR": ["A"] },
          excerpt: { "es-AR": "Sobre el amor" },
          preacherId: ID_AUTHOR_1.toHexString(),
        },
        published: {
          slug: "el-amor",
          title: { "es-AR": "El Amor" },
          sermonDate: "2026-03-23",
          thesis: { "es-AR": "Tesis" },
          mainPoints: { "es-AR": ["A"] },
          excerpt: { "es-AR": "Sobre el amor" },
          preacherId: ID_AUTHOR_1.toHexString(),
        },
      },
      {
        _id: ID_SERMON_3,
        revision: 1,
        createdAt: T2,
        updatedAt: T2,
        updatedBy: "admin",
        publishedAt: T2,
        draft: {
          slug: "la-fe",
          title: { "es-AR": "La Fe" },
          sermonDate: "2026-03-09",
          thesis: { "es-AR": "Tesis" },
          mainPoints: { "es-AR": ["F"] },
          excerpt: { "es-AR": "Sobre la fe" },
          preacherId: ID_AUTHOR_1.toHexString(),
        },
        published: {
          slug: "la-fe",
          title: { "es-AR": "La Fe" },
          sermonDate: "2026-03-09",
          thesis: { "es-AR": "Tesis" },
          mainPoints: { "es-AR": ["F"] },
          excerpt: { "es-AR": "Sobre la fe" },
          preacherId: ID_AUTHOR_1.toHexString(),
        },
      },
      {
        _id: ID_SERMON_DRAFT,
        revision: 1,
        createdAt: T3,
        updatedAt: T3,
        updatedBy: "admin",
        draft: {
          slug: "sermon-borrador",
          title: { "es-AR": "Sermón Borrador" },
          sermonDate: "2026-04-01",
        },
      },
    ],
  };
}

beforeEach(() => {
  state.cache = createNextCacheHarness();
  state.mockDb = createMockContentDb(makeSeed());
  state.dbAvailable = true;
});

describe("blog post readers", () => {
  it("orders getLatestBlogPostPages by publishedDate DESC with _id ASC tie-break (not publishedAt) and excludes slug", async () => {
    const latest = await getLatestBlogPostPages("es-AR");
    // POST_2 and POST_3 both have 2026-03-01 (POST_2._id < POST_3._id); POST_1 has older date even though publishedAt is T3
    expect(latest.map((p) => p.slug)).toEqual([
      "post-dos",
      "post-tres",
      "post-uno",
    ]);

    const excluding = await getLatestBlogPostPages("es-AR", {
      slug: "post-dos",
    });
    expect(excluding.map((p) => p.slug)).toEqual(["post-tres", "post-uno"]);
  });

  it("getBlogPostPage preserves stored related order, omits unpublished related posts in published mode, and applies en-US fallback", async () => {
    const post = (await getBlogPostPage("post-uno", "en-US"))!;
    expect(post.title).toBe("Post One");
    expect(post.subtitle).toBe("Sub ES"); // en-US fallback to es-AR
    expect(post.author).toEqual({
      name: "Juan García",
      avatar: { url: "https://blob.example/av.jpg", title: "Foto pastor" },
      email: "juan@example.com",
    });
    expect(post.relatedBlogPostsCollection.items.map((r) => r.slug)).toEqual([
      "post-tres",
      "post-dos",
    ]);
    expect(post.sys).toEqual({
      id: ID_POST_1.toHexString(),
      publishedAt: T3.toISOString(),
    });
    expect(post.__typename).toBe("BlogPostPage");

    // Draft-only post is not found in published mode, found in draft mode
    expect(await getBlogPostPage("solo-borrador", "es-AR")).toBeUndefined();
    expect(
      (await getBlogPostPage("solo-borrador", "es-AR", true))?.title,
    ).toBe("Solo Borrador");
  });

  it("getBlogPostPageById & getBlogPostPage reject invalid ids/slugs without querying MongoDB", async () => {
    state.mockDb!.resetQueryCount();
    expect(await getBlogPostPage("Bad Slug", "es-AR")).toBeUndefined();
    expect(await getBlogPostPage("../etc", "es-AR")).toBeUndefined();
    // 12-char ASCII string: BSON ObjectId.isValid would accept it, our strict 24-hex guard rejects it!
    expect(await getBlogPostPageById("123456789012", "es-AR")).toBeUndefined();
    expect(await getBlogPostPageById("not-hex", "es-AR")).toBeUndefined();
    expect(
      await getBlogPostPageById(ID_POST_1.toHexString(), "fr-FR"),
    ).toBeUndefined();
    expect(state.mockDb!.getQueryCount()).toBe(0);

    const byId = await getBlogPostPageById(ID_POST_1.toHexString(), "es-AR");
    expect(byId?.slug).toBe("post-uno");
  });

  it("getAllBlogPostSlugs returns >100 posts without truncation and throws when DB is down", async () => {
    const manyPosts = Array.from({ length: 125 }, (_, i) => ({
      _id: new ObjectId(),
      revision: 1,
      createdAt: T1,
      updatedAt: T1,
      updatedBy: "admin",
      publishedAt: T2,
      draft: { slug: `post-${i}`, title: { "es-AR": `P${i}` } },
      published: {
        slug: `post-${i}`,
        title: { "es-AR": `P${i}` },
        publishedDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      },
    }));
    state.mockDb!.setCollection(COLLECTIONS.posts, manyPosts);

    const slugs = await getAllBlogPostSlugs("es-AR");
    expect(slugs).toHaveLength(125);
    expect(slugs[0]!.updatedAt).toBe(T2.toISOString());

    // DB unreachable MUST throw (ICR-123)
    state.cache!.reset();
    state.dbAvailable = false;
    await expect(getAllBlogPostSlugs("es-AR")).rejects.toThrow(/unavailable/i);

    // Query error MUST throw
    state.dbAvailable = true;
    state.mockDb!.failQueriesWith(new Error("socket timeout"));
    await expect(getAllBlogPostSlugs("es-AR")).rejects.toThrow("socket timeout");
  });

  it("returns fresh content on very next read after revalidateSiteContent()", async () => {
    expect((await getBlogPostPage("post-uno", "es-AR"))?.title).toBe("Post Uno");

    // Mutate underlying DB directly
    const updatedSeed = makeSeed();
    const posts = updatedSeed[COLLECTIONS.posts]!;
    posts[0]!.published!.title = { "es-AR": "Post Uno Actualizado" };
    state.mockDb!.setCollection(COLLECTIONS.posts, posts);

    // Still cached prior to invalidation
    expect((await getBlogPostPage("post-uno", "es-AR"))?.title).toBe("Post Uno");

    revalidateSiteContent();
    expect((await getBlogPostPage("post-uno", "es-AR"))?.title).toBe(
      "Post Uno Actualizado",
    );
  });
});

describe("getChurchInfoTopic", () => {
  it("matches strictly by the requested locale slug while falling back on non-slug fields", async () => {
    const es = await getChurchInfoTopic("privacidad", "es-AR");
    expect(es?.name).toBe("Política de Privacidad");
    expect(es?.slug).toBe("privacidad");

    const en = await getChurchInfoTopic("privacy", "en-US");
    expect(en?.name).toBe("Privacy Policy");
    expect(en?.slug).toBe("privacy");
    expect(en?.shortDescription).toBe("Cómo usamos tus datos."); // fallback

    // Strict locale slug: cross-locale lookup MUST return undefined
    expect(await getChurchInfoTopic("privacidad", "en-US")).toBeUndefined();
    expect(await getChurchInfoTopic("privacy", "es-AR")).toBeUndefined();

    // Draft mode
    expect((await getChurchInfoTopic("privacy", "en-US", true))?.name).toBe(
      "Privacy Draft",
    );
  });
});

describe("sermon readers", () => {
  it("getSermon resolves numeric scriptureReferences, localized pdfSummary, audioLanguages, interpreter, and ONLY embedded media in content.media", async () => {
    const sermon = (await getSermon("la-gracia", "en-US"))!;
    expect(sermon.title).toBe("Grace");
    expect(sermon.audioLanguages).toEqual(["es-AR", "en-US"]);
    expect(sermon.preacher?.name).toBe("Juan García");
    expect(sermon.additionalPreachers.map((a) => a.name)).toEqual([
      "Pedro López",
    ]);
    expect(sermon.interpreter?.name).toBe("Jonathan H.");
    // Numeric chapter/fromVerse/toVerse in stored reference order
    expect(sermon.scriptureReferences).toEqual([
      {
        book: "Romanos",
        chapter: 3,
        fromVerse: 24,
        toVerse: null,
        verseContent: "Justificados gratuitamente",
        bibleVersion: "NVI",
      },
      {
        book: "Ephesians",
        chapter: 2,
        fromVerse: 8,
        toVerse: 9,
        verseContent: "Por gracia sois salvos",
        bibleVersion: "RVR1960",
      },
    ]);
    expect(sermon.pdfSummary).toEqual({
      url: "https://blob.example/summary-en.pdf",
      title: "Summary EN",
      contentType: "application/pdf",
      fileName: "summary-en.pdf",
      size: 118_000,
    });
    // content.media contains ONLY the embedded audio segment (not featuredImage/audio/pdfSummary!)
    expect(Object.keys(sermon.content!.media)).toEqual([
      ID_MEDIA_EMBED.toHexString(),
    ]);
    expect(sermon.content!.media[ID_MEDIA_EMBED.toHexString()]).toEqual({
      url: "https://blob.example/segment.mp3",
      title: "Segment 1",
      contentType: "audio/mpeg",
      fileName: "segment.mp3",
      size: 900_000,
    });
    // Related sermons preserve stored order and skip draft-only sermon
    expect(sermon.relatedSermons.map((r) => r.slug)).toEqual([
      "la-fe",
      "el-amor",
    ]);
    expect(sermon).not.toHaveProperty("__typename");

    expect(
      (await getSermonById(ID_SERMON_1.toHexString(), "es-AR"))?.pdfSummary
        ?.fileName,
    ).toBe("resumen-es.pdf");
  });

  it("getLatestSermons orders by sermonDate DESC and excludes given slug", async () => {
    const latest = await getLatestSermons("es-AR", { slug: "el-amor" });
    expect(latest.map((s) => s.slug)).toEqual(["la-gracia", "la-fe"]);
  });

  it("getAllSermons returns >100 items, defaults audioLanguages, and soft-fails to [] without caching the outage", async () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const many = Array.from({ length: 115 }, (_, i) => ({
        _id: new ObjectId(),
        revision: 1,
        createdAt: T1,
        updatedAt: T1,
        updatedBy: "admin",
        publishedAt: T2,
        draft: { slug: `sermon-${i}`, title: { "es-AR": `S${i}` } },
        published: {
          slug: `sermon-${i}`,
          title: { "es-AR": `S${i}` },
          sermonDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          thesis: { "es-AR": "T" },
          excerpt: { "es-AR": "E" },
        },
      }));
      state.mockDb!.setCollection(COLLECTIONS.sermons, many);

      // Simulate transient outage FIRST -> returns [] and MUST NOT poison cache
      state.dbAvailable = false;
      expect(await getAllSermons("es-AR")).toEqual([]);
      expect(consoleErr).toHaveBeenCalled();

      // DB recovers -> returns all 115 sermons!
      state.dbAvailable = true;
      const all = await getAllSermons("es-AR");
      expect(all).toHaveLength(115);
      expect(all[0]!.audioLanguages).toEqual(["es-AR"]);
      expect(all[0]!.content).toBeUndefined();
    } finally {
      consoleErr.mockRestore();
    }
  });

  it("getAllSermonSlugs returns all published slugs and throws when DB is unreachable or query fails", async () => {
    const slugs = await getAllSermonSlugs("es-AR");
    expect(slugs.map((s) => s.slug)).toEqual(["el-amor", "la-gracia", "la-fe"]);

    state.cache!.reset();
    state.dbAvailable = false;
    await expect(getAllSermonSlugs("es-AR")).rejects.toThrow(/unavailable/i);

    state.dbAvailable = true;
    state.mockDb!.failQueriesWith(new Error("read failed"));
    await expect(getAllSermonSlugs("es-AR")).rejects.toThrow("read failed");
  });

  it("rejects malformed sermon slugs and non-24-hex ids without querying MongoDB", async () => {
    state.mockDb!.resetQueryCount();
    expect(await getSermon("Bad Slug", "es-AR")).toBeUndefined();
    expect(await getSermonById("123456789012", "es-AR")).toBeUndefined();
    expect(await getSermonById("zzzzzzzzzzzzzzzzzzzzzzzz", "es-AR")).toBeUndefined();
    expect(state.mockDb!.getQueryCount()).toBe(0);
  });
});
