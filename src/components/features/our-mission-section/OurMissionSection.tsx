"use client";

import { motion } from "framer-motion";
import { CommonNode, documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { BLOCKS, Document } from "@contentful/rich-text-types";
import { Container } from "@src/components/ui/container";
import { ReactNode } from "react";

type ValueItem = {
  title: string;
  description: {
    json: Document;
  };
  bibleVerse?: {
    json: Document;
  };
  image?: {
    url: string;
    title: string;
  };
};

type OurMissionSectionProps = {
  content: {
    title: string;
    description: {
      json: Document;
    };
    creedItems: ValueItem[];
  };
};

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <p className="text-muted-foreground text-lg">{children}</p>
    ),
  },
};

const descriptionOptions = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (_node: CommonNode, children: ReactNode) => (
      <p className="text-muted-foreground leading-relaxed">{children}</p>
    ),
  },
};

export const OurMissionSection = ({ content }: OurMissionSectionProps) => {
  const description = content.description
    ? documentToReactComponents(content.description.json, options)
    : null;

  return (
    <section className="py-24 bg-background">
      <Container>
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-serif text-4xl font-bold mb-4 text-foreground">
            {content.title}
          </h2>
          <div className="h-1 w-20 bg-primary mx-auto rounded-full mb-6" />
          {description}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {content.creedItems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group"
            >
              {/* Placeholder icon container - to be replaced with actual icons later */}
              {/* <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary transition-colors text-primary">
                <div className="w-7 h-7 bg-primary/20 rounded-full group-hover:bg-white/20" />
              </div> */}
              
              <h3 className="font-serif text-2xl font-bold mb-3">{item.title}</h3>
              
              {item.description &&
                documentToReactComponents(
                  item.description.json,
                  descriptionOptions
                )}
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};
