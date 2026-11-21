import type { RichTextMarkType, RichTextNodeType } from "../rich-text/spec";

/**
 * Renderable block node types in a TipTap rich-text document (excludes container root `doc` and
 * leaf `text`). Delivers the typed resolver map asked for in ICR-20 / ICR-36 without pulling React
 * into `@idcr/content` — the React renderer (ICR-202) binds `TComponent`.
 */
export type BlockType = Exclude<RichTextNodeType, "doc" | "text">;

/** Renderable inline mark types in a TipTap rich-text document. */
export type MarkType = RichTextMarkType;

/** Exhaustive block resolver map keyed by every allowed TipTap block node type. */
export type BlockRegistry<TComponent> = Record<BlockType, TComponent>;

/** Exhaustive mark resolver map keyed by every allowed TipTap mark type. */
export type MarkRegistry<TComponent> = Record<MarkType, TComponent>;
