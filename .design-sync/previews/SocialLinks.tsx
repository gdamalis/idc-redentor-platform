import { SocialLinks } from "@idcr/web";

// Only facebook / instagram / youtube map to an icon; anything else renders null.
const links = [
  { url: "https://www.instagram.com/idcredentor", platform: "instagram" },
  { url: "https://www.facebook.com/idcredentor", platform: "facebook" },
  { url: "https://www.youtube.com/@idcredentor", platform: "youtube" },
];

/** The default variant — bare grey icons, for use on a light surface. */
export const Default = () => <SocialLinks links={links} />;

/** The footer variant: pill buttons on dark. This is how Footer renders it. */
export const FooterVariant = () => (
  <div className="rounded-xl bg-slate-900 p-6">
    <h3 className="mb-6 font-serif text-lg font-bold text-white">Seguinos</h3>
    <SocialLinks links={links} variant="footer" />
  </div>
);

/**
 * `platform` is matched case-insensitively against the icon map, and an
 * unknown platform is skipped rather than rendering a broken link.
 */
export const UnknownPlatformSkipped = () => (
  <SocialLinks
    links={[
      { url: "https://www.instagram.com/idcredentor", platform: "Instagram" },
      { url: "https://open.spotify.com/", platform: "spotify" },
      { url: "https://www.youtube.com/@idcredentor", platform: "YouTube" },
    ]}
  />
);
