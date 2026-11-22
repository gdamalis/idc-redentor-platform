import { createHash } from "node:crypto";
import { COLLECTIONS } from "@idcr/content";
import { ObjectId, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import {
  classifyContentfulEntryState,
  computeTipTapSermonContentHash,
  formatImportReportMarkdown,
  IMPORTER_SERVICE_ID,
  runContentfulImport,
  type ContentfulEntry,
  type ContentfulSnapshotManifest,
  type LoadedContentfulSnapshot,
} from "../index";

function sha(text: string): string {
  return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

function link(linkType: "Entry" | "Asset", id: string) {
  return { sys: { type: "Link" as const, linkType, id } };
}

function cfDoc(text: string, href?: string) {
  return {
    nodeType: "document",
    data: {},
    content: [
      {
        nodeType: "paragraph",
        data: {},
        content: href
          ? [
              { nodeType: "text", value: `${text} `, marks: [], data: {} },
              {
                nodeType: "hyperlink",
                data: { uri: href },
                content: [
                  { nodeType: "text", value: "enlace", marks: [], data: {} },
                ],
              },
            ]
          : [{ nodeType: "text", value: text, marks: [], data: {} }],
      },
    ],
  };
}

function clonePreservingObjectIds<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as unknown as T;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => clonePreservingObjectIds(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = clonePreservingObjectIds(v);
  }
  return out as T;
}

function createInMemoryContentDb(databaseName = "website-staging") {
  const store = new Map<string, Record<string, unknown>[]>();
  const getList = (name: string) => {
    let list = store.get(name);
    if (!list) {
      list = [];
      store.set(name, list);
    }
    return list;
  };

  const matchFilter = (
    doc: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean => {
    for (const [k, cond] of Object.entries(filter)) {
      const val = doc[k];
      if (
        cond &&
        typeof cond === "object" &&
        "$in" in (cond as Record<string, unknown>)
      ) {
        if (!(cond as { $in: unknown[] }).$in.includes(val)) return false;
      } else if (val instanceof ObjectId && cond instanceof ObjectId) {
        if (!val.equals(cond)) return false;
      } else if (val !== cond) {
        return false;
      }
    }
    return true;
  };

  let writeCount = 0;

  const db = {
    databaseName,
    collection: (name: string) => ({
      find: (filter: Record<string, unknown> = {}) => ({
        toArray: async () =>
          getList(name).filter((doc) => matchFilter(doc, filter)),
      }),
      findOne: async (filter: Record<string, unknown> = {}) =>
        getList(name).find((doc) => matchFilter(doc, filter)) ?? null,
      insertOne: async (doc: Record<string, unknown>) => {
        writeCount += 1;
        getList(name).push(clonePreservingObjectIds(doc));
        return { insertedId: doc._id };
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $unset?: Record<string, string>;
          $addToSet?: Record<string, { $each?: unknown[] }>;
        },
      ) => {
        const list = getList(name);
        const target = list.find((doc) => matchFilter(doc, filter));
        if (!target) return { matchedCount: 0, modifiedCount: 0 };
        writeCount += 1;
        if (update.$set) {
          for (const [k, v] of Object.entries(update.$set)) {
            target[k] = clonePreservingObjectIds(v);
          }
        }
        if (update.$unset) {
          for (const k of Object.keys(update.$unset)) {
            delete target[k];
          }
        }
        if (update.$addToSet) {
          for (const [k, spec] of Object.entries(update.$addToSet)) {
            const arr = Array.isArray(target[k]) ? [...(target[k] as unknown[])] : [];
            for (const item of spec.$each ?? []) {
              if (!arr.includes(item)) arr.push(item);
            }
            target[k] = arr;
          }
        }
        return { matchedCount: 1, modifiedCount: 1 };
      },
      createIndex: async () => "ok",
    }),
  } as unknown as Db;

  return {
    db,
    store,
    getWriteCount: () => writeCount,
    resetWriteCount: () => {
      writeCount = 0;
    },
  };
}

function buildFullSyntheticSnapshot(): LoadedContentfulSnapshot {
  const assetBytes: Record<string, Buffer> = {
    "assets/img.jpg": Buffer.from("JPG-SYNTHETIC-IMAGE"),
    "assets/audio.mp3": Buffer.from("MP3-SYNTHETIC-AUDIO"),
    "assets/pdf-es.pdf": Buffer.from("PDF-SYNTHETIC-ES"),
    "assets/pdf-en.pdf": Buffer.from("PDF-SYNTHETIC-EN"),
    "assets/unused.png": Buffer.from("PNG-SYNTHETIC-UNUSED"),
  };

  const publishedSys = (
    id: string,
    ct: string,
    created = "2025-03-01T10:00:00.000Z",
    updated = "2026-04-10T12:00:00.000Z",
    published = "2026-04-10T12:00:00.000Z",
  ) => ({
    id,
    contentType: { sys: { id: ct } },
    createdAt: created,
    updatedAt: updated,
    publishedAt: published,
    firstPublishedAt: created,
    version: 2,
    publishedVersion: 1,
  });

  const draftSys = (id: string, ct: string, created = "2026-07-12T10:00:00.000Z") => ({
    id,
    contentType: { sys: { id: ct } },
    createdAt: created,
    updatedAt: created,
    version: 1,
  });

  const cmaEntries: ContentfulEntry[] = [
    // Pages (flattened)
    {
      sys: publishedSys("cf-page-community", "page"),
      fields: { slug: { "es-AR": "community" }, pageName: { "es-AR": "Comunidad" } },
    },
    {
      sys: publishedSys("cf-page-blog", "page"),
      fields: { slug: { "es-AR": "blog" }, pageName: { "es-AR": "Blog" } },
    },

    // Author
    {
      sys: publishedSys("cf-author-1", "author"),
      fields: {
        name: { "es-AR": "Pastor Demo" },
        email: { "es-AR": "pastor.demo@example.org" },
        avatar: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },

    // Bible verses: 1 published with odd trailing-space version + 1 draft-only
    {
      sys: publishedSys("cf-verse-pub", "bibleVerse"),
      fields: {
        book: { "es-AR": "Juan", "en-US": "John" },
        chapter: { "es-AR": "3" },
        fromVerse: { "es-AR": "16" },
        toVerse: { "es-AR": "17" },
        verseContent: { "es-AR": "Porque de tal manera...", "en-US": "For God so loved..." },
        bibleVersion: { "es-AR": "Nueva Versión Internacional ", "en-US": "NIV" },
      },
    },
    {
      sys: draftSys("cf-verse-draft", "bibleVerse", "2026-07-12T09:00:00.000Z"),
      fields: {
        // Missing en-US intentionally: must stay absent!
        book: { "es-AR": "Salmos" },
        chapter: { "es-AR": "23" },
        fromVerse: { "es-AR": "1" },
        verseContent: { "es-AR": "El Señor es mi pastor." },
        bibleVersion: { "es-AR": "RVR" },
      },
    },

    // Section (changed state! CMA draft headline differs from CDA published headline)
    {
      sys: {
        ...publishedSys("cf-section-hero", "section"),
        version: 5,
        publishedVersion: 3,
      },
      fields: {
        machineName: { "es-AR": "our-mission" },
        layout: { "es-AR": "hero" },
        headline: { "es-AR": "Misión Borrador Nuevo", "en-US": "Mission Draft New" },
        subHeadline: { "es-AR": "Subtítulo" },
        body: { "es-AR": cfDoc("Texto héroe"), "en-US": cfDoc("Hero text") },
        ctaText: { "es-AR": "Conocenos", "en-US": "Meet us" },
        targetPage: { "es-AR": link("Entry", "cf-page-community") },
        image: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },

    // Belief collection + embedded BeliefItem
    {
      sys: publishedSys("cf-belief-item-1", "beliefItem"),
      fields: {
        title: { "es-AR": "Unidad", "en-US": "Unity" },
        description: { "es-AR": cfDoc("Somos uno"), "en-US": cfDoc("We are one") },
        bibleVerse: { "es-AR": link("Entry", "cf-verse-pub") },
        kind: { "es-AR": "Creed" },
        image: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },
    {
      sys: publishedSys("cf-belief-coll", "contentCollection"),
      fields: {
        machineName: { "es-AR": "our-creed" },
        title: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
        description: { "es-AR": cfDoc("Lo que creemos"), "en-US": cfDoc("What we believe") },
        contentItems: { "es-AR": [link("Entry", "cf-belief-item-1")] },
      },
    },

    // Event banner + embedded event + shared locationComponent
    {
      sys: publishedSys("cf-event-1", "event"),
      fields: {
        name: { "es-AR": "Reunión", "en-US": "Service" },
        dayOfWeek: { "es-AR": "Domingo", "en-US": "Sunday" },
        time: { "es-AR": "17:00" },
        note: { "es-AR": "Te esperamos" },
      },
    },
    {
      sys: publishedSys("cf-location-1", "locationComponent"),
      fields: {
        addressLine1: { "es-AR": "Calle Falsa 123" },
        neighborhood: { "es-AR": "Centro" },
        city: { "es-AR": "Buenos Aires" },
        country: { "es-AR": "Argentina" },
        googleMapsUrl: { "es-AR": "https://maps.example.org/place" },
        location: { "es-AR": { lat: -34.6, lon: -58.4 } },
      },
    },
    {
      sys: publishedSys("cf-event-banner", "eventBanner"),
      fields: {
        machineName: { "es-AR": "event-sunday-meetings" },
        eventInfo: { "es-AR": link("Entry", "cf-event-1") },
        location: { "es-AR": link("Entry", "cf-location-1") },
        image: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },

    // Globals: navigationMenu + menuGroup, footer + socialLink, singleEmailForm, contactForm + formField
    {
      sys: publishedSys("cf-menu-group-1", "menuGroup"),
      fields: {
        groupName: { "es-AR": "Blog", "en-US": "Blog" },
        groupLink: { "es-AR": link("Entry", "cf-page-blog") },
      },
    },
    {
      sys: publishedSys("cf-nav-menu", "navigationMenu"),
      fields: {
        machineName: { "es-AR": "main-menu" },
        menuItems: { "es-AR": [link("Entry", "cf-menu-group-1")] },
      },
    },
    {
      sys: publishedSys("cf-social-1", "socialLink"),
      fields: {
        platform: { "es-AR": "instagram" },
        url: { "es-AR": "https://instagram.com/example" },
      },
    },
    {
      sys: publishedSys("cf-footer", "footer"),
      fields: {
        logo: { "es-AR": link("Asset", "cf-asset-img") },
        shortDescription: { "es-AR": "Iglesia demo", "en-US": "Demo church" },
        socialLinks: { "es-AR": [link("Entry", "cf-social-1")] },
        location: { "es-AR": link("Entry", "cf-location-1") },
      },
    },
    {
      sys: publishedSys("cf-email-form", "singleEmailForm"),
      fields: {
        machineName: { "es-AR": "single-email-subscribe" },
        title: { "es-AR": "Suscribite" },
        ctaText: { "es-AR": "Enviar" },
      },
    },
    {
      sys: publishedSys("cf-form-field-1", "formField"),
      fields: {
        inputId: { "es-AR": "name" },
        type: { "es-AR": "Short text" },
        required: { "es-AR": true },
        name: { "es-AR": "Nombre", "en-US": "Name" },
        placeholder: { "es-AR": "Tu nombre" },
      },
    },
    {
      sys: publishedSys("cf-contact-form", "contactForm"),
      fields: {
        title: { "es-AR": "Contacto" },
        description: { "es-AR": "Escribinos" },
        ctaText: { "es-AR": "Enviar" },
        image: { "es-AR": link("Asset", "cf-asset-img") },
        bibleVerse: { "es-AR": link("Entry", "cf-verse-pub") },
        agreementNote: {
          "es-AR": cfDoc(
            "Acepto",
            "https://idcredentor.com/es-AR/privacy-policy",
          ),
          "en-US": cfDoc(
            "I agree",
            "https://idcredentor.com/en-US/privacy-policy",
          ),
        },
        fields: { "es-AR": [link("Entry", "cf-form-field-1")] },
      },
    },

    // SEO: 1 active + 1 unused seo-predicas
    {
      sys: publishedSys("cf-seo-home", "seo"),
      fields: {
        machineName: { "es-AR": "seo-home" },
        title: { "es-AR": "Inicio" },
        description: { "es-AR": "Descripción" },
        image: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },
    {
      sys: publishedSys("cf-seo-predicas", "seo"),
      fields: {
        machineName: { "es-AR": "seo-predicas" },
        title: { "es-AR": "Prédicas SEO muerto" },
        description: { "es-AR": "No usado" },
      },
    },

    // Blog post
    {
      sys: publishedSys("cf-post-1", "blogPostPage"),
      fields: {
        slug: { "es-AR": "nota-de-prueba" },
        title: { "es-AR": "Nota de prueba" },
        featuredImage: { "es-AR": link("Asset", "cf-asset-img") },
        content: { "es-AR": cfDoc("Cuerpo de nota") },
        author: { "es-AR": link("Entry", "cf-author-1") },
        publishedDate: { "es-AR": "2026-04-10" },
        seoTitle: { "es-AR": "SEO Nota" },
        seoDescription: { "es-AR": "SEO Desc" },
      },
    },

    // Privacy topic (protected: true + newline in address block)
    {
      sys: publishedSys("cf-topic-privacy", "churchInfoTopic"),
      fields: {
        name: { "es-AR": "Política de Privacidad", "en-US": "Privacy Policy" },
        slug: { "es-AR": "privacidad", "en-US": "privacy" },
        shortDescription: { "es-AR": "Aviso legal", "en-US": "Legal notice" },
        body: {
          "es-AR": cfDoc("Dirección:\nCalle Falsa 123\nBuenos Aires"),
          "en-US": cfDoc("Address:\n123 Fake St\nBuenos Aires"),
        },
        featuredImage: { "es-AR": link("Asset", "cf-asset-img") },
      },
    },

    // 1 published sermon + 3 unpublished draft-only July sermons
    {
      sys: publishedSys("cf-sermon-pub", "sermon"),
      fields: {
        slug: { "es-AR": "predica-publicada" },
        title: { "es-AR": "Prédica Publicada", "en-US": "Published Sermon" },
        thesis: { "es-AR": "Tesis", "en-US": "Thesis" },
        mainPoints: { "es-AR": ["Punto 1"], "en-US": ["Point 1"] },
        excerpt: { "es-AR": "Extracto", "en-US": "Excerpt" },
        sermonDate: { "es-AR": "2026-06-28" },
        durationSeconds: { "es-AR": 1800 },
        content: {
          "es-AR": {
            nodeType: "document",
            data: {},
            content: [
              {
                nodeType: "paragraph",
                data: {},
                content: [{ nodeType: "text", value: "Mensaje", marks: [], data: {} }],
              },
              {
                nodeType: "embedded-asset-block",
                data: { target: link("Asset", "cf-asset-audio") },
                content: [],
              },
            ],
          },
          "en-US": cfDoc("Message"),
        },
        featuredImage: { "es-AR": link("Asset", "cf-asset-img") },
        audio: { "es-AR": link("Asset", "cf-asset-audio") },
        audioLanguages: { "es-AR": ["es-AR"] },
        pdfSummary: {
          "es-AR": link("Asset", "cf-asset-pdf"),
          "en-US": link("Asset", "cf-asset-pdf"),
        },
        preacher: { "es-AR": link("Entry", "cf-author-1") },
        scriptureReferences: { "es-AR": [link("Entry", "cf-verse-pub")] },
        seoTitle: { "es-AR": "SEO Prédica" },
        seoDescription: { "es-AR": "Desc Prédica" },
      },
    },
    ...(["2026-07-12", "2026-07-19", "2026-07-26"] as const).map((date, i) => ({
      sys: draftSys(`cf-sermon-july-${i + 1}`, "sermon", `${date}T10:00:00.000Z`),
      fields: {
        slug: { "es-AR": `borrador-julio-${i + 1}` },
        title: { "es-AR": `Borrador Julio ${i + 1}` },
        sermonDate: { "es-AR": date },
        preacher: { "es-AR": link("Entry", "cf-author-1") },
        scriptureReferences: { "es-AR": [link("Entry", "cf-verse-draft")] },
        content: { "es-AR": cfDoc(`Contenido borrador ${i + 1}`) },
      },
    })),

    // Archived entry (must be skipped & reported)
    {
      sys: {
        id: "cf-archived-post",
        contentType: { sys: { id: "blogPostPage" } },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-02-01T00:00:00.000Z",
        version: 3,
        archivedVersion: 2,
      },
      fields: { title: { "es-AR": "Archivada" } },
    },
  ];

  // CDA published copy for the "changed" hero section has the OLD published headline!
  const cdaPublishedEntries: ContentfulEntry[] = cmaEntries
    .filter((e) => classifyContentfulEntryState(e.sys) === "published" || classifyContentfulEntryState(e.sys) === "changed")
    .map((e) =>
      e.sys.id === "cf-section-hero"
        ? {
            ...e,
            fields: {
              ...e.fields,
              headline: {
                "es-AR": "Misión Publicada Original",
                "en-US": "Mission Published Original",
              },
            },
          }
        : e,
    );

  const manifest: ContentfulSnapshotManifest = {
    schemaVersion: 1,
    exportedAt: "2026-11-22T15:00:00.000Z",
    spaceId: "space-test",
    environment: "master",
    defaultLocale: "es-AR",
    locales: ["es-AR", "en-US"],
    contentTypeIds: [
      "author",
      "beliefItem",
      "bibleVerse",
      "blogPostPage",
      "churchInfoTopic",
      "contactForm",
      "contentCollection",
      "event",
      "eventBanner",
      "footer",
      "formField",
      "locationComponent",
      "menuGroup",
      "navigationMenu",
      "page",
      "section",
      "seo",
      "sermon",
      "singleEmailForm",
      "socialLink",
    ],
    cmaEntries,
    cdaPublishedEntries,
    cmaAssets: [
      {
        sys: { id: "cf-asset-img", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" },
        fields: { title: { "es-AR": "Imagen Demo", "en-US": "Demo Image" } },
      },
      {
        sys: { id: "cf-asset-audio", createdAt: "2026-06-28T00:00:00.000Z", updatedAt: "2026-06-28T00:00:00.000Z" },
        fields: { title: { "es-AR": "Audio Demo" } },
      },
      {
        sys: { id: "cf-asset-pdf", createdAt: "2026-06-28T00:00:00.000Z", updatedAt: "2026-06-28T00:00:00.000Z" },
        fields: { title: { "es-AR": "PDF Demo", "en-US": "Demo PDF" } },
      },
      {
        sys: { id: "cf-asset-unused", createdAt: "2025-02-01T00:00:00.000Z", updatedAt: "2025-02-01T00:00:00.000Z" },
        fields: { title: { "es-AR": "Sin Uso" } },
      },
    ],
    downloadedFiles: [
      {
        assetId: "cf-asset-img",
        locale: "es-AR",
        relativePath: "assets/img.jpg",
        url: "https://images.ctfassets.net/s/cf-asset-img/1/img.jpg",
        fileName: "img.jpg",
        contentType: "image/jpeg",
        size: assetBytes["assets/img.jpg"]!.byteLength,
        sha256: sha("JPG-SYNTHETIC-IMAGE"),
        width: 1200,
        height: 630,
      },
      {
        assetId: "cf-asset-audio",
        locale: "es-AR",
        relativePath: "assets/audio.mp3",
        url: "https://assets.ctfassets.net/s/cf-asset-audio/1/audio.mp3",
        fileName: "audio.mp3",
        contentType: "audio/mpeg",
        size: assetBytes["assets/audio.mp3"]!.byteLength,
        sha256: sha("MP3-SYNTHETIC-AUDIO"),
      },
      {
        assetId: "cf-asset-pdf",
        locale: "es-AR",
        relativePath: "assets/pdf-es.pdf",
        url: "https://assets.ctfassets.net/s/cf-asset-pdf/1/resumen.es-AR.pdf",
        fileName: "resumen.es-AR.pdf",
        contentType: "application/pdf",
        size: assetBytes["assets/pdf-es.pdf"]!.byteLength,
        sha256: sha("PDF-SYNTHETIC-ES"),
      },
      {
        assetId: "cf-asset-pdf",
        locale: "en-US",
        relativePath: "assets/pdf-en.pdf",
        url: "https://assets.ctfassets.net/s/cf-asset-pdf/2/resumen.en-US.pdf",
        fileName: "resumen.en-US.pdf",
        contentType: "application/pdf",
        size: assetBytes["assets/pdf-en.pdf"]!.byteLength,
        sha256: sha("PDF-SYNTHETIC-EN"),
      },
      {
        assetId: "cf-asset-unused",
        locale: "es-AR",
        relativePath: "assets/unused.png",
        url: "https://images.ctfassets.net/s/cf-asset-unused/1/unused.png",
        fileName: "unused.png",
        contentType: "image/png",
        size: assetBytes["assets/unused.png"]!.byteLength,
        sha256: sha("PNG-SYNTHETIC-UNUSED"),
        width: 400,
        height: 400,
      },
    ],
  };

  return {
    manifest,
    loadFileBytes: async (file) => assetBytes[file.relativePath]!,
  };
}

describe("runContentfulImport end-to-end (AC1–AC6)", () => {
  it("reports in dry-run with 0 writes, applies all 20 types & 4 states accurately, and is 100% idempotent on re-run", async () => {
    const snapshot = buildFullSyntheticSnapshot();
    const { db, store, getWriteCount, resetWriteCount } =
      createInMemoryContentDb("website-staging");

    // Pre-seed a scratch post (no sourceContentfulId) that must stay untouched and be listed
    const scratchId = new ObjectId();
    store.set(COLLECTIONS.posts, [
      {
        _id: scratchId,
        draft: { title: { "es-AR": "Borrador Scratch Admin" }, slug: "scratch-admin" },
        revision: 1,
        createdAt: new Date("2026-11-20T00:00:00.000Z"),
        updatedAt: new Date("2026-11-20T00:00:00.000Z"),
        updatedBy: "admin-user-1",
        _refs: { mediaIds: [], contentRefs: [] },
      },
    ]);

    const createServerMediaMock = vi.fn(async (_caller, input, deps) => {
      const id = new ObjectId();
      const sha256 = createHash("sha256")
        .update(input.buffer ?? input.body)
        .digest("hex");
      const pathname = `media/${id.toHexString()}/${input.filename}`;
      const stored = {
        _id: id,
        pathname,
        url: `https://staging.public.blob.vercel-storage.com/${pathname}`,
        filename: input.filename,
        contentType: input.contentType,
        size: (input.buffer ?? input.body).byteLength,
        sha256,
        ...(input.width !== undefined && { width: input.width }),
        ...(input.height !== undefined && { height: input.height }),
        title: input.title,
        ...(input.alt !== undefined && { alt: input.alt }),
        createdBy: IMPORTER_SERVICE_ID,
        createdAt: deps?.now ? deps.now() : new Date(),
      };
      const mediaList = store.get(COLLECTIONS.media) ?? [];
      mediaList.push(stored);
      store.set(COLLECTIONS.media, mediaList);
      return {
        ok: true as const,
        status: "created" as const,
        reused: false as const,
        doc: { ...stored, _id: id.toHexString() },
      };
    });

    const importerDeps = {
      getContentDb: () => db,
      createServerMediaFn: createServerMediaMock as never,
      ensureIndexes: async () => {},
      ensureMediaIndexesFn: async () => {},
    };

    // 1. Dry-run (default) -> zero writes, zero blob uploads, all checks pass
    const dryReport = await runContentfulImport(snapshot, {}, importerDeps);
    expect(dryReport.ok).toBe(true);
    expect(dryReport.mode).toBe("dry-run");
    expect(dryReport.totalDocumentWrites).toBe(0);
    expect(dryReport.totalBlobUploads).toBe(0);
    expect(getWriteCount()).toBe(0);
    expect(createServerMediaMock).not.toHaveBeenCalled();
    expect(dryReport.brokenLinks).toHaveLength(2);
    expect(dryReport.scratchDocuments).toHaveLength(1);
    expect(dryReport.privacyPolicyChecks).toHaveLength(2);
    expect(
      dryReport.privacyPolicyChecks.every(
        (c) => c.identicalAfterWhitespaceNormalization,
      ),
    ).toBe(true);

    // 2. First apply -> writes all entries & uploads 5 distinct blobs (img, audio, pdf-es, pdf-en, unused)
    const apply1 = await runContentfulImport(
      snapshot,
      { apply: true },
      importerDeps,
    );
    expect(apply1.ok).toBe(true);
    expect(apply1.totalBlobUploads).toBe(5);
    expect(apply1.totalDocumentWrites).toBeGreaterThan(0);

    // Verify changed section has distinct published vs newer draft
    const heroDoc = store.get(COLLECTIONS.sections)?.[0] as Record<string, unknown>;
    expect((heroDoc.draft as Record<string, unknown>).headline).toEqual({
      "es-AR": "Misión Borrador Nuevo",
      "en-US": "Mission Draft New",
    });
    expect((heroDoc.published as Record<string, unknown>).headline).toEqual({
      "es-AR": "Misión Publicada Original",
      "en-US": "Mission Published Original",
    });
    expect((heroDoc.draft as Record<string, unknown>).targetPage).toBe(
      "community",
    );

    // Verify 3 unpublished July sermons exist as drafts ONLY (`published === undefined`)
    const sermons = store.get(COLLECTIONS.sermons) ?? [];
    expect(sermons).toHaveLength(4);
    const julyDrafts = sermons.filter((s) => s.published === undefined);
    expect(julyDrafts).toHaveLength(3);
    for (const s of sermons) {
      expect(typeof (s.draft as Record<string, unknown>).contentHash).toBe(
        "string",
      );
      expect(
        ((s.draft as Record<string, unknown>).contentHash as string).length,
      ).toBe(64);
    }

    // Verify published sermon contentHash matches canonical computeTipTapSermonContentHash
    const pubSermon = sermons.find((s) => s.published !== undefined)!;
    const pubDraft = pubSermon.draft as Record<string, unknown>;
    const expectedHash = computeTipTapSermonContentHash(
      {
        title: "Prédica Publicada",
        sermonDate: "2026-06-28",
        content: (pubDraft.content as Record<string, unknown>)["es-AR"] as never,
        scriptureReferences: [
          {
            book: "Juan",
            chapter: 3,
            fromVerse: 16,
            toVerse: 17,
            verseContent: "Porque de tal manera...",
          },
        ],
        preacherName: "Pastor Demo",
        additionalPreacherNames: [],
      },
      {
        title: "Published Sermon",
        sermonDate: "2026-06-28",
        content: (pubDraft.content as Record<string, unknown>)["en-US"] as never,
        scriptureReferences: [
          {
            book: "John",
            chapter: 3,
            fromVerse: 16,
            toVerse: 17,
            verseContent: "For God so loved...",
          },
        ],
        preacherName: "Pastor Demo",
        additionalPreacherNames: [],
      },
    );
    expect(pubDraft.contentHash).toBe(expectedHash);

    // Verify privacy topic is protected: true and keeps original timestamps
    const privacyDoc = store.get(COLLECTIONS.topics)?.[0] as Record<string, unknown>;
    expect((privacyDoc.draft as Record<string, unknown>).protected).toBe(true);
    expect((privacyDoc.published as Record<string, unknown>).protected).toBe(true);
    expect((privacyDoc.createdAt as Date).toISOString()).toBe(
      "2025-03-01T10:00:00.000Z",
    );
    expect((privacyDoc.publishedAt as Date).toISOString()).toBe(
      "2026-04-10T12:00:00.000Z",
    );

    // Verify Bible verses kept verbatim (trailing space + "RVR") and missing en-US stayed absent
    const verses = store.get(COLLECTIONS.bibleVerses) ?? [];
    const pubVerse = verses.find((v) => v.sourceContentfulId === "cf-verse-pub")!;
    expect(((pubVerse.draft as Record<string, unknown>).version as Record<string, string>)["es-AR"]).toBe(
      "Nueva Versión Internacional ",
    );
    const draftVerse = verses.find((v) => v.sourceContentfulId === "cf-verse-draft")!;
    expect(draftVerse.published).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        (draftVerse.draft as Record<string, unknown>).book,
        "en-US",
      ),
    ).toBe(false);

    // Verify seo-predicas skipped, archived post skipped, pages flattened, content_pdf_jobs empty
    expect(store.get(COLLECTIONS.seoEntries)).toHaveLength(1);
    expect(store.get("content_pdf_jobs")).toBeUndefined();
    expect(
      apply1.skippedEntries.some((s) => s.reason === "unused-seo-predicas"),
    ).toBe(true);
    expect(apply1.skippedEntries.some((s) => s.reason === "archived")).toBe(
      true,
    );
    expect(
      apply1.skippedEntries.some((s) => s.reason === "flattened-page"),
    ).toBe(true);

    // Verify scratch doc untouched
    const postsAfter = store.get(COLLECTIONS.posts) ?? [];
    expect(
      postsAfter.some((p) => (p._id as ObjectId).equals(scratchId)),
    ).toBe(true);

    // 3. Second apply against SAME snapshot -> ZERO document writes & ZERO blob uploads!
    resetWriteCount();
    createServerMediaMock.mockClear();

    const apply2 = await runContentfulImport(
      snapshot,
      { apply: true },
      importerDeps,
    );
    expect(apply2.ok).toBe(true);
    expect(apply2.totalDocumentWrites).toBe(0);
    expect(apply2.totalBlobUploads).toBe(0);
    expect(getWriteCount()).toBe(0);
    expect(createServerMediaMock).not.toHaveBeenCalled();

    // Verify human-readable Markdown report renders cleanly
    const md = formatImportReportMarkdown(apply2);
    expect(md).toContain("# Contentful Import Report (APPLY)");
    expect(md).toContain("Broken Links Preserved");
    expect(md).toContain("Privacy Policy Whitespace-Only Verification");
    expect(md).toContain("Untouched Scratch Documents");
  });

  it("refuses bare production 'website' DB without allowProd flag", async () => {
    const snapshot = buildFullSyntheticSnapshot();
    const { db, getWriteCount } = createInMemoryContentDb("website");

    const report = await runContentfulImport(
      snapshot,
      { apply: true },
      { getContentDb: () => db },
    );
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain("--prod");
    expect(getWriteCount()).toBe(0);
  });
});
