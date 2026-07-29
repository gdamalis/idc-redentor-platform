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
