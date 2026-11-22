// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import type { RichTextView } from "@idcr/content";
import {
  assertSafeParityBaseUrl,
  buildParityRouteInventory,
  comparePngPixels,
  createMediaIdentityMap,
  formatDataParityReportMarkdown,
  formatPageParityReportMarkdown,
  normalizeHtmlForPageParity,
  normalizeMediaUrl,
  normalizeSrcset,
  PRODUCTION_HOST_DENY_LIST,
  renderRichTextPairForParity,
  runDataParity,
  runPageParity,
  validateParityBaseUrl,
  type ParityReaders,
} from "../index";

describe("host-guard (AC7 & AC8 production deny list)", () => {
  it("refuses every production host in .claude/config.json regardless of case, path, or port", () => {
    for (const host of PRODUCTION_HOST_DENY_LIST) {
      expect(validateParityBaseUrl(`https://${host}`).ok).toBe(false);
      expect(validateParityBaseUrl(`https://${host.toUpperCase()}/es-AR`).ok).toBe(false);
      expect(validateParityBaseUrl(`https://${host}.:443/`).ok).toBe(false);
      expect(() => assertSafeParityBaseUrl(`https://${host}`)).toThrow(/production host/i);
    }
  });

  it("rejects non-HTTP(S) schemes and embedded credentials, and accepts local & preview URLs", () => {
    expect(validateParityBaseUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateParityBaseUrl("https://user:pass@localhost:3000").ok).toBe(false);
    expect(validateParityBaseUrl("http://127.0.0.1:3001/").ok).toBe(true);
    expect(validateParityBaseUrl("https://staging.idcredentor.org").ok).toBe(true);
  });
});

describe("normalizeHtmlForPageParity & media identity mapping (F-C3)", () => {
  const mediaMap = createMediaIdentityMap([
    {
      canonicalKey: "hero-sha",
      urls: [
        "https://images.ctfassets.net/vg9le24yw8hb/cfAssetHero/abc/hero.jpg",
        "https://store1.public.blob.vercel-storage.com/media/670000000000000000000001/hero.jpg",
      ],
      contentfulAssetIds: ["cfAssetHero"],
      mongoMediaIds: ["670000000000000000000001"],
    },
  ]);

  it("maps Contentful and Blob URLs (including inside /_next/image and srcset) to the same media identity", () => {
    const cfNextImg =
      "/_next/image?url=https%3A%2F%2Fimages.ctfassets.net%2Fvg9le24yw8hb%2FcfAssetHero%2Fabc%2Fhero.jpg&w=1080&q=75";
    const blobNextImg =
      "/_next/image?url=https%3A%2F%2Fstore1.public.blob.vercel-storage.com%2Fmedia%2F670000000000000000000001%2Fhero.jpg&w=1080&q=75";

    expect(normalizeMediaUrl(cfNextImg, mediaMap)).toBe(
      normalizeMediaUrl(blobNextImg, mediaMap),
    );

    const srcsetA = `${cfNextImg} 1x, ${cfNextImg} 2x`;
    const srcsetB = `${blobNextImg} 1x, ${blobNextImg} 2x`;
    expect(normalizeSrcset(srcsetA, mediaMap)).toBe(
      normalizeSrcset(srcsetB, mediaMap),
    );
  });

  it("normalizes scripts, build hashes, OG/JSON-LD media, footer version/year, likes, and Live Preview attrs", () => {
    const htmlContentful = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:image" content="https://images.ctfassets.net/vg9le24yw8hb/cfAssetHero/abc/hero.jpg" />
          <link rel="stylesheet" href="/_next/static/css/aaa111.css?dpl=dpl_A" />
          <script type="application/ld+json">{"image":"https://images.ctfassets.net/vg9le24yw8hb/cfAssetHero/abc/hero.jpg","@type":"Article"}</script>
        </head>
        <body>
          <main data-contentful-entry-id="cf1" data-contentful-field-id="title">
            <img src="/_next/image?url=https%3A%2F%2Fimages.ctfassets.net%2Fvg9le24yw8hb%2FcfAssetHero%2Fabc%2Fhero.jpg&amp;w=640&amp;q=75" />
            <span data-testid="like-count">42</span>
          </main>
          <footer>&copy; 2026 Iglesia | v1.27.6</footer>
          <script>self.__next_f.push([1,"contentful-payload"])</script>
        </body>
      </html>
    `;

    const htmlMongo = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:image" content="https://store1.public.blob.vercel-storage.com/media/670000000000000000000001/hero.jpg" />
          <link rel="stylesheet" href="/_next/static/css/bbb222.css?dpl=dpl_B" />
          <script type="application/ld+json">{"@type":"Article","image":"https://store1.public.blob.vercel-storage.com/media/670000000000000000000001/hero.jpg"}</script>
        </head>
        <body>
          <main>
            <img src="/_next/image?url=https%3A%2F%2Fstore1.public.blob.vercel-storage.com%2Fmedia%2F670000000000000000000001%2Fhero.jpg&amp;w=640&amp;q=75" />
            <span data-testid="like-count">7</span>
          </main>
          <footer>© 2027 Iglesia | v1.28.0</footer>
          <script>self.__next_f.push([1,"tiptap-payload"])</script>
        </body>
      </html>
    `;

    expect(normalizeHtmlForPageParity(htmlContentful, { mediaMap })).toBe(
      normalizeHtmlForPageParity(htmlMongo, { mediaMap }),
    );
  });

  it("renders Contentful and TipTap rich text to identical normalized HTML across presets", () => {
    const cfRichText = {
      json: {
        nodeType: "document" as const,
        data: {},
        content: [
          {
            nodeType: "paragraph" as const,
            data: {},
            content: [
              { nodeType: "text" as const, value: "Dirección:\nBuenos Aires", marks: [], data: {} },
            ],
          },
        ],
      },
    };
    const mongoRichText: RichTextView = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Dirección: Buenos Aires" }],
          },
        ],
      },
      media: {},
    };

    const res = renderRichTextPairForParity(
      cfRichText as never,
      mongoRichText,
      "article",
      mediaMap,
    );
    expect(res.equal).toBe(true);

    // Profile-disallowed heading in `sectionDescription` (inline profile) MUST drop to "" (C3)
    const cfWithHeading = {
      json: {
        nodeType: "document" as const,
        data: {},
        content: [
          {
            nodeType: "heading-2" as const,
            data: {},
            content: [{ nodeType: "text" as const, value: "Should Drop", marks: [], data: {} }],
          },
        ],
      },
    };
    const mongoWithHeading: RichTextView = {
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Should Drop" }],
          },
        ],
      },
      media: {},
    };
    const inlineCheck = renderRichTextPairForParity(
      cfWithHeading as never,
      mongoWithHeading,
      "sectionDescription",
      mediaMap,
    );
    expect(inlineCheck.mongoHtml).toBe("");
    expect(inlineCheck.equal).toBe(false);
  });
});

