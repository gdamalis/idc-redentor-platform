import type { RichTextDoc, RichTextProfile } from "@idcr/content";
import type { ReactNode } from "react";

/**
 * Serializable media metadata attached to a rich-text view.
 * Structurally identical to `MediaView` in `@idcr/content` (added by ICR-201).
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
 * Rich-text field payload returned by the MongoDB read layer (ICR-201) and
 * consumed by the TipTap React renderer (ICR-202).
 * Structurally identical to `RichTextView` in `@idcr/content`.
 */
export interface RichTextView {
  doc: RichTextDoc;
  /** Keyed by media id; contains ONLY files embedded in `doc`. */
  media: Record<string, MediaView>;
}

/**
 * Allowlisted React renderer preset bound to a single `@idcr/content` rich-text profile.
 * Any node or mark absent from the profile's allowlist or without a renderer returns `null`.
 */
export interface RichTextPreset {
  readonly profile: RichTextProfile;
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
    attrs?: { start?: number },
  ) => ReactNode;
  readonly renderListItem?: (children: ReactNode, key: string) => ReactNode;
  readonly renderBold?: (children: ReactNode, key: string) => ReactNode;
  readonly renderItalic?: (children: ReactNode, key: string) => ReactNode;
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
