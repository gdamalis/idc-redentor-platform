import { LIMITS } from "../limits";
import { isAllowedHref } from "./href";
import {
  BLOCK_NODES,
  HEADING_LEVELS,
  ORDERED_LIST_TYPES,
  RICH_TEXT_PROFILES,
  type RichTextProfile,
} from "./spec";

export interface RichTextIssue {
  path: (string | number)[];
  message: string;
}

type Json = Record<string, unknown>;

const MAX_ISSUES = 20;
const MEDIA_ID_MAX = 128;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Allowed child node types for each parent (stricter than ProseMirror's content expressions). */
function allowedChildren(parent: string): readonly string[] | null {
  switch (parent) {
    case "doc":
      return BLOCK_NODES;
    case "paragraph":
    case "heading":
      return ["text"];
    case "blockquote":
      return ["paragraph"];
    case "bulletList":
    case "orderedList":
      return ["listItem"];
    case "listItem":
      return ["paragraph", "bulletList", "orderedList"];
    default:
      return null; // text, embeddedMedia: no children
  }
}

/** Child count must be >= 1 for these containers. */
const NON_EMPTY = new Set([
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
]);

interface Frame {
  node: unknown;
  path: (string | number)[];
  depth: number;
  parent: string | null;
  index: number;
}

/**
 * Validates a TipTap JSON document against a profile. Iterative (explicit stack), bounded by
 * `LIMITS.maxNodes` and `LIMITS.maxNodeDepth`, no regexes: safe on hostile input.
 */
export function validateRichText(
  doc: unknown,
  profile: RichTextProfile,
): RichTextIssue[] {
  const spec = RICH_TEXT_PROFILES[profile];
  const allowedNodes = new Set<string>(spec.nodes);
  const allowedMarks = new Set<string>(spec.marks);
  const issues: RichTextIssue[] = [];
  const add = (path: (string | number)[], message: string) => {
    if (issues.length < MAX_ISSUES) issues.push({ path, message });
  };

  if (!isObject(doc) || doc.type !== "doc") {
    return [{ path: [], message: "Rich text must be a document" }];
  }

  let count = 0;
  const stack: Frame[] = [
    { node: doc, path: [], depth: 1, parent: null, index: 0 },
  ];
  while (stack.length > 0 && issues.length < MAX_ISSUES) {
    const { node, path, depth, parent, index } = stack.pop() as Frame;
    count += 1;
    if (count > LIMITS.maxNodes) {
      add([], `Document has more than ${LIMITS.maxNodes} nodes`);
      break;
    }
    if (depth > LIMITS.maxNodeDepth) {
      add(path, `Document is nested deeper than ${LIMITS.maxNodeDepth} levels`);
      continue;
    }
    if (!isObject(node) || typeof node.type !== "string") {
      add(path, "Invalid node");
      continue;
    }
    const type = node.type;
    if (!allowedNodes.has(type)) {
      add(path, `Node "${type.slice(0, 40)}" is not allowed in this field`);
      continue;
    }
    if (parent !== null) {
      const children = allowedChildren(parent);
      if (
        !children?.includes(type) ||
        (parent === "listItem" && index === 0 && type !== "paragraph")
      ) {
        add(path, `Node "${type}" is not allowed inside "${parent}"`);
        continue;
      }
    } else if (depth !== 1) {
      add(path, "Invalid node");
      continue;
    }

    for (const key of Object.keys(node)) {
      const ok =
        key === "type" ||
        (key === "text" && type === "text") ||
        (key === "marks" && type === "text") ||
        (key === "content" && type !== "text" && type !== "embeddedMedia") ||
        (key === "attrs" &&
          (type === "heading" ||
            type === "orderedList" ||
            type === "embeddedMedia"));
      if (!ok)
        add([...path, key], `Unexpected "${key.slice(0, 40)}" on "${type}"`);
    }

    // ── per-type checks ──
    if (type === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) {
        add([...path, "text"], "Text node must have text");
      } else if (node.text.length > LIMITS.maxTextNodeLength) {
        add(
          [...path, "text"],
          `Text is longer than ${LIMITS.maxTextNodeLength} characters`,
        );
      }
      if (node.marks !== undefined)
        validateMarks(node.marks, [...path, "marks"], allowedMarks, add);
      continue;
    }
    if (type === "heading") {
      const level = isObject(node.attrs) ? node.attrs.level : undefined;
      const extra = isObject(node.attrs)
        ? Object.keys(node.attrs).filter((k) => k !== "level")
        : [];
      if (!HEADING_LEVELS.includes(level as never) || extra.length > 0) {
        add([...path, "attrs"], "Heading level must be 2 or 3");
      }
    }
    if (type === "orderedList" && node.attrs !== undefined) {
      validateOrderedListAttrs(node.attrs, [...path, "attrs"], add);
    }
    if (type === "embeddedMedia") {
      const attrs = node.attrs;
      const mediaId = isObject(attrs) ? attrs.mediaId : undefined;
      const extra = isObject(attrs)
        ? Object.keys(attrs).filter((k) => k !== "mediaId")
        : [];
      if (
        typeof mediaId !== "string" ||
        mediaId.length === 0 ||
        mediaId.length > MEDIA_ID_MAX ||
        extra.length > 0
      ) {
        add([...path, "attrs"], "Embedded file needs a media id");
      }
      continue;
    }

    const content = node.content;
    if (content === undefined) {
      if (NON_EMPTY.has(type) || type === "doc")
        add([...path, "content"], `"${type}" needs content`);
      continue;
    }
    if (!Array.isArray(content)) {
      add([...path, "content"], "Content must be a list");
      continue;
    }
    if (content.length === 0 && NON_EMPTY.has(type)) {
      add([...path, "content"], `"${type}" needs content`);
      continue;
    }
    if (content.length > LIMITS.maxNodes) {
      add(
        [...path, "content"],
        `Document has more than ${LIMITS.maxNodes} nodes`,
      );
      continue;
    }
    for (let i = content.length - 1; i >= 0; i -= 1) {
      stack.push({
        node: content[i],
        path: [...path, "content", i],
        depth: depth + 1,
        parent: type,
        index: i,
      });
    }
  }
  return issues;
}

