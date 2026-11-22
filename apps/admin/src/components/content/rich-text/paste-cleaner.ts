import {
  LIMITS,
  RICH_TEXT_MARK,
  RICH_TEXT_NODE,
  RICH_TEXT_PROFILES,
  isAllowedHref,
  type RichTextProfile,
} from "@idcr/content";

export interface SanitizedPasteResult {
  readonly html: string;
  readonly rejectedImage: boolean;
}

const SKIP_SUBTREE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "META",
  "LINK",
  "TITLE",
  "HEAD",
  "XML",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO",
]);

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeInlineText(text: string): string {
  // Replace non-breaking spaces and collapse CR/LF inside HTML text nodes to normal spaces.
  return text.replaceAll("\u00a0", " ");
}

function parseFontWeight(style: string | null): number | "normal" | "bold" | null {
  if (!style) return null;
  const lower = style.toLowerCase();
  const idx = lower.indexOf("font-weight");
  if (idx === -1) return null;
  const colon = lower.indexOf(":", idx);
  if (colon === -1) return null;
  const semi = lower.indexOf(";", colon);
  const raw = (semi === -1 ? lower.slice(colon + 1) : lower.slice(colon + 1, semi))
    .trim()
    .replace("!important", "")
    .trim();
  if (raw === "normal" || raw === "lighter") return "normal";
  if (raw === "bold" || raw === "bolder") return "bold";
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function hasItalicStyle(style: string | null): boolean {
  if (!style) return false;
  const lower = style.toLowerCase();
  const idx = lower.indexOf("font-style");
  if (idx === -1) return false;
  const colon = lower.indexOf(":", idx);
  if (colon === -1) return false;
  const semi = lower.indexOf(";", colon);
  const raw = (semi === -1 ? lower.slice(colon + 1) : lower.slice(colon + 1, semi)).trim();
  return raw.startsWith("italic") || raw.startsWith("oblique");
}

function isWordCommentNode(el: Element): boolean {
  const cls = el.getAttribute("class")?.toLowerCase() ?? "";
  return (
    cls.includes("msocom") ||
    cls.includes("mso-comment") ||
    el.tagName.toUpperCase() === "O:P"
  );
}

/**
 * Bounded DOM-walk HTML paste sanitizer for Word, Google Docs, and web pages
 * (`F-editor-ux-decisions.md` §2.6, `ICR-197` AC8 & Edge cases #3/#4, `H` #4).
 *
 * Uses `DOMParser` + bounded recursion depth/node count (zero backtracking
 * regexes on HTML) so hostile or huge pastes remain O(n).
 */
export function sanitizePastedHtml(
  rawHtml: string,
  profile: RichTextProfile,
): SanitizedPasteResult {
  const bounded = rawHtml.slice(0, LIMITS.longTextMax * 4);
  if (typeof DOMParser === "undefined") {
    return {
      html: `<p>${escapeHtml(normalizeInlineText(bounded))}</p>`,
      rejectedImage: false,
    };
  }

  const spec = RICH_TEXT_PROFILES[profile];
  const allowedNodes = new Set<string>(spec.nodes);
  const allowedMarks = new Set<string>(spec.marks);
  const allowHeading = allowedNodes.has(RICH_TEXT_NODE.heading);
  const allowBlockquote = allowedNodes.has(RICH_TEXT_NODE.blockquote);
  const allowBulletList = allowedNodes.has(RICH_TEXT_NODE.bulletList);
  const allowOrderedList = allowedNodes.has(RICH_TEXT_NODE.orderedList);
  const allowBold = allowedMarks.has(RICH_TEXT_MARK.bold);
  const allowItalic = allowedMarks.has(RICH_TEXT_MARK.italic);
  const allowLink = allowedMarks.has(RICH_TEXT_MARK.link);

  const parser = new DOMParser();
  const doc = parser.parseFromString(bounded, "text/html");
  let rejectedImage = false;
  let visited = 0;

  interface InlineContext {
    readonly bold: boolean;
    readonly italic: boolean;
    readonly href: string | null;
  }

  const renderInlineText = (text: string, ctx: InlineContext): string => {
    const clean = normalizeInlineText(text);
    if (clean.length === 0) return "";
    let out = escapeHtml(clean);
    if (ctx.italic && allowItalic) out = `<em>${out}</em>`;
    if (ctx.bold && allowBold) out = `<strong>${out}</strong>`;
    if (ctx.href && allowLink && isAllowedHref(ctx.href)) {
      out = `<a href="${escapeHtml(ctx.href)}">${out}</a>`;
    }
    return out;
  };

  // Splits inline content containing <br> into separate inline segments (so <br> becomes new paragraphs).
  const collectInlineSegments = (
    node: Node,
    ctx: InlineContext,
    segments: string[],
    depth: number,
  ): void => {
    visited += 1;
    if (visited > LIMITS.maxNodes || depth > 32) return;

    if (node.nodeType === 3 /* TEXT_NODE */) {
      const piece = renderInlineText(node.textContent ?? "", ctx);
      if (piece) {
        segments[segments.length - 1] += piece;
      }
      return;
    }

    if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (SKIP_SUBTREE_TAGS.has(tag) || isWordCommentNode(el)) return;

    if (tag === "IMG" || tag === "PICTURE") {
      rejectedImage = true;
      return;
    }

    if (tag === "BR") {
      segments.push("");
      return;
    }

    const style = el.getAttribute("style");
    const weight = parseFontWeight(style);

    let nextBold = ctx.bold;
    if (tag === "B" || tag === "STRONG") {
      // Google Docs wraps the entire pasted fragment in `<b style="font-weight:normal;">`
      if (weight === "normal" || (typeof weight === "number" && weight < 600)) {
        nextBold = false;
      } else {
        nextBold = true;
      }
    } else if (weight === "bold" || (typeof weight === "number" && weight >= 600)) {
      nextBold = true;
    } else if (weight === "normal" || (typeof weight === "number" && weight < 600)) {
      nextBold = false;
    }

    let nextItalic = ctx.italic;
    if (tag === "I" || tag === "EM" || hasItalicStyle(style)) {
      nextItalic = true;
    }

    let nextHref = ctx.href;
    if (tag === "A" && allowLink) {
      const candidate = el.getAttribute("href")?.trim();
      if (candidate && isAllowedHref(candidate)) {
        nextHref = candidate;
      }
    }

    const nextCtx: InlineContext = {
      bold: nextBold,
      italic: nextItalic,
      href: nextHref,
    };

    for (let i = 0; i < el.childNodes.length; i += 1) {
      collectInlineSegments(el.childNodes[i]!, nextCtx, segments, depth + 1);
    }
  };

  const renderInlineAsParagraphs = (
    node: Node,
    ctx: InlineContext,
    depth: number,
  ): string[] => {
    const segments: string[] = [""];
    collectInlineSegments(node, ctx, segments, depth);
    return segments
      .map((seg) => seg.trim())
      .filter((seg) => seg.length > 0)
      .map((seg) => `<p>${seg}</p>`);
  };

  const walkBlockChildren = (
    parent: Node,
    ctx: InlineContext,
    depth: number,
    insideContainer: "doc" | "blockquote" | "listItem",
  ): string[] => {
    if (depth > 32 || visited > LIMITS.maxNodes) return [];
    const blocks: string[] = [];
    let pendingInline = [""];

    const flushInline = () => {
      for (const seg of pendingInline) {
        const trimmed = seg.trim();
        if (trimmed.length > 0) {
          blocks.push(`<p>${trimmed}</p>`);
        }
      }
      pendingInline = [""];
    };

    for (let i = 0; i < parent.childNodes.length; i += 1) {
      const child = parent.childNodes[i]!;
      visited += 1;
      if (visited > LIMITS.maxNodes) break;

      if (child.nodeType === 3) {
        const piece = renderInlineText(child.textContent ?? "", ctx);
        if (piece) pendingInline[pendingInline.length - 1] += piece;
        continue;
      }

      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();

      if (SKIP_SUBTREE_TAGS.has(tag) || isWordCommentNode(el)) continue;

      if (tag === "IMG" || tag === "PICTURE") {
        rejectedImage = true;
        continue;
      }

      // Google Docs normal-weight <b> wrapper around block elements: unwrap transparently
      if (tag === "B" || tag === "STRONG") {
        const weight = parseFontWeight(el.getAttribute("style"));
        const isNormalWrapper =
          weight === "normal" || (typeof weight === "number" && weight < 600);
        const hasBlockChild = Array.from(el.children).some((c) =>
          /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|TABLE|SECTION|ARTICLE)$/i.test(
            c.tagName,
          ),
        );
        if (isNormalWrapper || hasBlockChild) {
          flushInline();
          blocks.push(
            ...walkBlockChildren(
              el,
              { ...ctx, bold: isNormalWrapper ? false : true },
              depth + 1,
              insideContainer,
            ),
          );
          continue;
        }
      }

      // Headings: h1 -> h2, h4-h6 -> h3 when allowed at doc level; else <p>
      if (/^H[1-6]$/.test(tag)) {
        flushInline();
        const segments = [""];
        for (let j = 0; j < el.childNodes.length; j += 1) {
          collectInlineSegments(el.childNodes[j]!, ctx, segments, depth + 1);
        }
        const joined = segments
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        if (joined.length > 0) {
          if (allowHeading && insideContainer === "doc") {
            const level = tag === "H1" || tag === "H2" ? 2 : 3;
            blocks.push(`<h${level}>${joined}</h${level}>`);
          } else {
            blocks.push(`<p>${joined}</p>`);
          }
        }
        continue;
      }

      if (tag === "BLOCKQUOTE") {
        flushInline();
        const inner = walkBlockChildren(el, ctx, depth + 1, "blockquote");
        if (inner.length > 0) {
          if (allowBlockquote && insideContainer === "doc") {
            blocks.push(`<blockquote>${inner.join("")}</blockquote>`);
          } else {
            blocks.push(...inner);
          }
        }
        continue;
      }

      if (tag === "UL" || tag === "OL") {
        flushInline();
        const isOrdered = tag === "OL";
        const allowedThisList = isOrdered ? allowOrderedList : allowBulletList;
        const listItems: string[] = [];

        for (let j = 0; j < el.children.length; j += 1) {
          const itemEl = el.children[j]!;
          if (itemEl.tagName.toUpperCase() !== "LI") {
            // Nested list directly inside UL/OL or stray element
            const nested = walkBlockChildren(
              itemEl,
              ctx,
              depth + 1,
              insideContainer === "blockquote" ? "blockquote" : "listItem",
            );
            listItems.push(...nested);
            continue;
          }
          const liBlocks = walkBlockChildren(itemEl, ctx, depth + 1, "listItem");
          if (liBlocks.length === 0) continue;
          if (allowedThisList && insideContainer !== "blockquote") {
            // ConstrainedListItem requires leading paragraph
            const firstIsParagraph = liBlocks[0]!.startsWith("<p>");
            const normalizedLi = firstIsParagraph
              ? liBlocks.join("")
              : `<p></p>${liBlocks.join("")}`;
            listItems.push(`<li>${normalizedLi}</li>`);
          } else {
            listItems.push(...liBlocks);
          }
        }

        if (listItems.length > 0) {
          if (allowedThisList && insideContainer !== "blockquote") {
            const listTag = isOrdered ? "ol" : "ul";
            blocks.push(`<${listTag}>${listItems.join("")}</${listTag}>`);
          } else {
            blocks.push(...listItems);
          }
        }
        continue;
      }

      if (tag === "TABLE" || tag === "THEAD" || tag === "TBODY" || tag === "TFOOT" || tag === "TR") {
        flushInline();
        blocks.push(...walkBlockChildren(el, ctx, depth + 1, insideContainer));
        continue;
      }

      if (tag === "TD" || tag === "TH" || tag === "P" || tag === "PRE") {
        flushInline();
        const hasNestedBlocks = Array.from(el.children).some((c) =>
          /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|TABLE)$/i.test(c.tagName),
        );
        if (hasNestedBlocks) {
          blocks.push(...walkBlockChildren(el, ctx, depth + 1, insideContainer));
        } else {
          blocks.push(...renderInlineAsParagraphs(el, ctx, depth + 1));
        }
        continue;
      }

      if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" || tag === "HEADER" || tag === "FOOTER" || tag === "MAIN" || tag === "FIGURE" || tag === "FIGCAPTION") {
        flushInline();
        blocks.push(...walkBlockChildren(el, ctx, depth + 1, insideContainer));
        continue;
      }

      if (tag === "HR") {
        flushInline();
        continue;
      }

      // Inline element inside block container
      collectInlineSegments(el, ctx, pendingInline, depth + 1);
    }

    flushInline();
    return blocks;
  };

  const blocks = walkBlockChildren(
    doc.body,
    { bold: false, italic: false, href: null },
    0,
    "doc",
  );

  return {
    html: blocks.join(""),
    rejectedImage,
  };
}
