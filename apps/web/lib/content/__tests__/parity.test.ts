import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, GLOBAL_KIND, type RichTextDoc } from "@idcr/content";
import { ObjectId } from "mongodb";
import {
  createMockContentDb,
  createNextCacheHarness,
} from "./test-helpers";

const state = vi.hoisted(() => ({
  cache: null as ReturnType<typeof createNextCacheHarness> | null,
  mockDb: null as ReturnType<typeof createMockContentDb> | null,
  fetchGraphQL: vi.fn(),
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
  connect: vi.fn(async () => ({} as never)),
  getWebsiteDb: vi.fn(() => state.mockDb!.db),
}));

vi.mock("../../contentful/fetch", () => ({
  fetchGraphQL: (...args: unknown[]) => state.fetchGraphQL(...args),
}));

// Old Contentful readers
import * as oldSeo from "../../contentful/getSeo";
import * as oldSection from "../../contentful/getSection";
import * as oldCta from "../../contentful/getCtaComponent";
import * as oldHero from "../../contentful/getHeroBannerComponent";
import * as oldText from "../../contentful/getTextBlockComponent";
import * as oldNav from "../../contentful/getNavigationMenu";
import * as oldFooter from "../../contentful/getFooter";
import * as oldSingleEmail from "../../contentful/getSingleEmailForm";
import * as oldContact from "../../contentful/getContactForm";
import * as oldEvent from "../../contentful/getEventBanner";
import * as oldCollection from "../../contentful/getContentCollection";
import * as oldMapCollection from "../../contentful/mapContentCollection";
import * as oldBlog from "../../contentful/getBlogPostPages";
import * as oldTopic from "../../contentful/getChurchInfoTopic";
import * as oldSermons from "../../contentful/getSermons";

// New MongoDB readers
import * as nextContent from "../index";

const ID_IMG = new ObjectId("670000000000000000000001");
const ID_AUDIO = new ObjectId("670000000000000000000002");
const ID_PDF = new ObjectId("670000000000000000000003");
const ID_AUTHOR = new ObjectId("670000000000000000000004");
const ID_VERSE = new ObjectId("670000000000000000000005");
const ID_SEO = new ObjectId("670000000000000000000010");
const ID_SECTION = new ObjectId("670000000000000000000011");
const ID_NAV = new ObjectId("670000000000000000000012");
const ID_FOOTER = new ObjectId("670000000000000000000013");
const ID_LOC = new ObjectId("670000000000000000000014");
const ID_EMAIL = new ObjectId("670000000000000000000015");
const ID_CONTACT = new ObjectId("670000000000000000000016");
const ID_EVENT = new ObjectId("670000000000000000000017");
const ID_COLL = new ObjectId("670000000000000000000018");
const ID_POST = new ObjectId("670000000000000000000019");
const ID_TOPIC = new ObjectId("67000000000000000000001a");
const ID_SERMON = new ObjectId("67000000000000000000001b");

const PUB_DATE = new Date("2026-05-01T12:00:00.000Z");
const TIPTAP_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Paridad" }] }],
};
const SERMON_TIPTAP_DOC: RichTextDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Sermón" }] },
    {
      type: "embeddedMedia",
      attrs: { mediaId: ID_AUDIO.toHexString(), kind: "audio" },
    },
  ],
};
const CTF_RT = { json: { nodeType: "document", content: [] } };
const CTF_RT_LINKS = {
  json: { nodeType: "document", content: [] },
  links: { assets: { block: [], hyperlink: [] }, entries: { block: [], hyperlink: [] } },
};

