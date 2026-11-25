import { renderSermonRichText } from "@lib/content/rich-text";
import type { SermonView } from "@lib/content/types";

interface SermonContentProps {
  readonly content: SermonView["content"];
  /** Fallback title for embedded audio players (analytics + a11y). */
  readonly audioTitleFallback?: string;
}

export function SermonContent({
  content,
  audioTitleFallback,
}: SermonContentProps) {
  if (!content) return null;

  let richTextContent = null;
  try {
    richTextContent = renderSermonRichText(content, audioTitleFallback);
  } catch (error) {
    console.error("Error rendering sermon rich text:", error);
    return null;
  }

  if (!richTextContent) return null;

  return <div className="rich-text-content">{richTextContent}</div>;
}
