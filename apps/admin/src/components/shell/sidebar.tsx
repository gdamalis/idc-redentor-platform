import { Link } from "@src/i18n/routing";
import { cn } from "@idcr/ui";
import {
  Activity,
  CalendarDays,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ComponentType } from "react";

interface NavItem {
  readonly href: string;
  readonly labelKey: "dashboard" | "people" | "families" | "activities" | "calendar" | "users" | "roles" | "settings";
  readonly icon: ComponentType<{ className?: string }>;
}

// Static nav placeholders — no permission gating here. RBAC-aware filtering
// (hiding items the signed-in user lacks permission for) lands in a later
// checkpoint once Firebase Auth + the role/permission model exist.
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/people", labelKey: "people", icon: Users },
  { href: "/families", labelKey: "families", icon: UsersRound },
  { href: "/activities", labelKey: "activities", icon: Activity },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/users", labelKey: "users", icon: UserCog },
  { href: "/roles", labelKey: "roles", icon: ShieldCheck },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export async function Sidebar() {
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tNav(labelKey)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
