import { SubscribeBanner } from "@idcr/web";

// Shape ported from lib/contentful/getSingleEmailForm.ts — the
// "single-email-subscribe" entry, as fed in app/[locale]/layout.tsx.
const content = {
  title: "Recibí nuestro boletín",
  shortDescription:
    "Novedades de la iglesia, prédicas y actividades, una vez por mes en tu correo.",
  inputPlaceholder: "tu@correo.com",
  ctaText: "Suscribirme",
  successMessage: "¡Listo! Ya estás suscripto a nuestro boletín.",
};

/** How it ships: a full-bleed strip between the page content and the footer. */
export const Default = () => <SubscribeBanner content={content} />;

/**
 * Editors set this copy in Contentful with no length limit, so the banner has
 * to hold up when the title and description run long.
 */
export const LongCopy = () => (
  <SubscribeBanner
    content={{
      ...content,
      title: "Sumate a la comunidad de Cristo Redentor",
      shortDescription:
        "Enterate de las prédicas, los encuentros de comunión y las actividades de la iglesia antes que nadie. Podés darte de baja cuando quieras.",
    }}
  />
);
