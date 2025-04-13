"use client";

import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import BibleVerse from "@src/components/shared/bible-verse/BibleVerse";
import { Container } from "@src/components/ui/container";
import LoadingSpinner from "@src/components/ui/LoadingSpinner";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { ReactNode, useActionState } from "react";

import { handleContactFormSubmission } from "./contactFormAction";
import {
  getDropdownField,
  getEmailInput,
  getLongTextInput,
  getShortTextInput,
  getTextWithHighlights,
} from "./formFields";
import { getRequiredFields } from "./formUtils";
import { ContactFormProps, ContactFormState } from "./types";

/**
 * Rich text rendering options for the agreement note
 */
const richTextOptions = {
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

export const ContactForm = ({ content }: ContactFormProps) => {
  const agreementNote = documentToReactComponents(
    content.agreementNote.json,
    richTextOptions,
  );

  const requiredFields = getRequiredFields(content.formFields);

  const [state, formAction, isPending] = useActionState<
    ContactFormState | null,
    FormData
  >(
    (currentState, formData) =>
      handleContactFormSubmission(currentState, formData, requiredFields),
    null,
  );

  return (
    <div className="relative isolate px-6 py-20 sm:py-32 lg:px-8 border-t border-gray-900/5">
      <Container>
        {/* Header section */}
        <Typography
          component="h2"
          variant="h1"
          className="mb-2 text-pretty text-3xl md:text-4xl"
        >
          {content.title}
        </Typography>
        <div className="mt-4  items-center gap-2 text-lg/8 text-gray-600">
          {getTextWithHighlights(content.description)}
        </div>

        {/* Form and image section */}
        <div className="mt-8 flex flex-col gap-16 sm:gap-y-20 lg:flex-row">
          <form action={formAction} className="lg:flex-auto">
            {/* Form fields */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              {content.formFields.map((field) => {
                if (field.type === "Short text") {
                  return getShortTextInput(field);
                }

                if (field.type === "Email") {
                  return getEmailInput(field);
                }

                if (field.type === "Dropdown") {
                  return getDropdownField(field);
                }

                if (field.type === "Long text") {
                  return getLongTextInput(field);
                }
              })}
            </div>

            {/* Feedback message */}
            {state?.message && (
              <div
                className={`mt-4 p-3 rounded ${state.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
              >
                {state.message}
              </div>
            )}

            {/* Submit button */}
            <div className="mt-10">
              <button
                type="submit"
                disabled={isPending}
                className="block w-full rounded-md bg-blue-600 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
              >
                {isPending ? <LoadingSpinner size="sm" /> : content.ctaText}
              </button>
            </div>

            {/* Agreement note */}
            {agreementNote}
          </form>

          {/* Right side content */}
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
