import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import esAR from "@public/locales/es-AR.json";
import enUS from "@public/locales/en-US.json";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/es-AR/blog/mi-post"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { PreviewBanner } from "./PreviewBanner";

function renderBanner(
  locale: "es-AR" | "en-US",
  isAlwaysDraftEnv: boolean,
  path = `/${locale}/blog/mi-post`,
) {
  usePathnameMock.mockReturnValue(path);
  const messages = locale === "es-AR" ? esAR : enUS;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PreviewBanner isAlwaysDraftEnv={isAlwaysDraftEnv} />
    </NextIntlClientProvider>,
  );
}

describe("PreviewBanner", () => {
  it("renders preview copy and POST exit form in Spanish (es-AR)", () => {
    const { container } = renderBanner("es-AR", false, "/es-AR/blog/mi-post");

    expect(
      screen.getByText(esAR.preview.banner),
    ).toBeInTheDocument();
    expect(screen.getByRole("region").className).toContain("z-[60]");
    const button = screen.getByRole("button", { name: esAR.preview.exit });
    expect(button).toHaveAttribute("type", "submit");

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")?.toUpperCase()).toBe("POST");
    expect(form?.getAttribute("action")).toBe("/api/preview/exit");

    const hidden = container.querySelector(
      'input[type="hidden"][name="path"]',
    ) as HTMLInputElement | null;
    expect(hidden?.value).toBe("/es-AR/blog/mi-post");
  });

  it("renders preview copy and POST exit form in English (en-US)", () => {
    const { container } = renderBanner("en-US", false, "/en-US/predicas/grace");

    expect(screen.getByText(enUS.preview.banner)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enUS.preview.exit }),
    ).toBeInTheDocument();

    const hidden = container.querySelector(
      'input[type="hidden"][name="path"]',
    ) as HTMLInputElement | null;
    expect(hidden?.value).toBe("/en-US/predicas/grace");
  });

  it("renders staging/test-environment copy with NO exit form in both locales", () => {
    for (const [locale, messages] of [
      ["es-AR", esAR],
      ["en-US", enUS],
    ] as const) {
      const { container, unmount } = renderBanner(locale, true);
      expect(screen.getByText(messages.preview.staging)).toBeInTheDocument();
      expect(container.querySelector("form")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      unmount();
    }
  });
});
