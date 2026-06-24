import { CommonNode, Options } from "@contentful/rich-text-react-renderer";
import { BLOCKS, MARKS } from "@contentful/rich-text-types";
import { ReactNode } from "react";
import { Typography } from "@src/components/ui/typography";

export const sectionDescriptionOptions = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <p className="text-muted-foreground text-lg">{children}</p>
    ),
  },
};

export const cardDescriptionOptions = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <p className="text-muted-foreground leading-relaxed">{children}</p>
    ),
  },
};

/**
 * Rich-text render options for article/sermon content fetched from Contentful.
 * This is a user-controlled content surface — the Contentful SDK's rich-text renderer
 * already sanitizes the document tree, so no additional XSS escaping is needed here.
 */
export const articleRichTextOptions: Options = {
  renderMark: {
    [MARKS.BOLD]: (text) => <strong>{text}</strong>,
    [MARKS.ITALIC]: (text) => <em>{text}</em>,
  },
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node, children) => (
      <Typography component="p" variant="body">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_2]: (_node, children) => (
      <Typography component="h2" variant="h2">
        {children}
      </Typography>
    ),
    [BLOCKS.HEADING_3]: (_node, children) => (
      <Typography component="h3" variant="h3">
        {children}
      </Typography>
    ),
    [BLOCKS.QUOTE]: (_node, children) => (
      <Typography component="blockquote" variant="blockquote">
        {children}
      </Typography>
    ),
    [BLOCKS.UL_LIST]: (_node, children) => (
      <ul className="list-disc pl-5 space-y-2 mb-4">
        {children}
      </ul>
    ),
    [BLOCKS.OL_LIST]: (_node, children) => (
      <ol className="list-decimal pl-5 space-y-2 mb-4">
        {children}
      </ol>
    ),
    [BLOCKS.LIST_ITEM]: (_node, children) => (
      <li className="space-y-2">
        {children}
      </li>
    ),
  },
};
