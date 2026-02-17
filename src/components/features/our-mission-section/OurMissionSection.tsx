"use client";

import { motion } from "framer-motion";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { Container } from "@src/components/ui/container";
import { SectionHeader } from "@src/components/ui/section-header";
import {
  sectionDescriptionOptions,
  cardDescriptionOptions,
} from "@lib/contentful/rich-text-options";
import type { ContentCollection } from "@lib/contentful/types";

interface OurMissionSectionProps {
  content: ContentCollection;
}

export const OurMissionSection = ({ content }: OurMissionSectionProps) => {
  const description = content.description
    ? documentToReactComponents(
        content.description.json,
        sectionDescriptionOptions,
      )
    : null;

  return (
    <section className="py-24 bg-background">
      <Container>
        <SectionHeader title={content.title} description={description} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {content.creedItems.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group"
            >
              <h3 className="font-serif text-2xl font-bold mb-3">
                {item.title}
              </h3>

              {item.description &&
                documentToReactComponents(
                  item.description.json,
                  cardDescriptionOptions,
                )}
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};
