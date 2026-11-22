import {
  isAllowedHref,
  LIMITS,
  RICH_TEXT_MARK,
  RICH_TEXT_NODE,
  RICH_TEXT_PROFILES,
  validateRichText,
  type RichTextDoc,
  type RichTextElementNode,
  type RichTextMark,
  type RichTextMarkType,
  type RichTextNode,
  type RichTextProfile,
  type RichTextTextNode,
} from "@idcr/content";

export type ConversionIssueCode =
  | "invalid-document"
  | "unsupported-node"
  | "unsupported-mark"
  | "disallowed-node-for-profile"
  | "disallowed-mark-for-profile"
  | "disallowed-href"
  | "invalid-nesting"
  | "missing-asset-mapping"
  | "depth-exceeded"
  | "node-limit-exceeded";

export interface ConversionIssue {
  readonly documentId?: string;
  readonly path: readonly (string | number)[];
  readonly code: ConversionIssueCode;
  readonly nodeType?: string;
  readonly markType?: string;
  readonly message: string;
}

export interface ConvertContentfulOptions {
  readonly profile: RichTextProfile;
  readonly documentId?: string;
  /**
   * Maps Contentful asset `sys.id` to target Mongo `mediaId`.
   * Required whenever a sermon document contains `embedded-asset-block` nodes.
   */
  readonly assetIdMap?:
    | ReadonlyMap<string, string>
    | Readonly<Record<string, string>>;
}

export type ConvertContentfulResult =
  | { readonly ok: true; readonly doc: RichTextDoc; readonly issues: readonly [] }
  | {
      readonly ok: false;
      readonly doc: null;
      readonly issues: readonly ConversionIssue[];
    };

const MAX_ISSUES = 20;

/**
 * Matches ProseMirror schema mark rank in `@idcr/content/tiptap`
 * (`Object.keys(schema.marks) === ["link", "bold", "italic"]`) so converted JSON
 * round-trips unchanged through `PMNode.fromJSON(schema, doc).toJSON()`.
 */
const MARK_RANK: Record<RichTextMarkType, number> = {
  link: 0,
  bold: 1,
  italic: 2,
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Replaces `\r\n`, `\r`, and `\n` with a single ASCII space `" "` using a linear
 * character loop (no regexes; immune to catastrophic backtracking on large sermons).
 */
export function normalizeNewlinesToSpaces(text: string): string {
  let hasNewline = false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) {
      hasNewline = true;
      break;
    }
  }
  if (!hasNewline) return text;

  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0d) {
      out += " ";
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0a) {
        i += 1;
      }
    } else if (code === 0x0a) {
      out += " ";
    } else {
      out += text[i];
    }
  }
  return out;
}

function marksEqual(
  a: readonly RichTextMark[] | undefined,
  b: readonly RichTextMark[] | undefined,
): boolean {
  const lenA = a?.length ?? 0;
  const lenB = b?.length ?? 0;
  if (lenA !== lenB) return false;
  if (!a || !b) return true;
  for (let i = 0; i < lenA; i += 1) {
    if (a[i].type !== b[i].type) return false;
    if ((a[i].attrs?.href ?? undefined) !== (b[i].attrs?.href ?? undefined)) {
      return false;
    }
  }
  return true;
}

function canonicalizeMarks(marks: readonly RichTextMark[]): RichTextMark[] {
  if (marks.length <= 1) return [...marks];
  const byType = new Map<RichTextMarkType, RichTextMark>();
  for (const mark of marks) {
    if (!byType.has(mark.type)) {
      byType.set(mark.type, mark);
    }
  }
  return [...byType.values()].sort(
    (a, b) => MARK_RANK[a.type] - MARK_RANK[b.type],
  );
}

function mergeAdjacentTextNodes(nodes: RichTextTextNode[]): RichTextTextNode[] {
  if (nodes.length <= 1) return nodes;
  const merged: RichTextTextNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      marksEqual(prev.marks, node.marks) &&
      prev.text.length + node.text.length <= LIMITS.maxTextNodeLength
    ) {
      prev.text += node.text;
    } else {
      merged.push({ ...node });
    }
  }
  return merged;
}

