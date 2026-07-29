# ICR-126 Admin Responsive Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/admin` a bottom tab bar on mobile and keep the sidebar on desktop, both driven by one permission-filtered nav definition, plus an installable PWA manifest.

**Architecture:** `NAV_ITEMS` moves into a pure, server-import-free module with a testable `splitNavItems()` overflow rule. `AppShell` becomes async, resolves permissions **once**, and feeds the filtered list to both a desktop `Sidebar` and a mobile `MobileNav` — both **server** components. The only client code is `NavLink` (an active-route island that receives `href` + pre-rendered `children`, never nav items, because functions cannot cross the RSC boundary) and `MoreSheet` (disclosure state over the existing Radix `Dialog`).

**Tech Stack:** Next.js 16.2.11 App Router (RSC), next-intl 4.13, Tailwind CSS v4, Radix Dialog, lucide-react, Vitest + Testing Library.

**Spec:** `tasks/specs/ICR-126-admin-responsive-nav.md` — read it first.

## Global Constraints

- **Package manager is `pnpm`.** Run tests from the repo root as `pnpm --filter @idcr/admin test` or root `pnpm test`. Never `npm`/`yarn`.
- **`pnpm test` is a single run** (`vitest run`) — never watch mode.
- **Never use `next/link` or `next/navigation` in `apps/admin`.** Always the locale-aware wrappers from `@src/i18n/routing` (`Link`, `usePathname`). A raw `usePathname` returns `/es-AR/people` and will match nothing.
- **Every user-facing string must exist in BOTH `apps/admin/messages/en-US.json` and `apps/admin/messages/es-AR.json`.** `i18n-messages` is a declared sensitive area for this ticket.
- **RSC-first.** Add `"use client"` only to `nav-link.tsx` and `more-sheet.tsx`. Nothing else.
- **Prefer `interface` over `type` for object shapes; avoid enums; use `??` over `||`; named exports; `readonly` props.**
- **No dynamically-built Tailwind class names** (`grid-cols-${n}` is invisible to the scanner). Use explicit literal-string maps.
- **Never `git commit --no-verify`.** The husky pre-commit hook (prettier + eslint) must pass.
- Conventional commits, header ≤ 100 chars, `<type>(ICR-126): <description>`.
- Permission filtering in the nav is **convenience only** — `requirePermission()` in each page stays the gate of record. Do not remove or weaken those page-level checks.

---

## File Structure

