import { Document } from "@contentful/rich-text-types";
import type { ContactFormKey } from "@src/i18n/messageKeys/contactForm";
import { Field } from "./formFields";

export type ContactFormProps = {
  content: {
    title: string;
    description: string;
    ctaText: string;
    image: {
      url: string;
      title: string;
    };
    agreementNote: {
      json: Document;
    };
    bibleVerse: {
      book: string;
      chapter: number;
      fromVerse: number;
      toVerse: number;
      verseContent: string;
      bibleVersion: string;
    };
    formFields: Field[];
  };
};

export type ContactFormState = {
  success: boolean;
  messageKey: ContactFormKey;
};
