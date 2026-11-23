/**
 * Canonical TipTap sermon PDF content-block derivation and SHA-256 content hash.
 *
 * Byte-identical algorithm to `apps/web/src/utils/predica/tiptapRegenContent.ts`
 * (`ICR-202`) and `apps/admin/src/service/content/sermons/tiptap-regen-content.ts`
 * (`ICR-200`) so imported sermons carry exact matching `contentHash` values and
 * never trigger unnecessary PDF regeneration on first save.
 */
import type { RichTextDoc, RichTextNode } from "@idcr/content";
import { createHash } from "node:crypto";

export interface SermonPdfContentBlock {
  readonly type: "h2" | "h3" | "p" | "blockquote" | "ul" | "ol" | "embeddedAsset";
  readonly text?: string;
  readonly items?: string[];
  readonly assetId?: string;
}

export interface TipTapSermonHashScriptureRef {
  readonly book: string;
  readonly chapter: number;
  readonly fromVerse: number;
  readonly toVerse: number | null;
  readonly verseContent: string;
}

export interface TipTapSermonHashLocaleInput {
  readonly title?: string;
  readonly sermonDate?: string;
  readonly content?: RichTextDoc | null;
  readonly scriptureReferences?: readonly TipTapSermonHashScriptureRef[];
  readonly preacherName?: string;
  readonly additionalPreacherNames?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractTextIterative(root: unknown): string {
  const parts: string[] = [];
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;

    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
      continue;
    }

    if (Array.isArray(node.content)) {
      for (let i = node.content.length - 1; i >= 0; i -= 1) {
        stack.push(node.content[i]);
      }
    }
  }

  return parts.join("");
}

function extractListItems(listNode: Record<string, unknown>): string[] {
  if (!Array.isArray(listNode.content)) return [];
  const items: string[] = [];
  for (const child of listNode.content) {
    items.push(extractTextIterative(child));
  }
  return items;
}

function extractEmbeddedMediaId(
  node: Record<string, unknown>,
): string | undefined {
  const attrs = isRecord(node.attrs) ? node.attrs : undefined;
  const mediaId = attrs?.mediaId;
  return typeof mediaId === "string" && mediaId.length > 0 ? mediaId : undefined;
}

function topLevelNodeToBlock(
  node: RichTextNode | unknown,
): SermonPdfContentBlock | undefined {
  if (!isRecord(node) || typeof node.type !== "string") return undefined;

  switch (node.type) {
    case "paragraph":
      return { type: "p", text: extractTextIterative(node) };
    case "heading": {
      const level = isRecord(node.attrs) ? node.attrs.level : undefined;
      if (level === 2) return { type: "h2", text: extractTextIterative(node) };
      if (level === 3) return { type: "h3", text: extractTextIterative(node) };
      return undefined;
    }
    case "blockquote":
      return { type: "blockquote", text: extractTextIterative(node) };
    case "bulletList":
      return { type: "ul", items: extractListItems(node) };
    case "orderedList":
      return { type: "ol", items: extractListItems(node) };
    case "embeddedMedia": {
      const assetId = extractEmbeddedMediaId(node);
      return assetId ? { type: "embeddedAsset", assetId } : undefined;
    }
    default:
      return undefined;
  }
}

export function tiptapToContentBlocks(
  doc: RichTextDoc | undefined | null,
): SermonPdfContentBlock[] {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) {
    return [];
  }
  const blocks: SermonPdfContentBlock[] = [];
  for (const node of doc.content) {
    const block = topLevelNodeToBlock(node);
    if (block) blocks.push(block);
  }
  return blocks;
}

interface CanonicalScriptureRef {
  readonly book: { readonly "es-AR": string; readonly "en-US": string };
  readonly chapter: number;
  readonly fromVerse: number;
  readonly toVerse: number | null;
  readonly verseContent: {
    readonly "es-AR": string;
    readonly "en-US": string;
  };
}

function buildCanonicalScripture(
  esRefs: readonly TipTapSermonHashScriptureRef[] | undefined,
  enRefs: readonly TipTapSermonHashScriptureRef[] | undefined,
): CanonicalScriptureRef[] {
  const es = esRefs ?? [];
  const en = enRefs ?? [];
  const length = Math.max(es.length, en.length);
  const refs: CanonicalScriptureRef[] = [];

  for (let i = 0; i < length; i += 1) {
    const esRef = es[i];
    const enRef = en[i];
    const coords = esRef ?? enRef;
    refs.push({
      book: { "es-AR": esRef?.book ?? "", "en-US": enRef?.book ?? "" },
      chapter: coords?.chapter ?? 0,
      fromVerse: coords?.fromVerse ?? 0,
      toVerse: coords?.toVerse ?? null,
      verseContent: {
        "es-AR": esRef?.verseContent ?? "",
        "en-US": enRef?.verseContent ?? "",
      },
    });
  }
  return refs;
}

function buildCanonicalByline(
  sermonEsAR: TipTapSermonHashLocaleInput | undefined,
  sermonEnUS: TipTapSermonHashLocaleInput | undefined,
): string[] {
  const source = sermonEsAR ?? sermonEnUS;
  if (!source || typeof source.preacherName !== "string") return [];
  return [source.preacherName, ...(source.additionalPreacherNames ?? [])];
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`,
  );
  return `{${entries.join(",")}}`;
}

export function computeTipTapSermonContentHash(
  sermonEsAR: TipTapSermonHashLocaleInput | undefined,
  sermonEnUS: TipTapSermonHashLocaleInput | undefined,
): string {
  const canonical = {
    title: {
      "es-AR": sermonEsAR?.title ?? "",
      "en-US": sermonEnUS?.title ?? "",
    },
    sermonDate: sermonEsAR?.sermonDate ?? sermonEnUS?.sermonDate ?? "",
    content: {
      "es-AR": tiptapToContentBlocks(sermonEsAR?.content),
      "en-US": tiptapToContentBlocks(sermonEnUS?.content),
    },
    scripture: buildCanonicalScripture(
      sermonEsAR?.scriptureReferences,
      sermonEnUS?.scriptureReferences,
    ),
    byline: buildCanonicalByline(sermonEsAR, sermonEnUS),
  };
  return createHash("sha256").update(canonicalStringify(canonical)).digest("hex");
}
