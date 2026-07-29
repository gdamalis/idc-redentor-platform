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
    expect(nav.className).toContain("pb-[env(safe-area-inset-bottom)]");
  });

  /**
   * Finding 3 (round 2) regression guard: Tailwind's preflight sets global
   * `box-sizing: border-box`, so a bare `h-16` bar with
   * `pb-[env(safe-area-inset-bottom)]` has the safe-area inset SUBTRACTED
   * from its fixed 4rem height instead of growing the bar by it — on a
   * device with a home indicator the tabs' usable content height collapses
   * below `TAB_CLASS`'s `min-h-11` and they overflow into the padded unsafe
   * region. The bar height must grow by the inset instead.
   */
  it("grows the bar height by the safe-area inset instead of shrinking its content", async () => {
    render(await MobileNav({ items: NAV_ITEMS }));

    const nav = screen.getByRole("navigation", {
      name: "shell.mobileNavigation",
    });
    expect(nav.className).toContain(
      "h-[calc(4rem+env(safe-area-inset-bottom))]",
    );
  });

  /**
   * `truncate` alone is a no-op here. It sets `white-space: nowrap`, which
   * makes the label's min-content width equal its max-content width; as a
   * shrink-to-fit flex item under the tab's `items-center`, its fit-content
   * width then cannot be clamped below the text width, so `overflow: hidden`
   * clips nothing and a long label (es-AR "Configuración" in a five-tab bar on
   * a narrow phone) spills across its neighbours. `w-full` is what constrains
   * the box to the cell so the ellipsis can engage.
   */
  it("constrains tab labels to the cell so truncation can actually take effect", async () => {
    render(await MobileNav({ items: NAV_ITEMS }));

    const labels = screen
      .getAllByRole("link")
      .map((link) => link.querySelector("span"))
      .filter((span): span is HTMLSpanElement => span !== null);

    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label.className).toContain("w-full");
      expect(label.className).toContain("truncate");
    }
  });

  it("shows only the permitted items for a minimal permission set", async () => {
    const items = [NAV_ITEMS[0], NAV_ITEMS[7]] as readonly NavItem[];

    render(await MobileNav({ items }));

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByTestId("more-sheet")).toBeNull();
  });
});
