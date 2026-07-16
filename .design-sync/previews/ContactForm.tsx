import { ContactForm } from "@idcr/web";

// Shape from apps/web/src/components/features/contact-form/types.ts; the field
// list mirrors what getContactForm() returns (fieldsCollection.items → Field[]).
//
// Three things worth knowing:
//  1. `description` is a plain string, not rich text. getTextWithHighlights()
//     splits it on <highlight>…</highlight> and renders any fragment
//     containing "@" as a primary-tinted chip — that's how the email address
//     below becomes a pill.
//  2. `bibleVerse` here takes NUMBERS for chapter/fromVerse/toVerse (unlike
//     ContentCollection's StructuredBibleVerse, which uses strings), because it
//     is spread straight into the shared BibleVerse component.
//  3. The image + verse column is `hidden lg:block` — it only appears at the
//     large breakpoint.
//
// Submission is inert by design: contactFormAction is a "use server" action
// hitting MongoDB + SendGrid and is stubbed by the contact-services shim. The
// markup is real; only the POST is not.
const doc = (nodes: Array<{ text: string; uri?: string }>) =>
  ({
    nodeType: "document",
    data: {},
    content: [
      {
        nodeType: "paragraph",
        data: {},
        content: nodes.map(({ text, uri }) =>
          uri
            ? {
                nodeType: "hyperlink",
                data: { uri },
                content: [{ nodeType: "text", value: text, marks: [], data: {} }],
              }
            : { nodeType: "text", value: text, marks: [], data: {} },
        ),
      },
    ],
  }) as never;

const formFields = [
  {
    name: "Nombre",
    inputId: "name",
    required: true,
    type: "Short text",
    values: [],
    placeholder: "¿Cómo te llamás?",
  },
  {
    name: "Correo electrónico",
    inputId: "email",
    required: true,
    type: "Email",
    values: [],
    placeholder: "tunombre@correo.com",
  },
  {
    name: "Motivo",
    inputId: "subject",
    required: true,
    type: "Dropdown",
    values: [
      "Quiero visitar la iglesia",
      "Pedido de oración",
      "Quiero servir",
      "Consulta general",
    ],
    placeholder: "Elegí una opción",
  },
  {
    name: "Mensaje",
    inputId: "message",
    required: true,
    type: "Long text",
    values: [],
    placeholder: "Contanos en qué podemos acompañarte.",
  },
];

const content = {
  title: "Hablemos",
  description:
    "Escribinos y te respondemos esta semana. Si preferís el correo directo, es <highlight>hola@idcredentor.org</highlight> — nos leemos.",
  ctaText: "Enviar mensaje",
  image: {
    url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=600&q=80",
    title: "Cuatro amigos abrazados mirando el atardecer",
  },
  agreementNote: {
    json: doc([
      { text: "Al enviar este formulario aceptás nuestra " },
      { text: "política de privacidad", uri: "/privacy-policy" },
      { text: ". Nunca compartimos tus datos con terceros." },
    ]),
  },
  bibleVerse: {
    book: "Mateo",
    chapter: 11,
    fromVerse: 28,
    toVerse: 28,
    verseContent:
      "Vengan a mí todos ustedes que están cansados y agobiados, y yo les daré descanso.",
    bibleVersion: "NVI",
  },
  formFields,
} as never;

/** The come-meet-us composition: info column (image + verse) beside the form card. */
export const Default = () => <ContactForm content={content} />;

/**
 * A minimal editor-configured form: only the fields Contentful actually has
 * entries for. Field composition is fully data-driven — the component switches
 * on `field.type`, so dropping the dropdown drops that control entirely.
 */
export const MinimalFields = () => (
  <ContactForm
    content={
      {
        ...(content as object),
        title: "Pedido de oración",
        description:
          "Contanos por qué querés que oremos. Lo leemos sólo los pastores.",
        ctaText: "Enviar pedido",
        formFields: [formFields[0], formFields[1], formFields[3]],
      } as never
    }
  />
);
