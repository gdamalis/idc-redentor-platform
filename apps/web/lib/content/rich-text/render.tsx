import {
  HEADING_LEVELS,
  isAllowedHref,
  LIMITS,
  RICH_TEXT_MARK,
  RICH_TEXT_NODE,
  RICH_TEXT_PROFILES,
  type RichTextNode,
} from "@idcr/content";
import { Fragment, type ReactNode } from "react";
import type { MediaView, RichTextPreset, RichTextView } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface RenderContext {
  readonly preset: RichTextPreset;
  readonly media: Readonly<Record<string, MediaView>>;
  readonly allowedNodes: ReadonlySet<string>;
  readonly allowedMarks: ReadonlySet<string>;
  nodeCount: number;
}

function consumeNodeBudget(ctx: RenderContext): boolean {
  ctx.nodeCount += 1;
  return ctx.nodeCount <= LIMITS.maxNodes;
}

function allowedChildrenFor(parentType: string): readonly string[] | null {
  switch (parentType) {
    case RICH_TEXT_NODE.doc:
      return [
        RICH_TEXT_NODE.paragraph,
        RICH_TEXT_NODE.heading,
        RICH_TEXT_NODE.blockquote,
        RICH_TEXT_NODE.bulletList,
        RICH_TEXT_NODE.orderedList,
        RICH_TEXT_NODE.embeddedMedia,
      ];
    case RICH_TEXT_NODE.blockquote:
      return [RICH_TEXT_NODE.paragraph];
    case RICH_TEXT_NODE.bulletList:
    case RICH_TEXT_NODE.orderedList:
      return [RICH_TEXT_NODE.listItem];
    case RICH_TEXT_NODE.listItem:
      return [
        RICH_TEXT_NODE.paragraph,
        RICH_TEXT_NODE.bulletList,
        RICH_TEXT_NODE.orderedList,
      ];
    default:
      return null;
  }
}

interface LinkRun {
  readonly href: string;
  readonly key: string;
  readonly children: ReactNode[];
}

/**
 * Renders inline `text` children of a `paragraph` or `heading`:
 * - Drops any non-text node, any text node with a disallowed mark, or any link mark
 *   whose `href` fails `isAllowedHref` (AC6 fail-closed boundary).
 * - Groups contiguous text runs sharing the same allowed `link` `href` into a single
 *   outermost link element, with `bold`/`italic` nested inside.
 * - Applies non-link marks in `node.marks` order (first mark innermost), matching
 *   `@contentful/rich-text-react-renderer`'s `marks.reduce(...)`.
 */