describe("runDataParity mode-matched comparison (AC7)", () => {
  const mediaMap = createMediaIdentityMap([
    {
      canonicalKey: "img-1",
      urls: [
        "https://images.ctfassets.net/s/cfImg1/h/img.jpg",
        "https://store.public.blob.vercel-storage.com/media/670000000000000000000001/img.jpg",
      ],
      contentfulAssetIds: ["cfImg1"],
      mongoMediaIds: ["670000000000000000000001"],
    },
    {
      // Split-locale bilingual sermon PDF (es-AR) mapped by exact Contentful CDN URL (C1)
      canonicalKey: "pdf-sha-es",
      urls: [
        "https://assets.ctfassets.net/s/cfPdfBilingual/es-hash/predica.es-AR.pdf",
        "https://store.public.blob.vercel-storage.com/media/670000000000000000000002/predica-es.pdf",
      ],
      mongoMediaIds: ["670000000000000000000002"],
    },
    {
      // Split-locale bilingual sermon PDF (en-US) mapped by exact Contentful CDN URL (C1)
      canonicalKey: "pdf-sha-en",
      urls: [
        "https://assets.ctfassets.net/s/cfPdfBilingual/en-hash/predica.en-US.pdf",
        "https://store.public.blob.vercel-storage.com/media/670000000000000000000003/predica-en.pdf",
      ],
      mongoMediaIds: ["670000000000000000000003"],
    },
  ]);

  const entryIdByContentfulId = new Map<string, string>([
    ["cf-post-1", "670000000000000000000019"],
    ["cf-sermon-pub", "67000000000000000000001b"],
    ["cf-sermon-draft", "67000000000000000000001c"],
    ["cf-topic-priv", "67000000000000000000001a"],
    ["cf-seo", "670000000000000000000010"],
    ["cf-sec", "670000000000000000000011"],
    ["cf-email", "670000000000000000000015"],
    ["cf-event", "670000000000000000000017"],
    ["cf-coll", "670000000000000000000018"],
  ]);

  function makeReaders(
    kind: "cf" | "mongo",
    options: { readonly tamperTitle?: string; readonly swapBilingualPdf?: boolean } = {},
  ): ParityReaders {
    const imgUrl =
      kind === "cf"
        ? "https://images.ctfassets.net/s/cfImg1/h/img.jpg"
        : "https://store.public.blob.vercel-storage.com/media/670000000000000000000001/img.jpg";
    const pdfUrl = (locale: string) => {
      const effectiveLocale =
        options.swapBilingualPdf && kind === "mongo"
          ? locale === "es-AR"
            ? "en-US"
            : "es-AR"
          : locale;
      if (kind === "cf") {
        return effectiveLocale === "es-AR"
          ? "https://assets.ctfassets.net/s/cfPdfBilingual/es-hash/predica.es-AR.pdf"
          : "https://assets.ctfassets.net/s/cfPdfBilingual/en-hash/predica.en-US.pdf";
      }
      return effectiveLocale === "es-AR"
        ? "https://store.public.blob.vercel-storage.com/media/670000000000000000000002/predica-es.pdf"
        : "https://store.public.blob.vercel-storage.com/media/670000000000000000000003/predica-en.pdf";
    };
    const id = (cfId: string) =>
      kind === "cf" ? cfId : entryIdByContentfulId.get(cfId) ?? cfId;
    const rt = (text: string) =>
      kind === "cf"
        ? {
            json: {
              nodeType: "document",
              data: {},
              content: [
                {
                  nodeType: "paragraph",
                  data: {},
                  content: [{ nodeType: "text", value: text, marks: [], data: {} }],
                },
              ],
            },
          }
        : {
            doc: {
              type: "doc",
              content: [
                { type: "paragraph", content: [{ type: "text", text }] },
              ],
            },
            media: {},
          };

    const makeSermon = (slug: string, cfId: string, locale: string) => ({
      title:
        slug === "predica-1" && options.tamperTitle
          ? options.tamperTitle
          : `Título ${slug}`,
      slug,
      sermonDate: "2026-07-01",
      // Nullable GraphQL draft fields vs Mongo "" / [] defaults (C3)
      thesis: slug === "borrador-julio" ? (kind === "cf" ? null : "") : "Tesis",
      keywords: kind === "cf" ? null : [],
      content: rt(`Cuerpo ${slug}`),
      featuredImage: { url: imgUrl, title: "Img" },
      pdfSummary: {
        url: pdfUrl(locale),
        title: locale === "es-AR" ? "Resumen" : "Summary",
      },
      sys: { id: id(cfId), publishedAt: "2026-07-01T12:00:00.000Z" },
    });

    const postObj = {
      title: "Post 1",
      slug: "post-1",
      content: rt("Contenido post"),
      featuredImage: { url: imgUrl, title: "Img" },
      sys: { id: id("cf-post-1"), publishedAt: "2026-05-01T00:00:00.000Z" },
    };

    const sectionObj = {
      layout: "hero",
      headline: "Misión",
      body: rt("Cuerpo sección"),
      image: { url: imgUrl, title: "Img" },
      sys: { id: id("cf-sec") },
      __typename: "Section",
    };

    return {
      getSeo: async (name) => ({
        title: `SEO ${name}`,
        description: "Desc",
        keywords: ["iglesia"],
        image: { url: imgUrl, title: "Img", width: 1200, height: 630 },
        sys: { id: id("cf-seo") },
        __typename: "Seo",
      }),
      getSection: async () => sectionObj,
      getCtaComponent: async () => sectionObj,
      getHeroBannerComponent: async () => sectionObj,
      getTextBlockComponent: async () => sectionObj,
      getNavigationMenu: async () => [{ groupName: "Blog", groupLink: { slug: "blog" } }],
      getFooter: async () => ({
        logo: { url: imgUrl, title: "Img" },
        shortDescription: "Iglesia",
        socialLinks: [{ platform: "facebook", url: "https://fb.example.org" }],
        location: { addressLine1: "Calle 1", city: "BA", country: "AR" },
      }),
      getSingleEmailForm: async () => ({
        title: "Boletín",
        ctaText: "Enviar",
        sys: { id: id("cf-email") },
        __typename: "SingleEmailForm",
      }),
      getContactForm: async () => ({
        title: "Contacto",
        agreementNote: rt("Acepto"),
        formFields: [
          {
            inputId: "name",
            type: "Short text",
            required: true,
            name: "Nombre",
            placeholder: kind === "cf" ? null : "",
            values: kind === "cf" ? null : [],
          },
        ],
      }),
      getEventBanner: async () => ({
        eventInfo: { name: "Culto", dayOfWeek: "Domingo", time: "17:00" },
        image: { url: imgUrl, title: "Img" },
        sys: { id: id("cf-event") },
        __typename: "EventBanner",
      }),
      getContentCollection: async () => ({
        title: "Credo",
        description: rt("Desc credo"),
        contentItemsCollection: {
          items: [
            {
              title: "Unidad",
              description: rt("Desc unidad"),
              sys: { id: kind === "cf" ? "cf-item-1" : "670000000000000000000018:item:0" },
              __typename: "BeliefItem",
            },
          ],
        },
        sys: { id: id("cf-coll") },
        __typename: "ContentCollection",
      }),
      mapContentCollection: (raw) => raw,
      getLatestBlogPostPages: async () => [postObj],
      getAllBlogPostSlugs: async () => [
        { slug: "post-1", updatedAt: "2026-05-01T00:00:00.000Z" },
      ],
      getBlogPostPage: async () => postObj,
      getBlogPostPageById: async () => postObj,
      getChurchInfoTopic: async (slug) => ({
        name: "Privacidad",
        slug,
        body: rt("Texto legal"),
        sys: { id: id("cf-topic-priv"), publishedAt: "2026-05-01T00:00:00.000Z" },
      }),
      getAllSermonSlugs: async () =>
        // Reverse order on CF vs Mongo to prove unordered sitemap slug comparison sorts by slug (C3)
        kind === "cf"
          ? [
              { slug: "predica-1", updatedAt: "2026-07-01T12:00:00.000Z" },
              { slug: "predica-0", updatedAt: "2026-06-01T12:00:00.000Z" },
            ]
          : [
              { slug: "predica-0", updatedAt: "2026-06-01T12:00:00.000Z" },
              { slug: "predica-1", updatedAt: "2026-07-01T12:00:00.000Z" },
            ],
      getAllSermons: async (locale, opts) =>
        opts?.isDraftMode
          ? [
              makeSermon("predica-1", "cf-sermon-pub", locale),
              makeSermon("borrador-julio", "cf-sermon-draft", locale),
            ]
          : [makeSermon("predica-1", "cf-sermon-pub", locale)],
      getLatestSermons: async (locale, opts) =>
        opts?.isDraftMode
          ? [
              makeSermon("predica-1", "cf-sermon-pub", locale),
              makeSermon("borrador-julio", "cf-sermon-draft", locale),
            ]
          : [makeSermon("predica-1", "cf-sermon-pub", locale)],
      getSermon: async (slug, locale) =>
        slug === "borrador-julio"
          ? makeSermon("borrador-julio", "cf-sermon-draft", locale)
          : makeSermon(slug, "cf-sermon-pub", locale),
      getSermonById: async (reqId, locale) =>
        reqId === id("cf-sermon-draft")
          ? makeSermon("borrador-julio", "cf-sermon-draft", locale)
          : makeSermon("predica-1", "cf-sermon-pub", locale),
    };
  }

  it("reports 0 diffs across all readers (incl. mapContentCollection, split-locale PDFs, nullable GraphQL fields & reconciliation)", async () => {
    const report = await runDataParity({
      mediaMap,
      entryIdByContentfulId,
      mongoMediaCount: 3,
      mongoCollections: { sermons: { total: 2, published: 1, draftOnly: 1 } },
      contentfulReaders: makeReaders("cf"),
      mongoReaders: makeReaders("mongo"),
    });

    expect(report.ok).toBe(true);
    expect(report.totalDiffs).toBe(0);
    expect(report.totalChecks).toBeGreaterThan(80);
    expect(
      report.checks.some((c) => c.check.startsWith("mapContentCollection(")),
    ).toBe(true);
    expect(report.reconciliation.mongoMediaCount).toBe(3);
    const md = formatDataParityReportMarkdown(report);
    expect(md).toContain("PASS (0 diffs)");
    expect(md).toContain("## Count Reconciliation");
  });

  it("detects both a planted title diff and swapped bilingual ES/EN sermon PDFs (C1)", async () => {
    const report = await runDataParity({
      modes: ["published"],
      locales: ["es-AR"],
      mediaMap,
      entryIdByContentfulId,
      contentfulReaders: makeReaders("cf"),
      mongoReaders: makeReaders("mongo", {
        tamperTitle: "Título Alterado",
        swapBilingualPdf: true,
      }),
    });

    expect(report.ok).toBe(false);
    expect(
      report.diffs.some(
        (d) =>
          d.check === "getSermon(predica-1)" &&
          d.mongoValue === "Título Alterado",
      ),
    ).toBe(true);
    expect(
      report.diffs.some(
        (d) =>
          d.check === "getSermon(predica-1)" &&
          d.path === "$.pdfSummary.url" &&
          d.contentfulValue === "media:pdf-sha-es" &&
          d.mongoValue === "media:pdf-sha-en",
      ),
    ).toBe(true);
  });
});

