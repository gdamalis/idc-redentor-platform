import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import BibleVerse from "@src/components/shared/bible-verse/BibleVerse";
import { Container } from "@src/components/ui/container";
import { Dropdown, DropDownOption } from "@src/components/ui/dropdown";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { ReactNode } from "react";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="mt-4 text-sm/6 text-gray-500"
      >
        {children}
      </Typography>
    ),
    ["hyperlink"]: (node: CommonNode, children: ReactNode) => {
      return (
        <Link
          href={node.data.uri}
          className="font-semibold text-blue-600"
          target="_blank"
        >
          {children}
        </Link>
      );
    },
  },
};

type Field = {
  name: string;
  inputId: string;
  required: boolean;
  type: string;
  values: string[];
};

function getShortTextInput(data: Field) {
  return (
    <div key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <input
          id={data.inputId}
          required={data.required}
          name={data.inputId}
          type="text"
          autoComplete="given-name"
          className="block w-full rounded-md bg-white px-3.5 py-2 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
        />
      </div>
    </div>
  );
}

function getLongTextInput(data: Field) {
  return (
    <div className="sm:col-span-2" key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <textarea
          id={data.inputId}
          required={data.required}
          name={data.inputId}
          rows={4}
          className="block w-full rounded-md bg-white px-3.5 py-2 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
          defaultValue={""}
        />
      </div>
    </div>
  );
}

function getDropdownField(data: Field) {
  const DropDownOptions: DropDownOption[] = data.values.map((value, index) => ({
    id: String(index),
    value,
  }));

  return (
    <div key={data.inputId}>
      <label
        htmlFor={data.inputId}
        className="block text-sm/6 font-semibold text-gray-900"
      >
        {data.name}
      </label>
      <div className="mt-2.5">
        <Dropdown options={DropDownOptions} />
      </div>
    </div>
  );
}

function getTextWithHighlights(text: string) {
  const styledText = text.split(/<highlight>(.*?)<\/highlight>/g);

  styledText.forEach((value, index) => {
    if (value.includes("@")) {
      styledText[index] = (
        <span
          key={value}
          className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-sm font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10"
        >
          {value}
        </span> // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      return true;
    }

    styledText[index] = (
      <Typography component="p" variant="body1" key={value}>
        {value}
      </Typography> // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  });

  return styledText;
}

type ContactFormProps = {
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

export const ContactForm = ({ content }: ContactFormProps) => {
  const agreementNote = documentToReactComponents(
    content.agreementNote.json,
    options,
  );

  return (
    <div className="relative isolate bg-white dark:bg-gray-900 px-6 py-20 sm:py-32 lg:px-8">
      <Container>
        <Typography
          component="h2"
          variant="h2"
          className="text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl"
        >
          {content.title}
        </Typography>
        <div className="mt-4 flex items-center space-x-1 text-lg/8 text-gray-600">
          {getTextWithHighlights(content.description)}
        </div>
        <div className="mt-8 flex flex-col gap-16 sm:gap-y-20 lg:flex-row">
          <form action="#" method="POST" className="lg:flex-auto">
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              {content.formFields.map((field: Field) => {
                if (field.type === "Short text") {
                  return getShortTextInput(field);
                }

                if (field.type === "Long text") {
                  return getLongTextInput(field);
                }

                if (field.type === "Dropdown") {
                  return getDropdownField(field);
                }

                return null;
              })}
            </div>
            <div className="mt-10">
              <button
                type="submit"
                className="block w-full rounded-md bg-blue-600 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {content.ctaText}
              </button>
            </div>

            {agreementNote}
          </form>
          <div className="lg:mt-6 lg:w-80 lg:flex-none">
            <Image
              src={content.image.url}
              className="w-full h-auto"
              width={600}
              height={800}
              alt={content.image.title}
            />
            <BibleVerse className="mt-4" {...content.bibleVerse} />
          </div>
        </div>
      </Container>
    </div>
  );
};
