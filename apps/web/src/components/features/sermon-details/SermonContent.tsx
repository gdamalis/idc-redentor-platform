import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { articleRichTextOptions } from "@lib/contentful/rich-text-options";
import type { Sermon } from "@src/types/Sermon";

interface SermonContentProps {
  readonly content: Sermon["content"];
}

export function SermonContent({ content }: SermonContentProps) {
  if (!content?.json) return null;

  let richTextContent = null;
  try {
    richTextContent = documentToReactComponents(
      content.json,
      articleRichTextOptions,
    );
  } catch (error) {
    console.error("Error rendering sermon rich text:", error);
    return null;
  }

  return <div className="rich-text-content">{richTextContent}</div>;
}
