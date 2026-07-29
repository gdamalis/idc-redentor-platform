import { NavLink } from "@src/components/shell/nav-link";
import { getTranslations } from "next-intl/server";
import type { NavItem } from "@src/components/shell/nav-items";

export async function Sidebar({
  items,
}: {
  readonly items: readonly NavItem[];
}) {
  const tShell = await getTranslations("shell");
  const tNav = await getTranslations("nav");

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 flex-col justify-center border-b border-sidebar-border px-4">
        <span className="font-serif text-base font-bold leading-tight">
          {tShell("appName")}
        </span>
        <span className="text-xs leading-tight text-sidebar-foreground/70">
          {tShell("tagline")}
        </span>
      </div>
      <nav
        aria-label={tShell("mainNavigation")}
        className="flex-1 space-y-1 overflow-y-auto p-3"
      >
        {items.map(({ href, labelKey, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
            inactiveClassName="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tNav(labelKey)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