function renderInlineChildren(
  rawChildren: unknown,
  parentKey: string,
  depth: number,
  ctx: RenderContext,
): ReactNode[] {
  if (!Array.isArray(rawChildren) || depth > LIMITS.maxNodeDepth) {
    return [];
  }

  const output: ReactNode[] = [];
  let activeLink: LinkRun | null = null;

  const flushLink = () => {
    if (!activeLink) return;
    const renderLink = ctx.preset.renderLink;
    if (renderLink && activeLink.children.length > 0) {
      output.push(
        renderLink(activeLink.href, activeLink.children, activeLink.key),
      );
    }
    activeLink = null;
  };

  for (let i = 0; i < rawChildren.length; i += 1) {
    if (!consumeNodeBudget(ctx)) break;
    const child = rawChildren[i];
    const key = `${parentKey}-${i}`;

    if (
      !isRecord(child) ||
      child.type !== RICH_TEXT_NODE.text ||
      typeof child.text !== "string"
    ) {
      flushLink();
      continue;
    }

    const rawMarks = child.marks;
    if (
      rawMarks !== undefined &&
      (!Array.isArray(rawMarks) || rawMarks.length > ctx.allowedMarks.size)
    ) {
      flushLink();
      continue;
    }

    let linkHref: string | undefined;
    let hasDisallowedMark = false;
    const seenMarks = new Set<string>();
    const nonLinkMarks: Array<"bold" | "italic"> = [];

    if (Array.isArray(rawMarks)) {
      for (const rawMark of rawMarks) {
        if (!isRecord(rawMark) || typeof rawMark.type !== "string") {
          hasDisallowedMark = true;
          break;
        }
        const markType = rawMark.type;
        if (!ctx.allowedMarks.has(markType) || seenMarks.has(markType)) {
          hasDisallowedMark = true;
          break;
        }
        seenMarks.add(markType);
        if (markType === RICH_TEXT_MARK.link) {
          const href = isRecord(rawMark.attrs) ? rawMark.attrs.href : undefined;
          if (!isAllowedHref(href) || !ctx.preset.renderLink) {
            hasDisallowedMark = true;
            break;
          }
          linkHref = href;
        } else if (
          markType === RICH_TEXT_MARK.bold ||
          markType === RICH_TEXT_MARK.italic
        ) {
          nonLinkMarks.push(markType);
        } else {
          hasDisallowedMark = true;
          break;
        }
      }
    }

    if (hasDisallowedMark) {
      flushLink();
      continue;
    }

    // Wrap text with non-link marks in `node.marks` order (first mark innermost).
    let rendered: ReactNode = child.text;
    let missingMarkRenderer = false;
    for (let m = 0; m < nonLinkMarks.length; m += 1) {
      const markType = nonLinkMarks[m];
      const markKey = `${key}-m${m}`;
      if (markType === RICH_TEXT_MARK.bold) {
        if (!ctx.preset.renderBold) {
          missingMarkRenderer = true;
          break;
        }
        rendered = ctx.preset.renderBold(rendered, markKey);
      } else {
        if (!ctx.preset.renderItalic) {
          missingMarkRenderer = true;
          break;
        }
        rendered = ctx.preset.renderItalic(rendered, markKey);
      }
    }

    if (missingMarkRenderer) {
      flushLink();
      continue;
    }

    if (linkHref !== undefined) {
      if (activeLink && activeLink.href === linkHref) {
        activeLink.children.push(
          nonLinkMarks.length === 0 ? (
            <Fragment key={key}>{rendered}</Fragment>
          ) : (
            rendered
          ),
        );
      } else {
        flushLink();
        activeLink = {
          href: linkHref,
          key: `${key}-link`,
          children: [
            nonLinkMarks.length === 0 ? (
              <Fragment key={key}>{rendered}</Fragment>
            ) : (
              rendered
            ),
          ],
        };
      }
    } else {
      flushLink();
      output.push(
        nonLinkMarks.length === 0 ? (
          <Fragment key={key}>{rendered}</Fragment>
        ) : (
          rendered
        ),
      );
    }
  }

  flushLink();
  return output;
}

function renderBlockChildren(
  rawChildren: unknown,
  parentType: string,
  parentKey: string,
  depth: number,
  ctx: RenderContext,
): ReactNode[] {
  if (!Array.isArray(rawChildren) || depth > LIMITS.maxNodeDepth) {
    return [];
  }
  const allowedForParent = allowedChildrenFor(parentType);
  if (!allowedForParent) return [];

  const nodes: ReactNode[] = [];
  for (let i = 0; i < rawChildren.length; i += 1) {
    const child = rawChildren[i];
    if (!isRecord(child) || typeof child.type !== "string") continue;
    if (!allowedForParent.includes(child.type)) continue;
    const rendered = renderBlockNode(
      child as unknown as RichTextNode,
      `${parentKey}-${i}`,
      depth,
      ctx,
    );
    if (rendered !== null && rendered !== undefined) {
      nodes.push(rendered);
    }
  }
  return nodes;
}

