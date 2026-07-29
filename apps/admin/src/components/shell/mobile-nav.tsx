import { getTranslations } from "next-intl/server";
import { NavLink } from "@src/components/shell/nav-link";
import { MoreSheet } from "@src/components/shell/more-sheet";
import { splitNavItems, type NavItem } from "@src/components/shell/nav-items";

// Tailwind cannot see interpolated class names, so the column count is a
// lookup of literal strings. Max 5 cells: 4 links + More, or 5 flat links.
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

const TAB_CLASS =
  "flex h-full min-h-11 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors";

export async function MobileNav({
  items,
}: {
  readonly items: readonly NavItem[];
}) {
  const tNav = await getTranslations("nav");
  const tShell = await getTranslations("shell");
  const tCommon = await getTranslations("common");

  const { primary, overflow } = splitNavItems(items);
  const cellCount = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label={tShell("mobileNavigation")}
      className={`fixed inset-x-0 bottom-0 z-40 grid ${GRID_COLS[cellCount] ?? "grid-cols-5"} h-16 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden`}
    >
      {primary.map(({ href, labelKey, icon: Icon }) => (
        <NavLink
          key={href}
          href={href}
          className={TAB_CLASS}
          activeClassName="text-primary"
          inactiveClassName="text-foreground/70 hover:text-foreground"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{tNav(labelKey)}</span>
        </NavLink>
      ))}

      {overflow.length > 0 && (
        <MoreSheet
          triggerLabel={tNav("more")}
          title={tNav("more")}
          closeLabel={tCommon("close")}
          overflowHrefs={overflow.map((item) => item.href)}
          className={TAB_CLASS}
          activeClassName="text-primary"
          inactiveClassName="text-foreground/70 hover:text-foreground"
        >
          {overflow.map(({ href, labelKey, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors"
              activeClassName="bg-accent text-accent-foreground"
              inactiveClassName="text-foreground/80 hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-5 w-5 shrink-0" />
              {tNav(labelKey)}
            </NavLink>
          ))}
        </MoreSheet>
      )}
    </nav>
  );
}
