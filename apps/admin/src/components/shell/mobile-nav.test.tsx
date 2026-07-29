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

// The sheet's disclosure + active-state behavior is MoreSheet's own
// (more-sheet.test.tsx); here we only care THAT an overflow trigger exists,
// which links it was handed, and which hrefs it derives its active state
// from.
vi.mock("@src/components/shell/more-sheet", () => ({
  MoreSheet: ({
    triggerLabel,
    overflowHrefs,
    children,
  }: {
    triggerLabel: string;
    overflowHrefs: readonly string[];
    children: ReactNode;
  }) => (
    <div data-testid="more-sheet" data-overflow-hrefs={overflowHrefs.join(",")}>
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
    // MoreSheet needs every overflow href to derive its own active state.
    expect(screen.getByTestId("more-sheet")).toHaveAttribute(
      "data-overflow-hrefs",
      "/calendar,/users,/roles,/settings",
    );
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