function lookupAssetId(
  assetIdMap: ConvertContentfulOptions["assetIdMap"],
  contentfulAssetId: string,
): string | undefined {
  if (!assetIdMap) return undefined;
  if (assetIdMap instanceof Map) {
    return assetIdMap.get(contentfulAssetId);
  }
  const record = assetIdMap as Readonly<Record<string, string>>;
  return Object.prototype.hasOwnProperty.call(record, contentfulAssetId)
    ? record[contentfulAssetId]
    : undefined;
}

interface ConversionState {
  readonly profile: RichTextProfile;
  readonly documentId?: string;
  readonly assetIdMap?: ConvertContentfulOptions["assetIdMap"];
  readonly allowedNodes: ReadonlySet<string>;
  readonly allowedMarks: ReadonlySet<string>;
  readonly issues: ConversionIssue[];
  nodeCount: number;
}

function addIssue(
  state: ConversionState,
  issue: Omit<ConversionIssue, "documentId">,
): void {
  if (state.issues.length >= MAX_ISSUES) return;
  state.issues.push(
    state.documentId !== undefined
      ? { documentId: state.documentId, ...issue }
      : issue,
  );
}

function bumpNodeCount(
  state: ConversionState,
  path: readonly (string | number)[],
): boolean {
  state.nodeCount += 1;
  if (state.nodeCount > LIMITS.maxNodes) {
    addIssue(state, {
      path,
      code: "node-limit-exceeded",
      message: `Document exceeds maximum of ${LIMITS.maxNodes} nodes`,
    });
    return false;
  }
  return true;
}

