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

import { getSeo } from "../getSeo";
import { getSection } from "../getSection";
import { getCtaComponent } from "../getCtaComponent";
import { getHeroBannerComponent } from "../getHeroBannerComponent";
import { getTextBlockComponent } from "../getTextBlockComponent";
import { getNavigationMenu } from "../getNavigationMenu";
import { getFooter } from "../getFooter";
import { getSingleEmailForm } from "../getSingleEmailForm";
import { getContactForm } from "../getContactForm";
import { getEventBanner } from "../getEventBanner";
import { getContentCollection } from "../getContentCollection";
import { mapContentCollection } from "../mapContentCollection";

const ID_IMG_1 = new ObjectId("650000000000000000000001");
const ID_IMG_2 = new ObjectId("650000000000000000000002");
const ID_IMG_DECORATIVE = new ObjectId("650000000000000000000003");
const ID_VERSE = new ObjectId("650000000000000000000010");
const ID_SEO = new ObjectId("650000000000000000000020");
const ID_SECTION = new ObjectId("650000000000000000000021");
const ID_NAV = new ObjectId("650000000000000000000022");
const ID_FOOTER = new ObjectId("650000000000000000000023");
const ID_LOCATION = new ObjectId("650000000000000000000024");
const ID_EMAIL_FORM = new ObjectId("650000000000000000000025");
const ID_CONTACT = new ObjectId("650000000000000000000026");
const ID_EVENT = new ObjectId("650000000000000000000027");
const ID_COLLECTION = new ObjectId("650000000000000000000028");

const NOW = new Date("2026-06-01T12:00:00.000Z");
const SIMPLE_DOC_ES: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hola mundo" }] }],
};
const SIMPLE_DOC_EN: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
};

