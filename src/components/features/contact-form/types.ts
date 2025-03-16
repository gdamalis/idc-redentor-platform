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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: any;
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
  message: string;
}; 