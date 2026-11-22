import {
  documentToReactComponents,
  type CommonNode,
  type Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, type Document } from "@contentful/rich-text-types";
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { validateRichText, type RichTextProfile } from "@idcr/content";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  articleRichTextOptions,
  cardDescriptionOptions,
  sectionDescriptionOptions,
} from "@lib/contentful/rich-text-options";
import { buildSermonRichTextOptions } from "@src/components/features/sermon-details/sermonRichTextOptions";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import {
  articlePreset,
  cardDescriptionPreset,
  contactFormAgreementPreset,
  convertContentfulRichText,
  infoCommunityPreset,
  infoConnectPreset,
  ourMissionCtaPreset,
  renderRichText,
  renderSermonRichText,
  sectionDescriptionPreset,
  type MediaView,
  type RichTextPreset,
} from "../index";
import { renderToNormalizedHtml } from "./parity-helpers";

vi.mock("@src/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    target?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  ),
}));

const MESSAGES = {
  Sermons: {
    play: "Reproducir",
    pause: "Pausar",
    seek: "Buscar",
    speed: "Velocidad",
    "summary-pdf": "Descargar resumen en PDF",
  },
};

function withIntl(node: ReactNode): ReactNode {
  return (
    <NextIntlClientProvider locale="es-AR" messages={MESSAGES}>
      {node}
    </NextIntlClientProvider>
  );
}

const cfText = (value: string, marks: Array<{ type: string }> = []) => ({
  nodeType: "text",
  value,
  marks,
  data: {},
});

const cfParagraph = (...children: unknown[]) => ({
  nodeType: BLOCKS.PARAGRAPH,
  data: {},
  content: children,
});

const cfDoc = (...content: unknown[]): Document =>
  ({ nodeType: BLOCKS.DOCUMENT, data: {}, content }) as Document;

// Exact inline option objects mirrored from InfoCommunity, InfoConnect, OurMissionCta, ContactForm
const legacyInfoCommunityOptions: Options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-xl md:text-2xl dark:text-white"
      >
        {children}
      </Typography>
    ),
  },
};

const legacyInfoConnectOptions: Options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-xl md:text-2xl text-gray-700 dark:text-gray-300"
      >
        {children}
      </Typography>
    ),
  },
};

const legacyOurMissionCtaOptions: Options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]"
      >
        {children}
      </Typography>
    ),
  },
};

const legacyContactFormOptions: Options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="mt-4 text-sm/6 text-muted-foreground"
      >
        {children}
      </Typography>
    ),
    hyperlink: (node: CommonNode, children: ReactNode) => (
      <Link
        href={node.data.uri}
        className="font-semibold text-primary hover:underline"
        target="_blank"
      >
        {children}
      </Link>
    ),
  },
};

function assertParityAndRoundTrip(
  cfDocument: Document,
  profile: RichTextProfile,
  legacyOptions: Options,
  preset: RichTextPreset,
) {
  const converted = convertContentfulRichText(cfDocument, { profile });
  expect(converted.ok).toBe(true);
  if (!converted.ok) return;

  expect(validateRichText(converted.doc, profile)).toEqual([]);
  if (converted.doc.content.length > 0) {
    const schema = getSchema(createRichTextExtensions(profile));
    const pm = PMNode.fromJSON(schema, converted.doc);
    expect(() => pm.check()).not.toThrow();
    expect(pm.toJSON()).toEqual(converted.doc);
  }

  const expectedHtml = renderToNormalizedHtml(
    withIntl(documentToReactComponents(cfDocument, legacyOptions)),
  );
  const actualHtml = renderToNormalizedHtml(
    withIntl(renderRichText({ doc: converted.doc, media: {} }, preset)),
  );
  expect(actualHtml).toBe(expectedHtml);
}

