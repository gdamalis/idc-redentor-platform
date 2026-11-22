import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { BLOCKS, INLINES, type Document } from "@contentful/rich-text-types";
import type {
  MediaView,
  RichTextMark,
  RichTextNode,
  RichTextTextNode,
  RichTextView,
} from "@idcr/content";
import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  articleRichTextOptions,
  cardDescriptionOptions,
  sectionDescriptionOptions,
} from "@lib/contentful/rich-text-options";
import { Typography } from "@src/components/ui/typography";

/**
 * Bidirectional identity map from Contentful asset URLs / asset IDs and Vercel Blob
 * URLs / Mongo media IDs to a single canonical media identity token (`media:<key>`).
 */
export interface MediaIdentityMap {
  /** Exact URL (https://...) -> canonical media identity key (e.g. "media:<sha256-or-cfId>"). */
  readonly byUrl: ReadonlyMap<string, string>;
  /** Contentful asset ID (e.g. "3aBc...") -> canonical media identity key. */
  readonly byContentfulAssetId: ReadonlyMap<string, string>;
  /** Mongo media ObjectId hex -> canonical media identity key. */
  readonly byMongoMediaId: ReadonlyMap<string, string>;
}

export function createMediaIdentityMap(
  entries: readonly {
    readonly canonicalKey: string;
    readonly urls?: readonly string[];
    readonly contentfulAssetIds?: readonly string[];
    readonly mongoMediaIds?: readonly string[];
  }[],
): MediaIdentityMap {
  const byUrl = new Map<string, string>();
  const byContentfulAssetId = new Map<string, string>();
  const byMongoMediaId = new Map<string, string>();

  for (const entry of entries) {
    const token = entry.canonicalKey.startsWith("media:")
      ? entry.canonicalKey
      : `media:${entry.canonicalKey}`;
    for (const rawUrl of entry.urls ?? []) {
      const normalized = normalizeProtocol(rawUrl);
      if (normalized) byUrl.set(normalized, token);
    }
    for (const cfId of entry.contentfulAssetIds ?? []) {
      if (cfId) byContentfulAssetId.set(cfId, token);
    }
    for (const mongoId of entry.mongoMediaIds ?? []) {
      if (mongoId) byMongoMediaId.set(mongoId.toLowerCase(), token);
    }
  }

  return { byUrl, byContentfulAssetId, byMongoMediaId };
}

function normalizeProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

const CTF_ASSET_URL_RE =
  /^https:\/\/(?:images|assets|downloads)(?:\.eu)?\.ctfassets\.net\/[^/]+\/([^/]+)\//i;
const BLOB_MEDIA_URL_RE =
  /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/media\/([0-9a-f]{24})\//i;

/**
 * Resolves a single media URL (raw Contentful CDN URL, raw Vercel Blob URL, or
 * `/_next/image?url=<encoded>&w=...&q=...`) to its canonical media identity token.
 */
export function normalizeMediaUrl(
  rawUrl: string,
  map: MediaIdentityMap,
): string {
  const trimmed = normalizeProtocol(rawUrl);
  if (!trimmed) return trimmed;

  // Handle Next.js Image Optimization proxy URLs: `/_next/image?url=<encoded>&w=...&q=...`
  if (trimmed.startsWith("/_next/image?") || trimmed.includes("/_next/image?")) {
    try {
      const isRelative = trimmed.startsWith("/");
      const parsed = new URL(
        isRelative ? `http://parity.local${trimmed}` : trimmed,
      );
      const inner = parsed.searchParams.get("url");
      if (inner) {
        const normalizedInner = normalizeMediaUrl(inner, map);
        parsed.searchParams.set("url", normalizedInner);
        return isRelative
          ? `${parsed.pathname}${parsed.search}`
          : parsed.toString();
      }
    } catch {
      // fall through
    }
  }

  const exact = map.byUrl.get(trimmed);
  if (exact) return exact;

  // Strip query string and retry exact lookup
  const qIdx = trimmed.indexOf("?");
  if (qIdx > 0) {
    const withoutQuery = trimmed.slice(0, qIdx);
    const exactNoQuery = map.byUrl.get(withoutQuery);
    if (exactNoQuery) return exactNoQuery;
  }

  const ctfMatch = CTF_ASSET_URL_RE.exec(trimmed);
  if (ctfMatch?.[1]) {
    const mapped = map.byContentfulAssetId.get(ctfMatch[1]);
    if (mapped) return mapped;
  }

  const blobMatch = BLOB_MEDIA_URL_RE.exec(trimmed);
  if (blobMatch?.[1]) {
    const mapped = map.byMongoMediaId.get(blobMatch[1].toLowerCase());
    if (mapped) return mapped;
  }

  return trimmed;
}

