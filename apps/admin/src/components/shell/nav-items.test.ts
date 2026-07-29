import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  TAB_BAR_FLAT_MAX,
  TAB_BAR_PRIMARY_MAX,
  isNavItemActive,
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

describe("isNavItemActive", () => {
  it("marks the dashboard active only at the exact root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
  });

  it("does NOT mark the dashboard active on another route", () => {
    // The trap: a naive startsWith("/") lights up every single route.
    expect(isNavItemActive("/people", "/")).toBe(false);
  });

  it("marks a section active on its own route", () => {
    expect(isNavItemActive("/people", "/people")).toBe(true);
  });

  it("keeps the section active on a nested detail route", () => {
    expect(isNavItemActive("/people/123", "/people")).toBe(true);
  });

  it("does NOT activate on a route that merely shares a prefix", () => {
    expect(isNavItemActive("/peopleXYZ", "/people")).toBe(false);
  });
});