function convertInlineChildren(
  rawChildren: unknown,
  path: readonly (string | number)[],
  depth: number,
  activeLinkHref: string | undefined,
  state: ConversionState,
): RichTextTextNode[] {
  if (!Array.isArray(rawChildren)) {
    addIssue(state, {
      path,
      code: "invalid-document",
      message: "Inline container content must be an array",
    });
    return [];
  }

  const out: RichTextTextNode[] = [];

  for (let i = 0; i < rawChildren.length; i += 1) {
    if (state.issues.length >= MAX_ISSUES) break;
    const child = rawChildren[i];
    const childPath = [...path, i];

    if (depth > LIMITS.maxNodeDepth) {
      addIssue(state, {
        path: childPath,
        code: "depth-exceeded",
        message: `Document nesting exceeds maximum depth of ${LIMITS.maxNodeDepth}`,
      });
      continue;
    }
    if (!isObject(child) || typeof child.nodeType !== "string") {
      addIssue(state, {
        path: childPath,
        code: "invalid-document",
        message: "Invalid inline node",
      });
      continue;
    }

    const nodeType = child.nodeType;

    if (nodeType === "text") {
      if (!bumpNodeCount(state, childPath)) break;
      if (typeof child.value !== "string") {
        addIssue(state, {
          path: childPath,
          code: "invalid-document",
          nodeType,
          message: "Text node value must be a string",
        });
        continue;
      }

      const rawMarks = child.marks;
      if (rawMarks !== undefined && !Array.isArray(rawMarks)) {
        addIssue(state, {
          path: [...childPath, "marks"],
          code: "invalid-document",
          nodeType,
          message: "Text node marks must be an array",
        });
        continue;
      }

      const marks: RichTextMark[] = [];
      if (activeLinkHref !== undefined) {
        marks.push({
          type: RICH_TEXT_MARK.link,
          attrs: { href: activeLinkHref },
        });
      }

      if (Array.isArray(rawMarks)) {
        for (let m = 0; m < rawMarks.length; m += 1) {
          const rawMark = rawMarks[m];
          const markPath = [...childPath, "marks", m];
          if (!isObject(rawMark) || typeof rawMark.type !== "string") {
            addIssue(state, {
              path: markPath,
              code: "unsupported-mark",
              message: "Invalid mark entry",
            });
            continue;
          }
          const markType = rawMark.type;
          if (
            markType !== RICH_TEXT_MARK.bold &&
            markType !== RICH_TEXT_MARK.italic
          ) {
            addIssue(state, {
              path: markPath,
              code: "unsupported-mark",
              markType,
              message: `Unsupported Contentful mark "${markType.slice(0, 40)}"`,
            });
            continue;
          }
          if (!state.allowedMarks.has(markType)) {
            addIssue(state, {
              path: markPath,
              code: "disallowed-mark-for-profile",
              markType,
              message: `Mark "${markType}" is not allowed in profile "${state.profile}"`,
            });
            continue;
          }
          marks.push({ type: markType });
        }
      }

      const normalizedText = normalizeNewlinesToSpaces(child.value);
      // TipTap/ProseMirror forbids empty text nodes (Contentful emits "" in empty paragraphs
      // and adjacent to inline hyperlinks). Marks on empty text nodes are still checked above.
      if (normalizedText.length === 0) continue;

      if (normalizedText.length > LIMITS.maxTextNodeLength) {
        addIssue(state, {
          path: childPath,
          code: "invalid-document",
          nodeType,
          message: `Text node exceeds maximum length of ${LIMITS.maxTextNodeLength}`,
        });
        continue;
      }

      const canonicalMarks = canonicalizeMarks(marks);
      const textNode: RichTextTextNode =
        canonicalMarks.length > 0
          ? { type: "text", text: normalizedText, marks: canonicalMarks }
          : { type: "text", text: normalizedText };
      out.push(textNode);
      continue;
    }

    if (nodeType === "hyperlink") {
      if (activeLinkHref !== undefined) {
        addIssue(state, {
          path: childPath,
          code: "invalid-nesting",
          nodeType,
          message: "Nested hyperlinks are not allowed",
        });
        continue;
      }
      if (!state.allowedMarks.has(RICH_TEXT_MARK.link)) {
        addIssue(state, {
          path: childPath,
          code: "disallowed-mark-for-profile",
          nodeType,
          markType: RICH_TEXT_MARK.link,
          message: `Hyperlink is not allowed in profile "${state.profile}"`,
        });
        continue;
      }
      const uri = isObject(child.data) ? child.data.uri : undefined;
      if (!isAllowedHref(uri)) {
        addIssue(state, {
          path: [...childPath, "data", "uri"],
          code: "disallowed-href",
          nodeType,
          message: "Hyperlink address is not in the allowlist",
        });
        continue;
      }
      // Hyperlink flattens into text children carrying the link mark, so depth stays
      // at the same TipTap tree depth while capping Contentful nesting safely.
      const linkChildren = convertInlineChildren(
        child.content,
        [...childPath, "content"],
        depth,
        uri,
        state,
      );
      for (const linkChild of linkChildren) {
        out.push(linkChild);
      }
      continue;
    }

    addIssue(state, {
      path: childPath,
      code: "unsupported-node",
      nodeType,
      message: `Unsupported inline Contentful node "${nodeType.slice(0, 40)}"`,
    });
  }

  return activeLinkHref === undefined ? mergeAdjacentTextNodes(out) : out;
}

function convertParagraph(
  node: JsonObject,
  path: readonly (string | number)[],
  depth: number,
  state: ConversionState,
): RichTextElementNode | null {
  if (!bumpNodeCount(state, path)) return null;
  const children = convertInlineChildren(
    node.content,
    [...path, "content"],
    depth + 1,
    undefined,
    state,
  );
  return children.length > 0
    ? { type: RICH_TEXT_NODE.paragraph, content: children }
    : { type: RICH_TEXT_NODE.paragraph };
}