function validateMarks(
  marks: unknown,
  path: (string | number)[],
  allowedMarks: Set<string>,
  add: (path: (string | number)[], message: string) => void,
): void {
  if (!Array.isArray(marks) || marks.length > allowedMarks.size) {
    add(path, "Invalid marks");
    return;
  }
  const seen = new Set<string>();
  marks.forEach((mark, i) => {
    const markPath = [...path, i];
    if (!isObject(mark) || typeof mark.type !== "string") {
      add(markPath, "Invalid mark");
      return;
    }
    if (!allowedMarks.has(mark.type)) {
      add(
        markPath,
        `Mark "${mark.type.slice(0, 40)}" is not allowed in this field`,
      );
      return;
    }
    if (seen.has(mark.type)) add(markPath, `Mark "${mark.type}" is repeated`);
    seen.add(mark.type);
    for (const key of Object.keys(mark)) {
      if (key !== "type" && !(key === "attrs" && mark.type === "link")) {
        add(
          [...markPath, key],
          `Unexpected "${key.slice(0, 40)}" on mark "${mark.type}"`,
        );
      }
    }
    if (mark.type === "link") {
      const attrs = mark.attrs;
      const extra = isObject(attrs)
        ? Object.keys(attrs).filter((k) => k !== "href")
        : [];
      if (!isObject(attrs) || !isAllowedHref(attrs.href) || extra.length > 0) {
        add(
          [...markPath, "attrs"],
          "Link address must start with https://, http://, mailto: or /",
        );
      }
    }
  });
}

function validateOrderedListAttrs(
  attrs: unknown,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  if (!isObject(attrs)) {
    add(path, "Invalid list attributes");
    return;
  }
  for (const [key, value] of Object.entries(attrs)) {
    const ok =
      (key === "start" &&
        Number.isInteger(value) &&
        (value as number) >= 1 &&
        (value as number) <= 10_000) ||
      (key === "type" &&
        (value === null || ORDERED_LIST_TYPES.includes(value as never)));
    if (!ok) add([...path, key], "Invalid list attributes");
  }
}
