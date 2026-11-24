import { BLOCKS, INLINES, type Document } from "@contentful/rich-text-types";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContactForm } from "@src/components/features/contact-form/ContactForm";
import { OurMissionCta } from "@src/components/features/our-mission-cta/OurMissionCta";
import {
  contactFormAgreementPreset,
  convertContentfulRichText,
  ourMissionCtaPreset,
  renderRichText,
  type RichTextView,
} from "../index";
import { normalizeHtmlForParity } from "./parity-helpers";

vi.mock("@src/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    target?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

vi.mock("@src/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

const MESSAGES = {
  OurMissionCta: {
    "welcome-home": "Bienvenido a casa",
    "join-us-sunday": "Sumate el domingo",
  },
  ContactForm: {
    heading: "Escribinos",
  },
  "contact-form": {
    "form-heading": "Escribinos",
  },
};

function ClientMissionCtaSlot({ body }: { body: RichTextView }) {
  return <div data-testid="new-mission-body">{renderRichText(body, ourMissionCtaPreset)}</div>;
}

function ClientContactAgreementSlot({ agreementNote }: { agreementNote: RichTextView }) {
  return (
    <div data-testid="new-agreement-note">
      {renderRichText(agreementNote, contactFormAgreementPreset)}
    </div>
  );
}

describe("Client-component safety & parity (AC5)", () => {
  it("contains zero server-only, node:*, database, or next/headers imports across lib/content/rich-text", () => {
    const richTextDir = path.resolve(__dirname, "..");
    const sourceFiles = readdirSync(richTextDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => path.join(richTextDir, f));

    expect(sourceFiles.length).toBeGreaterThanOrEqual(5);

    const forbiddenImports = [
      /["']server-only["']/,
      /["']node:/,
      /["']mongodb["']/,
      /["']next\/headers["']/,
      /["']next\/cache["']/,
      /@tiptap\/static-renderer/,
    ];

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbiddenImports) {
        expect(
          content,
          `${path.basename(file)} must not import ${pattern}`,
        ).not.toMatch(pattern);
      }
    }
  });

  it("renders identically inside the OurMissionCta client component slot", () => {
    const cfBody: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [
            {
              nodeType: "text",
              value: "Amamos a Dios y servimos a nuestra ciudad.",
              marks: [],
              data: {},
            },
          ],
        },
      ],
    };

    const converted = convertContentfulRichText(cfBody, { profile: "inline" });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const rendered = render(
      <NextIntlClientProvider locale="es-AR" messages={MESSAGES}>
        <OurMissionCta
          content={{
            headline: "Iglesia",
            subHeadline: "Redentor",
            body: { doc: converted.doc, media: {} },
            ctaText: "Conocenos",
            targetPage: { slug: "community" },
            image: { title: "Hero", url: "https://example.org/hero.jpg" },
            imagesCollection: { items: [] },
            sys: { id: "sec-1" },
            __typename: "Section",
          }}
        />
      </NextIntlClientProvider>,
    );
    const renderedParagraph = rendered.container.querySelector(
      "p.text-lg.md\\:text-xl",
    );
    expect(renderedParagraph).not.toBeNull();

    const next = render(
      <ClientMissionCtaSlot body={{ doc: converted.doc, media: {} }} />,
    );
    const nextWrapper = next.getByTestId("new-mission-body");

    expect(normalizeHtmlForParity(nextWrapper.innerHTML)).toBe(
      normalizeHtmlForParity(renderedParagraph!.outerHTML),
    );
  });

  it("renders identically inside the ContactForm client component agreement-note slot", () => {
    const cfAgreement: Document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [
            {
              nodeType: "text",
              value: "Al enviar aceptás nuestra ",
              marks: [],
              data: {},
            },
            {
              nodeType: INLINES.HYPERLINK,
              data: { uri: "https://idcredentor.com/es-AR/privacy-policy" },
              content: [
                {
                  nodeType: "text",
                  value: "política de privacidad",
                  marks: [],
                  data: {},
                },
              ],
            },
            { nodeType: "text", value: ".", marks: [], data: {} },
          ],
        },
      ],
    };

    const converted = convertContentfulRichText(cfAgreement, {
      profile: "inlineLink",
    });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const rendered = render(
      <NextIntlClientProvider locale="es-AR" messages={MESSAGES}>
        <ContactForm
          content={{
            title: "Contacto",
            description: "Escribinos",
            ctaText: "Enviar",
            image: { url: "https://example.org/img.jpg", title: "Img" },
            agreementNote: { doc: converted.doc, media: {} },
            bibleVerse: {
              book: "Salmos",
              chapter: "23",
              fromVerse: "1",
              toVerse: "1",
              verseContent: "El Señor es mi pastor.",
              bibleVersion: "NVI",
            },
            formFields: [],
          }}
        />
      </NextIntlClientProvider>,
    );
    const renderedAgreement = rendered.container.querySelector("form > p");
    expect(renderedAgreement).not.toBeNull();

    const next = render(
      <NextIntlClientProvider locale="es-AR" messages={MESSAGES}>
        <ClientContactAgreementSlot
          agreementNote={{ doc: converted.doc, media: {} }}
        />
      </NextIntlClientProvider>,
    );
    const nextWrapper = next.getByTestId("new-agreement-note");

    expect(normalizeHtmlForParity(nextWrapper.innerHTML)).toBe(
      normalizeHtmlForParity(renderedAgreement!.outerHTML),
    );
  });
});
