import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { ReactNode } from "react";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-xl md:text-2xl text-gray-700 dark:text-gray-300"
      >
        {children}
      </Typography>
    ),
  },
};

type InfoConnectProps = {
  content: {
    headline: string;
    body: {
       
      json: any;
    };
  };
};

export function InfoConnect({
  content,
}: Readonly<InfoConnectProps>) {
  const bodyText = documentToReactComponents(content?.body.json, options);
  return (
    <div className="bg-gray-50 dark:bg-slate-900/50 transition-colors">
      <Container size="md" className="py-16 text-center sm:py-24">
        {bodyText}
      </Container>
    </div>
  );
}