function convertHeading(
  node: JsonObject,
  level: 2 | 3,
  path: readonly (string | number)[],
  depth: number,
  state: ConversionState,
): RichTextElementNode | null {
  if (!state.allowedNodes.has(RICH_TEXT_NODE.heading)) {
    addIssue(state, {
      path,
      code: "disallowed-node-for-profile",
      nodeType: String(node.nodeType),
      message: `Heading level ${level} is not allowed in profile "${state.profile}"`,
    });
    return null;
  }
  if (!bumpNodeCount(state, path)) return null;
  const children = convertInlineChildren(
    node.content,
    [...path, "content"],
    depth + 1,
    undefined,
    state,
  );
  return children.length > 0
    ? { type: RICH_TEXT_NODE.heading, attrs: { level }, content: children }
    : { type: RICH_TEXT_NODE.heading, attrs: { level } };
}

function convertBlockquote(
  node: JsonObject,
  path: readonly (string | number)[],
  depth: number,
  state: ConversionState,
): RichTextElementNode | null {
  if (!state.allowedNodes.has(RICH_TEXT_NODE.blockquote)) {
    addIssue(state, {
      path,
      code: "disallowed-node-for-profile",
      nodeType: "blockquote",
      message: `Blockquote is not allowed in profile "${state.profile}"`,
    });
    return null;
  }
  if (!bumpNodeCount(state, path)) return null;
  if (!Array.isArray(node.content) || node.content.length === 0) {
    addIssue(state, {
      path: [...path, "content"],
      code: "invalid-nesting",
      nodeType: "blockquote",
      message: "Blockquote must contain at least one paragraph",
    });
    return null;
  }

  const children: RichTextNode[] = [];
  for (let i = 0; i < node.content.length; i += 1) {
    if (state.issues.length >= MAX_ISSUES) break;
    const child = node.content[i];
    const childPath = [...path, "content", i];
    if (depth + 1 > LIMITS.maxNodeDepth) {
      addIssue(state, {
        path: childPath,
        code: "depth-exceeded",
        message: `Document nesting exceeds maximum depth of ${LIMITS.maxNodeDepth}`,
      });
      continue;
    }
    if (!isObject(child) || child.nodeType !== "paragraph") {
      addIssue(state, {
        path: childPath,
        code: "invalid-nesting",
        nodeType: isObject(child) ? String(child.nodeType) : undefined,
        message: "Blockquote may contain only paragraph children",
      });
      continue;
    }
    const converted = convertParagraph(child, childPath, depth + 1, state);
    if (converted) children.push(converted);
  }

  return { type: RICH_TEXT_NODE.blockquote, content: children };
}

function convertListItem(
  node: JsonObject,
  path: readonly (string | number)[],
  depth: number,
  state: ConversionState,
): RichTextElementNode | null {
  if (!state.allowedNodes.has(RICH_TEXT_NODE.listItem)) {
    addIssue(state, {
      path,
      code: "disallowed-node-for-profile",
      nodeType: "list-item",
      message: `List item is not allowed in profile "${state.profile}"`,
    });
    return null;
  }
  if (!bumpNodeCount(state, path)) return null;
  if (!Array.isArray(node.content) || node.content.length === 0) {
    addIssue(state, {
      path: [...path, "content"],
      code: "invalid-nesting",
      nodeType: "list-item",
      message: "List item must contain a leading paragraph",
    });
    return null;
  }

  const children: RichTextNode[] = [];
  for (let i = 0; i < node.content.length; i += 1) {
    if (state.issues.length >= MAX_ISSUES) break;
    const child = node.content[i];
    const childPath = [...path, "content", i];
    if (depth + 1 > LIMITS.maxNodeDepth) {
      addIssue(state, {
        path: childPath,
        code: "depth-exceeded",
        message: `Document nesting exceeds maximum depth of ${LIMITS.maxNodeDepth}`,
      });
      continue;
    }
    if (!isObject(child) || typeof child.nodeType !== "string") {
      addIssue(state, {
        path: childPath,
        code: "invalid-document",
        message: "Invalid child inside list item",
      });
      continue;
    }
    if (i === 0 && child.nodeType !== "paragraph") {
      addIssue(state, {
        path: childPath,
        code: "invalid-nesting",
        nodeType: child.nodeType,
        message: "First child of list-item must be a paragraph",
      });
      continue;
    }

    if (child.nodeType === "paragraph") {
      const converted = convertParagraph(child, childPath, depth + 1, state);
      if (converted) children.push(converted);
    } else if (
      child.nodeType === "unordered-list" ||
      child.nodeType === "ordered-list"
    ) {
      const converted = convertList(
        child,
        child.nodeType === "ordered-list",
        childPath,
        depth + 1,
        state,
      );
      if (converted) children.push(converted);
    } else {
      addIssue(state, {
        path: childPath,
        code: "invalid-nesting",
        nodeType: child.nodeType,
        message: `Node "${child.nodeType.slice(0, 40)}" is not allowed inside list-item`,
      });
    }
  }

  return { type: RICH_TEXT_NODE.listItem, content: children };
}

