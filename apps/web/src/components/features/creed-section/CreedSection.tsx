"use client";

import { ComponentType } from "react";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { Container } from "@src/components/ui/container";
import { IconCard } from "@src/components/ui/icon-card";
import { SectionHeader } from "@src/components/ui/section-header";
import {
  sectionDescriptionOptions,
  cardDescriptionOptions,
} from "@lib/contentful/rich-text-options";
import type { ContentCollection } from "@lib/contentful/types";
import {
  MessageCircle,
  Heart,
  Sparkles,
  Users,
  HeartHandshake,
  Home,
  Compass,
  BookOpen,
} from "lucide-react";

/**
 * Maps creed titles (both EN and ES) to Lucide icons.
 * Covers both locales so the correct icon renders regardless of language.
 */
const CREED_ICON_MAP: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  // English
  Testimony: MessageCircle,
  Redemption: Heart,
  Mercy: Sparkles,
  Unity: Users,
  Service: HeartHandshake,
  "A place for volunteers": Home,
  Vocation: Compass,
  // Spanish
  Testimonio: MessageCircle,
  Redención: Heart,
  Misericordia: Sparkles,
  Unidad: Users,
  Servicio: HeartHandshake,
  "Un lugar de voluntarios": Home,
  Vocación: Compass,
};

const DEFAULT_ICON = BookOpen;

interface CreedSectionProps {
  content: ContentCollection;
}

export const CreedSection = ({ content }: CreedSectionProps) => {
  const description = content.description
    ? documentToReactComponents(
        content.description.json,
        sectionDescriptionOptions,
      )
    : null;

  return (
    <section className="py-24 bg-muted/30">
      <Container>
        <SectionHeader title={content.title} description={description} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.creedItems.map((credo, index) => {
            const Icon = CREED_ICON_MAP[credo.title] ?? DEFAULT_ICON;
            const v = credo.bibleVerse;
            const ref = v
              ? `${v.book} ${v.chapter}:${v.toVerse && v.toVerse !== v.fromVerse ? `${v.fromVerse}-${v.toVerse}` : v.fromVerse}`
              : null;
            const bibleVerse = v ? `"${v.verseContent}" (${ref})` : null;

            return (
              <IconCard
                key={credo.title}
                icon={Icon}
                title={credo.title}
                index={index}
                footer={
                  bibleVerse ? (
                    <div className="border-t border-border pt-4 mt-4">
                      <p className="text-sm italic text-muted-foreground/80">
                        {bibleVerse}
                      </p>
                    </div>
                  ) : undefined
                }
              >
                {documentToReactComponents(
                  credo.description.json,
                  cardDescriptionOptions,
                )}
              </IconCard>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
