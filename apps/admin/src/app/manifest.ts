import type { MetadataRoute } from "next";

/**
 * Served at `/manifest.webmanifest`. Deliberately NOT localized: this file
 * sits above the `[locale]` segment and the browser fetches it once without
 * locale context, so it uses the default locale (es-AR).
 *
 * No service worker ships with this — one is not required for installability
 * (MDN, verified 2026-07-29); offline support is its own ticket.
 *
 * NOTE: `proxy.ts` must let `/manifest.webmanifest` through unauthenticated,
 * or the browser never sees this file. See `isSafeAssetPath`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IDC Redentor · Panel de Administración",
    short_name: "IDCR Admin",
    description:
      "Panel de administración del ministerio — Iglesia de Cristo Redentor",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0059b3",
    icons: [
      { src: "/assets/img/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/assets/img/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
