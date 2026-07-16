import { LanguageSwitcher } from "@idcr/web";

// LanguageSwitcher is a Headless UI <Menu>: closed, it is only the trigger
// (globe + current locale + chevron), which is tiny and reads as blank on its
// own. Both cells therefore show it in the navbar row it actually lives in
// (Navbar.tsx:96) — also the only context `isScrolled` is styled for. The
// dropdown itself needs a click, so a static preview cannot show it open.

/** In a solid navbar (any page but home, or once scrolled): dark trigger. */
export const InSolidNavbar = () => (
  <div className="flex items-center justify-between gap-8 rounded-xl border border-border bg-background px-6 py-4 shadow-sm">
    <span className="font-serif text-lg font-bold text-foreground">
      Iglesia de Cristo Redentor
    </span>
    <div className="flex items-center gap-8">
      <span className="text-sm font-medium text-foreground/80">Comunidad</span>
      <span className="text-sm font-medium text-foreground/80">Prédicas</span>
      <LanguageSwitcher isScrolled />
    </div>
  </div>
);

/** In the home page's transparent overlay navbar: white trigger on the hero. */
export const OnDarkHeader = () => (
  <div
    className="flex items-center justify-between gap-8 rounded-xl bg-slate-900 bg-cover bg-center px-6 py-4"
    style={{
      backgroundImage:
        "linear-gradient(rgba(15,23,42,0.65), rgba(15,23,42,0.65)), url(https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1000&q=80)",
    }}
  >
    <span className="font-serif text-lg font-bold text-white">
      Iglesia de Cristo Redentor
    </span>
    <div className="flex items-center gap-8">
      <span className="text-sm font-medium text-white/90">Comunidad</span>
      <span className="text-sm font-medium text-white/90">Prédicas</span>
      <LanguageSwitcher />
    </div>
  </div>
);