function baseSeed() {
  return {
    [COLLECTIONS.media]: [
      {
        _id: ID_IMG_1,
        pathname: "media/hero.jpg",
        url: "https://blob.example/hero.jpg",
        filename: "hero.jpg",
        contentType: "image/jpeg",
        size: 12000,
        sha256: "a".repeat(64),
        width: 1600,
        height: 900,
        title: { "es-AR": "Hero título", "en-US": "Hero title" },
        alt: { "es-AR": "Imagen principal", "en-US": "Hero image" },
        createdBy: "admin",
        createdAt: NOW,
      },
      {
        _id: ID_IMG_2,
        pathname: "media/photo2.jpg",
        url: "https://blob.example/photo2.jpg",
        filename: "photo2.jpg",
        contentType: "image/jpeg",
        size: 8000,
        sha256: "b".repeat(64),
        width: 800,
        height: 600,
        title: { "es-AR": "Foto 2" },
        alt: { "es-AR": "Foto comunidad" },
        createdBy: "admin",
        createdAt: NOW,
      },
      {
        _id: ID_IMG_DECORATIVE,
        pathname: "media/deco.png",
        url: "https://blob.example/deco.png",
        filename: "deco.png",
        contentType: "image/png",
        size: 1000,
        sha256: "c".repeat(64),
        title: { "es-AR": "Decorativa" },
        decorative: true,
        createdBy: "admin",
        createdAt: NOW,
      },
    ],
    [COLLECTIONS.bibleVerses]: [
      {
        _id: ID_VERSE,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          book: { "es-AR": "Juan (borrador)" },
          chapter: 3,
          fromVerse: 16,
          toVerse: 17,
          text: { "es-AR": "Texto borrador" },
          version: { "es-AR": "NVI" },
        },
        published: {
          book: { "es-AR": "Marcos", "en-US": "Mark" },
          chapter: 10,
          fromVerse: 45,
          text: { "es-AR": "Porque ni aun el Hijo del Hombre..." },
          version: { "es-AR": "RVR1960", "en-US": "NIV" },
        },
      },
    ],
    [COLLECTIONS.seoEntries]: [
      {
        _id: ID_SEO,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          machineName: "seo-home",
          title: { "es-AR": "Inicio Borrador" },
          description: { "es-AR": "Desc Borrador" },
          keywords: { "es-AR": ["borrador"] },
          imageId: ID_IMG_1.toHexString(),
          siteName: { "es-AR": "IDC Redentor" },
          type: "website",
        },
        published: {
          machineName: "seo-home",
          title: { "es-AR": "Inicio", "en-US": "Home" },
          description: { "es-AR": "Descripción ES" },
          keywords: { "es-AR": ["iglesia", "fe"] },
          imageId: ID_IMG_1.toHexString(),
          siteName: { "es-AR": "IDC Redentor", "en-US": "Redentor Church" },
          type: "website",
        },
      },
    ],
    [COLLECTIONS.sections]: [
      {
        _id: ID_SECTION,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          machineName: "our-mission",
          layout: "hero",
          headline: { "es-AR": "Misión Borrador" },
          body: { "es-AR": SIMPLE_DOC_ES },
          ctaText: { "es-AR": "Ver" },
          targetPage: "come-meet-us",
          image: ID_IMG_DECORATIVE.toHexString(),
        },
        published: {
          machineName: "our-mission",
          layout: "hero",
          headline: { "es-AR": "Nuestra Misión", "en-US": "Our Mission" },
          subHeadline: { "es-AR": "Comunidad" },
          body: { "es-AR": SIMPLE_DOC_ES, "en-US": SIMPLE_DOC_EN },
          ctaText: { "es-AR": "Conocenos" },
          targetPage: "come-meet-us",
          urlParameters: "ref=hero",
          image: ID_IMG_1.toHexString(),
          images: [ID_IMG_1.toHexString(), ID_IMG_2.toHexString()],
        },
      },
    ],
    [COLLECTIONS.globals]: [
      {
        _id: ID_NAV,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          kind: GLOBAL_KIND.navigationMenu,
          machineName: "main-menu",
          menuItems: [{ groupName: { "es-AR": "Borrador" }, groupLink: "blog" }],
        },
        published: {
          kind: GLOBAL_KIND.navigationMenu,
          machineName: "main-menu",
          menuItems: [
            { groupName: { "es-AR": "Comunidad", "en-US": "Community" }, groupLink: "community" },
            { groupName: { "es-AR": "Blog" }, groupLink: "blog" },
          ],
        },
      },
      {
        _id: ID_LOCATION,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          kind: GLOBAL_KIND.location,
          machineName: "location",
          addressLine1: "Calle Nueva 999",
          neighborhood: "Palermo",
          city: "Buenos Aires",
          country: "Argentina",
          mapEmbedUrl: "https://maps.example/embed-draft",
          googleMapsUrl: "https://maps.example/draft",
          lat: -34.5,
          lon: -58.4,
        },
        published: {
          kind: GLOBAL_KIND.location,
          machineName: "location",
          addressLine1: "Perón 4385",
          neighborhood: "Almagro",
          city: "Buenos Aires",
          country: "Argentina",
          mapEmbedUrl: "https://maps.example/embed",
          googleMapsUrl: "https://maps.example/go",
          lat: -34.6058,
          lon: -58.4287,
        },
      },
      {
        _id: ID_FOOTER,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          kind: GLOBAL_KIND.footer,
          machineName: "footer",
          logo: ID_IMG_1.toHexString(),
          shortDescription: { "es-AR": "Pie borrador" },
          socialLinks: [{ platform: "youtube", url: "https://youtube.com/@idcr" }],
        },
        published: {
          kind: GLOBAL_KIND.footer,
          machineName: "footer",
          logo: ID_IMG_1.toHexString(),
          shortDescription: { "es-AR": "Iglesia en Buenos Aires" },
          socialLinks: [{ platform: "instagram", url: "https://instagram.com/idcr" }],
        },
      },
      {
        _id: ID_EMAIL_FORM,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          kind: GLOBAL_KIND.singleEmailForm,
          machineName: "single-email-subscribe",
          title: { "es-AR": "Boletín borrador" },
          ctaText: { "es-AR": "Sumarme" },
        },
        published: {
          kind: GLOBAL_KIND.singleEmailForm,
          machineName: "single-email-subscribe",
          title: { "es-AR": "Suscribite", "en-US": "Subscribe" },
          shortDescription: { "es-AR": "Recibí novedades" },
          ctaText: { "es-AR": "Enviar" },
          inputPlaceholder: { "es-AR": "tu@email.com" },
          successMessage: { "es-AR": "¡Gracias!" },
        },
      },
      {
        _id: ID_CONTACT,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          kind: GLOBAL_KIND.contactForm,
          machineName: "contact-form",
          title: { "es-AR": "Contacto borrador" },
          description: { "es-AR": "Desc borrador" },
          ctaText: { "es-AR": "Enviar" },
          bibleVerseId: ID_VERSE.toHexString(),
          agreementNote: { "es-AR": SIMPLE_DOC_ES },
          fields: [
            {
              inputId: "name",
              type: "Short text",
              required: true,
              name: { "es-AR": "Nombre" },
              placeholder: { "es-AR": "Tu nombre" },
            },
          ],
        },
        published: {
          kind: GLOBAL_KIND.contactForm,
          machineName: "contact-form",
          title: { "es-AR": "Contactanos", "en-US": "Contact us" },
          description: { "es-AR": "Escribinos" },
          ctaText: { "es-AR": "Enviar" },
          image: ID_IMG_1.toHexString(),
          bibleVerseId: ID_VERSE.toHexString(),
          agreementNote: { "es-AR": SIMPLE_DOC_ES },
          fields: [
            {
              inputId: "subject",
              type: "Dropdown",
              required: true,
              name: { "es-AR": "Asunto", "en-US": "Subject" },
              values: { "es-AR": ["Consulta", "Oración"] },
              placeholder: { "es-AR": "Elegí" },
            },
          ],
        },
      },
    ],
    [COLLECTIONS.eventBanners]: [
      {
        _id: ID_EVENT,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          machineName: "event-sunday-meetings",
          event: {
            name: { "es-AR": "Reunión Borrador" },
            dayOfWeek: { "es-AR": "Domingos" },
            time: "11:00",
          },
          image: ID_IMG_1.toHexString(),
        },
        published: {
          machineName: "event-sunday-meetings",
          event: {
            name: { "es-AR": "Reunión Dominical", "en-US": "Sunday Service" },
            dayOfWeek: { "es-AR": "Domingos" },
            time: "10:30",
            note: { "es-AR": "Te esperamos" },
          },
          image: ID_IMG_1.toHexString(),
        },
      },
    ],
    [COLLECTIONS.beliefCollections]: [
      {
        _id: ID_COLLECTION,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: "admin",
        publishedAt: NOW,
        draft: {
          machineName: "our-creed",
          title: { "es-AR": "Credo Borrador" },
          items: [],
        },
        published: {
          machineName: "our-creed",
          title: { "es-AR": "Nuestro Credo", "en-US": "Our Creed" },
          description: { "es-AR": SIMPLE_DOC_ES },
          items: [
            {
              title: { "es-AR": "Servicio", "en-US": "Service" },
              description: { "es-AR": SIMPLE_DOC_ES },
              bibleVerseId: ID_VERSE.toHexString(),
              kind: "Creed",
              imageId: ID_IMG_2.toHexString(),
            },
          ],
        },
      },
    ],
  };
}