describe("Synthetic DOM parity across all 11 call-site presets", () => {
  it("matches articleRichTextOptions for headings, quotes, nested lists, marks, newlines, and mailto/http links", () => {
    const articleDoc = cfDoc(
      { nodeType: BLOCKS.HEADING_2, data: {}, content: [cfText("Título")] },
      { nodeType: BLOCKS.HEADING_3, data: {}, content: [cfText("Subtítulo")] },
      cfParagraph(
        cfText("Dirección:\nCalle Falsa 123\n"),
        cfText("Negrita", [{ type: "bold" }]),
        cfText(" "),
        cfText("Cursiva", [{ type: "italic" }]),
        cfText(" "),
        cfText("Negrita y cursiva", [{ type: "bold" }, { type: "italic" }]),
      ),
      cfParagraph(
        cfText("Escribinos a "),
        {
          nodeType: "hyperlink",
          data: { uri: "mailto:contacto@example.org" },
          content: [
            cfText("nuestro "),
            cfText("correo", [{ type: "bold" }]),
            cfText(" oficial"),
          ],
        },
        cfText(" o visitá "),
        {
          nodeType: "hyperlink",
          data: { uri: "https://example.org/a" },
          content: [cfText("enlace A")],
        },
        {
          nodeType: "hyperlink",
          data: { uri: "https://example.org/b" },
          content: [cfText("enlace B")],
        },
      ),
      {
        nodeType: BLOCKS.QUOTE,
        data: {},
        content: [cfParagraph(cfText("Porque de tal manera amó Dios al mundo."))],
      },
      {
        nodeType: BLOCKS.UL_LIST,
        data: {},
        content: [
          {
            nodeType: BLOCKS.LIST_ITEM,
            data: {},
            content: [
              cfParagraph(cfText("Punto uno")),
              {
                nodeType: BLOCKS.OL_LIST,
                data: {},
                content: [
                  {
                    nodeType: BLOCKS.LIST_ITEM,
                    data: {},
                    content: [cfParagraph(cfText("Sub-punto 1.1"))],
                  },
                ],
              },
            ],
          },
        ],
      },
    );

    assertParityAndRoundTrip(
      articleDoc,
      "article",
      articleRichTextOptions,
      articlePreset,
    );

    // Explicitly verify a link split by bold renders ONE <a> with <strong> inside
    const converted = convertContentfulRichText(articleDoc, { profile: "article" });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const html = renderToNormalizedHtml(
      renderRichText({ doc: converted.doc, media: {} }, articlePreset),
    );
    expect(html).toContain(
      '<a href="mailto:contacto@example.org">nuestro <strong>correo</strong> oficial</a>',
    );
    expect(html).toContain(
      '<a href="https://example.org/a">enlace A</a><a href="https://example.org/b">enlace B</a>',
    );
  });

  it("matches all inline presets (section, card, InfoCommunity, InfoConnect, OurMissionCta) including bold/italic defaults", () => {
    const inlineDoc = cfDoc(
      cfParagraph(
        cfText("Somos una iglesia "),
        cfText("centrada en Cristo", [{ type: "bold" }]),
        cfText(" y "),
        cfText("en comunidad", [{ type: "italic" }]),
        cfText("."),
      ),
    );

    assertParityAndRoundTrip(
      inlineDoc,
      "inline",
      sectionDescriptionOptions,
      sectionDescriptionPreset,
    );
    assertParityAndRoundTrip(
      inlineDoc,
      "inline",
      cardDescriptionOptions,
      cardDescriptionPreset,
    );
    assertParityAndRoundTrip(
      inlineDoc,
      "inline",
      legacyInfoCommunityOptions,
      infoCommunityPreset,
    );
    assertParityAndRoundTrip(
      inlineDoc,
      "inline",
      legacyInfoConnectOptions,
      infoConnectPreset,
    );
    assertParityAndRoundTrip(
      inlineDoc,
      "inline",
      legacyOurMissionCtaOptions,
      ourMissionCtaPreset,
    );
  });

  it("matches ContactForm agreement note preset with next-intl Link target=_blank", () => {
    const agreementDoc = cfDoc(
      cfParagraph(
        cfText("Al enviar este formulario aceptás nuestra "),
        {
          nodeType: "hyperlink",
          data: { uri: "https://idcredentor.com/es-AR/privacy-policy" },
          content: [cfText("política de privacidad")],
        },
        cfText("."),
      ),
    );

    assertParityAndRoundTrip(
      agreementDoc,
      "inlineLink",
      legacyContactFormOptions,
      contactFormAgreementPreset,
    );
  });

  it("matches empty document and empty paragraph output", () => {
    assertParityAndRoundTrip(
      cfDoc(),
      "article",
      articleRichTextOptions,
      articlePreset,
    );
    assertParityAndRoundTrip(
      cfDoc(cfParagraph(cfText(""))),
      "article",
      articleRichTextOptions,
      articlePreset,
    );
  });
});

