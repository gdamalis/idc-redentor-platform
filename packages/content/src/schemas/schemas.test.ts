import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { RichTextDoc } from "../rich-text/spec";
import {
  CONTENT_SCHEMAS,
  CONTENT_TYPES,
  mediaCreateSchema,
  mediaUpdateSchema,
  type ContentType,
} from "./index";

const doc = (text: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const emptyDoc: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Walks a Zod v4 schema's internal `_zod.def` graph to prove no `.default()` or `.prefault()`
 * exists anywhere in a create/draft/publishable schema (H-reference-editor-lessons).
 */
function findDefaults(root: z.ZodTypeAny): string[] {
  const hits: string[] = [];
  const visited = new Set<unknown>();
  const stack: Array<{ schema: unknown; path: string }> = [
    { schema: root, path: "$" },
  ];

  while (stack.length > 0) {
    const { schema, path } = stack.pop()!;
    if (!schema || typeof schema !== "object" || visited.has(schema)) continue;
    visited.add(schema);

    const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod
      ?.def;
    if (!def) continue;

    if (def.type === "default" || def.type === "prefault") {
      hits.push(`${path} (${String(def.type)})`);
    }

    if (def.innerType) stack.push({ schema: def.innerType, path });
    if (def.element) stack.push({ schema: def.element, path: `${path}[]` });
    if (def.in) stack.push({ schema: def.in, path });
    if (def.out) stack.push({ schema: def.out, path });
    if (def.shape && typeof def.shape === "object") {
      for (const [key, val] of Object.entries(
        def.shape as Record<string, unknown>,
      )) {
        stack.push({ schema: val, path: `${path}.${key}` });
      }
    }
    if (Array.isArray(def.options)) {
      def.options.forEach((opt, i) =>
        stack.push({ schema: opt, path: `${path}|${i}` }),
      );
    }
  }
  return hits;
}

/** Valid minimal drafts (incomplete -> pass draft, fail publishable) and valid publishable fixtures. */
const FIXTURES: Record<
  ContentType,
  {
    incompleteDraft: Record<string, unknown>;
    validPublishable: Record<string, unknown>;
  }
> = {
  section: {
    incompleteDraft: { machineName: "our-mission" },
    validPublishable: {
      machineName: "our-mission",
      layout: "hero",
      headline: { "es-AR": "Nuestra misión" },
      subHeadline: { "es-AR": "Iglesia en comunidad" },
      body: { "es-AR": doc("Bienvenidos") },
      ctaText: { "es-AR": "Conocenos" },
      targetPage: "come-meet-us",
      urlParameters: "?ref=home",
      image: "media-hero-1",
      images: ["media-1", "media-2"],
    },
  },
  beliefCollection: {
    incompleteDraft: { machineName: "our-creed" },
    validPublishable: {
      machineName: "our-creed",
      title: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
      description: { "es-AR": doc("Creemos"), "en-US": doc("We believe") },
      items: [
        {
          title: { "es-AR": "Dios", "en-US": "God" },
          description: {
            "es-AR": doc("Un solo Dios"),
            "en-US": doc("One God"),
          },
          bibleVerseId: "verse-1",
          kind: "Creed",
          imageId: "media-creed-1",
        },
      ],
    },
  },
  eventBanner: {
    incompleteDraft: { machineName: "event-sunday-meetings" },
    validPublishable: {
      machineName: "event-sunday-meetings",
      event: {
        name: { "es-AR": "Reunión dominical" },
        dayOfWeek: { "es-AR": "Domingos" },
        note: { "es-AR": "Te esperamos" },
        time: "10:30",
        date: "2026-11-22",
      },
      image: "media-event-1",
    },
  },
  post: {
    incompleteDraft: { title: { "es-AR": "Borrador sin slug" } },
    validPublishable: {
      slug: "vida-en-comunidad",
      title: { "es-AR": "Vida en comunidad" },
      subtitle: { "es-AR": "Reflexión" },
      category: "Community",
      featuredImageId: "media-post-1",
      content: { "es-AR": doc("Contenido del artículo") },
      authorId: "author-1",
      publishedDate: "2026-11-20",
      seoTitle: { "es-AR": "Vida en comunidad" },
      seoDescription: { "es-AR": "Resumen SEO" },
      keywords: { "es-AR": ["comunidad", "fe"] },
      relatedPostIds: ["post-2"],
    },
  },
  sermon: {
    incompleteDraft: { title: { "es-AR": "Borrador de prédica" } },
    validPublishable: {
      slug: "salmo-23",
      title: { "es-AR": "El Señor es mi pastor" },
      thesis: { "es-AR": "Dios cuida de su pueblo" },
      mainPoints: { "es-AR": ["Confianza", "Dirección"] },
      excerpt: { "es-AR": "Resumen breve" },
      sermonDate: "2026-11-15",
      durationSeconds: 2450,
      content: {
        "es-AR": {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Prédica" }] },
            { type: "embeddedMedia", attrs: { mediaId: "media-audio-seg-1" } },
          ],
        },
      },
      featuredImageId: "media-sermon-1",
      audioMediaId: "media-audio-1",
      audioLanguages: ["es-AR", "en-US"],
      pdfSummaryMediaId: { "es-AR": "media-pdf-es", "en-US": "media-pdf-en" },
      preacherId: "author-1",
      additionalPreacherIds: ["author-2"],
      interpreterId: "author-3",
      scriptureRefIds: ["verse-1"],
      seoTitle: { "es-AR": "Salmo 23" },
      seoDescription: { "es-AR": "Descripción" },
      keywords: { "es-AR": ["salmo"] },
      relatedSermonIds: ["sermon-2"],
      contentHash: "abc123",
    },
  },
  bibleVerse: {
    incompleteDraft: { book: { "es-AR": "Joel" }, chapter: 2, fromVerse: 13 },
    validPublishable: {
      book: { "es-AR": "Joel", "en-US": "Joel" },
      chapter: 2,
      fromVerse: 13,
      toVerse: 14,
      text: { "es-AR": "Rasgad vuestro corazón" },
      version: { "es-AR": "RVR1960" },
    },
  },
  author: {
    incompleteDraft: { name: "Ana", email: "not-an-email" },
    validPublishable: {
      name: "Ana",
      avatarMediaId: "media-avatar-1",
      email: "ana@example.org",
      userId: "admin-user-1",
    },
  },
  topic: {
    incompleteDraft: { name: { "es-AR": "Política de privacidad" } },
    validPublishable: {
      name: { "es-AR": "Política de privacidad" },
      shortDescription: { "es-AR": "Cómo cuidamos tus datos" },
      body: { "es-AR": doc("Texto legal") },
      slug: { "es-AR": "privacidad" },
      featuredImageId: "media-topic-1",
      protected: false,
    },
  },
  seoEntry: {
    incompleteDraft: { machineName: "seo-home" },
    validPublishable: {
      machineName: "seo-home",
      title: { "es-AR": "IDC Redentor" },
      description: { "es-AR": "Iglesia de Cristo Redentor" },
      keywords: { "es-AR": ["iglesia"] },
      imageId: "media-seo-1",
      siteName: { "es-AR": "IDC Redentor" },
      type: "website",
    },
  },
  global: {
    incompleteDraft: { kind: "footer", machineName: "footer" },
    validPublishable: {
      kind: "footer",
      machineName: "footer",
      logo: "media-logo-1",
      shortDescription: { "es-AR": "Iglesia en Buenos Aires" },
      socialLinks: [
        { platform: "instagram", url: "https://instagram.com/idcredentor" },
      ],
    },
  },
  navigationMenu: {
    incompleteDraft: { kind: "navigationMenu", machineName: "main-menu" },
    validPublishable: {
      kind: "navigationMenu",
      machineName: "main-menu",
      menuItems: [
        { groupName: { "es-AR": "Comunidad" }, groupLink: "community" },
      ],
    },
  },
  footer: {
    incompleteDraft: { kind: "footer", machineName: "footer" },
    validPublishable: {
      kind: "footer",
      machineName: "footer",
      logo: "media-logo-1",
      shortDescription: { "es-AR": "Iglesia" },
      socialLinks: [
        { platform: "youtube", url: "https://youtube.com/@idcredentor" },
      ],
    },
  },
  singleEmailForm: {
    incompleteDraft: {
      kind: "singleEmailForm",
      machineName: "single-email-subscribe",
    },
    validPublishable: {
      kind: "singleEmailForm",
      machineName: "single-email-subscribe",
      title: { "es-AR": "Suscribite" },
      shortDescription: { "es-AR": "Recibí novedades" },
      ctaText: { "es-AR": "Enviar" },
      inputPlaceholder: { "es-AR": "Tu correo" },
      successMessage: { "es-AR": "Gracias" },
    },
  },
  contactForm: {
    incompleteDraft: { kind: "contactForm", machineName: "contact-form" },
    validPublishable: {
      kind: "contactForm",
      machineName: "contact-form",
      title: { "es-AR": "Escribinos" },
      description: { "es-AR": "Estamos para ayudarte" },
      ctaText: { "es-AR": "Enviar mensaje" },
      image: "media-contact-1",
      bibleVerseId: "verse-contact-1",
      agreementNote: {
        "es-AR": {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Política de privacidad",
                  marks: [{ type: "link", attrs: { href: "/privacidad" } }],
                },
              ],
            },
          ],
        },
      },
      fields: [
        {
          inputId: "subject",
          type: "select",
          required: true,
          name: { "es-AR": "Asunto" },
          placeholder: { "es-AR": "Elegí uno" },
          values: { "es-AR": ["Consulta", "Oración"] },
        },
      ],
    },
  },
  location: {
    incompleteDraft: { kind: "location", machineName: "location" },
    validPublishable: {
      kind: "location",
      machineName: "location",
      addressLine1: "Av. Ejemplo 1234",
      neighborhood: "Palermo",
      city: "Buenos Aires",
      country: "Argentina",
      mapEmbedUrl: "https://maps.google.com/embed?pb=1",
      googleMapsUrl: "https://maps.google.com/?q=1",
      lat: -34.588,
      lon: -58.43,
    },
  },
};

