import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// This suite needs the REAL next-intl provider — vitest.setup.ts globally stubs
// next-intl's useTranslations to return the raw key, but we need the actual
// es-AR copy to render so we can assert on it (and catch an accent regression).
vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return actual;
});

// next/link needs an App Router context to prefetch; render it as a plain <a> in
// tests, mirroring how vitest.setup.ts already stubs next/image and the routing Link.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { NextIntlClientProvider } from "next-intl";
import esAR from "@public/locales/es-AR.json";
import ErrorPage from "./error";

function renderError(reset = vi.fn()) {
  const error = Object.assign(new Error("boom — do not leak me"), {
    digest: "do-not-leak-digest-1234",
  });
  render(
    <NextIntlClientProvider locale="es-AR" messages={esAR}>
      <ErrorPage error={error} reset={reset} />
    </NextIntlClientProvider>,
  );
  return { error, reset };
}

describe("[locale]/error.tsx", () => {
  it("renders the title, description, and both action labels", () => {
    renderError();
    expect(screen.getByText(esAR.error.title)).toBeDefined();
    expect(screen.getByText(esAR.error.description)).toBeDefined();
    expect(screen.getByText(esAR.error.tryAgain)).toBeDefined();
    expect(screen.getByText(esAR.error.backToHome)).toBeDefined();
  });

  it("calls reset exactly once when 'Intentar de nuevo' is clicked", () => {
    const { reset } = renderError();
    fireEvent.click(screen.getByText(esAR.error.tryAgain));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("links back to the locale home", () => {
    renderError();
    const homeLink = screen.getByText(esAR.error.backToHome);
    expect(homeLink).toHaveAttribute("href", "/es-AR");
  });

  it("never renders error.message or error.digest — info-leak guard", () => {
    const { error } = renderError();
    expect(document.body.textContent).not.toContain(error.message);
    expect(document.body.textContent).not.toContain(error.digest);
  });
});
