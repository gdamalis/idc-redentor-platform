import { Document } from "@contentful/rich-text-types";

export interface RichTextField {
  json: Document;
}

export interface ContentfulImage {
  url: string;
  title: string;
}

export const BELIEF_KIND = {
  Creed: "Creed",
  Value: "Value",
} as const;

export type BeliefKind = (typeof BELIEF_KIND)[keyof typeof BELIEF_KIND];

export interface ContentItem {
  title: string;
  description: RichTextField;
  bibleVerse?: RichTextField;
  image?: ContentfulImage;
  kind?: BeliefKind;
}

export interface ContentCollection {
  title: string;
  description: RichTextField;
  creedItems: ContentItem[];
}