function convertList(
  node: JsonObject,
  ordered: boolean,
  path: readonly (string | number)[],
  depth: number,
  state: ConversionState,
): RichTextElementNode | null {
  const tiptapType = ordered
    ? RICH_TEXT_NODE.orderedList
    : RICH_TEXT_NODE.bulletList;
  const contentfulType = ordered ? "ordered-list" : "unordered-list";

  if (!state.allowedNodes.has(tiptapType)) {
    addIssue(state, {
      path,
      code: "disallowed-node-for-profile",
      nodeType: contentfulType,
      message: `List "${contentfulType}" is not allowed in profile "${state.profile}"`,
    });
    return null;
  }
  if (!bumpNodeCount(state, path)) return null;
  if (!Array.isArray(node.content) || node.content.length === 0) {
    addIssue(state, {
      path: [...path, "content"],
      code: "invalid-nesting",
      nodeType: contentfulType,
      message: `List "${contentfulType}" must contain at least one list-item`,
    });
    return null;
  }

  const items: RichTextNode[] = [];
  for (let i = 0; i < node.content.length; i += 1) {
    if (state.issues.length >= MAX_ISSUES) break;
    const child = node.content[i];
    const childPath = [...path, "content", i];
    if (depth + 1 > LIMITS.maxNodeDepth) {
      addIssue(state, {
        path: childPath,
        code: "depth-exceeded",
        message: `Document nesting exceeds maximum depth of ${LIMITS.maxNodeDepth}`,
      });
      continue;
    }
    if (!isObject(child) || child.nodeType !== "list-item") {
      addIssue(state, {
        path: childPath,
        code: "invalid-nesting",
        nodeType: isObject(child) ? String(child.nodeType) : undefined,
        message: `List "${contentfulType}" may contain only list-item children`,
      });
      continue;
    }
    const converted = convertListItem(child, childPath, depth + 1, state);
    if (converted) items.push(converted);
  }

  // TipTap v3 OrderedList always serializes `{ start: 1, type: null }`.
  // Emitting it here ensures lossless PMNode.fromJSON(schema, doc).toJSON() round-trips.
  return ordered
    ? { type: tiptapType, attrs: { start: 1, type: null }, content: items }
    : { type: tiptapType, content: items };
}

function convertEmbeddedAssetBlock(
  node: JsonObject,
  path: readonly (string | number)[],
  state: ConversionState,
): RichTextElementNode | null {
  if (!state.allowedNodes.has(RICH_TEXT_NODE.embeddedMedia)) {
    addIssue(state, {
      path,
      code: "disallowed-node-for-profile",
      nodeType: "embedded-asset-block",
      message: `Embedded asset block is not allowed in profile "${state.profile}"`,
    });
    return null;
  }
  if (!bumpNodeCount(state, path)) return null;

  const data = isObject(node.data) ? node.data : undefined;
  const target = data && isObject(data.target) ? data.target : undefined;
  const sys = target && isObject(target.sys) ? target.sys : undefined;
  const rawId = typeof sys?.id === "string" ? sys.id.trim() : "";

  if (rawId.length === 0) {
    addIssue(state, {
      path: [...path, "data", "target", "sys", "id"],
      code: "missing-asset-mapping",
      nodeType: "embedded-asset-block",
      message: "Embedded asset block is missing target.sys.id",
    });
    return null;
  }

  const mappedId = lookupAssetId(state.assetIdMap, rawId)?.trim();
  if (!mappedId) {
    addIssue(state, {
      path: [...path, "data", "target", "sys", "id"],
      code: "missing-asset-mapping",
      nodeType: "embedded-asset-block",
      message: `No mediaId mapping found for Contentful asset "${rawId}"`,
    });
    return null;
  }

  return {
    type: RICH_TEXT_NODE.embeddedMedia,
    attrs: { mediaId: mappedId },
  };
}