const ALL_TYPES = Object.values(CONTENT_TYPES);

describe("CONTENT_SCHEMAS — draft vs publishable, defaults, and {} tripwire", () => {
  it.each(ALL_TYPES)(
    "%s: incomplete draft passes draft and fails publishable; complete entry passes publishable",
    (type) => {
      const { draft, publishable } = CONTENT_SCHEMAS[type];
      const { incompleteDraft, validPublishable } = FIXTURES[type];

      expect(draft.safeParse(incompleteDraft).success).toBe(true);
      expect(publishable.safeParse(incompleteDraft).success).toBe(false);
      expect(publishable.safeParse(validPublishable).success).toBe(true);
    },
  );

  it.each(ALL_TYPES)(
    "%s: update schema parses {} to {} with zero injected keys",
    (type) => {
      const parsed = CONTENT_SCHEMAS[type].update.parse({});
      expect(parsed).toEqual({});
      expect(Object.keys(parsed as object)).toEqual([]);
    },
  );

  it("media: update schema parses {} to {} and create schema enforces image alt or decorative", () => {
    const parsed = mediaUpdateSchema.parse({});
    expect(parsed).toEqual({});
    expect(Object.keys(parsed)).toEqual([]);

    const base = {
      pathname: "media/m1/foto.jpg",
      url: "https://abc.public.blob.vercel-storage.com/media/m1/foto.jpg",
      filename: "foto.jpg",
      contentType: "image/jpeg",
      size: 1024,
      sha256: "a".repeat(64),
      width: 1200,
      height: 800,
      title: { "es-AR": "Foto de culto" },
      createdBy: "admin-1",
      createdAt: new Date("2026-11-20T00:00:00Z"),
    };

    // Image without alt and not decorative -> refused
    expect(mediaCreateSchema.safeParse(base).success).toBe(false);
    // Image with Spanish alt -> accepted
    expect(
      mediaCreateSchema.safeParse({
        ...base,
        alt: { "es-AR": "Congregación reunida" },
        caption: { "es-AR": "Domingo" },
        credit: { "es-AR": "Equipo foto" },
      }).success,
    ).toBe(true);
    // Image marked decorative without alt -> accepted
    expect(
      mediaCreateSchema.safeParse({ ...base, decorative: true }).success,
    ).toBe(true);
    // Audio without alt -> accepted
    expect(
      mediaCreateSchema.safeParse({
        ...base,
        contentType: "audio/mpeg",
        width: undefined,
        height: undefined,
        durationSeconds: 1800,
      }).success,
    ).toBe(true);
  });

  it("contains ZERO .default() / .prefault() anywhere in any create or update schema", () => {
    for (const type of ALL_TYPES) {
      expect(findDefaults(CONTENT_SCHEMAS[type].draft)).toEqual([]);
      expect(findDefaults(CONTENT_SCHEMAS[type].publishable)).toEqual([]);
      expect(findDefaults(CONTENT_SCHEMAS[type].update)).toEqual([]);
    }
    expect(findDefaults(mediaCreateSchema)).toEqual([]);
    expect(findDefaults(mediaUpdateSchema)).toEqual([]);
  });

  it("normalises empty English values to absent in both draft and publishable", () => {
    const parsed = CONTENT_SCHEMAS.post.publishable.parse({
      ...FIXTURES.post.validPublishable,
      title: { "es-AR": "Hola", "en-US": "   " },
      content: { "es-AR": doc("Texto"), "en-US": emptyDoc },
    });

    expect("en-US" in parsed.title).toBe(false);
    expect("en-US" in parsed.content).toBe(false);
  });

  it("requires both es-AR and en-US for protected content at publish", () => {
    // Belief collection missing en-US -> rejected at publish
    const esOnlyBelief = {
      machineName: "our-creed",
      title: { "es-AR": "Nuestro credo" },
      items: [
        {
          title: { "es-AR": "Dios", "en-US": "God" },
          description: { "es-AR": doc("Uno"), "en-US": doc("One") },
          kind: "Creed",
        },
      ],
    };
    expect(
      CONTENT_SCHEMAS.beliefCollection.draft.safeParse(esOnlyBelief).success,
    ).toBe(true);
    expect(
      CONTENT_SCHEMAS.beliefCollection.publishable.safeParse(esOnlyBelief)
        .success,
    ).toBe(false);

    // Unprotected topic with Spanish only -> accepted at publish
    expect(
      CONTENT_SCHEMAS.topic.publishable.safeParse(
        FIXTURES.topic.validPublishable,
      ).success,
    ).toBe(true);

    // Protected topic with Spanish only -> refused at publish
    const protectedEsOnly = {
      ...FIXTURES.topic.validPublishable,
      protected: true,
    };
    expect(CONTENT_SCHEMAS.topic.draft.safeParse(protectedEsOnly).success).toBe(
      true,
    );
    expect(
      CONTENT_SCHEMAS.topic.publishable.safeParse(protectedEsOnly).success,
    ).toBe(false);

    // Protected topic with both locales complete -> accepted at publish
    const protectedBoth = {
      name: { "es-AR": "Política de privacidad", "en-US": "Privacy policy" },
      shortDescription: {
        "es-AR": "Cómo cuidamos tus datos",
        "en-US": "How we protect data",
      },
      body: { "es-AR": doc("Texto legal"), "en-US": doc("Legal text") },
      slug: { "es-AR": "privacidad", "en-US": "privacy" },
      protected: true,
    };
    expect(
      CONTENT_SCHEMAS.topic.publishable.safeParse(protectedBoth).success,
    ).toBe(true);
  });

  it("refuses removed/unknown fields (no icon on belief items, no SEO on topics, no duplex layout)", () => {
    expect(
      CONTENT_SCHEMAS.beliefCollection.draft.safeParse({
        machineName: "our-creed",
        items: [{ kind: "Creed", icon: "heart" }],
      }).success,
    ).toBe(false);

    expect(
      CONTENT_SCHEMAS.topic.draft.safeParse({
        name: { "es-AR": "Privacidad" },
        seoTitle: { "es-AR": "Nope" },
      }).success,
    ).toBe(false);

    expect(
      CONTENT_SCHEMAS.section.draft.safeParse({
        machineName: "our-mission",
        layout: "duplex",
      }).success,
    ).toBe(false);

    // Invalid global discriminator kind
    expect(
      CONTENT_SCHEMAS.global.draft.safeParse({
        kind: "unknownGlobal",
        machineName: "foo",
      }).success,
    ).toBe(false);

    // Bible verse range with toVerse < fromVerse
    expect(
      CONTENT_SCHEMAS.bibleVerse.draft.safeParse({
        book: { "es-AR": "Joel" },
        chapter: 2,
        fromVerse: 15,
        toVerse: 13,
      }).success,
    ).toBe(false);
  });

  it("enforces rich-text validation even in drafts", () => {
    const xssPost = {
      title: { "es-AR": "Post" },
      content: {
        "es-AR": {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Click",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        },
      },
    };
    expect(CONTENT_SCHEMAS.post.draft.safeParse(xssPost).success).toBe(false);
  });
});
