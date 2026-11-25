import type { Localized } from "../model/localized";

/**
 * The site's routable top-level pages.
 * Used for `section.targetPage`, `navigationMenu` links, and `FIXED_ENTRIES.appearsOn`/`previewPage`.
 */
export const SITE_PAGE_SLUGS = [
  "home",
  "who-is-jesus",
  "community",
  "come-meet-us",
  "blog",
  "predicas",
] as const;

export type SitePageSlug = (typeof SITE_PAGE_SLUGS)[number];

export interface SitePageEntry {
  slug: SitePageSlug;
  /** Locale-relative route path ("" for home). */
  path: string;
  label: Required<Localized<string>>;
}

export const SITE_PAGES = {
  home: {
    slug: "home",
    path: "",
    label: { "es-AR": "Inicio", "en-US": "Home" },
  },
  "who-is-jesus": {
    slug: "who-is-jesus",
    path: "/who-is-jesus",
    label: { "es-AR": "¿Quién es Jesús?", "en-US": "Who is Jesus?" },
  },
  community: {
    slug: "community",
    path: "/community",
    label: { "es-AR": "Comunidad", "en-US": "Community" },
  },
  "come-meet-us": {
    slug: "come-meet-us",
    path: "/come-meet-us",
    label: { "es-AR": "Conocenos", "en-US": "Come Meet Us" },
  },
  blog: {
    slug: "blog",
    path: "/blog",
    label: { "es-AR": "Blog", "en-US": "Blog" },
  },
  predicas: {
    slug: "predicas",
    path: "/predicas",
    label: { "es-AR": "Prédicas", "en-US": "Sermons" },
  },
} as const satisfies Record<SitePageSlug, SitePageEntry>;

export function isSitePageSlug(value: string): value is SitePageSlug {
  return Object.prototype.hasOwnProperty.call(SITE_PAGES, value);
}
