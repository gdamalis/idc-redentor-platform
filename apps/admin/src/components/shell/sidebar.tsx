import { Link } from "@src/i18n/routing";
import { cn } from "@idcr/ui";
import { getSessionPermissions } from "@src/lib/rbac/require-permission";
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
import type { PermissionKey } from "@src/lib/rbac/permissions";

interface NavItem {
  readonly href: string;
  readonly labelKey: "dashboard" | "people" | "families" | "activities" | "calendar" | "users" | "roles" | "settings";
  readonly icon: ComponentType<{ className?: string }>;
  /** Absent = ungated (dashboard, settings). Present = hidden unless granted. */
  readonly permission?: PermissionKey;
}

// This filtering is CONVENIENCE ONLY, never the gate — it just hides links a
// user can't use. The server check in each page (`requirePermission()`) is
// the actual enforcement; a hidden item that leaked via a direct URL would
// still be refused there.
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/people", labelKey: "people", icon: Users, permission: "people:read" },
  { href: "/families", labelKey: "families", icon: UsersRound, permission: "families:read" },
  { href: "/activities", labelKey: "activities", icon: Activity, permission: "activities:read" },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays, permission: "calendar:read" },
  { href: "/users", labelKey: "users", icon: UserCog, permission: "users:read" },
  { href: "/roles", labelKey: "roles", icon: ShieldCheck, permission: "roles:read" },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export async function Sidebar() {
  const tShell = await getTranslations("shell");
  const tNav = await getTranslations("nav");

  const authz = await getSessionPermissions();
  const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || granted.has(item.permission),
  );

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
        {items.map(({ href, labelKey, icon: Icon }) => (
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
