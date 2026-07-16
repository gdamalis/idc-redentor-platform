import { Navbar } from "@idcr/web";

// The real menu shape — apps/web/src/types/MenuItem.ts — as fed by
// getNavigationMenu("main-menu", locale) in app/[locale]/layout.tsx.
const menuItems = [
  { groupLink: { slug: "who-is-jesus" }, groupName: "¿Quién es Jesús?" },
  { groupLink: { slug: "community" }, groupName: "Comunidad" },
  { groupLink: { slug: "predicas" }, groupName: "Prédicas" },
  { groupLink: { slug: "blog" }, groupName: "Blog" },
] as never;

/**
 * Navbar is `position: fixed`, so it would otherwise pin itself to the viewport
 * and escape this cell. A transform makes this wrapper the containing block for
 * fixed descendants, which scopes the navbar to the frame.
 *
 * The height is inline rather than a utility class on purpose: the compiled DS
 * stylesheet only carries classes the app itself uses, so `h-28` has no rule and
 * the frame would collapse to 0 and clip the navbar away. See learnings/shared.md.
 */
const Frame = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`relative overflow-hidden rounded-xl ${className ?? ""}`}
    style={{ height: 120, transform: "translateZ(0)" }}
  >
    {children}
  </div>
);

/** Every page except the home page — dark text on the light page background. */
export const Solid = () => (
  <Frame className="bg-background border border-border">
    <Navbar menuItems={menuItems} variant="solid" />
  </Frame>
);

/** The home page only — transparent over the hero image, white text. */
export const Overlay = () => (
  <Frame>
    <div
      className="absolute inset-0 bg-slate-900 bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15,23,42,0.6), rgba(15,23,42,0.6)), url(https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1400&q=80)",
      }}
    />
    <Navbar menuItems={menuItems} variant="overlay" />
  </Frame>
);
