import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import { Link } from "@src/i18n/routing";
import { MoreSheet } from "./more-sheet";

const OVERFLOW_HREFS = ["/calendar", "/users", "/roles", "/settings"];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderSheet(
  pathname: string,
  overflowHrefs: readonly string[] = OVERFLOW_HREFS,
) {
  pathnameMock.mockReturnValue(pathname);
  return render(
    <MoreSheet
      triggerLabel="More"
      title="More"
      closeLabel="Close"
      overflowHrefs={overflowHrefs}
      activeClassName="is-active"
      inactiveClassName="is-idle"
    >
      <Link href="/users">Users</Link>
    </MoreSheet>,
  );
}

describe("MoreSheet active-route indication", () => {
  it("marks the trigger active when the pathname matches one of overflowHrefs", () => {
    renderSheet("/users");

    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does NOT mark the trigger active when the pathname matches none of overflowHrefs", () => {
    renderSheet("/people");

    expect(
      screen.getByRole("button", { name: "More" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("applies activeClassName when active and inactiveClassName when not", () => {
    const { rerender } = renderSheet("/users", ["/users"]);
    expect(screen.getByRole("button", { name: "More" }).className).toContain(
      "is-active",
    );

    pathnameMock.mockReturnValue("/people");
    rerender(
      <MoreSheet
        triggerLabel="More"
        title="More"
        closeLabel="Close"
        overflowHrefs={["/users"]}
        activeClassName="is-active"
        inactiveClassName="is-idle"
      >
        <Link href="/users">Users</Link>
      </MoreSheet>,
    );

    expect(screen.getByRole("button", { name: "More" }).className).toContain(
      "is-idle",
    );
  });
});

/**
 * Finding 1 regression guard: MoreSheet used to render an uncontrolled
 * Dialog with no pathname awareness. `AppShell`'s `(app)` layout persists
 * across in-app navigations, so nothing ever closed the sheet after tapping
 * an overflow link — this is the test that would have caught it.
 */
describe("MoreSheet — closes on navigation (Finding 1 regression)", () => {
  it("closes the dialog when the pathname changes after being opened", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/people");
    const { rerender } = render(
      <MoreSheet
        triggerLabel="More"
        title="Overflow"
        closeLabel="Close"
        overflowHrefs={["/users"]}
      >
        <Link href="/users">Users</Link>
      </MoreSheet>,
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    pathnameMock.mockReturnValue("/users");
    rerender(
      <MoreSheet
        triggerLabel="More"
        title="Overflow"
        closeLabel="Close"
        overflowHrefs={["/users"]}
      >
        <Link href="/users">Users</Link>
      </MoreSheet>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * Finding 4 (round 2) regression guard: selecting the link for the route the
 * user is ALREADY on never changes `pathname`, so the pathname-reset above
 * never fires. Radix does not auto-close a Dialog on a link click inside
 * `DialogContent`, so without an explicit click-based close the sheet would
 * keep focus-trapping the page after re-selecting the current route.
 */
describe("MoreSheet — closes on re-selecting the current route (Finding 4 regression)", () => {
  it("closes the dialog when the link for the current pathname is clicked", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/users");
    render(
      <MoreSheet
        triggerLabel="More"
        title="Overflow"
        closeLabel="Close"
        overflowHrefs={["/users"]}
      >
        <Link href="/users">Users</Link>
      </MoreSheet>,
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // pathname is unchanged across this interaction — the click, not a
    // pathname change, must be what closes the sheet.
    await user.click(screen.getByRole("link", { name: "Users" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close the dialog when a non-link area inside the sheet is clicked", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/people");
    render(
      <MoreSheet
        triggerLabel="More"
        title="Overflow"
        closeLabel="Close"
        overflowHrefs={["/users"]}
      >
        <Link href="/users">Users</Link>
      </MoreSheet>,
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Overflow" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