beforeEach(() => {
  state.cache = createNextCacheHarness();
  state.mockDb = createMockContentDb(baseSeed());
  state.dbAvailable = true;
});

describe("fixed-entry & global readers", () => {
  it("getSeo returns published with en-US fallback, switches on draft, and rejects bad names/locales without DB", async () => {
    const en = await getSeo("seo-home", "en-US");
    expect(en).toEqual({
      title: "Home",
      description: "Descripción ES",
      keywords: ["iglesia", "fe"],
      image: {
        url: "https://blob.example/hero.jpg",
        title: "Hero image",
        width: 1600,
        height: 900,
      },
      siteName: "Redentor Church",
      type: "website",
      sys: { id: ID_SEO.toHexString() },
      __typename: "Seo",
    });

    const draft = await getSeo("seo-home", "es-AR", true);
    expect(draft?.title).toBe("Inicio Borrador");

    state.mockDb!.resetQueryCount();
    expect(await getSeo("Bad Name", "es-AR")).toBeUndefined();
    expect(await getSeo("seo-home", "fr-FR")).toBeUndefined();
    expect(state.mockDb!.getQueryCount()).toBe(0);
  });

  it("getSection + 3 aliases resolve targetPage, imagesCollection, decorative alt, and RichTextView", async () => {
    const section = await getSection("our-mission", "en-US");
    expect(section).toEqual({
      layout: "hero",
      headline: "Our Mission",
      subHeadline: "Comunidad",
      body: { doc: SIMPLE_DOC_EN, media: {} },
      ctaText: "Conocenos",
      targetPage: { slug: "come-meet-us" },
      urlParameters: "ref=hero",
      image: { url: "https://blob.example/hero.jpg", title: "Hero image" },
      imagesCollection: {
        items: [
          { url: "https://blob.example/hero.jpg", title: "Hero image", width: 1600, height: 900 },
          { url: "https://blob.example/photo2.jpg", title: "Foto comunidad", width: 800, height: 600 },
        ],
      },
      sys: { id: ID_SECTION.toHexString() },
      __typename: "Section",
    });

    expect(await getCtaComponent("our-mission", "en-US")).toEqual(section);
    expect(await getHeroBannerComponent("our-mission", "en-US")).toEqual(section);
    expect(await getTextBlockComponent("our-mission", "en-US")).toEqual(section);

    // Decorative image emits empty string alt (`title: ""`)
    const draft = await getSection("our-mission", "es-AR", true);
    expect(draft?.image).toEqual({ url: "https://blob.example/deco.png", title: "" });
  });

  it("getNavigationMenu unwraps items with locale fallback and draft support", async () => {
    expect(await getNavigationMenu("main-menu", "en-US")).toEqual([
      { groupName: "Community", groupLink: { slug: "community" } },
      { groupName: "Blog", groupLink: { slug: "blog" } },
    ]);
    expect(await getNavigationMenu("main-menu", "es-AR", true)).toEqual([
      { groupName: "Borrador", groupLink: { slug: "blog" } },
    ]);
  });

  it("getFooter joins shared location (matching snapshot) and throws when footer doc is missing", async () => {
    const pub = await getFooter("en-US");
    expect(pub).toEqual({
      logo: { url: "https://blob.example/hero.jpg", title: "Hero image" },
      shortDescription: "Iglesia en Buenos Aires",
      socialLinks: [{ platform: "instagram", url: "https://instagram.com/idcr" }],
      location: {
        addressLine1: "Perón 4385",
        neighborhood: "Almagro",
        city: "Buenos Aires",
        country: "Argentina",
        googleMapsUrl: "https://maps.example/go",
      },
    });
    expect(pub).not.toHaveProperty("sys");
    expect(pub).not.toHaveProperty("__typename");

    const draft = await getFooter("es-AR", true);
    expect(draft.location?.addressLine1).toBe("Calle Nueva 999");

    state.mockDb!.setCollection(COLLECTIONS.globals, []);
    state.cache!.reset();
    await expect(getFooter("es-AR")).rejects.toThrow(/Footer document not found/);
  });

  it("getSingleEmailForm returns localized copy and draft copy", async () => {
    expect(await getSingleEmailForm("single-email-subscribe", "en-US")).toEqual({
      title: "Subscribe",
      shortDescription: "Recibí novedades",
      ctaText: "Enviar",
      inputPlaceholder: "tu@email.com",
      successMessage: "¡Gracias!",
      sys: { id: ID_EMAIL_FORM.toHexString() },
      __typename: "SingleEmailForm",
    });
    expect(
      (await getSingleEmailForm("single-email-subscribe", "es-AR", true))?.title,
    ).toBe("Boletín borrador");
  });

  it("getContactForm emits string bibleVerse numbers, serializable agreementNote, and throws when missing", async () => {
    const form = await getContactForm("en-US");
    expect(form).toEqual({
      title: "Contact us",
      description: "Escribinos",
      ctaText: "Enviar",
      image: { url: "https://blob.example/hero.jpg", title: "Hero image" },
      agreementNote: { doc: SIMPLE_DOC_ES, media: {} },
      bibleVerse: {
        book: "Mark",
        chapter: "10",
        fromVerse: "45",
        toVerse: null,
        verseContent: "Porque ni aun el Hijo del Hombre...",
        bibleVersion: "NIV",
      },
      formFields: [
        {
          name: "Subject",
          values: ["Consulta", "Oración"],
          type: "Dropdown",
          required: true,
          placeholder: "Elegí",
          inputId: "subject",
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(form))).toEqual(form);

    // Draft resolves draft verse with toVerse stringified
    const draft = await getContactForm("es-AR", true);
    expect(draft.bibleVerse?.chapter).toBe("3");
    expect(draft.bibleVerse?.toVerse).toBe("17");

    state.mockDb!.setCollection(COLLECTIONS.globals, []);
    state.cache!.reset();
    await expect(getContactForm("es-AR")).rejects.toThrow(
      /Contact form document not found/,
    );
  });

  it("getEventBanner joins shared location with mapEmbedUrl + geo coords", async () => {
    const banner = await getEventBanner("event-sunday-meetings", "en-US");
    expect(banner).toEqual({
      eventInfo: {
        name: "Sunday Service",
        dayOfWeek: "Domingos",
        date: null,
        time: "10:30",
        note: "Te esperamos",
      },
      location: {
        addressLine1: "Perón 4385",
        neighborhood: "Almagro",
        city: "Buenos Aires",
        country: "Argentina",
        mapEmbedUrl: "https://maps.example/embed",
        googleMapsUrl: "https://maps.example/go",
        location: { lat: -34.6058, lon: -58.4287 },
      },
      image: { url: "https://blob.example/hero.jpg", title: "Hero image" },
      sys: { id: ID_EVENT.toHexString() },
      __typename: "EventBanner",
    });
  });

  it("getContentCollection keeps raw shape with string verse numbers and maps via mapContentCollection", async () => {
    const raw = (await getContentCollection("our-creed", "en-US"))!;
    expect(raw).toEqual({
      title: "Our Creed",
      description: { doc: SIMPLE_DOC_ES, media: {} },
      contentItemsCollection: {
        items: [
          {
            title: "Service",
            description: { doc: SIMPLE_DOC_ES, media: {} },
            bibleVerse: {
              book: "Mark",
              chapter: "10",
              fromVerse: "45",
              toVerse: null,
              verseContent: "Porque ni aun el Hijo del Hombre...",
              bibleVersion: "NIV",
            },
            image: {
              url: "https://blob.example/photo2.jpg",
              title: "Foto comunidad",
            },
            kind: "Creed",
            sys: { id: `${ID_COLLECTION.toHexString()}:item:0` },
            __typename: "BeliefItem",
          },
        ],
      },
      sys: { id: ID_COLLECTION.toHexString() },
      __typename: "ContentCollection",
    });

    const mapped = mapContentCollection(raw);
    expect(mapped.creedItems).toEqual(raw.contentItemsCollection.items);
    expect(mapped.image).toBeUndefined();
    expect(mapped.sys).toEqual(raw.sys);
  });
});
