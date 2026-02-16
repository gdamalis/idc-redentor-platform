import { Document } from "@contentful/rich-text-types";

export interface RichTextField {
  json: Document;
}

export interface ContentfulImage {
  url: string;
  title: string;
}

export interface ContentItem {
  title: string;
  description: RichTextField;
  bibleVerse?: RichTextField;
  image?: ContentfulImage;
}

export interface ContentCollection {
  title: string;
  description: RichTextField;
  creedItems: ContentItem[];
}
