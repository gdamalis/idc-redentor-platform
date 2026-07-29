// See docs/architecture/admin-navigation.md
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
import type { ComponentType } from "react";
import type { PermissionKey } from "@src/lib/rbac/permissions";

export type NavLabelKey =
  | "dashboard"
  | "people"
  | "families"
  | "activities"
  | "calendar"
  | "users"
  | "roles"
  | "settings";

export interface NavItem {
  readonly href: string;
  readonly labelKey: NavLabelKey;
  readonly icon: ComponentType<{ className?: string }>;
  /** Absent = ungated (dashboard, settings). Present = hidden unless granted. */
  readonly permission?: PermissionKey;
}

// This filtering is CONVENIENCE ONLY, never the gate — it just hides links a
// user can't use. The server check in each page (`requirePermission()`) is
// the actual enforcement; a hidden item that leaked via a direct URL would
// still be refused there.
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  {
    href: "/people",
    labelKey: "people",
    icon: Users,
    permission: "people:read",
  },
  {
    href: "/families",
    labelKey: "families",
    icon: UsersRound,
    permission: "families:read",
  },
  {
    href: "/activities",
    labelKey: "activities",
    icon: Activity,
    permission: "activities:read",
  },
  {
    href: "/calendar",
    labelKey: "calendar",
    icon: CalendarDays,
    permission: "calendar:read",
  },
  {
    href: "/users",
    labelKey: "users",
    icon: UserCog,
    permission: "users:read",
  },
  {
    href: "/roles",
    labelKey: "roles",
    icon: ShieldCheck,
    permission: "roles:read",
  },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

/** Link cells shown alongside the "More" trigger — 4 links + More = 5 cells. */
export const TAB_BAR_PRIMARY_MAX = 4;
/** Largest list that fits the bar with no overflow trigger at all. */
export const TAB_BAR_FLAT_MAX = 5;

export interface SplitNavItems {
  readonly primary: readonly NavItem[];
  readonly overflow: readonly NavItem[];
}

/**
 * The ONE active-route rule, shared by NavLink and the More trigger so the two
 * surfaces can never disagree. `pathname` must already be locale-stripped
 * (next-intl's usePathname does this). `/` matches only exactly — a prefix
 * match there would light up every route — and a section matches its own route
 * plus nested routes, but NOT a route that merely shares its prefix
 * (`/peopleXYZ` is not `/people`).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Decides what the bottom tab bar shows. `items` must already be
 * permission-filtered — a user with few permissions gets a flat bar rather
 * than a "More" sheet holding one link.
 */
export function splitNavItems(items: readonly NavItem[]): SplitNavItems {
  if (items.length <= TAB_BAR_FLAT_MAX) {
    return { primary: items, overflow: [] };
  }
  return {
    primary: items.slice(0, TAB_BAR_PRIMARY_MAX),
    overflow: items.slice(TAB_BAR_PRIMARY_MAX),
  };
}
