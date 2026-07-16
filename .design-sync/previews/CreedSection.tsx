import { CreedSection } from "@idcr/web";

// Shape: ContentCollection from apps/web/lib/contentful/types.ts, i.e. what
// `mapContentCollection(ourCreedContent)` returns at the real call site
// (apps/web/src/app/[locale]/community/page.tsx:92).
//
// Three things are load-bearing here:
//  1. Each `creedItems[].title` must match a key in the component's own
//     CREED_ICON_MAP (Spanish side: Testimonio / Redención / Misericordia /
//     Unidad / Servicio / "Un lugar de voluntarios" / Vocación) or the card
//     silently falls back to the BookOpen icon.
//  2. StructuredBibleVerse's chapter/fromVerse/toVerse are STRINGS, not
//     numbers — the component interpolates them straight into "Book c:v".
//  3. Every `description` is a RichTextField — `{ json: Document }`, NOT a bare
//     Document. The component reads `.json` off it, so handing it the Document
//     directly makes documentToReactComponents(undefined) return null and every
//     body silently disappears while titles/icons/verses still render.
const rich = (text: string) =>
  ({
    json: {
      nodeType: "document",
      data: {},
      content: [
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: text, marks: [], data: {} }],
        },
      ],
    },
  }) as never;

const creedItems = [
  {
    title: "Testimonio",
    description: rich(
      "Contamos lo que Dios hizo con nosotros. No somos expertos: somos testigos de una gracia que nos alcanzó primero.",
    ),
    bibleVerse: {
      book: "Hechos",
      chapter: "1",
      fromVerse: "8",
      toVerse: null,
      verseContent: "Y serán mis testigos hasta lo último de la tierra.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-1" },
  },
  {
    title: "Redención",
    description: rich(
      "Creemos que Jesús pagó lo que no podíamos pagar. Nuestra identidad no está en lo que logramos, sino en lo que Él terminó en la cruz.",
    ),
    bibleVerse: {
      book: "Efesios",
      chapter: "1",
      fromVerse: "7",
      toVerse: "8",
      verseContent:
        "En él tenemos la redención mediante su sangre, el perdón de nuestros pecados.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-2" },
  },
  {
    title: "Misericordia",
    description: rich(
      "Recibimos misericordia sin merecerla, así que la damos sin medirla. En esta casa nadie tiene que fingir que está bien.",
    ),
    bibleVerse: {
      book: "Joel",
      chapter: "2",
      fromVerse: "13",
      toVerse: null,
      verseContent:
        "Vuélvanse al Señor su Dios, porque él es bondadoso y compasivo, lento para la ira y lleno de amor.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-3" },
  },
  {
    title: "Unidad",
    description: rich(
      "Venimos de barrios, historias y edades distintas. Lo que nos junta no es el parecido: es Cristo.",
    ),
    bibleVerse: {
      book: "Efesios",
      chapter: "4",
      fromVerse: "3",
      toVerse: null,
      verseContent:
        "Esfuércense por mantener la unidad del Espíritu mediante el vínculo de la paz.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-4" },
  },
  {
    title: "Servicio",
    description: rich(
      "Servir no es una tarea extra de la vida cristiana: es la forma que tiene el amor cuando se pone de pie.",
    ),
    bibleVerse: {
      book: "Marcos",
      chapter: "10",
      fromVerse: "45",
      toVerse: null,
      verseContent:
        "Porque ni aun el Hijo del hombre vino para que le sirvan, sino para servir.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-5" },
  },
  {
    title: "Vocación",
    description: rich(
      "Cada persona tiene un llamado. Nuestro trabajo es ayudarte a descubrirlo y acompañarte mientras lo vivís.",
    ),
    bibleVerse: {
      book: "Efesios",
      chapter: "2",
      fromVerse: "10",
      toVerse: null,
      verseContent:
        "Somos hechura de Dios, creados en Cristo Jesús para buenas obras.",
      bibleVersion: "NVI",
    },
    sys: { id: "credo-6" },
  },
];

const content = {
  title: "Nuestro Credo",
  description: rich(
    "Esto es lo que creemos y confesamos juntos cada domingo. No es un reglamento: es la historia que nos sostiene.",
  ),
  creedItems,
  sys: { id: "collection-our-creed" },
} as never;

/** The real community-page composition: header + the full 6-item creed grid. */
export const Default = () => <CreedSection content={content} />;

/** `bibleVerse` is optional per item — without it the card drops its footer rule + citation. */
export const WithoutVerses = () => (
  <CreedSection
    content={
      {
        ...(content as object),
        creedItems: creedItems
          .slice(0, 3)
          .map((item) => ({ ...item, bibleVerse: null })),
      } as never
    }
  />
);

/**
 * A title outside CREED_ICON_MAP ("Hospitalidad") falls back to the default
 * BookOpen icon — the honest render for an editor-invented creed item.
 */
export const IconFallback = () => (
  <CreedSection
    content={
      {
        ...(content as object),
        creedItems: [
          creedItems[0],
          {
            ...creedItems[1],
            title: "Hospitalidad",
            description: rich(
              "Abrimos la mesa antes de abrir el debate. Quien llega es recibido como se recibe a un hermano, no como se evalúa a un visitante.",
            ),
          },
          creedItems[2],
        ],
      } as never
    }
  />
);
