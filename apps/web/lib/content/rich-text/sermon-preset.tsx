import { RICH_TEXT_NODE, type RichTextDoc } from "@idcr/content";
import { PdfDownloadButton } from "@src/components/features/sermon-details/PdfDownloadButton";
import { SermonAudioPlayer } from "@src/components/features/sermon-details/SermonAudioPlayer";
import Image from "next/image";
import type { ReactNode } from "react";
import { articlePreset } from "./presets";
import { renderRichText } from "./render";
import type { RichTextPreset, RichTextView } from "./types";

export interface SermonPresetOptions {
  /** Fallback title for embedded audio players (analytics + a11y). */
  readonly audioTitleFallback?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Iterative scan checking whether a TipTap document contains any `embeddedMedia` node.
 * Sermons without embedded media delegate directly to `articlePreset` (matching
 * `SermonContent.tsx:16-18`).
 */
export function hasEmbeddedMediaNodes(
  doc: RichTextDoc | null | undefined,
): boolean {
  if (!doc || !Array.isArray(doc.content)) return false;
  const stack: unknown[] = [...doc.content];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    if (node.type === RICH_TEXT_NODE.embeddedMedia) return true;
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
  return false;
}

/**
 * Sermon rich-text preset mirroring `buildSermonRichTextOptions` in
 * `apps/web/src/components/features/sermon-details/sermonRichTextOptions.tsx`:
 * - `audio/*` → `<SermonAudioPlayer>`
 * - `application/pdf` → `<PdfDownloadButton>`
 * - `image/*` → `<Image>` with `1200×630` fallbacks
 * - Missing `mediaId` in `media` map → logs warning and renders `null` (never throws)
 */
export function createSermonPreset(
  options: SermonPresetOptions = {},
): RichTextPreset {
  const audioTitleFallback = options.audioTitleFallback ?? "";

  return {
    ...articlePreset,
    profile: "sermon",
    renderEmbeddedMedia: (mediaId, media, key) => {
      if (!media) {
        console.warn("[rich-text] Missing embedded media id:", mediaId);
        return null;
      }

      const contentType = media.contentType ?? "";

      if (contentType.startsWith("audio/")) {
        return (
          <div key={key} className="my-4">
            <SermonAudioPlayer
              src={media.url}
              title={media.title || audioTitleFallback}
            />
          </div>
        );
      }

      if (contentType === "application/pdf") {
        return (
          <div key={key} className="my-4">
            <PdfDownloadButton
              pdfSummary={{ url: media.url, title: media.title }}
              label={media.title || undefined}
            />
          </div>
        );
      }

      if (contentType.startsWith("image/")) {
        return (
          <span key={key} className="my-4 block">
            <Image
              src={media.url}
              alt={media.title || ""}
              width={media.width ?? 1200}
              height={media.height ?? 630}
              className="h-auto w-full rounded-md"
            />
          </span>
        );
      }

      return null;
    },
  };
}

/**
 * Convenience entry point for `SermonContent`: delegates to `articlePreset` when
 * the sermon body embeds no files, or `createSermonPreset` when it does.
 */
export function renderSermonRichText(
  value: RichTextView | null | undefined,
  audioTitleFallback = "",
): ReactNode {
  if (!value?.doc) return null;
  if (!hasEmbeddedMediaNodes(value.doc)) {
    return renderRichText(value, articlePreset);
  }
  return renderRichText(value, createSermonPreset({ audioTitleFallback }));
}
