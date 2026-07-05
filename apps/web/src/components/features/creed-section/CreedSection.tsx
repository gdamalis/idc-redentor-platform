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
import type { InspectorProps } from "@src/components/shared/contentful-preview/useLivePreview";
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
  content: ContentCollection;
  inspectorProps?: InspectorProps;
}

export const CreedSection = ({
  content,
  inspectorProps,
}: CreedSectionProps) => {
  const description = content.description
    ? documentToReactComponents(
        content.description.json,
        sectionDescriptionOptions,
      )
    : null;

  return (
    <section className="py-24 bg-muted/30">
      <Container>
        {/* SectionHeader doesn't forward extra props to its DOM node — wrap it
            so the inspector attributes still reach the DOM without touching
            SectionHeader's API (it's shared by other callers). */}
        <div
          {...inspectorProps?.({
            entryId: content.sys?.id ?? "",
            fieldId: "title",
          })}
        >
          <SectionHeader title={content.title} description={description} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.creedItems.map((credo, index) => {
            const Icon = CREED_ICON_MAP[credo.title] ?? DEFAULT_ICON;
            const v = credo.bibleVerse;
            const ref = v
              ? `${v.book} ${v.chapter}:${v.toVerse && v.toVerse !== v.fromVerse ? `${v.fromVerse}-${v.toVerse}` : v.fromVerse}`
              : null;
            const bibleVerse = v ? `"${v.verseContent}" (${ref})` : null;

            return (
              // Entry-level inspector granularity for pass 1: wrapping the
              // whole IconCard (rather than threading inspectorProps into
              // IconCard's own API, which is shared by other callers) still
              // lets an editor click through to the right BeliefItem entry.
              // `h-full` on both the wrapper and IconCard preserves the
              // pre-existing equal-card-height grid behavior — without it,
              // IconCard's own box (not the wrapper) would stop stretching
              // to the grid row's height on the non-draft render path.
              <div
                key={credo.title}
                className="h-full"
                {...inspectorProps?.({
                  entryId: credo.sys?.id ?? "",
                  fieldId: "title",
                })}
              >
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
                  {documentToReactComponents(
                    credo.description.json,
                    cardDescriptionOptions,
                  )}
                </IconCard>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
