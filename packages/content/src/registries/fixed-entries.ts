import type { Localized } from "../model/localized";
import type { GlobalKind } from "../schemas/globals";
import type { SectionLayout } from "../schemas/common";
import { SITE_PAGE_SLUGS, type SitePageSlug } from "./pages";

export const FIXED_ENTRY_TYPES = [
  "section",
  "beliefCollection",
  "eventBanner",
  "seoEntry",
  "global",
] as const;

export type FixedEntryType = (typeof FIXED_ENTRY_TYPES)[number];

export interface FixedEntryMeta {
  type: FixedEntryType;
  machineName: string;
  name: Required<Localized<string>>;
  appearsOn: readonly SitePageSlug[];
  previewPage: SitePageSlug;
  /** Read-only layout for `section` entries. */
  layout?: SectionLayout;
  /** Discriminator kind for `global` entries. */
  globalKind?: GlobalKind;
}

const ALL_SITE_PAGES = SITE_PAGE_SLUGS;

/**
 * Registry of every fixed entry the site reads today (enumerated from the real getter call sites
 * in `apps/web/src/app/[locale]/**`, never from test mocks; `seo-predicas` is dead and omitted).
 *
 * Drives admin lists, preview routing, and server-side guards: an entry in the database that is
 * not in this registry is not shown (F-editor-ux §2.8).
 */
export const FIXED_ENTRIES = [
  // ── Sections ──────────────────────────────────────────────────────────────
  {
    type: "section",
    machineName: "our-mission",
    layout: "hero",
    name: { "es-AR": "Portada: nuestra misión", "en-US": "Hero: our mission" },
    appearsOn: ["home"],
    previewPage: "home",
  },
  {
    type: "section",
    machineName: "connect-with-us",
    layout: "cta",
    name: {
      "es-AR": "Llamado a la acción: conectate",
      "en-US": "Call to action: connect with us",
    },
    appearsOn: ["home", "blog", "predicas", "community"],
    previewPage: "home",
  },
  {
    type: "section",
    machineName: "info-community",
    layout: "textBlock",
    name: { "es-AR": "Comunidad: información", "en-US": "Community: info" },
    appearsOn: ["community"],
    previewPage: "community",
  },
  {
    type: "section",
    machineName: "info-connect",
    layout: "textBlock",
    name: { "es-AR": "Conocenos: información", "en-US": "Come meet us: info" },
    appearsOn: ["come-meet-us"],
    previewPage: "come-meet-us",
  },

  // ── Belief collections (protected by type) ────────────────────────────────
  {
    type: "beliefCollection",
    machineName: "collection-our-mission",
    name: {
      "es-AR": "Nuestra misión y valores",
      "en-US": "Our mission and values",
    },
    appearsOn: ["home", "community"],
    previewPage: "home",
  },
  {
    type: "beliefCollection",
    machineName: "our-creed",
    name: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
    appearsOn: ["community"],
    previewPage: "community",
  },

  // ── Event banner ──────────────────────────────────────────────────────────
  {
    type: "eventBanner",
    machineName: "event-sunday-meetings",
    name: { "es-AR": "Reuniones de los domingos", "en-US": "Sunday meetings" },
    appearsOn: ["come-meet-us"],
    previewPage: "come-meet-us",
  },

  // ── SEO entries (`seo-predicas` intentionally omitted) ────────────────────
  {
    type: "seoEntry",
    machineName: "seo-home",
    name: { "es-AR": "SEO: Inicio", "en-US": "SEO: Home" },
    appearsOn: ["home"],
    previewPage: "home",
  },
  {
    type: "seoEntry",
    machineName: "seo-who-is-jesus",
    name: { "es-AR": "SEO: ¿Quién es Jesús?", "en-US": "SEO: Who is Jesus?" },
    appearsOn: ["who-is-jesus"],
    previewPage: "who-is-jesus",
  },
  {
    type: "seoEntry",
    machineName: "seo-community",
    name: { "es-AR": "SEO: Comunidad", "en-US": "SEO: Community" },
    appearsOn: ["community"],
    previewPage: "community",
  },
  {
    type: "seoEntry",
    machineName: "seo-connect",
    name: { "es-AR": "SEO: Conocenos", "en-US": "SEO: Come Meet Us" },
    appearsOn: ["come-meet-us"],
    previewPage: "come-meet-us",
  },
  {
    type: "seoEntry",
    machineName: "seo-blog",
    name: { "es-AR": "SEO: Blog", "en-US": "SEO: Blog" },
    appearsOn: ["blog"],
    previewPage: "blog",
  },

  // ── Globals ───────────────────────────────────────────────────────────────
  {
    type: "global",
    globalKind: "navigationMenu",
    machineName: "main-menu",
    name: { "es-AR": "Menú principal", "en-US": "Main menu" },
    appearsOn: ALL_SITE_PAGES,
    previewPage: "home",
  },
  {
    type: "global",
    globalKind: "footer",
    machineName: "footer",
    name: { "es-AR": "Pie de página", "en-US": "Footer" },
    appearsOn: ALL_SITE_PAGES,
    previewPage: "home",
  },
  {
    type: "global",
    globalKind: "singleEmailForm",
    machineName: "single-email-subscribe",
    name: {
      "es-AR": "Suscripción por correo",
      "en-US": "Email newsletter signup",
    },
    appearsOn: ALL_SITE_PAGES,
    previewPage: "home",
  },
  {
    type: "global",
    globalKind: "contactForm",
    machineName: "contact-form",
    name: { "es-AR": "Formulario de contacto", "en-US": "Contact form" },
    appearsOn: ["come-meet-us"],
    previewPage: "come-meet-us",
  },
  {
    type: "global",
    globalKind: "location",
    machineName: "location",
    name: { "es-AR": "Dirección y mapa", "en-US": "Address and map" },
    appearsOn: ALL_SITE_PAGES,
    previewPage: "come-meet-us",
  },
] as const satisfies readonly FixedEntryMeta[];

export function findFixedEntry(
  type: FixedEntryType,
  machineName: string,
): FixedEntryMeta | undefined {
  return FIXED_ENTRIES.find(
    (entry) => entry.type === type && entry.machineName === machineName,
  );
}

export function isRegisteredFixedEntry(
  type: FixedEntryType,
  machineName: string,
): boolean {
  return findFixedEntry(type, machineName) !== undefined;
}

export function getFixedEntriesByType(
  type: FixedEntryType,
): readonly FixedEntryMeta[] {
  return FIXED_ENTRIES.filter((entry) => entry.type === type);
}
