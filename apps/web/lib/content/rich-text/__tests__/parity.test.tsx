import {
  documentToReactComponents,
  type CommonNode,
  type Options,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS, type Document } from "@contentful/rich-text-types";
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import {
  RICH_TEXT_SCHEMAS,
  validateRichText,
  type RichTextProfile,
} from "@idcr/content";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
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

interface CorpusAsset {
  id: string;
  url: string;
  title: string;
  contentType: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
}

interface CorpusDocumentEntry {
  id: string;
  entryId: string;
  contentType:
    | "sermon"
    | "blogPostPage"
    | "churchInfoTopic"
    | "section"
    | "beliefItem"
    | "contentCollection"
    | "contactForm";
  field: string;
  profile: RichTextProfile;
  locale: "es-AR" | "en-US";
  name?: string;
  layout?: string;
  document: Document;
  embeddedAssets?: Record<string, CorpusAsset>;
}

interface ProductionCorpus {
  source: string;
  scrubPolicy: string;
  placeholderEmail: string;
  documentCount: number;
  sermonCount: number;
  documents: CorpusDocumentEntry[];
  sermons: Array<Record<string, unknown>>;
}

const CORPUS_PATH = path.resolve(
  __dirname,
  "../__fixtures__/production-corpus.json",
);
const CORPUS_RAW = readFileSync(CORPUS_PATH, "utf8");
const CORPUS: ProductionCorpus = JSON.parse(CORPUS_RAW) as ProductionCorpus;

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

const SCHEMAS = {
  inline: getSchema(createRichTextExtensions("inline")),
  inlineLink: getSchema(createRichTextExtensions("inlineLink")),
  article: getSchema(createRichTextExtensions("article")),
  sermon: getSchema(createRichTextExtensions("sermon")),
} as const;

