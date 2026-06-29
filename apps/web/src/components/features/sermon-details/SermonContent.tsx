import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { articleRichTextOptions } from "@lib/contentful/rich-text-options";
import type { Sermon } from "@src/types/Sermon";
import { buildSermonRichTextOptions } from "./sermonRichTextOptions";

interface SermonContentProps {
  readonly content: Sermon["content"];
  /** Fallback title for embedded audio players (analytics + a11y). */
  readonly audioTitleFallback?: string;
}

export function SermonContent({ content, audioTitleFallback }: SermonContentProps) {
  if (!content?.json) return null;

  const assetBlocks = content.links?.assets?.block ?? [];
  const options = assetBlocks.length
    ? buildSermonRichTextOptions(assetBlocks, audioTitleFallback)
    : articleRichTextOptions;

  let richTextContent = null;
  try {
    richTextContent = documentToReactComponents(content.json, options);
  } catch (error) {
    console.error("Error rendering sermon rich text:", error);
    return null;
  }

  return <div className="rich-text-content">{richTextContent}</div>;
}