| File                                             | Responsibility                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/admin/src/components/shell/nav-items.ts`   | Pure nav definition + overflow split rule. No server imports.                           |
| `apps/admin/src/components/shell/nav-link.tsx`   | `"use client"` — active-route detection + `aria-current`. The only route-aware code.    |
| `apps/admin/src/components/shell/mobile-nav.tsx` | Server — fixed bottom tab bar, delegates overflow to `MoreSheet`.                       |
| `apps/admin/src/components/shell/more-sheet.tsx` | `"use client"` — disclosure state only; content passed in as `children`.                |
| `apps/admin/src/components/shell/sidebar.tsx`    | Server — desktop rail. Loses its own `NAV_ITEMS` + permission call; gains `items` prop. |
| `apps/admin/src/components/shell/app-shell.tsx`  | Server (async) — resolves permissions once, composes all surfaces.                      |
| `apps/admin/src/app/manifest.ts`                 | PWA manifest (root of `app/`, outside `[locale]`).                                      |
| `apps/admin/src/proxy.ts`                        | Gains `isSafeAssetPath()` + `webmanifest` bypass.                                       |

---

### Task 1: Pure nav module

**Files:**

- Create: `apps/admin/src/components/shell/nav-items.ts`
- Test: `apps/admin/src/components/shell/nav-items.test.ts`
- Read (source of the moved code): `apps/admin/src/components/shell/sidebar.tsx:18-39`

**Interfaces:**

- Consumes: `PermissionKey` from `@src/lib/rbac/permissions`.
- Produces: `NavItem`, `NavLabelKey`, `NAV_ITEMS`, `TAB_BAR_PRIMARY_MAX`, `TAB_BAR_FLAT_MAX`, `SplitNavItems`, `splitNavItems(items: readonly NavItem[]): SplitNavItems`. Tasks 3 and 4 import all of these.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/components/shell/nav-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  TAB_BAR_FLAT_MAX,
  TAB_BAR_PRIMARY_MAX,
  splitNavItems,
  type NavItem,
} from "./nav-items";

// A stand-in icon: splitNavItems must never care what the icon is.
const Icon = () => null;

function makeItems(count: number): readonly NavItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    href: `/item-${index}`,
    labelKey: "people" as const,
    icon: Icon,
  }));
}

describe("splitNavItems", () => {
  it("keeps everything flat when the list fits the bar (5 items, the boundary)", () => {
    const items = makeItems(TAB_BAR_FLAT_MAX);

    const { primary, overflow } = splitNavItems(items);

    expect(primary).toHaveLength(5);
    expect(overflow).toHaveLength(0);
  });

  it("splits into 4 + overflow as soon as the list exceeds the bar (6 items)", () => {
    const items = makeItems(6);

    const { primary, overflow } = splitNavItems(items);

    expect(primary).toHaveLength(TAB_BAR_PRIMARY_MAX);
    expect(overflow).toHaveLength(2);
    expect(primary.map((item) => item.href)).toEqual([
      "/item-0",
      "/item-1",
      "/item-2",
      "/item-3",
    ]);
    expect(overflow.map((item) => item.href)).toEqual(["/item-4", "/item-5"]);
  });

  it("handles a minimal permission set without inventing an overflow", () => {
    const { primary, overflow } = splitNavItems(makeItems(2));

    expect(primary).toHaveLength(2);
    expect(overflow).toHaveLength(0);
  });

  it("splits the full 8-item admin nav as 4 + 4", () => {
    const { primary, overflow } = splitNavItems(NAV_ITEMS);

    expect(primary.map((item) => item.labelKey)).toEqual([
      "dashboard",
      "people",
      "families",
      "activities",
    ]);
    expect(overflow.map((item) => item.labelKey)).toEqual([
      "calendar",
      "users",
      "roles",
      "settings",
    ]);
  });

  it("does not mutate its input", () => {
    const items = makeItems(8);
    const before = items.map((item) => item.href);

    splitNavItems(items);

    expect(items.map((item) => item.href)).toEqual(before);
  });

  it("ships the eight known nav destinations in order", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/people",
      "/families",
      "/activities",
      "/calendar",
      "/users",
      "/roles",
      "/settings",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @idcr/admin test -- nav-items`
Expected: FAIL — `Failed to resolve import "./nav-items"`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/components/shell/nav-items.ts`. Move the interface + array **verbatim** from `sidebar.tsx:18-39` (including its comment), then add the split rule:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @idcr/admin test -- nav-items`
Expected: PASS, 6 tests.

- [ ] **Step 5: Point sidebar at the new module (no behavior change yet)**

In `sidebar.tsx`, delete the local `NavItem` interface, the `NAV_ITEMS` const, its comment, and the now-unused lucide + `ComponentType` imports. Add:

```ts
import { NAV_ITEMS } from "@src/components/shell/nav-items";
```

Leave everything else — the `getSessionPermissions()` call and the filter stay put until Task 3.

- [ ] **Step 6: Verify nothing regressed**

Run: `pnpm --filter @idcr/admin test && pnpm --filter @idcr/admin exec tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/shell/nav-items.ts \
        apps/admin/src/components/shell/nav-items.test.ts \
        apps/admin/src/components/shell/sidebar.tsx
git commit -m "refactor(ICR-126): extract NAV_ITEMS into a pure, testable shell module"
```

---

### Task 2: `NavLink` active-route island + sidebar adoption

**Files:**

- Create: `apps/admin/src/components/shell/nav-link.tsx`
- Test: `apps/admin/src/components/shell/nav-link.test.tsx`
- Modify: `apps/admin/src/components/shell/sidebar.tsx`

**Interfaces:**

- Consumes: `Link`, `usePathname` from `@src/i18n/routing`; `cn` from `@idcr/ui`.
- Produces: `NavLink` with props `{ href: string; className?: string; activeClassName?: string; inactiveClassName?: string; children: ReactNode }`. Task 3 renders it for every tab and every overflow row.

