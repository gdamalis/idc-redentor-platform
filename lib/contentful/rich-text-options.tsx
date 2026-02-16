import { CommonNode } from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import { ReactNode } from "react";

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