function stripKeys<T extends Record<string, unknown>>(obj: T, keys: string[]) {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

beforeEach(() => {
  state.cache = createNextCacheHarness();
  state.fetchGraphQL.mockReset();
  state.mockDb = createMockContentDb({
    [COLLECTIONS.media]: [
      {
        _id: ID_IMG,
        pathname: "m/hero.jpg",
        url: "https://blob.example/hero.jpg",
        filename: "hero.jpg",
        contentType: "image/jpeg",
        size: 1024,
        sha256: "a".repeat(64),
        width: 1200,
        height: 630,
        title: { "es-AR": "Hero" },
        alt: { "es-AR": "Hero" },
        createdBy: "admin",
        createdAt: PUB_DATE,
      },
      {
        _id: ID_AUDIO,
        pathname: "m/audio.mp3",
        url: "https://blob.example/audio.mp3",
        filename: "audio.mp3",
        contentType: "audio/mpeg",
        size: 500000,
        sha256: "b".repeat(64),
        title: { "es-AR": "Audio" },
        createdBy: "admin",
        createdAt: PUB_DATE,
      },
      {
        _id: ID_PDF,
        pathname: "m/resumen.pdf",
        url: "https://blob.example/resumen.pdf",
        filename: "resumen.pdf",
        contentType: "application/pdf",
        size: 25000,
        sha256: "c".repeat(64),
        title: { "es-AR": "Resumen" },
        createdBy: "admin",
        createdAt: PUB_DATE,
      },
    ],
    [COLLECTIONS.authors]: [
      {
        _id: ID_AUTHOR,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { name: "Ana", avatarMediaId: ID_IMG.toHexString(), email: "ana@example.com" },
        published: { name: "Ana", avatarMediaId: ID_IMG.toHexString(), email: "ana@example.com" },
      },
    ],
    [COLLECTIONS.bibleVerses]: [
      {
        _id: ID_VERSE,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: {
          book: { "es-AR": "Juan" },
          chapter: 3,
          fromVerse: 16,
          toVerse: 17,
          text: { "es-AR": "Porque de tal manera..." },
          version: { "es-AR": "NVI" },
        },
        published: {
          book: { "es-AR": "Juan" },
          chapter: 3,
          fromVerse: 16,
          toVerse: 17,
          text: { "es-AR": "Porque de tal manera..." },
          version: { "es-AR": "NVI" },
        },
      },
    ],
    [COLLECTIONS.seoEntries]: [
      {
        _id: ID_SEO,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { machineName: "seo-home" },
        published: {
          machineName: "seo-home",
          title: { "es-AR": "Inicio" },
          description: { "es-AR": "Desc" },
          keywords: { "es-AR": ["iglesia"] },
          imageId: ID_IMG.toHexString(),
          siteName: { "es-AR": "IDC" },
          type: "website",
        },
      },
    ],
    [COLLECTIONS.sections]: [
      {
        _id: ID_SECTION,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { machineName: "our-mission" },
        published: {
          machineName: "our-mission",
          layout: "hero",
          headline: { "es-AR": "Misión" },
          subHeadline: { "es-AR": "Sub" },
          body: { "es-AR": TIPTAP_DOC },
          ctaText: { "es-AR": "Ver" },
          targetPage: "community",
          urlParameters: null,
          image: ID_IMG.toHexString(),
          images: [ID_IMG.toHexString()],
        },
      },
    ],
    [COLLECTIONS.globals]: [
      {
        _id: ID_NAV,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { kind: GLOBAL_KIND.navigationMenu, machineName: "main-menu" },
        published: {
          kind: GLOBAL_KIND.navigationMenu,
          machineName: "main-menu",
          menuItems: [{ groupName: { "es-AR": "Blog" }, groupLink: "blog" }],
        },
      },
      {
        _id: ID_LOC,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { kind: GLOBAL_KIND.location, machineName: "location" },
        published: {
          kind: GLOBAL_KIND.location,
          machineName: "location",
          addressLine1: "Perón 4385",
          neighborhood: "Almagro",
          city: "Buenos Aires",
          country: "Argentina",
          mapEmbedUrl: "https://maps.example/embed",
          googleMapsUrl: "https://maps.example/go",
          lat: -34.6,
          lon: -58.4,
        },
      },
      {
        _id: ID_FOOTER,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { kind: GLOBAL_KIND.footer, machineName: "footer" },
        published: {
          kind: GLOBAL_KIND.footer,
          machineName: "footer",
          logo: ID_IMG.toHexString(),
          shortDescription: { "es-AR": "Iglesia" },
          socialLinks: [{ platform: "facebook", url: "https://fb.example" }],
        },
      },
      {
        _id: ID_EMAIL,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { kind: GLOBAL_KIND.singleEmailForm, machineName: "single-email-subscribe" },
        published: {
          kind: GLOBAL_KIND.singleEmailForm,
          machineName: "single-email-subscribe",
          title: { "es-AR": "Boletín" },
          shortDescription: { "es-AR": "Sumate" },
          ctaText: { "es-AR": "Enviar" },
          inputPlaceholder: { "es-AR": "Email" },
          successMessage: { "es-AR": "Listo" },
        },
      },
      {
        _id: ID_CONTACT,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { kind: GLOBAL_KIND.contactForm, machineName: "contact-form" },
        published: {
          kind: GLOBAL_KIND.contactForm,
          machineName: "contact-form",
          title: { "es-AR": "Contacto" },
          description: { "es-AR": "Escribinos" },
          ctaText: { "es-AR": "Enviar" },
          image: ID_IMG.toHexString(),
          bibleVerseId: ID_VERSE.toHexString(),
          agreementNote: { "es-AR": TIPTAP_DOC },
          fields: [
            {
              inputId: "name",
              type: "Short text",
              required: true,
              name: { "es-AR": "Nombre" },
              values: { "es-AR": [] },
              placeholder: { "es-AR": "Tu nombre" },
            },
          ],
        },
      },
    ],
    [COLLECTIONS.eventBanners]: [
      {
        _id: ID_EVENT,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { machineName: "event-sunday-meetings" },
        published: {
          machineName: "event-sunday-meetings",
          event: {
            name: { "es-AR": "Culto" },
            dayOfWeek: { "es-AR": "Domingo" },
            date: null,
            time: "10:30",
            note: { "es-AR": "Todos invitados" },
          },
          image: ID_IMG.toHexString(),
        },
      },
    ],
    [COLLECTIONS.beliefCollections]: [
      {
        _id: ID_COLL,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { machineName: "our-creed" },
        published: {
          machineName: "our-creed",
          title: { "es-AR": "Credo" },
          description: { "es-AR": TIPTAP_DOC },
          items: [
            {
              title: { "es-AR": "Unidad" },
              description: { "es-AR": TIPTAP_DOC },
              bibleVerseId: ID_VERSE.toHexString(),
              imageId: ID_IMG.toHexString(),
              kind: "Creed",
            },
          ],
        },
      },
    ],
    [COLLECTIONS.posts]: [
      {
        _id: ID_POST,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { slug: "articulo-1", title: { "es-AR": "Artículo 1" } },
        published: {
          slug: "articulo-1",
          title: { "es-AR": "Artículo 1" },
          subtitle: { "es-AR": "Sub" },
          category: "Events",
          featuredImageId: ID_IMG.toHexString(),
          content: { "es-AR": TIPTAP_DOC },
          authorId: ID_AUTHOR.toHexString(),
          publishedDate: "2026-05-01",
          seoTitle: { "es-AR": "SEO Art" },
          seoDescription: { "es-AR": "SEO Desc" },
          keywords: { "es-AR": ["evento"] },
          relatedPostIds: [],
        },
      },
    ],
    [COLLECTIONS.topics]: [
      {
        _id: ID_TOPIC,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { name: { "es-AR": "Privacidad" }, slug: { "es-AR": "privacidad" } },
        published: {
          name: { "es-AR": "Privacidad" },
          slug: { "es-AR": "privacidad" },
          shortDescription: { "es-AR": "Resumen" },
          featuredImageId: ID_IMG.toHexString(),
          body: { "es-AR": TIPTAP_DOC },
        },
      },
    ],
    [COLLECTIONS.sermons]: [
      {
        _id: ID_SERMON,
        revision: 1,
        createdAt: PUB_DATE,
        updatedAt: PUB_DATE,
        updatedBy: "admin",
        publishedAt: PUB_DATE,
        draft: { slug: "predica-1", title: { "es-AR": "Prédica 1" } },
        published: {
          slug: "predica-1",
          title: { "es-AR": "Prédica 1" },
          sermonDate: "2026-05-01",
          thesis: { "es-AR": "Tesis" },
          mainPoints: { "es-AR": ["Punto 1"] },
          excerpt: { "es-AR": "Extracto" },
          durationSeconds: 1800,
          content: { "es-AR": SERMON_TIPTAP_DOC },
          featuredImageId: ID_IMG.toHexString(),
          audioMediaId: ID_AUDIO.toHexString(),
          audioLanguages: ["es-AR"],
          pdfSummaryMediaId: { "es-AR": ID_PDF.toHexString() },
          preacherId: ID_AUTHOR.toHexString(),
          additionalPreacherIds: [],
          scriptureRefIds: [ID_VERSE.toHexString()],
          seoTitle: { "es-AR": "SEO Pred" },
          seoDescription: { "es-AR": "Desc Pred" },
          keywords: { "es-AR": ["biblia"] },
          relatedSermonIds: [],
        },
      },
    ],
  });
});

describe("AC1 getter-shape parity: lib/contentful vs lib/content across all 19 readers", () => {
  it("matches getSeo deep-equal", async () => {
    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        seoCollection: {
          items: [
            {
              title: "Inicio",
              description: "Desc",
              keywords: ["iglesia"],
              image: { url: "https://blob.example/hero.jpg", title: "Hero", width: 1200, height: 630 },
              siteName: "IDC",
              type: "website",
              sys: { id: ID_SEO.toHexString() },
              __typename: "Seo",
            },
          ],
        },
      },
    });
    const oldRes = await oldSeo.getSeo("seo-home", "es-AR");
    const newRes = await nextContent.getSeo("seo-home", "es-AR");
    expect(newRes).toEqual(oldRes);
  });

  it("matches getSection + 3 aliases deep-equal (except RichTextView body)", async () => {
    const item = {
      layout: "hero",
      headline: "Misión",
      subHeadline: "Sub",
      body: CTF_RT,
      ctaText: "Ver",
      targetPage: { slug: "community" },
      urlParameters: null,
      image: { url: "https://blob.example/hero.jpg", title: "Hero" },
      imagesCollection: {
        items: [{ url: "https://blob.example/hero.jpg", title: "Hero", width: 1200, height: 630 }],
      },
      sys: { id: ID_SECTION.toHexString() },
      __typename: "Section",
    };
    for (const [oldFn, newFn] of [
      [oldSection.getSection, nextContent.getSection],
      [oldCta.getCtaComponent, nextContent.getCtaComponent],
      [oldHero.getHeroBannerComponent, nextContent.getHeroBannerComponent],
      [oldText.getTextBlockComponent, nextContent.getTextBlockComponent],
    ] as const) {
      state.fetchGraphQL.mockResolvedValueOnce({
        data: { sectionCollection: { items: [item] } },
      });
      const oldRes = await oldFn("our-mission", "es-AR");
      const newRes = await newFn("our-mission", "es-AR");
      expect(stripKeys(newRes as unknown as Record<string, unknown>, ["body"])).toEqual(
        stripKeys(oldRes, ["body"]),
      );
      expect(newRes?.body).toEqual({ doc: TIPTAP_DOC, media: {} });
    }
  });

  it("matches getNavigationMenu, getFooter, getSingleEmailForm, getEventBanner deep-equal", async () => {
    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        navigationMenuCollection: {
          items: [
            { menuItemsCollection: { items: [{ groupName: "Blog", groupLink: { slug: "blog" } }] } },
          ],
        },
      },
    });
    expect(await nextContent.getNavigationMenu("main-menu", "es-AR")).toEqual(
      await oldNav.getNavigationMenu("main-menu", "es-AR"),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        footerCollection: {
          items: [
            {
              logo: { url: "https://blob.example/hero.jpg", title: "Hero" },
              shortDescription: "Iglesia",
              socialLinksCollection: {
                items: [{ platform: "facebook", url: "https://fb.example" }],
              },
              location: {
                addressLine1: "Perón 4385",
                neighborhood: "Almagro",
                city: "Buenos Aires",
                country: "Argentina",
                googleMapsUrl: "https://maps.example/go",
              },
            },
          ],
        },
      },
    });
    expect(await nextContent.getFooter("es-AR")).toEqual(
      await oldFooter.getFooter("es-AR"),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        singleEmailFormCollection: {
          items: [
            {
              title: "Boletín",
              shortDescription: "Sumate",
              ctaText: "Enviar",
              inputPlaceholder: "Email",
              successMessage: "Listo",
              sys: { id: ID_EMAIL.toHexString() },
              __typename: "SingleEmailForm",
            },
          ],
        },
      },
    });
    expect(
      await nextContent.getSingleEmailForm("single-email-subscribe", "es-AR"),
    ).toEqual(await oldSingleEmail.getSingleEmailForm("single-email-subscribe", "es-AR"));

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        eventBannerCollection: {
          items: [
            {
              eventInfo: {
                name: "Culto",
                dayOfWeek: "Domingo",
                date: null,
                time: "10:30",
                note: "Todos invitados",
              },
              location: {
                addressLine1: "Perón 4385",
                neighborhood: "Almagro",
                city: "Buenos Aires",
                country: "Argentina",
                mapEmbedUrl: "https://maps.example/embed",
                googleMapsUrl: "https://maps.example/go",
                location: { lat: -34.6, lon: -58.4 },
              },
              image: { url: "https://blob.example/hero.jpg", title: "Hero" },
              sys: { id: ID_EVENT.toHexString() },
              __typename: "EventBanner",
            },
          ],
        },
      },
    });
    expect(
      await nextContent.getEventBanner("event-sunday-meetings", "es-AR"),
    ).toEqual(await oldEvent.getEventBanner("event-sunday-meetings", "es-AR"));
  });

  it("matches getContactForm and getContentCollection (+ mapContentCollection) deep-equal (except RichTextView)", async () => {
    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        contactFormCollection: {
          items: [
            {
              title: "Contacto",
              description: "Escribinos",
              ctaText: "Enviar",
              image: { url: "https://blob.example/hero.jpg", title: "Hero" },
              agreementNote: CTF_RT,
              bibleVerse: {
                book: "Juan",
                chapter: "3",
                fromVerse: "16",
                toVerse: "17",
                verseContent: "Porque de tal manera...",
                bibleVersion: "NVI",
              },
              fieldsCollection: {
                items: [
                  {
                    name: "Nombre",
                    values: [],
                    type: "Short text",
                    required: true,
                    placeholder: "Tu nombre",
                    inputId: "name",
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const oldContactRes = await oldContact.getContactForm("es-AR");
    const newContactRes = await nextContent.getContactForm("es-AR");
    expect(
      stripKeys(newContactRes as unknown as Record<string, unknown>, ["agreementNote"]),
    ).toEqual(stripKeys(oldContactRes, ["agreementNote"]));
    expect(newContactRes.agreementNote).toEqual({ doc: TIPTAP_DOC, media: {} });

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        contentCollectionCollection: {
          items: [
            {
              title: "Credo",
              description: CTF_RT,
              contentItemsCollection: {
                items: [
                  {
                    title: "Unidad",
                    description: CTF_RT,
                    bibleVerse: {
                      book: "Juan",
                      chapter: "3",
                      fromVerse: "16",
                      toVerse: "17",
                      verseContent: "Porque de tal manera...",
                      bibleVersion: "NVI",
                    },
                    image: { url: "https://blob.example/hero.jpg", title: "Hero" },
                    kind: "Creed",
                    sys: { id: `${ID_COLL.toHexString()}:item:0` },
                    __typename: "BeliefItem",
                  },
                ],
              },
              sys: { id: ID_COLL.toHexString() },
              __typename: "ContentCollection",
            },
          ],
        },
      },
    });
    const oldColl = await oldCollection.getContentCollection("our-creed", "es-AR");
    const newColl = (await nextContent.getContentCollection("our-creed", "es-AR"))!;
    expect(
      stripKeys(newColl as unknown as Record<string, unknown>, [
        "description",
        "contentItemsCollection",
      ]),
    ).toEqual(
      stripKeys(oldColl as unknown as Record<string, unknown>, [
        "description",
        "contentItemsCollection",
      ]),
    );
    expect(
      stripKeys(newColl.contentItemsCollection.items[0] as unknown as Record<string, unknown>, [
        "description",
      ]),
    ).toEqual(
      stripKeys(oldColl.contentItemsCollection.items[0] as unknown as Record<string, unknown>, [
        "description",
      ]),
    );
    expect(nextContent.mapContentCollection(newColl).creedItems).toHaveLength(
      oldMapCollection.mapContentCollection(oldColl).creedItems.length,
    );
  });

  it("matches blog, topic, and sermon readers deep-equal (except RichTextView)", async () => {
    const postPayload = {
      title: "Artículo 1",
      subtitle: "Sub",
      category: "Events",
      slug: "articulo-1",
      featuredImage: { url: "https://blob.example/hero.jpg", title: "Hero" },
      content: CTF_RT_LINKS,
      author: {
        name: "Ana",
        avatar: { url: "https://blob.example/hero.jpg", title: "Hero" },
        email: "ana@example.com",
      },
      publishedDate: "2026-05-01",
      seoTitle: "SEO Art",
      seoDescription: "SEO Desc",
      keywords: ["evento"],
      relatedBlogPostsCollection: { items: [] },
      sys: { id: ID_POST.toHexString(), publishedAt: PUB_DATE.toISOString() },
      __typename: "BlogPostPage",
    };

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { blogPostPageCollection: { items: [postPayload] } },
    });
    const oldPost = await oldBlog.getBlogPostPage("articulo-1", "es-AR");
    const newPost = (await nextContent.getBlogPostPage("articulo-1", "es-AR"))!;
    expect(stripKeys(newPost as unknown as Record<string, unknown>, ["content"])).toEqual(
      stripKeys(oldPost, ["content"]),
    );
    expect(newPost.content).toEqual({ doc: TIPTAP_DOC, media: {} });

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { blogPostPageCollection: { items: [postPayload] } },
    });
    expect(
      stripKeys(
        (await nextContent.getBlogPostPageById(ID_POST.toHexString(), "es-AR"))! as unknown as Record<string, unknown>,
        ["content"],
      ),
    ).toEqual(
      stripKeys(
        (await oldBlog.getBlogPostPageById(ID_POST.toHexString(), "es-AR"))! as unknown as Record<string, unknown>,
        ["content"],
      ),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { blogPostPageCollection: { items: [postPayload] } },
    });
    expect(
      (await nextContent.getLatestBlogPostPages("es-AR")).map((p) =>
        stripKeys(p as unknown as Record<string, unknown>, ["content"]),
      ),
    ).toEqual(
      (await oldBlog.getLatestBlogPostPages("es-AR", {})).map(
        (p: Record<string, unknown>) => stripKeys(p, ["content"]),
      ),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        blogPostPageCollection: {
          items: [{ slug: "articulo-1", sys: { publishedAt: PUB_DATE.toISOString() } }],
        },
      },
    });
    expect(await nextContent.getAllBlogPostSlugs("es-AR")).toEqual(
      await oldBlog.getAllBlogPostSlugs("es-AR"),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        churchInfoTopicCollection: {
          items: [
            {
              name: "Privacidad",
              slug: "privacidad",
              shortDescription: "Resumen",
              featuredImage: { url: "https://blob.example/hero.jpg", title: "Hero" },
              body: CTF_RT_LINKS,
              sys: { id: ID_TOPIC.toHexString(), publishedAt: PUB_DATE.toISOString() },
              __typename: "ChurchInfoTopic",
            },
          ],
        },
      },
    });
    const oldTopicRes = (await oldTopic.getChurchInfoTopic("privacidad", "es-AR"))!;
    const newTopicRes = (await nextContent.getChurchInfoTopic("privacidad", "es-AR"))!;
    expect(stripKeys(newTopicRes as unknown as Record<string, unknown>, ["body"])).toEqual(
      stripKeys(oldTopicRes as unknown as Record<string, unknown>, ["body"]),
    );
    expect(newTopicRes.body).toEqual({ doc: TIPTAP_DOC, media: {} });

    const sermonPayload = {
      title: "Prédica 1",
      slug: "predica-1",
      sermonDate: "2026-05-01",
      thesis: "Tesis",
      mainPoints: ["Punto 1"],
      excerpt: "Extracto",
      durationSeconds: 1800,
      content: CTF_RT_LINKS,
      featuredImage: { url: "https://blob.example/hero.jpg", title: "Hero" },
      audio: {
        url: "https://blob.example/audio.mp3",
        title: "Audio",
        contentType: "audio/mpeg",
        fileName: "audio.mp3",
        size: 500000,
      },
      audioLanguages: ["es-AR"],
      pdfSummary: {
        url: "https://blob.example/resumen.pdf",
        title: "Resumen",
        contentType: "application/pdf",
        fileName: "resumen.pdf",
        size: 25000,
      },
      preacher: {
        name: "Ana",
        avatar: { url: "https://blob.example/hero.jpg", title: "Hero" },
        email: "ana@example.com",
      },
      additionalPreachersCollection: { items: [] },
      scriptureReferencesCollection: {
        items: [
          {
            book: "Juan",
            chapter: 3,
            fromVerse: 16,
            toVerse: 17,
            verseContent: "Porque de tal manera...",
            bibleVersion: "NVI",
          },
        ],
      },
      seoTitle: "SEO Pred",
      seoDescription: "Desc Pred",
      keywords: ["biblia"],
      relatedSermonsCollection: { items: [] },
      sys: { id: ID_SERMON.toHexString(), publishedAt: PUB_DATE.toISOString() },
      __typename: "Sermon",
    };

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { sermonCollection: { items: [sermonPayload] } },
    });
    const oldSermon = (await oldSermons.getSermon("predica-1", "es-AR"))!;
    const newSermon = (await nextContent.getSermon("predica-1", "es-AR"))!;
    expect(stripKeys(newSermon as unknown as Record<string, unknown>, ["content"])).toEqual(
      stripKeys(oldSermon as unknown as Record<string, unknown>, ["content"]),
    );
    expect(newSermon.content).toEqual({
      doc: SERMON_TIPTAP_DOC,
      media: {
        [ID_AUDIO.toHexString()]: {
          url: "https://blob.example/audio.mp3",
          title: "Audio",
          contentType: "audio/mpeg",
          fileName: "audio.mp3",
          size: 500000,
        },
      },
    });

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { sermonCollection: { items: [sermonPayload] } },
    });
    expect(
      stripKeys(
        (await nextContent.getSermonById(ID_SERMON.toHexString(), "es-AR"))! as unknown as Record<string, unknown>,
        ["content"],
      ),
    ).toEqual(
      stripKeys(
        (await oldSermons.getSermonById(ID_SERMON.toHexString(), "es-AR"))! as unknown as Record<string, unknown>,
        ["content"],
      ),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: { sermonCollection: { items: [sermonPayload] } },
    });
    expect(
      (await nextContent.getLatestSermons("es-AR")).map((s) =>
        stripKeys(s as unknown as Record<string, unknown>, ["content"]),
      ),
    ).toEqual(
      (await oldSermons.getLatestSermons("es-AR")).map((s) =>
        stripKeys(s as unknown as Record<string, unknown>, ["content"]),
      ),
    );

    const sermonCardPayload = stripKeys(sermonPayload, [
      "content",
      "scriptureReferencesCollection",
      "relatedSermonsCollection",
      "additionalPreachersCollection",
      "audioLanguages",
      "pdfSummary",
    ]);
    state.fetchGraphQL.mockResolvedValueOnce({
      data: { sermonCollection: { total: 1, items: [sermonCardPayload] } },
    });
    expect(await nextContent.getAllSermons("es-AR")).toEqual(
      await oldSermons.getAllSermons("es-AR"),
    );

    state.fetchGraphQL.mockResolvedValueOnce({
      data: {
        sermonCollection: {
          total: 1,
          items: [{ slug: "predica-1", sys: { publishedAt: PUB_DATE.toISOString() } }],
        },
      },
    });
    expect(await nextContent.getAllSermonSlugs("es-AR")).toEqual(
      await oldSermons.getAllSermonSlugs("es-AR"),
    );
  });
});