**Why `children` and not an item:** `NavItem.icon` is a `ComponentType`. React throws if a function prop crosses from a server component into a client component. Passing pre-rendered ReactNodes is the whole reason this component has the shape it does — do not "simplify" it to take a `NavItem`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/components/shell/nav-link.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const pathnameMock = vi.fn<() => string>();

vi.mock("@src/i18n/routing", () => ({
  usePathname: () => pathnameMock(),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { NavLink } from "./nav-link";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderAt(pathname: string, href: string) {
  pathnameMock.mockReturnValue(pathname);
  render(
    <NavLink
      href={href}
      activeClassName="is-active"
      inactiveClassName="is-idle"
    >
      label
    </NavLink>,
  );
  return screen.getByRole("link");
}

describe("NavLink active-route detection", () => {
  it("marks the dashboard active only at the exact root", () => {
    expect(renderAt("/", "/")).toHaveAttribute("aria-current", "page");
  });

  it("does NOT mark the dashboard active on another route", () => {
    // The trap: a naive startsWith("/") lights up every single route.
    expect(renderAt("/people", "/")).not.toHaveAttribute("aria-current");
  });

  it("marks a section active on its own route", () => {
    expect(renderAt("/people", "/people")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the section active on a nested detail route", () => {
    expect(renderAt("/people/123", "/people")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does NOT activate on a route that merely shares a prefix", () => {
    expect(renderAt("/peopleXYZ", "/people")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("applies activeClassName when active and inactiveClassName when not", () => {
    expect(renderAt("/people", "/people").className).toContain("is-active");
  });

  it("applies inactiveClassName when not active", () => {
    expect(renderAt("/families", "/people").className).toContain("is-idle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @idcr/admin test -- nav-link`
Expected: FAIL — cannot resolve `./nav-link`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/components/shell/nav-link.tsx`:

```tsx
"use client";

import { Link, usePathname } from "@src/i18n/routing";
import { cn } from "@idcr/ui";
import type { ReactNode } from "react";

interface NavLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly activeClassName?: string;
  readonly inactiveClassName?: string;
  readonly children: ReactNode;
}

/**
 * The ONLY route-aware component in the shell. It deliberately takes
 * pre-rendered `children` rather than a `NavItem`: `NavItem.icon` is a
 * component *function*, and functions cannot be passed from a server
 * component to a client component. Both the sidebar and the mobile tab bar
 * stay server components by rendering their icons and labels themselves and
 * handing the result here as ReactNodes.
 *
 * `usePathname` comes from `@src/i18n/routing` (next-intl), which strips the
 * locale prefix — so it compares directly against NAV_ITEMS hrefs. The raw
 * `next/navigation` version returns `/es-AR/people` and would match nothing.
 */
export function NavLink({
  href,
  className,
  activeClassName,
  inactiveClassName,
  children,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @idcr/admin test -- nav-link`
Expected: PASS, 7 tests.

- [ ] **Step 5: Adopt `NavLink` in the sidebar**

In `sidebar.tsx`, replace the `<Link>` usage inside the `items.map(...)` with `NavLink`, keeping the existing visual language and adding an active state. Remove the now-unused `Link` and `cn` imports if nothing else uses them.

```tsx
import { NavLink } from "@src/components/shell/nav-link";
import { NAV_ITEMS } from "@src/components/shell/nav-items";
```

```tsx
{
  items.map(({ href, labelKey, icon: Icon }) => (
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
  ));
}
```

Also add the landmark label to the existing `<nav>`:

```tsx
<nav aria-label={tShell("mainNavigation")} className="flex-1 space-y-1 overflow-y-auto p-3">
```

- [ ] **Step 6: Add the two new `shell` keys to BOTH catalogs**

`apps/admin/messages/en-US.json` → `shell`: add `"mainNavigation": "Main navigation"` and `"mobileNavigation": "Main navigation"`.
`apps/admin/messages/es-AR.json` → `shell`: add `"mainNavigation": "Navegación principal"` and `"mobileNavigation": "Navegación principal"`.

(`mobileNavigation` is unused until Task 3; adding both now keeps the two catalogs in one reviewable diff.)

- [ ] **Step 7: Run the full admin suite**

Run: `pnpm --filter @idcr/admin test && pnpm --filter @idcr/admin exec tsc --noEmit && pnpm lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/components/shell/nav-link.tsx \
        apps/admin/src/components/shell/nav-link.test.tsx \
        apps/admin/src/components/shell/sidebar.tsx \
        apps/admin/messages/en-US.json apps/admin/messages/es-AR.json
git commit -m "feat(ICR-126): add active-route indication to the admin sidebar"
```

---

### Task 3: Mobile tab bar + overflow sheet + shell wiring

**Files:**

- Create: `apps/admin/src/components/shell/mobile-nav.tsx`
- Create: `apps/admin/src/components/shell/more-sheet.tsx`
- Test: `apps/admin/src/components/shell/mobile-nav.test.tsx`
- Modify: `apps/admin/src/components/shell/app-shell.tsx`
- Modify: `apps/admin/src/components/shell/sidebar.tsx`
- Modify: `apps/admin/src/components/shell/topbar.tsx`
- Modify: `apps/admin/messages/en-US.json`, `apps/admin/messages/es-AR.json`

**Interfaces:**

- Consumes: `NAV_ITEMS`, `NavItem`, `splitNavItems` (Task 1); `NavLink` (Task 2); `Dialog`, `DialogTrigger`, `DialogContent`, `DialogTitle` from `@src/components/ui/dialog`.
- Produces: `MobileNav({ items }: { readonly items: readonly NavItem[] })` — an **async** server component; `MoreSheet` client component with props `{ triggerLabel, title, closeLabel, children }`.

- [ ] **Step 1: Add the `nav.more` key to BOTH catalogs**

`en-US.json` → `nav`: `"more": "More"`. `es-AR.json` → `nav`: `"more": "Más"`.

- [ ] **Step 2: Write the failing test**

Create `apps/admin/src/components/shell/mobile-nav.test.tsx`. Note the house pattern for async server components — `render(await Component(props))`, as in `no-access/page.test.tsx`.

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NAV_ITEMS, type NavItem } from "./nav-items";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

vi.mock("@src/i18n/routing", () => ({
  usePathname: () => "/",
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The sheet's disclosure behavior is Radix's; here we only care THAT an
// overflow trigger exists and which links it was handed.
vi.mock("@src/components/shell/more-sheet", () => ({
  MoreSheet: ({
    triggerLabel,
    children,
  }: {
    triggerLabel: string;
    children: ReactNode;
  }) => (
    <div data-testid="more-sheet">
      <button type="button">{triggerLabel}</button>
      {children}
    </div>
  ),
}));

import { MobileNav } from "./mobile-nav";

describe("MobileNav", () => {
  it("renders every item flat and no overflow when the list fits (5 items)", async () => {
    const items = NAV_ITEMS.slice(0, 5) as readonly NavItem[];

    render(await MobileNav({ items }));

    expect(screen.queryByTestId("more-sheet")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("renders 4 tabs plus a More sheet when the list overflows (8 items)", async () => {
    render(await MobileNav({ items: NAV_ITEMS }));

    expect(screen.getByTestId("more-sheet")).toBeDefined();
    expect(screen.getByRole("button", { name: "nav.more" })).toBeDefined();
    // 4 primary tabs + 4 overflow links rendered inside the mocked sheet.
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("renders a labelled navigation landmark", async () => {
    render(await MobileNav({ items: NAV_ITEMS }));

    expect(
      screen.getByRole("navigation", { name: "shell.mobileNavigation" }),
    ).toBeDefined();
  });

  it("is hidden at md and up and pads for the iOS home indicator", async () => {
    render(await MobileNav({ items: NAV_ITEMS }));

    const nav = screen.getByRole("navigation", {
      name: "shell.mobileNavigation",
    });
    expect(nav.className).toContain("md:hidden");
    expect(nav.className).toContain("env(safe-area-inset-bottom)");
  });

  it("shows only the permitted items for a minimal permission set", async () => {
    const items = [NAV_ITEMS[0], NAV_ITEMS[7]] as readonly NavItem[];

    render(await MobileNav({ items }));

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByTestId("more-sheet")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @idcr/admin test -- mobile-nav`
Expected: FAIL — cannot resolve `./mobile-nav`.

- [ ] **Step 4: Implement `MoreSheet`**

Create `apps/admin/src/components/shell/more-sheet.tsx`:

```tsx
"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@src/components/ui/dialog";

interface MoreSheetProps {
  readonly triggerLabel: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
}

/**
 * Overflow nav for the bottom tab bar. Owns disclosure state ONLY — the links
 * themselves are server-rendered by MobileNav and passed in as `children`, so
 * no nav data or icon component ever crosses the RSC boundary.
 *
 * Built on the shared Radix Dialog for a real focus trap + Escape handling;
 * the className override displaces the primitive's centered geometry into a
 * bottom sheet (cn() is tailwind-merge, so the later values win).
 */
export function MoreSheet({
  triggerLabel,
  title,
  closeLabel,
  children,
}: MoreSheetProps) {
  return (
    <Dialog>
      <DialogTrigger className="flex h-full min-h-11 flex-col items-center justify-center gap-1 text-xs font-medium text-foreground/70 transition-colors hover:text-foreground">
        <MoreHorizontal className="h-5 w-5 shrink-0" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        closeLabel={closeLabel}
        className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 gap-2 rounded-b-none rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Implement `MobileNav`**

Create `apps/admin/src/components/shell/mobile-nav.tsx`:

```tsx
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @idcr/admin test -- mobile-nav`
Expected: PASS, 5 tests.

- [ ] **Step 7: Move permission resolution up into `AppShell`**

Replace `apps/admin/src/components/shell/app-shell.tsx` entirely:

```tsx
import { MobileNav } from "@src/components/shell/mobile-nav";
import { NAV_ITEMS } from "@src/components/shell/nav-items";
import { Sidebar } from "@src/components/shell/sidebar";
import { Topbar } from "@src/components/shell/topbar";
import { getSessionPermissions } from "@src/lib/rbac/require-permission";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { ReactNode } from "react";

export async function AppShell({ children }: { readonly children: ReactNode }) {
  // Resolved ONCE here and handed to both nav surfaces, so the desktop rail
  // and the mobile tab bar can never disagree about what a user may see.
  // Still convenience only — `requirePermission()` in each page is the gate.
  const authz = await getSessionPermissions();
  const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
  const items = NAV_ITEMS.filter(
    (item) => !item.permission || granted.has(item.permission),
  );

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
```

- [ ] **Step 8: Make `Sidebar` take `items` instead of resolving them**

In `sidebar.tsx`: delete the `getSessionPermissions` import, the `authz`/`granted`/`items` lines, and the `PermissionKey` import if now unused. Change the signature to:

```tsx
export async function Sidebar({ items }: { readonly items: readonly NavItem[] }) {
```

and add `import type { NavItem } from "@src/components/shell/nav-items";`. It keeps `getTranslations` for its own labels. `NAV_ITEMS` is no longer imported here.

- [ ] **Step 9: Add the mobile brand to `Topbar`**

`topbar.tsx` — the header becomes `justify-between` and gains a mobile-only app name:

```tsx
<header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
  {/* The sidebar owns the brand on desktop, but it's hidden on mobile —
      without this the panel renders with no visible app name on a phone. */}
  <span className="truncate font-serif text-sm font-bold md:hidden">
    {t("appName")}
  </span>
  <div className="flex items-center gap-2 md:ml-auto">
    <LocaleSwitcher />
    <ThemeToggle />
    <SignOutButton />
  </div>
</header>
```

`Topbar` must become `async` and call `const t = await getTranslations("shell");` (import `getTranslations` from `next-intl/server`).

- [ ] **Step 10: Update `topbar.test.tsx` for the now-async component**

The existing tests call `render(<Topbar />)`. Change both to `render(await Topbar())` and make the callbacks `async`, and add the server-side translation mock alongside the existing `next-intl` one:

```tsx
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));
```

Add one new assertion:

```tsx
it("shows the app name on mobile so the hidden sidebar doesn't take the brand with it", async () => {
  render(await Topbar());

  const brand = screen.getByText("shell.appName");
  expect(brand.className).toContain("md:hidden");
});
```

- [ ] **Step 11: Full verification**

Run: `pnpm --filter @idcr/admin test && pnpm --filter @idcr/admin exec tsc --noEmit && pnpm lint`
Expected: all pass. If `tsc` complains that `Sidebar`/`AppShell` are used as JSX with a Promise return, confirm the `(app)/layout.tsx` call site already `await`s nothing — async server components are legal as JSX in Next 16 and this is expected to type-check.

- [ ] **Step 12: Commit**

```bash
git add apps/admin/src/components/shell apps/admin/messages
git commit -m "feat(ICR-126): add mobile bottom tab bar with permission-aware overflow sheet"
```

---

### Task 4: PWA manifest, square icons, and the proxy bypass fix

**Files:**

- Create: `apps/admin/src/app/manifest.ts`
- Test: `apps/admin/src/app/manifest.test.ts`
- Create: `apps/admin/public/assets/img/icon-192.png`, `apps/admin/public/assets/img/icon-512.png`
- Modify: `apps/admin/src/proxy.ts`
- Test: `apps/admin/src/proxy.test.ts`

**Interfaces:**

- Produces: default-exported `manifest(): MetadataRoute.Manifest`; `isSafeAssetPath(pathname: string): boolean` exported from `proxy.ts`.

**Why the proxy change is a bug fix, not a nicety:** `proxy.ts`'s matcher `"/((?!_next|_vercel|api|trpc).*)"` matches `/manifest.webmanifest`, and its `safeExtensions` list has `json` but not `webmanifest`. So a signed-out browser asking for the manifest is **302'd to `/login`** and the app is not installable from the sign-in screen — which is exactly where someone installs it. This is invisible if you only ever test while signed in.

- [ ] **Step 1: Generate the two square icons**

Every existing logo is non-square (334×223), and Chromium requires a 192px and a 512px icon. Pad the logo onto the manifest background color:

```bash
cd apps/admin/public/assets/img
sips -Z 400 redentor_logo.png --out /tmp/icr126-step512.png
sips --padToHeightWidth 512 512 --padColor F9FAFB /tmp/icr126-step512.png --out icon-512.png
sips -Z 150 redentor_logo.png --out /tmp/icr126-step192.png
sips --padToHeightWidth 192 192 --padColor F9FAFB /tmp/icr126-step192.png --out icon-192.png
sips -g pixelWidth -g pixelHeight icon-512.png icon-192.png
```

Expected output: `512 / 512` and `192 / 192`. If a dimension is wrong, stop — do not commit a mis-sized icon, it silently breaks installability.

- [ ] **Step 2: Write the failing manifest test**

Create `apps/admin/src/app/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("declares the fields Chromium requires to offer installation", () => {
    const result = manifest();

    expect(result.name).toBeTruthy();
    expect(result.short_name).toBeTruthy();
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("ships both icon sizes Chromium requires", () => {
    const sizes = (manifest().icons ?? []).map((icon) => icon.sizes);

    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("points every icon at a real public path", () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.src.startsWith("/assets/img/")).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });

  it("uses the light-theme brand tokens for its chrome colors", () => {
    const result = manifest();

    expect(result.theme_color).toBe("#0059b3");
    expect(result.background_color).toBe("#f9fafb");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @idcr/admin test -- manifest`
Expected: FAIL — cannot resolve `./manifest`.

- [ ] **Step 4: Implement the manifest**

Create `apps/admin/src/app/manifest.ts` (root of `app/`, **not** inside `[locale]/` — it is fetched with no locale context):

```ts
import type { MetadataRoute } from "next";

/**
 * Served at `/manifest.webmanifest`. Deliberately NOT localized: this file
 * sits above the `[locale]` segment and the browser fetches it once without
 * locale context, so it uses the default locale (es-AR).
 *
 * No service worker ships with this — one is not required for installability
 * (MDN, verified 2026-07-29); offline support is its own ticket.
 *
 * NOTE: `proxy.ts` must let `/manifest.webmanifest` through unauthenticated,
 * or the browser never sees this file. See `isSafeAssetPath`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IDC Redentor · Panel de Administración",
    short_name: "IDCR Admin",
    description:
      "Panel de administración del ministerio — Iglesia de Cristo Redentor",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0059b3",
    icons: [
      { src: "/assets/img/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/assets/img/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 5: Run the manifest test to verify it passes**

Run: `pnpm --filter @idcr/admin test -- manifest`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing proxy test**

Create `apps/admin/src/proxy.test.ts`. It targets the pure helper so no `NextRequest`, Firebase, or next-intl middleware needs constructing:

```ts
import { describe, expect, it } from "vitest";
import { isSafeAssetPath } from "./proxy";

describe("isSafeAssetPath", () => {
  it("lets the PWA manifest through unauthenticated", () => {
    // Regression guard: without this the manifest 302s to /login and the app
    // is not installable from the sign-in screen — invisible when signed in.
    expect(isSafeAssetPath("/manifest.webmanifest")).toBe(true);
  });

  it("still bypasses the previously-allowed static asset types", () => {
    for (const path of [
      "/favicon.ico",
      "/a/b.png",
      "/x.css",
      "/y.js",
      "/z.woff2",
    ]) {
      expect(isSafeAssetPath(path)).toBe(true);
    }
  });

  it("does not bypass application routes", () => {
    for (const path of ["/", "/es-AR/people", "/en-US/users/123"]) {
      expect(isSafeAssetPath(path)).toBe(false);
    }
  });

  it("is case-insensitive about the extension", () => {
    expect(isSafeAssetPath("/LOGO.PNG")).toBe(true);
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm --filter @idcr/admin test -- proxy`
Expected: FAIL — `isSafeAssetPath` is not exported.

- [ ] **Step 8: Implement the proxy change**

In `apps/admin/src/proxy.ts`, lift the inline extension list into a module-level const, add `"webmanifest"`, and export a pure predicate. Replace the `safeExtensions` block and the `if` that uses it:

```ts
// `webmanifest` MUST stay in this list: the matcher below catches
// `/manifest.webmanifest`, and without a bypass an unauthenticated browser
// fetching the manifest gets redirected to /login — so the app is not
// installable from the sign-in screen, which is where it gets installed.
const SAFE_ASSET_EXTENSIONS = [
  "ico",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "css",
  "js",
  "json",
  "webmanifest",
  "xml",
  "txt",
  "woff",
  "woff2",
  "ttf",
  "eot",
] as const;

export function isSafeAssetPath(pathname: string): boolean {
  const extension = pathname.split(".").pop()?.toLowerCase();
  if (!extension || extension === pathname.toLowerCase()) {
    return false;
  }
  return (SAFE_ASSET_EXTENSIONS as readonly string[]).includes(extension);
}
```

Then inside `proxy()`, replace the extension-extraction lines and their `if` with:

```ts
const pathname = request.nextUrl.pathname;

// Skip middleware for safe asset extensions
if (isSafeAssetPath(pathname)) {
  return NextResponse.next();
}
```

Note the `extension === pathname` guard: `"/people".split(".").pop()` returns the whole string, which must not be treated as an extension.

- [ ] **Step 9: Run the proxy test to verify it passes**

Run: `pnpm --filter @idcr/admin test -- proxy`
Expected: PASS, 4 tests.

- [ ] **Step 10: Full verification including a forced build**

```bash
pnpm --filter @idcr/admin test
pnpm --filter @idcr/admin exec tsc --noEmit
pnpm lint
pnpm build --force
```

`--force` is required: a cached `pnpm build` replays a previous run in milliseconds and proves nothing about this branch. Report the `Cached:` line.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/src/app/manifest.ts apps/admin/src/app/manifest.test.ts \
        apps/admin/src/proxy.ts apps/admin/src/proxy.test.ts \
        apps/admin/public/assets/img/icon-192.png apps/admin/public/assets/img/icon-512.png
git commit -m "feat(ICR-126): add PWA manifest and unblock it in the auth proxy"
```

---

### Task 5: Documentation and changeset

**Files:**

- Create: `docs/architecture/admin-navigation.md`
- Modify: `CLAUDE.md` (docs index entry)
- Create: `.changeset/<generated-name>.md`

- [ ] **Step 1: Write the architecture doc**

Create `docs/architecture/admin-navigation.md` covering, with the _why_ not just the _what_:

- The two surfaces and the single `NAV_ITEMS` source of truth; the adaptive 5/4+More rule and why a small permission set gets a flat bar.
- **Why `NavLink` takes `children` and not a `NavItem`** — the RSC function-prop boundary. This is the single most likely thing for a future change to break.
- Why `usePathname` must come from `@src/i18n/routing`, with the `/es-AR/people` failure mode spelled out.
- Why permission filtering happens once in `AppShell` and is still convenience-only, with `requirePermission()` as the gate of record.
- The `fixed` tab bar + `main` padding choice, and why the flex column was _not_ restructured to `h-dvh`.
- The manifest: no service worker (not required for installability), not localized, and the `proxy.ts` `webmanifest` coupling — state plainly that removing `webmanifest` from `SAFE_ASSET_EXTENSIONS` silently un-installs the app.
- Deferred: maskable icons, `apple-touch-icon`, offline support.

- [ ] **Step 2: Add a one-line entry to the `CLAUDE.md` docs index**

Under the `docs/architecture/` bullet list, after `admin-bootstrap.md`, add a line describing `admin-navigation.md`, matching the surrounding entries' style.

- [ ] **Step 3: Reference the doc from the code**

Add `// See docs/architecture/admin-navigation.md` at the top of `nav-items.ts` and above `SAFE_ASSET_EXTENSIONS` in `proxy.ts`.

- [ ] **Step 4: Create the changeset**

Create `.changeset/icr-126-admin-responsive-nav.md`:

```markdown
---
"@idcr/admin": minor
---

Add responsive navigation to the admin panel: a bottom tab bar on mobile and the existing sidebar on desktop, both driven by one permission-filtered nav definition, with active-route indication on both surfaces. Adds a PWA manifest so the panel is installable, and fixes the auth proxy redirecting `/manifest.webmanifest` to the login page.
```

- [ ] **Step 5: Final verification**

```bash
pnpm --filter @idcr/admin test
pnpm --filter @idcr/admin exec tsc --noEmit
pnpm lint
pnpm format:check
```

If `format:check` fails on files you touched, run `pnpm format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/admin-navigation.md CLAUDE.md .changeset \
        apps/admin/src/components/shell/nav-items.ts apps/admin/src/proxy.ts
git commit -m "docs(ICR-126): document the responsive admin navigation"
```

---

## Self-Review

**Spec coverage:** R1→Task 1. R2→Task 3 Step 7. R3→Task 2. R4→Task 3 Steps 2-6. R5→Task 3 Step 4. R6→Task 2 Step 5. R7→Task 3 Step 7. R8→Task 3 Steps 9-10. R9→Task 4 Steps 2-5. R10→Task 4 Step 1. R11→Task 4 Steps 6-9. §8 i18n→Task 2 Step 6 + Task 4… _(corrected: `nav.more` is Task 3 Step 1)_. §9 testing→every task. §10 checkpoints→Tasks 1-5. Edge cases 1-4→Task 1 tests; 5-7→Task 2 tests; 8→Task 3 Step 7 (`authz.ok` fallback); 9→Task 4 Step 6; 10→Task 3 test "pads for the iOS home indicator"; 11→Task 2 (mock + doc); 12→Task 3 `GRID_COLS`; 13→CSS-only visibility throughout.

**Placeholder scan:** none — every step carries runnable code or an exact command.

**Type consistency:** `NavItem`/`NAV_ITEMS`/`splitNavItems`/`TAB_BAR_PRIMARY_MAX`/`TAB_BAR_FLAT_MAX` defined in Task 1, consumed with identical names in Tasks 3-4. `NavLink`'s four props are defined in Task 2 and used with the same names in Tasks 2-3. `isSafeAssetPath` defined and consumed in Task 4. `MobileNav({ items })` and `Sidebar({ items })` share the `readonly items: readonly NavItem[]` shape.

**Known risk to watch during execution:** Task 3 Step 10 changes an existing passing test file (`topbar.test.tsx`) because `Topbar` becomes async. If those two tests fail after the edit, the cause is the missing `await`, not a regression in sign-out.