function convertTopLevelBlock(
  node: unknown,
  path: readonly (string | number)[],
  state: ConversionState,
): RichTextNode | null {
  const depth = 2; // doc is depth 1
  if (!isObject(node) || typeof node.nodeType !== "string") {
    addIssue(state, {
      path,
      code: "invalid-document",
      message: "Top-level node must be an object with a nodeType",
    });
    return null;
  }

  switch (node.nodeType) {
    case "paragraph":
      return convertParagraph(node, path, depth, state);
    case "heading-2":
      return convertHeading(node, 2, path, depth, state);
    case "heading-3":
      return convertHeading(node, 3, path, depth, state);
    case "blockquote":
      return convertBlockquote(node, path, depth, state);
    case "unordered-list":
      return convertList(node, false, path, depth, state);
    case "ordered-list":
      return convertList(node, true, path, depth, state);
    case "embedded-asset-block":
      return convertEmbeddedAssetBlock(node, path, state);
    default:
      addIssue(state, {
        path,
        code: "unsupported-node",
        nodeType: node.nodeType,
        message: `Unsupported Contentful node "${node.nodeType.slice(0, 40)}"`,
      });
      return null;
  }
}

/**
 * Pure converter from a Contentful rich-text JSON document to canonical TipTap JSON
 * matching `@idcr/content` (`validateRichText` + `@idcr/content/tiptap` schema round-trip).
 *
 * Never throws on malformed or disallowed input; reports structured issues and fails
 * conversion cleanly (`{ ok: false, doc: null, issues }`).
 */
export function convertContentfulRichText(
  input: unknown,
  options: ConvertContentfulOptions,
): ConvertContentfulResult {
  const spec = RICH_TEXT_PROFILES[options.profile];
  const state: ConversionState = {
    profile: options.profile,
    documentId: options.documentId,
    assetIdMap: options.assetIdMap,
    allowedNodes: new Set<string>(spec.nodes),
    allowedMarks: new Set<string>(spec.marks),
    issues: [],
    nodeCount: 1, // doc root
  };

  if (
    !isObject(input) ||
    input.nodeType !== "document" ||
    !Array.isArray(input.content)
  ) {
    addIssue(state, {
      path: [],
      code: "invalid-document",
      nodeType: isObject(input) ? String(input.nodeType) : undefined,
      message: "Contentful rich-text input must be a document with a content array",
    });
    return { ok: false, doc: null, issues: state.issues };
  }

  const content: RichTextNode[] = [];
  for (let i = 0; i < input.content.length; i += 1) {
    if (state.issues.length >= MAX_ISSUES) break;
    const converted = convertTopLevelBlock(
      input.content[i],
      ["content", i],
      state,
    );
    if (converted) content.push(converted);
  }

  if (state.issues.length > 0) {
    return { ok: false, doc: null, issues: state.issues };
  }

  const doc: RichTextDoc = { type: "doc", content };

  // Defense-in-depth invariant: every converted doc must satisfy `@idcr/content` validateRichText.
  const validationIssues = validateRichText(doc, options.profile);
  if (validationIssues.length > 0) {
    for (const issue of validationIssues) {
      addIssue(state, {
        path: issue.path,
        code: "invalid-document",
        message: issue.message,
      });
    }
    return { ok: false, doc: null, issues: state.issues };
  }

  return { ok: true, doc, issues: [] };
}
