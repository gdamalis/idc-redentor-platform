/**
 * Church logo asset paths, served from each app's own `public/` directory.
 * The binaries live in `apps/web/public/assets/img/` — OG cards and email
 * templates need absolute URLs to a real file, so they are not bundled here.
 */
export const LOGO = {
  default: "/assets/img/redentor_logo.png",
  light: "/assets/img/redentor_logo_light.png",
  dark: "/assets/img/redentor_logo_dark.png",
  default100: "/assets/img/redentor_logo_100.png",
  light100: "/assets/img/redentor_logo_light_100.png",
  dark100: "/assets/img/redentor_logo_dark_100.png",
} as const;