describe("Sermon preset embedded media parity (AC4)", () => {
  const cfEmbed = (id: string) => ({
    nodeType: BLOCKS.EMBEDDED_ASSET,
    data: { target: { sys: { type: "Link", linkType: "Asset", id } } },
    content: [],
  });

  it("renders embedded audio matching buildSermonRichTextOptions", () => {
    const cfDocument = cfDoc(
      cfParagraph(cfText("Introducción.")),
      cfEmbed("cf-aud-1"),
    );
    const converted = convertContentfulRichText(cfDocument, {
      profile: "sermon",
      assetIdMap: { "cf-aud-1": "media-aud-1" },
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const media: Record<string, MediaView> = {
      "media-aud-1": {
        url: "https://blob.example.org/sermon-1.mp3",
        title: "Segmento 1",
        contentType: "audio/mpeg",
        fileName: "sermon-1.mp3",
        size: 1024,
      },
    };
    const legacyOptions = buildSermonRichTextOptions(
      [
        {
          sys: { id: "cf-aud-1" },
          url: media["media-aud-1"].url,
          title: media["media-aud-1"].title,
          contentType: media["media-aud-1"].contentType,
        },
      ],
      "Título respaldo",
    );

    const expected = renderToNormalizedHtml(
      withIntl(documentToReactComponents(cfDocument, legacyOptions)),
    );
    const actual = renderToNormalizedHtml(
      withIntl(renderSermonRichText({ doc: converted.doc, media }, "Título respaldo")),
    );
    expect(actual).toBe(expected);
  });

  it("renders embedded PDF matching buildSermonRichTextOptions", () => {
    const cfDocument = cfDoc(cfEmbed("cf-pdf-1"));
    const converted = convertContentfulRichText(cfDocument, {
      profile: "sermon",
      assetIdMap: { "cf-pdf-1": "media-pdf-1" },
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const media: Record<string, MediaView> = {
      "media-pdf-1": {
        url: "https://blob.example.org/resumen.pdf",
        title: "Resumen PDF",
        contentType: "application/pdf",
        fileName: "resumen.pdf",
        size: 2048,
      },
    };
    const legacyOptions = buildSermonRichTextOptions([
      {
        sys: { id: "cf-pdf-1" },
        url: media["media-pdf-1"].url,
        title: media["media-pdf-1"].title,
        contentType: media["media-pdf-1"].contentType,
      },
    ]);

    const expected = renderToNormalizedHtml(
      withIntl(documentToReactComponents(cfDocument, legacyOptions)),
    );
    const actual = renderToNormalizedHtml(
      withIntl(renderSermonRichText({ doc: converted.doc, media })),
    );
    expect(actual).toBe(expected);
  });

  it("renders embedded image with explicit dimensions and 1200x630 fallback matching buildSermonRichTextOptions", () => {
    const cfDocument = cfDoc(cfEmbed("cf-img-1"), cfEmbed("cf-img-2"));
    const converted = convertContentfulRichText(cfDocument, {
      profile: "sermon",
      assetIdMap: { "cf-img-1": "media-img-1", "cf-img-2": "media-img-2" },
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const media: Record<string, MediaView> = {
      "media-img-1": {
        url: "https://blob.example.org/photo.jpg",
        title: "Congregación",
        width: 800,
        height: 450,
        contentType: "image/jpeg",
        fileName: "photo.jpg",
        size: 4096,
      },
      "media-img-2": {
        url: "https://blob.example.org/fallback.jpg",
        title: "",
        contentType: "image/jpeg",
        fileName: "fallback.jpg",
        size: 1024,
      },
    };
    const legacyOptions = buildSermonRichTextOptions([
      {
        sys: { id: "cf-img-1" },
        url: media["media-img-1"].url,
        title: media["media-img-1"].title,
        width: 800,
        height: 450,
        contentType: "image/jpeg",
      },
      {
        sys: { id: "cf-img-2" },
        url: media["media-img-2"].url,
        title: "",
        contentType: "image/jpeg",
      },
    ]);

    const expected = renderToNormalizedHtml(
      withIntl(documentToReactComponents(cfDocument, legacyOptions)),
    );
    const actual = renderToNormalizedHtml(
      withIntl(renderSermonRichText({ doc: converted.doc, media })),
    );
    expect(actual).toBe(expected);
    expect(actual).toContain('width="1200"');
    expect(actual).toContain('height="630"');
  });

  it("renders a sermon with no embedded files identically to the article preset", () => {
    const cfDocument = cfDoc(
      { nodeType: BLOCKS.HEADING_2, data: {}, content: [cfText("Sermón simple")] },
      cfParagraph(cfText("Sin archivos embebidos.")),
    );
    const converted = convertContentfulRichText(cfDocument, { profile: "sermon" });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const articleHtml = renderToNormalizedHtml(
      renderRichText({ doc: converted.doc, media: {} }, articlePreset),
    );
    const sermonHtml = renderToNormalizedHtml(
      renderSermonRichText({ doc: converted.doc, media: {} }),
    );
    const legacyHtml = renderToNormalizedHtml(
      documentToReactComponents(cfDocument, articleRichTextOptions),
    );
    expect(sermonHtml).toBe(articleHtml);
    expect(sermonHtml).toBe(legacyHtml);
  });

  it("logs a warning and renders nothing (without throwing) when an embedded mediaId is missing from the map", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const html = renderToNormalizedHtml(
        renderSermonRichText({
          doc: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Antes" }] },
              { type: "embeddedMedia", attrs: { mediaId: "missing-id" } },
              { type: "paragraph", content: [{ type: "text", text: "Después" }] },
            ],
          },
          media: {},
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "[rich-text] Missing embedded media id:",
        "missing-id",
      );
      expect(html).toContain("Antes");
      expect(html).toContain("Después");
      expect(html).not.toContain("missing-id");
    } finally {
      warnSpy.mockRestore();
    }
  });
});