describe("Frozen published production corpus — safety, conversion, round-trip & DOM parity", () => {
  it("contains only published entries with zero real emails or credentials (public-repo safety)", () => {
    expect(CORPUS.source).toBe("contentful-cda-published-only");
    expect(CORPUS.scrubPolicy).toBe("mailto-placeholder");
    expect(CORPUS.documents.length).toBe(CORPUS.documentCount);
    expect(CORPUS.documents.length).toBeGreaterThanOrEqual(40);

    const emailMatches =
      CORPUS_RAW.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
    for (const match of emailMatches) {
      expect(match).toBe(CORPUS.placeholderEmail);
    }

    // No unpublished draft sermon fields or author email fields
    for (const sermon of CORPUS.sermons) {
      expect(sermon).not.toHaveProperty("preacherEmail");
      expect(sermon).not.toHaveProperty("email");
    }
  });

  it("converts every published production document with zero reports (AC2) and passes validator + lossless TipTap round-trip (AC3)", () => {
    for (const entry of CORPUS.documents) {
      const assetIdMap = new Map<string, string>();
      if (entry.embeddedAssets) {
        for (const cfId of Object.keys(entry.embeddedAssets)) {
          assetIdMap.set(cfId, `media-${cfId}`);
        }
      }

      const converted = convertContentfulRichText(entry.document, {
        profile: entry.profile,
        documentId: entry.id,
        assetIdMap,
      });

      expect(converted.ok, `${entry.id} failed conversion`).toBe(true);
      expect(converted.issues, `${entry.id} produced converter issues`).toEqual([]);
      if (!converted.ok) continue;

      // Shared @idcr/content validator + Zod schema
      expect(
        validateRichText(converted.doc, entry.profile),
        `${entry.id} failed validateRichText`,
      ).toEqual([]);
      expect(
        RICH_TEXT_SCHEMAS[entry.profile].safeParse(converted.doc).success,
        `${entry.id} failed RICH_TEXT_SCHEMAS`,
      ).toBe(true);

      // Unconditional ProseMirror schema load, check(), and lossless toJSON() round-trip
      const schema = SCHEMAS[entry.profile];
      const pmDoc = PMNode.fromJSON(schema, converted.doc);
      expect(() => pmDoc.check(), `${entry.id} failed pmDoc.check()`).not.toThrow();
      expect(pmDoc.toJSON(), `${entry.id} mutated on TipTap round-trip`).toEqual(
        converted.doc,
      );
    }
  });

  it("produces equal normalized HTML against Contentful across all 11 site render calls (AC1)", () => {
    const coveredCallSites = new Set<number>();

    for (const entry of CORPUS.documents) {
      const assetIdMap = new Map<string, string>();
      const mediaMap: Record<string, MediaView> = {};
      const legacyAssetBlocks: Array<{
        sys: { id: string };
        url: string;
        title: string;
        contentType: string;
        width?: number;
        height?: number;
      }> = [];

      if (entry.embeddedAssets) {
        for (const [cfId, asset] of Object.entries(entry.embeddedAssets)) {
          const mediaId = `media-${cfId}`;
          assetIdMap.set(cfId, mediaId);
          mediaMap[mediaId] = {
            url: asset.url,
            title: asset.title,
            contentType: asset.contentType,
            fileName: asset.fileName,
            size: asset.size,
            ...(asset.width !== undefined ? { width: asset.width } : {}),
            ...(asset.height !== undefined ? { height: asset.height } : {}),
          };
          legacyAssetBlocks.push({
            sys: { id: cfId },
            url: asset.url,
            title: asset.title,
            contentType: asset.contentType,
            ...(asset.width !== undefined ? { width: asset.width } : {}),
            ...(asset.height !== undefined ? { height: asset.height } : {}),
          });
        }
      }

      const converted = convertContentfulRichText(entry.document, {
        profile: entry.profile,
        documentId: entry.id,
        assetIdMap,
      });
      expect(converted.ok).toBe(true);
      if (!converted.ok) continue;

      const view = { doc: converted.doc, media: mediaMap };

      const compare = (
        callSiteIds: number[],
        legacyOptions: Options,
        newElement: ReactNode,
      ) => {
        for (const id of callSiteIds) coveredCallSites.add(id);
        const expected = renderToNormalizedHtml(
          withIntl(documentToReactComponents(entry.document, legacyOptions)),
        );
        const actual = renderToNormalizedHtml(withIntl(newElement));
        expect(actual, `${entry.id} (call sites ${callSiteIds.join(",")})`).toBe(
          expected,
        );
      };

      switch (entry.contentType) {
        case "churchInfoTopic":
          // Call site 1: app/[locale]/[topic]/page.tsx:57
          compare([1], articleRichTextOptions, renderRichText(view, articlePreset));
          break;

        case "blogPostPage":
          // Call site 2: BlogPostContent.tsx:15
          compare([2], articleRichTextOptions, renderRichText(view, articlePreset));
          break;

        case "sermon": {
          // Call site 3: SermonContent.tsx:22 (with embeds -> sermon preset; without -> article)
          const fallbackTitle = entry.id;
          const legacyOptions = legacyAssetBlocks.length
            ? buildSermonRichTextOptions(legacyAssetBlocks, fallbackTitle)
            : articleRichTextOptions;
          compare(
            [3],
            legacyOptions,
            renderSermonRichText(view, fallbackTitle),
          );
          break;
        }

        case "contentCollection":
          // Call sites 4 & 6: CreedSection.tsx:60 & OurMissionSection.tsx:24
          compare(
            [4, 6],
            sectionDescriptionOptions,
            renderRichText(view, sectionDescriptionPreset),
          );
          break;

        case "beliefItem":
          // Call sites 5 & 7: CreedSection.tsx:122 & OurMissionSection.tsx:72
          compare(
            [5, 7],
            cardDescriptionOptions,
            renderRichText(view, cardDescriptionPreset),
          );
          break;

        case "section": {
          // Call sites 8 (InfoCommunity), 9 (InfoConnect), 10 (OurMissionCta)
          const sectionVariants: Array<[number, Options, RichTextPreset]> = [
            [8, legacyInfoCommunityOptions, infoCommunityPreset],
            [9, legacyInfoConnectOptions, infoConnectPreset],
            [10, legacyOurMissionCtaOptions, ourMissionCtaPreset],
          ];
          for (const [siteId, legacyOptions, preset] of sectionVariants) {
            compare([siteId], legacyOptions, renderRichText(view, preset));
          }
          break;
        }

        case "contactForm":
          // Call site 11: ContactForm.tsx:62
          compare(
            [11],
            legacyContactFormOptions,
            renderRichText(view, contactFormAgreementPreset),
          );
          break;
      }
    }

    expect([...coveredCallSites].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});
