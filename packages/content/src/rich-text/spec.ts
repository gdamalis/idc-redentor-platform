/**
 * The declarative rich-text spec. Both the Zod document schema (`./schema`) and the shared TipTap
 * extension list (`@idcr/content/tiptap`) are built from these maps, so the editor, the server-side
 * validator and the renderer cannot disagree. Node and mark names are TipTap v3 JSON names.
 *
 * Production corpus (52 docs, 2026-11-18): paragraph, text, heading 2-3, blockquote of
 * paragraphs, bullet/ordered lists nested two deep, embedded audio/PDF (sermons only), hyperlinks
 * (mailto + contact-form note), bold, italic. Explicitly NOT supported: hardBreak, horizontalRule,
 * underline, strike, code, codeBlock, heading 1/4-6, image, tables, postLink.
 */
export const RICH_TEXT_NODE = {
  doc: "doc",
  paragraph: "paragraph",
  text: "text",
  heading: "heading",
  blockquote: "blockquote",
  bulletList: "bulletList",
  orderedList: "orderedList",
  listItem: "listItem",
  embeddedMedia: "embeddedMedia",
} as const;

export type RichTextNodeType =
  (typeof RICH_TEXT_NODE)[keyof typeof RICH_TEXT_NODE];

export const RICH_TEXT_MARK = {
  bold: "bold",
  italic: "italic",
  link: "link",
} as const;

export type RichTextMarkType =
  (typeof RICH_TEXT_MARK)[keyof typeof RICH_TEXT_MARK];

/** Heading levels the site styles (h1 is the entry's own title). */
export const HEADING_LEVELS = [2, 3] as const;

export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Nodes that may sit directly under `doc`. */
export const BLOCK_NODES = [
  RICH_TEXT_NODE.paragraph,
  RICH_TEXT_NODE.heading,
  RICH_TEXT_NODE.blockquote,
  RICH_TEXT_NODE.bulletList,
  RICH_TEXT_NODE.orderedList,
  RICH_TEXT_NODE.embeddedMedia,
] as const satisfies readonly RichTextNodeType[];

export interface RichTextProfileSpec {
  nodes: readonly RichTextNodeType[];
  marks: readonly RichTextMarkType[];
}

const INLINE_NODES = [
  RICH_TEXT_NODE.doc,
  RICH_TEXT_NODE.paragraph,
  RICH_TEXT_NODE.text,
] as const;
const ARTICLE_NODES = [
  ...INLINE_NODES,
  RICH_TEXT_NODE.heading,
  RICH_TEXT_NODE.blockquote,
  RICH_TEXT_NODE.bulletList,
  RICH_TEXT_NODE.orderedList,
  RICH_TEXT_NODE.listItem,
] as const;
const ALL_MARKS = [
  RICH_TEXT_MARK.bold,
  RICH_TEXT_MARK.italic,
  RICH_TEXT_MARK.link,
] as const;

/** Which nodes and marks each field may hold (F-editor-ux §2.6). */
export const RICH_TEXT_PROFILES = {
  /** Section body, belief and collection descriptions. */
  inline: {
    nodes: INLINE_NODES,
    marks: [RICH_TEXT_MARK.bold, RICH_TEXT_MARK.italic],
  },
  /** Contact-form agreement note. */
  inlineLink: { nodes: INLINE_NODES, marks: ALL_MARKS },
  /** Post content, topic body. */
  article: { nodes: ARTICLE_NODES, marks: ALL_MARKS },
  /** Sermon content: article + embedded audio/PDF. */
  sermon: {
    nodes: [...ARTICLE_NODES, RICH_TEXT_NODE.embeddedMedia],
    marks: ALL_MARKS,
  },
} as const satisfies Record<string, RichTextProfileSpec>;

export type RichTextProfile = keyof typeof RICH_TEXT_PROFILES;

export const RICH_TEXT_PROFILE_NAMES = Object.keys(
  RICH_TEXT_PROFILES,
) as RichTextProfile[];

/** Allowed `orderedList.attrs.type` values (TipTap v3 emits `null` by default). */
export const ORDERED_LIST_TYPES = ["1", "a", "A", "i", "I"] as const;

// ── JSON shapes ─────────────────────────────────────────────────────────────

export interface RichTextMark {
  type: RichTextMarkType;
  attrs?: { href: string };
}

export interface RichTextTextNode {
  type: "text";
  text: string;
  marks?: RichTextMark[];
}

export interface RichTextElementNode {
  type: Exclude<RichTextNodeType, "text" | "doc">;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
}

export type RichTextNode = RichTextTextNode | RichTextElementNode;

/** A TipTap JSON document, validated per profile by `richTextSchema(profile)`. */
export interface RichTextDoc {
  type: "doc";
  content: RichTextNode[];
}
