import { PhotoGrid } from "@idcr/web";

// Composition ported from the real call site:
// apps/web/src/app/[locale]/community/page.tsx:79 — images come from
// InfoCommunity's `imagesCollection.items`, caption from the
// `Community.photo-grid-caption` message ("Vida en Comunidad").
//
// The component slices to the first 4 images and lays them out as a fixed
// mosaic: [0] large (2x2, carries the caption overlay), [1] small, [2] tall
// (1x2), [3] small.
const images = [
  {
    url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200&q=80",
    title: "Cuatro amigos abrazados mirando el atardecer",
  },
  {
    url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=780&q=80",
    title: "La congregación cantando en una noche de alabanza",
  },
  {
    url: "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=780&q=80",
    title: "Los vitrales del templo iluminados",
  },
  {
    url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=780&q=80",
    title: "Un grupo sentado, compartiendo la tarde",
  },
];

/** The real community-page composition: four images + the caption overlay. */
export const Default = () => <PhotoGrid images={images} caption="Vida en Comunidad" />;

/** `caption` is optional — without it the large tile loses its gradient overlay. */
export const WithoutCaption = () => <PhotoGrid images={images} />;

/**
 * Fewer than four images: each tile is guarded individually, so the mosaic
 * keeps its shape and simply leaves the missing cells empty.
 */
export const TwoImages = () => (
  <PhotoGrid images={images.slice(0, 2)} caption="Vida en Comunidad" />
);
