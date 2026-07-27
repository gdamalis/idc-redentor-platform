import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next-intl/server's getTranslations is async; echo back `${namespace}.${key}`
// so assertions can target the exact message key (mirrors login-form.test.tsx's
// next-intl mocking style, adapted for the server-side API).
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

// SignOutButton carries its own client-side wiring + test (topbar.test.tsx
// mocks it the same way) — stub it here so this file isolates the ONE thing
// this fixup changes: the redundant "back to sign in" link is replaced by a
// link to the public church website.
vi.mock("@src/components/shell/sign-out-button", () => ({
  SignOutButton: () => <button type="button">sign-out</button>,
}));

describe("NoAccessPage (fixup — link to the church website, not back to sign-in)", () => {
  beforeEach(() => {
    vi.resetModules();
    // `NEXT_PUBLIC_WEBSITE_URL` is typed as a required `string` in
    // environment.d.ts (matching every other env var in that file), so a
    // plain `delete` is a type error here; Reflect bypasses the typed
    // ProcessEnv shape to simulate the var being genuinely unset.
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_WEBSITE_URL");
  });

  it("falls back to the production church website when NEXT_PUBLIC_WEBSITE_URL is unset", async () => {
    const { default: NoAccessPage } = await import("./page");
    render(await NoAccessPage());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.idcredentor.org");
  });

  it("honors NEXT_PUBLIC_WEBSITE_URL when it is set", async () => {
    process.env.NEXT_PUBLIC_WEBSITE_URL = "https://staging.idcredentor.org";
    const { default: NoAccessPage } = await import("./page");
    render(await NoAccessPage());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://staging.idcredentor.org");
  });

  it("never renders a link back to /login", async () => {
    const { default: NoAccessPage } = await import("./page");
    render(await NoAccessPage());

    const loginLink = Array.from(document.querySelectorAll("a")).find(
      (anchor) => anchor.getAttribute("href") === "/login",
    );
    expect(loginLink).toBeUndefined();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("still renders the sign-out control alongside the website link", async () => {
    const { default: NoAccessPage } = await import("./page");
    render(await NoAccessPage());

    expect(screen.getByRole("button", { name: "sign-out" })).toBeDefined();
  });
});
