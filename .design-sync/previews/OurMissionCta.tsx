import { OurMissionCta } from "@idcr/web";

// Shape from the component's own OurMissionCtaProps; the real call site
// (apps/web/src/app/[locale]/page.tsx:86) feeds it the `our-mission` Section
// straight from Contentful.
//
// This is the homepage hero: a full-bleed `min-h-screen` section with the
// image behind a black gradient, so every string renders in white. The
// "Bienvenido a Casa" eyebrow and the "Unite Este Domingo" button are NOT
// content — they come from the OurMissionCta message namespace.
const doc = (text: string) =>
  ({
    nodeType: "document",
    data: {},
    content: [
      {
        nodeType: "paragraph",
        data: {},
        content: [{ nodeType: "text", value: text, marks: [], data: {} }],
      },
    ],
  }) as never;

const content = {
  headline: "Una iglesia para",
  subHeadline: "los que vuelven a empezar",
  body: {
    json: doc(
      "No hace falta que tengas todo resuelto para entrar. Somos una comunidad que se junta alrededor de Jesús, con las manos abiertas y la historia a cuestas.",
    ),
  },
  ctaText: "Conocé nuestra comunidad",
  targetPage: { slug: "community" },
  image: {
    url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1600&q=80",
    title: "La congregación cantando con las manos levantadas",
  },
  sys: { id: "our-mission" },
} as never;

/** The homepage hero exactly as it ships. */
export const Default = () => <OurMissionCta content={content} />;

/**
 * The headline is split across two lines by construction — `subHeadline`
 * always renders italic on its own line. A longer pair shows the wrap
 * behaviour at the 5xl/7xl serif size.
 */
export const LongHeadline = () => (
  <OurMissionCta
    content={
      {
        ...(content as object),
        headline: "Vení como estás",
        subHeadline: "quedate porque sos amado",
        body: {
          json: doc(
            "Nos reunimos cada domingo a las 11 en Belgrano para cantar, escuchar la Palabra y compartir la mesa. Si es tu primera vez, avisanos: te guardamos un lugar.",
          ),
        },
        ctaText: "Cómo llegar",
        targetPage: { slug: "come-meet-us" },
        image: {
          url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1600&q=80",
          title: "Cuatro amigos abrazados mirando el atardecer",
        },
      } as never
    }
  />
);