/** Normalizes every candidate URL inside an HTML `srcset` attribute. */
export function normalizeSrcset(
  srcset: string,
  map: MediaIdentityMap,
): string {
  return srcset
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return "";
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx === -1) {
        return normalizeMediaUrl(trimmed, map);
      }
      const urlPart = trimmed.slice(0, spaceIdx);
      const descriptor = trimmed.slice(spaceIdx).trim();
      return `${normalizeMediaUrl(urlPart, map)} ${descriptor}`;
    })
    .filter(Boolean)
    .join(", ");
}

function normalizeJsonValueMedia(
  value: unknown,
  map: MediaIdentityMap,
): unknown {
  if (typeof value === "string") {
    return normalizeMediaUrl(value, map);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValueMedia(item, map));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalizeJsonValueMedia(record[key], map);
    }
    return sorted;
  }
  return value;
}

export interface PageHtmlNormalizeOptions {
  readonly mediaMap?: MediaIdentityMap;
  readonly normalizeLikeCounts?: boolean;
  readonly stripLivePreviewAttrs?: boolean;
}

const EMPTY_MEDIA_MAP = createMediaIdentityMap([]);

/**
 * Normalizes a full HTML document for mode-matched page parity comparison (`ICR-203` F-C3):
 * 1. Normalizes JSON-LD `<script type="application/ld+json">` payloads (media URLs + sorted keys).
 * 2. Strips all other `<script>` contents (RSC flight `self.__next_f.push`, `__NEXT_DATA__`).
 * 3. Normalizes build-specific `/_next/static/...` asset hashes and build IDs.
 * 4. Normalizes media URLs inside `src`, `srcset`, `href`, `content` (OG/Twitter `<meta>`),
 *    `poster`, and `/_next/image?url=...` queries.
 * 5. Normalizes footer copyright year + package version (`© YYYY ... | vX.Y.Z`).
 * 6. Strips Live Preview `data-contentful-*` inspector attributes.
 * 7. Normalizes like counts (optional, default true).
 * 8. Collapses ASCII whitespace runs.
 */
