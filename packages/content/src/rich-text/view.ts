import type { RichTextDoc } from "./spec";

/**
 * Resolved media view returned by the web read layer (`ICR-201`) and consumed by
 * the TipTap React renderer (`ICR-202`). Serialisable plain object (safe for client components).
 */
export interface MediaView {
  url: string;
  title: string;
  width?: number;
  height?: number;
  contentType: string;
  fileName: string;
  size: number;
}

/**
 * Rich-text view value returned by every `apps/web/lib/content/` reader and rendered by `ICR-202`.
 * Replaces Contentful's `{ json, links }` shape.
 */
export interface RichTextView {
  doc: RichTextDoc;
  /** Keyed by media id hex string; contains ONLY files embedded in `doc`. */
  media: Record<string, MediaView>;
}
