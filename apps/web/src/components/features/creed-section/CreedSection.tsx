"use client";

import { ComponentType } from "react";
import { Container } from "@src/components/ui/container";
import { IconCard } from "@src/components/ui/icon-card";
import { SectionHeader } from "@src/components/ui/section-header";
import {
  cardDescriptionPreset,
  renderRichText,
  sectionDescriptionPreset,
} from "@lib/content/rich-text";
import type { ContentCollectionView } from "@lib/content/types";
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
const CREED_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
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
  readonly content: ContentCollectionView;
}

export const CreedSection = ({ content }: CreedSectionProps) => {
  const description = content.description
    ? renderRichText(content.description, sectionDescriptionPreset)
    : null;

  return (
    <section className="py-24 bg-muted/30">
      <Container>
        <div>
          <SectionHeader title={content.title} description={description} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {(content.creedItems ?? []).map((credo, index) => {
            const Icon = CREED_ICON_MAP[credo.title] ?? DEFAULT_ICON;
            const v = credo.bibleVerse;
            const ref = v
              ? `${v.book} ${v.chapter}:${v.toVerse && v.toVerse !== v.fromVerse ? `${v.fromVerse}-${v.toVerse}` : v.fromVerse}`
              : null;
            const bibleVerse = v ? `"${v.verseContent}" (${ref})` : null;

            return (
              <div key={credo.sys?.id ?? credo.title} className="h-full">
                <IconCard
                  icon={Icon}
                  title={credo.title}
                  index={index}
                  className="h-full"
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
                  {credo.description
                    ? renderRichText(credo.description, cardDescriptionPreset)
                    : null}
                </IconCard>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
