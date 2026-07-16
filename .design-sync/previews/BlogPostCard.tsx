import { BlogPostCard } from "@idcr/web";

// Shape from apps/web/src/types/BlogPost.ts. The card only reads
// title / subtitle / category / slug / featuredImage / author.name /
// publishedDate — `content` (the rich-text body + links) is required by the
// type but never touched here, hence the cast rather than a 40-line fixture.
//
// `category` must be one of the three keys the card looks up in the
// BlogPost.categories namespace ("Events" | "Spiritual Growth" | "Community"),
// otherwise the badge falls back to the raw English string. One cell per
// category, so all three badge strings are covered across this sheet.
const basePost = {
  title: "Volver al primer amor",
  subtitle:
    "Una reflexión sobre Apocalipsis 2 y lo que significa recuperar la pasión por Cristo cuando la rutina se lleva la ternura.",
  category: "Spiritual Growth",
  slug: "volver-al-primer-amor",
  publishedDate: "2025-06-08",
  author: {
    name: "Pastor Juan",
    email: "juan@idcredentor.org",
    avatar: {
      url: "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=200&q=80",
      title: "Retrato",
    },
  },
  featuredImage: {
    url: "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=780&q=80",
    title: "Vitrales del templo iluminados",
  },
  seoTitle: "Volver al primer amor",
  seoDescription: "Una reflexión sobre Apocalipsis 2.",
  keywords: [],
  sys: { id: "post-1" },
} as never;

const communityPost = {
  ...(basePost as object),
  title: "Amigos que se volvieron familia",
  subtitle:
    "Tres historias de gente que llegó sin conocer a nadie y hoy no se pierde un domingo. Así se teje una comunidad.",
  category: "Community",
  slug: "amigos-que-se-volvieron-familia",
  publishedDate: "2025-05-25",
  author: {
    name: "Ana Beltrán",
    email: "ana@idcredentor.org",
    avatar: {
      url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=200&q=80",
      title: "Retrato",
    },
  },
  featuredImage: {
    url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=780&q=80",
    title: "Cuatro amigos abrazados mirando el atardecer",
  },
  sys: { id: "post-2" },
} as never;

const eventPost = {
  ...(basePost as object),
  title: "Noche de alabanza: sábado 21 de junio",
  subtitle:
    "Una noche entera para cantar juntos. Traé a quien quieras: las puertas abren 19:30 y no se cobra entrada.",
  category: "Events",
  slug: "noche-de-alabanza-21-de-junio",
  publishedDate: "2025-05-10",
  author: {
    name: "Pastor Martín",
    email: "martin@idcredentor.org",
    avatar: {
      url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=200&q=80",
      title: "Retrato",
    },
  },
  featuredImage: {
    url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=780&q=80",
    title: "La congregación cantando con las manos levantadas",
  },
  sys: { id: "post-3" },
} as never;

/** The default card: image + category badge, date/author meta, title, subtitle, "Leer más". */
export const Default = () => (
  <div className="max-w-sm">
    <BlogPostCard post={basePost} />
  </div>
);

/** `category` is optional — with none, the badge over the image is absent. */
export const WithoutCategory = () => (
  <div className="max-w-sm">
    <BlogPostCard post={{ ...(basePost as object), category: undefined } as never} />
  </div>
);

/**
 * How the card is actually used: the responsive grid in BlogSection.tsx.
 * Two cards, because the real `lg:grid-cols-3` never applies at this cell's
 * width — a third card would wrap to a second row and be clipped by the cell.
 * This also exercises equal-height behaviour across unequal subtitle lengths.
 */
export const Grid = () => (
  <div className="grid gap-6 sm:grid-cols-2">
    <BlogPostCard post={communityPost} index={0} />
    <BlogPostCard post={eventPost} index={1} />
  </div>
);