export function normalizeHtmlForPageParity(
  html: string,
  options: PageHtmlNormalizeOptions = {},
): string {
  const mediaMap = options.mediaMap ?? EMPTY_MEDIA_MAP;
  const stripLivePreview = options.stripLivePreviewAttrs !== false;
  const normalizeLikes = options.normalizeLikeCounts !== false;

  // Decode HTML entities inside URL attributes before normalizing
  const decodeAttr = (v: string) =>
    v.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

  // 1 & 2. Handle <script> blocks: normalize JSON-LD, strip inline flight/JS scripts
  let out = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (_full, attrs: string, body: string) => {
      if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) {
        try {
          const parsed = JSON.parse(body.trim());
          const normalized = normalizeJsonValueMedia(parsed, mediaMap);
          return `<script type="application/ld+json">${JSON.stringify(normalized)}</script>`;
        } catch {
          return `<script type="application/ld+json"></script>`;
        }
      }
      // Normalize script src hash if external, strip inline body (RSC flight payloads)
      const srcMatch = /\bsrc\s*=\s*(["'])([^"']+)\1/i.exec(attrs);
      if (srcMatch?.[2]) {
        const normalizedSrc = srcMatch[2]
          .replace(/\/_next\/static\/chunks\/[^"']+/g, "/_next/static/chunks/<HASH>")
          .replace(/\/_next\/static\/[^/"']+\//g, "/_next/static/<BUILD_ID>/")
          .replace(/[?&]dpl=[^&"']+/g, "");
        return `<script src="${normalizedSrc}"></script>`;
      }
      return "";
    },
  );

  // 3. Normalize build-specific hashes in stylesheet/preload links & buildId markers
  out = out
    .replace(
      /\/_next\/static\/css\/[^"'\s>]+/g,
      "/_next/static/css/<HASH>.css",
    )
    .replace(
      /\/_next\/static\/chunks\/[^"'\s>]+/g,
      "/_next/static/chunks/<HASH>",
    )
    .replace(
      /\/_next\/static\/media\/[^"'\s>]+/g,
      "/_next/static/media/<HASH>",
    )
    .replace(/[?&]dpl=[a-zA-Z0-9_-]+/g, "");

  // 4. Normalize media URLs in src / href / content / poster / srcset attributes
  out = out.replace(
    /\b(src|href|content|poster)\s*=\s*"([^"]*)"/gi,
    (_m, attr: string, rawVal: string) => {
      const decoded = decodeAttr(rawVal);
      const normalized = normalizeMediaUrl(decoded, mediaMap);
      return `${attr}="${normalized}"`;
    },
  );

  out = out.replace(
    /\bsrcset\s*=\s*"([^"]*)"/gi,
    (_m, rawVal: string) => {
      const decoded = decodeAttr(rawVal);
      const normalized = normalizeSrcset(decoded, mediaMap);
      return `srcset="${normalized}"`;
    },
  );

  // 5. Normalize footer copyright year and package version string (`Footer.tsx:144`)
  out = out
    .replace(/(?:&copy;|©)\s*20\d{2}\b/g, "© <YEAR>")
    .replace(/\|\s*v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?/g, "| v<VERSION>");

  // 6. Strip Live Preview inspector attributes
  if (stripLivePreview) {
    out = out.replace(
      /\s+data-contentful-[a-z0-9-]+(?:="[^"]*")?/gi,
      "",
    );
  }

  // 7. Normalize like button counts (numeric badges inside like buttons)
  if (normalizeLikes) {
    out = out.replace(
      /(data-testid="like-count"[^>]*>)\s*\d+\s*(<\/)/gi,
      "$1<LIKES>$2",
    );
    out = out.replace(
      /(aria-label="[^"]*(?:Me gusta|Like)[^"]*"[^>]*>[\s\S]*?<span[^>]*>)\s*\d+\s*(<\/span>)/gi,
      "$1<LIKES>$2",
    );
  }

  // 8. Collapse ASCII whitespace & trim
  return out.replace(/[ \t\r\n]+/g, " ").trim();
}

export type RichTextParityPreset =
  | "article"
  | "sermon"
  | "sectionDescription"
  | "cardDescription"
  | "infoCommunity"
  | "infoConnect"
  | "ourMissionCta"
  | "contactFormAgreement";

const INFO_COMMUNITY_CLASS = "text-xl md:text-2xl dark:text-white";
const INFO_CONNECT_CLASS =
  "text-xl md:text-2xl text-gray-700 dark:text-gray-300";
const OUR_MISSION_CTA_CLASS =
  "text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]";

const TypographyAny = Typography as ComponentType<{
  readonly component?: "p" | "h2" | "h3" | "blockquote";
  readonly variant?: "body" | "body1" | "h2" | "h3" | "blockquote";
  readonly className?: string;
}>;

interface StaticTipTapPreset {
  readonly renderParagraph: (children: ReactNode, key: string) => ReactNode;
  readonly renderHeading?: (
    level: 2 | 3,
    children: ReactNode,
    key: string,
  ) => ReactNode;
  readonly renderBlockquote?: (children: ReactNode, key: string) => ReactNode;
  readonly renderBulletList?: (children: ReactNode, key: string) => ReactNode;
  readonly renderOrderedList?: (
    children: ReactNode,
    key: string,
    start?: number,
  ) => ReactNode;
  readonly renderListItem?: (children: ReactNode, key: string) => ReactNode;
  readonly renderBold: (children: ReactNode, key: string) => ReactNode;
  readonly renderItalic: (children: ReactNode, key: string) => ReactNode;
  readonly renderLink?: (
    href: string,
    children: ReactNode,
    key: string,
  ) => ReactNode;
  readonly renderEmbeddedMedia?: (
    mediaId: string,
    media: MediaView | undefined,
    key: string,
  ) => ReactNode;
}

const STATIC_ARTICLE_PRESET: StaticTipTapPreset = {
  renderParagraph: (children, key) =>
    createElement(TypographyAny, { key, component: "p", variant: "body" }, children),
  renderHeading: (level, children, key) =>
    createElement(
      TypographyAny,
      { key, component: level === 2 ? "h2" : "h3", variant: level === 2 ? "h2" : "h3" },
      children,
    ),
  renderBlockquote: (children, key) =>
    createElement(
      TypographyAny,
      { key, component: "blockquote", variant: "blockquote" },
      children,
    ),
  renderBulletList: (children, key) =>
    createElement("ul", { key, className: "list-disc pl-5 space-y-2 mb-4" }, children),
  renderOrderedList: (children, key, start) =>
    createElement(
      "ol",
      {
        key,
        className: "list-decimal pl-5 space-y-2 mb-4",
        ...(start !== undefined && start !== 1 ? { start } : {}),
      },
      children,
    ),
  renderListItem: (children, key) =>
    createElement("li", { key, className: "space-y-2" }, children),
  renderBold: (children, key) => createElement("strong", { key }, children),
  renderItalic: (children, key) => createElement("em", { key }, children),
  renderLink: (href, children, key) => createElement("a", { key, href }, children),
};

const STATIC_SECTION_DESC_PRESET: StaticTipTapPreset = {
  renderParagraph: (children, key) =>
    createElement("p", { key, className: "text-muted-foreground text-lg" }, children),
  renderBold: (children, key) => createElement("b", { key }, children),
  renderItalic: (children, key) => createElement("i", { key }, children),
};

const STATIC_CARD_DESC_PRESET: StaticTipTapPreset = {
  renderParagraph: (children, key) =>
    createElement(
      "p",
      { key, className: "text-muted-foreground leading-relaxed" },
      children,
    ),
  renderBold: (children, key) => createElement("b", { key }, children),
  renderItalic: (children, key) => createElement("i", { key }, children),
};

function createStaticInlinePreset(className: string): StaticTipTapPreset {
  return {
    renderParagraph: (children, key) =>
      createElement(
        TypographyAny,
        { key, component: "p", variant: "body1", className },
        children,
      ),
    renderBold: (children, key) => createElement("b", { key }, children),
    renderItalic: (children, key) => createElement("i", { key }, children),
  };
}

const STATIC_CONTACT_AGREEMENT_PRESET: StaticTipTapPreset = {
  renderParagraph: (children, key) =>
    createElement(
      TypographyAny,
      {
        key,
        component: "p",
        variant: "body1",
        className: "mt-4 text-sm/6 text-muted-foreground",
      },
      children,
    ),
  renderBold: (children, key) => createElement("b", { key }, children),
  renderItalic: (children, key) => createElement("i", { key }, children),
  renderLink: (href, children, key) =>
    createElement(
      "a",
      {
        key,
        href,
        className: "font-semibold text-primary hover:underline",
        target: "_blank",
      },
      children,
    ),
};

function renderStaticInlineNodes(
  nodes: readonly RichTextNode[] | undefined,
  preset: StaticTipTapPreset,
  keyPrefix: string,
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];
  const textNodes = nodes.filter(
    (n): n is RichTextTextNode => n.type === "text" && typeof n.text === "string",
  );

  const getLinkHref = (marks?: readonly RichTextMark[]): string | undefined =>
    marks?.find((m) => m.type === "link")?.attrs?.href;

  const renderNonLinkMarks = (node: RichTextTextNode, key: string): ReactNode => {
    let el: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") el = preset.renderBold(el, `${key}-b`);
      else if (mark.type === "italic") el = preset.renderItalic(el, `${key}-i`);
    }
    return el;
  };

  const out: ReactNode[] = [];
  let i = 0;
  while (i < textNodes.length) {
    const href = getLinkHref(textNodes[i]!.marks);
    if (href && preset.renderLink) {
      const group: ReactNode[] = [];
      const start = i;
      while (i < textNodes.length && getLinkHref(textNodes[i]!.marks) === href) {
        group.push(
          createElement(
            Fragment,
            { key: `${keyPrefix}-t-${i}` },
            renderNonLinkMarks(textNodes[i]!, `${keyPrefix}-t-${i}`),
          ),
        );
        i += 1;
      }
      out.push(preset.renderLink(href, group, `${keyPrefix}-a-${start}`));
    } else {
      out.push(
        createElement(
          Fragment,
          { key: `${keyPrefix}-t-${i}` },
          renderNonLinkMarks(textNodes[i]!, `${keyPrefix}-t-${i}`),
        ),
      );
      i += 1;
    }
  }
  return out;
}

function renderStaticTipTapNode(
  node: RichTextNode,
  preset: StaticTipTapPreset,
  media: Readonly<Record<string, MediaView>>,
  key: string,
): ReactNode {
  switch (node.type) {
    case "paragraph":
      return preset.renderParagraph(
        renderStaticInlineNodes(node.content, preset, key),
        key,
      );
    case "heading": {
      const level = node.attrs?.level === 3 ? 3 : 2;
      const children = renderStaticInlineNodes(node.content, preset, key);
      return preset.renderHeading
        ? preset.renderHeading(level, children, key)
        : createElement(level === 2 ? "h2" : "h3", { key }, children);
    }
    case "blockquote": {
      const children = (node.content ?? []).map((child, idx) =>
        renderStaticTipTapNode(child, preset, media, `${key}-bq-${idx}`),
      );
      return preset.renderBlockquote
        ? preset.renderBlockquote(children, key)
        : createElement("blockquote", { key }, children);
    }
    case "bulletList": {
      const children = (node.content ?? []).map((child, idx) =>
        renderStaticTipTapNode(child, preset, media, `${key}-ul-${idx}`),
      );
      return preset.renderBulletList
        ? preset.renderBulletList(children, key)
        : createElement("ul", { key }, children);
    }
    case "orderedList": {
      const children = (node.content ?? []).map((child, idx) =>
        renderStaticTipTapNode(child, preset, media, `${key}-ol-${idx}`),
      );
      const start =
        typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return preset.renderOrderedList
        ? preset.renderOrderedList(children, key, start)
        : createElement("ol", { key }, children);
    }
    case "listItem": {
      const children = (node.content ?? []).map((child, idx) =>
        renderStaticTipTapNode(child, preset, media, `${key}-li-${idx}`),
      );
      return preset.renderListItem
        ? preset.renderListItem(children, key)
        : createElement("li", { key }, children);
    }
    case "embeddedMedia": {
      const mediaId =
        typeof node.attrs?.mediaId === "string" ? node.attrs.mediaId : "";
      return preset.renderEmbeddedMedia
        ? preset.renderEmbeddedMedia(mediaId, media[mediaId], key)
        : null;
    }
    default:
      return null;
  }
}

function renderStaticTipTap(
  view: RichTextView,
  preset: StaticTipTapPreset,
): ReactNode {
  const media = view.media ?? {};
  return (view.doc.content ?? []).map((node, idx) =>
    renderStaticTipTapNode(node, preset, media, `rt-${idx}`),
  );
}

function buildContentfulInlineOptions(className: string) {
  return {
    renderNode: {
      [BLOCKS.PARAGRAPH]: (_node: unknown, children: ReactNode) =>
        createElement(
          TypographyAny,
          {
            component: "p",
            variant: "body1",
            className,
          },
          children,
        ),
    },
  };
}

function buildContentfulContactAgreementOptions() {
  return {
    renderNode: {
      [BLOCKS.PARAGRAPH]: (_node: unknown, children: ReactNode) =>
        createElement(
          TypographyAny,
          {
            component: "p",
            variant: "body1",
            className: "mt-4 text-sm/6 text-muted-foreground",
          },
          children,
        ),
      [INLINES.HYPERLINK]: (
        node: { data?: { uri?: string } },
        children: ReactNode,
      ) =>
        createElement(
          "a",
          {
            href: node.data?.uri ?? "#",
            className: "font-semibold text-primary hover:underline",
            target: "_blank",
          },
          children,
        ),
    },
  };
}

interface ContentfulRichTextLike {
  readonly json?: Document;
  readonly links?: {
    readonly assets?: {
      readonly block?: readonly {
        readonly sys: { readonly id: string };
        readonly url: string;
        readonly title?: string;
        readonly contentType?: string;
        readonly width?: number;
        readonly height?: number;
      }[];
    };
  };
}

function renderSermonEmbeddedStatic(
  asset: {
    readonly url: string;
    readonly title?: string;
    readonly contentType?: string;
    readonly width?: number;
    readonly height?: number;
  },
  key: string,
): ReactNode {
  const ct = asset.contentType ?? "";
  if (ct.startsWith("audio/")) {
    return createElement(
      "div",
      { key, className: "my-4", "data-embed": "audio" },
      createElement("audio", { src: asset.url, title: asset.title ?? "" }),
    );
  }
  if (ct === "application/pdf") {
    return createElement(
      "div",
      { key, className: "my-4", "data-embed": "pdf" },
      createElement("a", { href: asset.url }, asset.title ?? ""),
    );
  }
  if (ct.startsWith("image/")) {
    return createElement(
      "span",
      { key, className: "my-4 block", "data-embed": "image" },
      createElement("img", {
        src: asset.url,
        alt: asset.title ?? "",
        width: asset.width ?? 1200,
        height: asset.height ?? 630,
      }),
    );
  }
  return null;
}

/**
 * Renders a Contentful rich-text field and its Mongo/TipTap counterpart into
 * normalized static HTML (media URLs replaced by canonical identities, ASCII
 * whitespace collapsed) so data-parity can verify DOM-level equivalence without
 * needing a live browser or Next.js router context.
 */
export function renderRichTextPairForParity(
  contentfulValue: ContentfulRichTextLike | null | undefined,
  tiptapValue: RichTextView | null | undefined,
  preset: RichTextParityPreset,
  mediaMap: MediaIdentityMap,
): { readonly contentfulHtml: string; readonly mongoHtml: string; readonly equal: boolean } {
  const normalizeMarkup = (markup: string): string =>
    markup
      .replace(
        /\b(src|href)\s*=\s*"([^"]*)"/gi,
        (_m, attr: string, val: string) =>
          `${attr}="${normalizeMediaUrl(val.replace(/&amp;/g, "&"), mediaMap)}"`,
      )
      .replace(/[ \t\r\n]+/g, " ")
      .trim();

  let cfElement: ReactNode = null;
  if (contentfulValue?.json) {
    switch (preset) {
      case "article":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          articleRichTextOptions,
        );
        break;
      case "sermon": {
        const assetById = new Map(
          (contentfulValue.links?.assets?.block ?? []).map((a) => [a.sys.id, a]),
        );
        cfElement = documentToReactComponents(contentfulValue.json, {
          ...articleRichTextOptions,
          renderNode: {
            ...articleRichTextOptions.renderNode,
            [BLOCKS.EMBEDDED_ASSET]: (node) => {
              const id = node.data?.target?.sys?.id;
              const asset = typeof id === "string" ? assetById.get(id) : undefined;
              return asset ? renderSermonEmbeddedStatic(asset, id) : null;
            },
          },
        });
        break;
      }
      case "sectionDescription":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          sectionDescriptionOptions,
        );
        break;
      case "cardDescription":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          cardDescriptionOptions,
        );
        break;
      case "infoCommunity":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          buildContentfulInlineOptions(INFO_COMMUNITY_CLASS),
        );
        break;
      case "infoConnect":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          buildContentfulInlineOptions(INFO_CONNECT_CLASS),
        );
        break;
      case "ourMissionCta":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          buildContentfulInlineOptions(OUR_MISSION_CTA_CLASS),
        );
        break;
      case "contactFormAgreement":
        cfElement = documentToReactComponents(
          contentfulValue.json,
          buildContentfulContactAgreementOptions(),
        );
        break;
    }
  }

  let mongoElement: ReactNode = null;
  if (tiptapValue?.doc) {
    switch (preset) {
      case "article":
        mongoElement = renderStaticTipTap(tiptapValue, STATIC_ARTICLE_PRESET);
        break;
      case "sermon":
        mongoElement = renderStaticTipTap(tiptapValue, {
          ...STATIC_ARTICLE_PRESET,
          renderEmbeddedMedia: (_id, media, key) =>
            media ? renderSermonEmbeddedStatic(media, key) : null,
        });
        break;
      case "sectionDescription":
        mongoElement = renderStaticTipTap(tiptapValue, STATIC_SECTION_DESC_PRESET);
        break;
      case "cardDescription":
        mongoElement = renderStaticTipTap(tiptapValue, STATIC_CARD_DESC_PRESET);
        break;
      case "infoCommunity":
        mongoElement = renderStaticTipTap(
          tiptapValue,
          createStaticInlinePreset(INFO_COMMUNITY_CLASS),
        );
        break;
      case "infoConnect":
        mongoElement = renderStaticTipTap(
          tiptapValue,
          createStaticInlinePreset(INFO_CONNECT_CLASS),
        );
        break;
      case "ourMissionCta":
        mongoElement = renderStaticTipTap(
          tiptapValue,
          createStaticInlinePreset(OUR_MISSION_CTA_CLASS),
        );
        break;
      case "contactFormAgreement":
        mongoElement = renderStaticTipTap(
          tiptapValue,
          STATIC_CONTACT_AGREEMENT_PRESET,
        );
        break;
    }
  }

  const contentfulHtml = normalizeMarkup(
    cfElement ? renderToStaticMarkup(createElement("div", null, cfElement)) : "",
  );
  const mongoHtml = normalizeMarkup(
    mongoElement
      ? renderToStaticMarkup(createElement("div", null, mongoElement))
      : "",
  );

  return {
    contentfulHtml,
    mongoHtml,
    equal: contentfulHtml === mongoHtml,
  };
}