describe("runPageParity against local HTTP server (AC8)", () => {
  it("reports 0 diffs on two self-comparison runs, reports a planted difference, and refuses production hosts", async () => {
    let plantDiff = false;
    const server = http.createServer((req, res) => {
      const path = req.url ?? "/";
      const bodyText =
        plantDiff && req.headers["x-variant"] === "B" && path === "/es-AR"
          ? "<h1>Bienvenido MODIFICADO</h1>"
          : `<h1>Página ${path}</h1>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><body>${bodyText}<footer>© 2026 Iglesia | v1.27.6</footer><script>self.__next_f.push([1,"${Math.random()}"])</script></body></html>`,
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const routes = buildParityRouteInventory({
        postSlugs: ["post-1"],
        sermonSlugs: ["predica-1"],
        topicSlugsByLocale: { "es-AR": ["privacidad"], "en-US": ["privacy"] },
      });
      expect(routes).toContain("/es-AR/privacidad");
      expect(routes).toContain("/en-US/privacy");

      // Self-comparison #1
      const self1 = await runPageParity({
        baseUrlA: baseUrl,
        baseUrlB: baseUrl,
        routes: ["/es-AR", "/en-US", "/es-AR/privacidad"],
      });
      expect(self1.ok).toBe(true);
      expect(self1.failedRoutes).toBe(0);

      // Self-comparison #2 (stability)
      const self2 = await runPageParity({
        baseUrlA: baseUrl,
        baseUrlB: baseUrl,
        routes: ["/es-AR", "/en-US", "/es-AR/privacidad"],
      });
      expect(self2.ok).toBe(true);

      // Planted difference detected
      plantDiff = true;
      const planted = await runPageParity({
        baseUrlA: baseUrl,
        baseUrlB: baseUrl,
        headersA: { "x-variant": "A" },
        headersB: { "x-variant": "B" },
        routes: ["/es-AR", "/en-US"],
      });
      expect(planted.ok).toBe(false);
      expect(planted.failedRoutes).toBe(1);
      expect(planted.routes[0]?.htmlDiff?.snippetB).toContain("MODIFICADO");
      expect(formatPageParityReportMarkdown(planted)).toContain("FAIL");

      // Production host refused BEFORE any request
      await expect(
        runPageParity({
          baseUrlA: "https://www.idcredentor.org",
          baseUrlB: baseUrl,
          routes: ["/es-AR"],
        }),
      ).rejects.toThrow(/production host/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("computes true decoded-pixel diffRatio on Playwright screenshots: stable self-compare + planted visual diff (C4)", async () => {
    let plantVisualDiff = false;
    const server = http.createServer((req, res) => {
      const isVariantB = req.headers["x-variant"] === "B";
      const bg = plantVisualDiff && isVariantB ? "#dc2626" : "#ffffff";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><body style="margin:0;background:${bg};height:400px"><main style="padding:32px;font-family:sans-serif"><h1>Iglesia Demo</h1></main></body></html>`,
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Self-comparison with Playwright screenshots -> 0% pixel diff
      const selfShot = await runPageParity({
        baseUrlA: baseUrl,
        baseUrlB: baseUrl,
        routes: ["/es-AR"],
        screenshotRoutes: ["/es-AR"],
      });
      expect(selfShot.ok).toBe(true);
      expect(selfShot.screenshots).toHaveLength(1);
      expect(selfShot.screenshots[0]?.ok).toBe(true);
      expect(selfShot.screenshots[0]?.diffRatio).toBe(0);

      // Planted full-page visual difference -> high decoded pixel diffRatio caught cleanly
      plantVisualDiff = true;
      const diffShot = await runPageParity({
        baseUrlA: baseUrl,
        baseUrlB: baseUrl,
        headersA: { "x-variant": "A" },
        headersB: { "x-variant": "B" },
        routes: ["/es-AR"],
        screenshotRoutes: ["/es-AR"],
        screenshotDiffThreshold: 0.005,
      });
      expect(diffShot.ok).toBe(false);
      expect(diffShot.screenshots[0]?.ok).toBe(false);
      expect(diffShot.screenshots[0]?.diffRatio).toBeGreaterThan(0.5);

      // Invalid PNG buffers fail closed to diffRatio = 1
      expect(
        comparePngPixels(Buffer.from("not-a-png-a"), Buffer.from("not-a-png-b")),
      ).toEqual({ byteEqual: false, diffRatio: 1 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