function renderBlockNode(
  node: RichTextNode | Record<string, unknown>,
  key: string,
  depth: number,
  ctx: RenderContext,
): ReactNode {
  if (depth > LIMITS.maxNodeDepth || !consumeNodeBudget(ctx)) return null;
  if (!isRecord(node) || typeof node.type !== "string") return null;

  const nodeType = node.type;
  if (!ctx.allowedNodes.has(nodeType)) return null;

  switch (nodeType) {
    case RICH_TEXT_NODE.paragraph: {
      const children =
        node.content !== undefined
          ? renderInlineChildren(node.content, key, depth + 1, ctx)
          : [];
      return ctx.preset.renderParagraph(children, key);
    }

    case RICH_TEXT_NODE.heading: {
      if (!ctx.preset.renderHeading) return null;
      const level = isRecord(node.attrs) ? node.attrs.level : undefined;
      if (!HEADING_LEVELS.includes(level as never)) return null;
      const children =
        node.content !== undefined
          ? renderInlineChildren(node.content, key, depth + 1, ctx)
          : [];
      return ctx.preset.renderHeading(level as 2 | 3, children, key);
    }

    case RICH_TEXT_NODE.blockquote: {
      if (!ctx.preset.renderBlockquote) return null;
      const children = renderBlockChildren(
        node.content,
        nodeType,
        key,
        depth + 1,
        ctx,
      );
      if (children.length === 0) return null;
      return ctx.preset.renderBlockquote(children, key);
    }

    case RICH_TEXT_NODE.bulletList: {
      if (!ctx.preset.renderBulletList) return null;
      const children = renderBlockChildren(
        node.content,
        nodeType,
        key,
        depth + 1,
        ctx,
      );
      if (children.length === 0) return null;
      return ctx.preset.renderBulletList(children, key);
    }

    case RICH_TEXT_NODE.orderedList: {
      if (!ctx.preset.renderOrderedList) return null;
      const children = renderBlockChildren(
        node.content,
        nodeType,
        key,
        depth + 1,
        ctx,
      );
      if (children.length === 0) return null;
      const rawStart = isRecord(node.attrs) ? node.attrs.start : undefined;
      const start =
        typeof rawStart === "number" &&
        Number.isInteger(rawStart) &&
        rawStart >= 1 &&
        rawStart <= 10_000
          ? rawStart
          : undefined;
      return ctx.preset.renderOrderedList(children, key, { start });
    }

    case RICH_TEXT_NODE.listItem: {
      if (!ctx.preset.renderListItem) return null;
      const children = renderBlockChildren(
        node.content,
        nodeType,
        key,
        depth + 1,
        ctx,
      );
      if (children.length === 0) return null;
      return ctx.preset.renderListItem(children, key);
    }

    case RICH_TEXT_NODE.embeddedMedia: {
      if (!ctx.preset.renderEmbeddedMedia) return null;
      const mediaId = isRecord(node.attrs) ? node.attrs.mediaId : undefined;
      if (typeof mediaId !== "string" || mediaId.trim().length === 0) {
        return null;
      }
      const media = Object.prototype.hasOwnProperty.call(ctx.media, mediaId)
        ? ctx.media[mediaId]
        : undefined;
      return ctx.preset.renderEmbeddedMedia(mediaId, media, key);
    }

    default:
      return null;
  }
}

/**
 * Client-safe, allowlisted TipTap JSON React renderer.
 *
 * Driven directly by `@idcr/content`'s `RICH_TEXT_PROFILES` and `isAllowedHref`:
 * unknown/disallowed nodes, marks, or link hrefs render nothing (`null`).
 * Zero `server-only`, zero Node built-ins, zero ProseMirror runtime.
 */
export function renderRichText(
  value: RichTextView | null | undefined,
  preset: RichTextPreset,
): ReactNode {
  if (!value || !isRecord(value.doc)) return null;
  if (value.doc.type !== RICH_TEXT_NODE.doc || !Array.isArray(value.doc.content)) {
    return null;
  }

  const spec = RICH_TEXT_PROFILES[preset.profile];
  const ctx: RenderContext = {
    preset,
    media: isRecord(value.media) ? value.media : {},
    allowedNodes: new Set<string>(spec.nodes),
    allowedMarks: new Set<string>(spec.marks),
    nodeCount: 1,
  };

  const rendered = renderBlockChildren(
    value.doc.content,
    RICH_TEXT_NODE.doc,
    "rt",
    2,
    ctx,
  );

  if (rendered.length === 0) return null;
  return <Fragment>{rendered}</Fragment>;
}
