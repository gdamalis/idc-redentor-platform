import { Footer } from "@idcr/web";

// Shape ported from lib/contentful/getFooter.ts, as fed in app/[locale]/layout.tsx.
// The logo is the church's real asset, served absolutely so it loads here.
const content = {
  logo: {
    url: "https://www.idcredentor.org/assets/img/redentor_logo_light.png",
    title: "Iglesia de Cristo Redentor",
  },
  shortDescription:
    "Somos una comunidad cristiana reformada en Buenos Aires que anuncia a Cristo, celebra su gracia y camina junta en la fe.",
  socialLinks: [
    { url: "https://www.instagram.com/idcredentor", platform: "instagram" },
    { url: "https://www.facebook.com/idcredentor", platform: "facebook" },
    { url: "https://www.youtube.com/@idcredentor", platform: "youtube" },
  ],
  location: {
    addressLine1: "Av. Rivadavia 5200",
    neighborhood: "Caballito",
    city: "Ciudad Autónoma de Buenos Aires",
    country: "Argentina",
    googleMapsUrl: "https://maps.google.com/?q=Av.+Rivadavia+5200+Caballito",
  },
};

/** How the footer ships on every page: brand, links, location, socials. */
export const Default = () => <Footer content={content} />;

/** `content.location` is optional — the Visitanos column drops to email only. */
export const WithoutLocation = () => (
  <Footer content={{ ...content, location: undefined }} />
);
