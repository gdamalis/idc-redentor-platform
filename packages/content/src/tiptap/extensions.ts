import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  HEADING_LEVELS,
  RICH_TEXT_MARK,
  RICH_TEXT_NODE,
  RICH_TEXT_PROFILES,
  type RichTextProfile,
} from "../rich-text/spec";
import { EmbeddedMedia } from "./embedded-media";
import { CustomLink } from "./link";

/**
 * Editor options the shared extension list is built for (applied by the React editor in ICR-197).
 */
export const TIPTAP_EDITOR_DEFAULTS = {
  immediatelyRender: false,
  openOnClick: false,
  defaultProtocol: "https",
} as const;

/**
 * Builds the shared TipTap v3 extension list for a rich-text profile from `RICH_TEXT_PROFILES`,
 * so the editor (ICR-197), server-side Zod validator, and renderer (ICR-202) always agree on
 * the exact node and mark set.
 *
 * StarterKit v3 bundles `link`, `underline`, `strike`, `code`, `codeBlock`, `hardBreak`,
 * `horizontalRule`, `listKeymap`, `trailingNode`, `undoRedo`. Every disallowed node/mark is
 * explicitly disabled, and `link` is replaced with `CustomLink` when the profile allows links.
 */
export function createRichTextExtensions(
  profile: RichTextProfile,
): AnyExtension[] {
  const spec = RICH_TEXT_PROFILES[profile];
  const nodes = new Set<string>(spec.nodes);
  const marks = new Set<string>(spec.marks);

  const hasHeading = nodes.has(RICH_TEXT_NODE.heading);
  const hasBlockquote = nodes.has(RICH_TEXT_NODE.blockquote);
  const hasBulletList = nodes.has(RICH_TEXT_NODE.bulletList);
  const hasOrderedList = nodes.has(RICH_TEXT_NODE.orderedList);
  const hasListItem = nodes.has(RICH_TEXT_NODE.listItem);
  const hasAnyList = hasBulletList || hasOrderedList;

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      // Always allowed core nodes & marks (`document` and `text` have no options and stay enabled by default)
      paragraph: {},
      bold: marks.has(RICH_TEXT_MARK.bold) ? {} : false,
      italic: marks.has(RICH_TEXT_MARK.italic) ? {} : false,

      // Profile-dependent block nodes
      heading: hasHeading ? { levels: [...HEADING_LEVELS] } : false,
      blockquote: hasBlockquote ? {} : false,
      bulletList: hasBulletList ? {} : false,
      orderedList: hasOrderedList ? {} : false,
      listItem: hasListItem ? {} : false,
      listKeymap: hasAnyList ? {} : false,

      // Always disabled in v1 (explicitly rejected by schema)
      link: false,
      underline: false,
      strike: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
    }),
  ];

  if (marks.has(RICH_TEXT_MARK.link)) {
    extensions.push(CustomLink);
  }
  if (nodes.has(RICH_TEXT_NODE.embeddedMedia)) {
    extensions.push(EmbeddedMedia);
  }

  return extensions;
}
