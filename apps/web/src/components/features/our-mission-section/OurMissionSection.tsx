"use client";

import { motion } from "framer-motion";
import { Container } from "@src/components/ui/container";
import { SectionHeader } from "@src/components/ui/section-header";
import {
  cardDescriptionPreset,
  renderRichText,
  sectionDescriptionPreset,
} from "@lib/content/rich-text";
import type { ContentCollectionView } from "@lib/content/types";

interface OurMissionSectionProps {
  readonly content: ContentCollectionView;
}

export const OurMissionSection = ({ content }: OurMissionSectionProps) => {
  const description = content.description
    ? renderRichText(content.description, sectionDescriptionPreset)
    : null;

  return (
    <section className="py-24 bg-background">
      <Container>
        <div>
          <SectionHeader title={content.title} description={description} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(content.creedItems ?? []).map((item, index) => (
            <motion.div
              key={item.sys?.id ?? item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group"
            >
              <h3 className="font-serif text-2xl font-bold mb-3">
                {item.title}
              </h3>

              <div>
                {item.description &&
                  renderRichText(item.description, cardDescriptionPreset)}
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};
