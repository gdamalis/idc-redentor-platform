import { SermonCard } from "@idcr/web";

// Fixture ported from the repo's own test:
// apps/web/src/components/features/sermon-section/SermonCard.test.tsx
// (image swapped for one that actually loads in a preview).
const baseSermon = {
  title: "La gracia de Dios",
  slug: "la-gracia-de-dios",
  sermonDate: "2025-06-01",
  preacher: { name: "Pastor Juan", email: "juan@example.com" },
  audioLanguages: ["es-AR"],
  thesis:
    "La gracia es suficiente: no llegamos a Dios por nuestro mérito, sino por su favor inmerecido.",
  mainPoints: [],
  excerpt: "Un mensaje sobre la gracia.",
  featuredImage: {
    url: "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=780&q=80",
    title: "Vitrales de la capilla",
  },
  seoTitle: "La gracia de Dios",
  seoDescription: "Un mensaje sobre la gracia.",
  keywords: [],
  sys: { id: "abc123" },
} as never;

const withAudio = {
  ...(baseSermon as object),
  title: "Vivir en comunidad",
  slug: "vivir-en-comunidad",
  sermonDate: "2025-05-18",
  preacher: { name: "Pastor Martín", email: "martin@example.com" },
  thesis: "La iglesia no es un edificio: es un pueblo que camina junto.",
  audio: { url: "https://example.com/audio.mp3", title: "Audio" },
  featuredImage: {
    url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=780&q=80",
    title: "Personas conversando",
  },
} as never;

export const Default = () => (
  <div className="max-w-sm">
    <SermonCard sermon={baseSermon} />
  </div>
);

/** The play badge (top-right) only renders when `sermon.audio` is present. */
export const WithAudio = () => (
  <div className="max-w-sm">
    <SermonCard sermon={withAudio} />
  </div>
);

/**
 * How the card is actually used on the site — a responsive grid.
 *
 * TWO cards, not three: `lg:grid-cols-3` never applies at preview-cell width, so
 * a third card wraps onto a second row and clips at the cell boundary.
 */
export const Grid = () => (
  <div className="grid gap-6 sm:grid-cols-2">
    <SermonCard sermon={baseSermon} index={0} />
    <SermonCard sermon={withAudio} index={1} />
  </div>
);
