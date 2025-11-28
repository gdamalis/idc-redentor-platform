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
import { Mail, MapPin, Phone, Clock } from "lucide-react";
import { Card } from "@src/components/ui/card";
import { Button } from "@src/components/ui/button";

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
        className="mt-4 text-sm/6 text-muted-foreground"
      >
        {children}
      </Typography>
    ),
    ["hyperlink"]: (node: CommonNode, children: ReactNode) => {
      return (
        <Link
          href={node.data.uri}
          className="font-semibold text-primary hover:underline"
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
    <div className="relative isolate bg-background py-20 sm:py-32">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
          {/* Info Side */}
          <div className="space-y-12">
            <div>
              <Typography
                component="h2"
                variant="h1"
                className="font-serif text-5xl font-bold mb-6 text-foreground"
              >
                {content.title}
              </Typography>
              <div className="text-xl text-muted-foreground leading-relaxed">
                {getTextWithHighlights(content.description)}
              </div>
            </div>

            {content.image && (
              <div className="hidden lg:block">
                <Image
                  src={content.image.url}
                  className="w-full h-auto rounded-2xl shadow-lg"
                  width={600}
                  height={800}
                  alt={content.image.title}
                />
                {content.bibleVerse && (
                  <div className="mt-6">
                    <BibleVerse {...content.bibleVerse} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form Side */}
          <div>
            <Card className="bg-card border border-border rounded-3xl p-8 shadow-lg">
              <Typography
                component="h3"
                variant="h2"
                className="font-serif text-2xl font-bold mb-6 text-foreground"
              >
                Send us a Message
              </Typography>
              
              <form action={formAction} className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
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
                    className={`p-4 rounded-lg ${
                      state.success
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {state.message}
                  </div>
                )}

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-full text-lg h-12"
                  size="lg"
                >
                  {isPending ? <LoadingSpinner size="sm" /> : content.ctaText}
                </Button>

                {/* Agreement note */}
                {agreementNote}
              </form>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
};
