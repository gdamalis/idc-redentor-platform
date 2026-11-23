import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { loadMessages } from "@src/i18n/load-messages";
import { AuthorsListView, type AuthorListRow } from "./authors-list-view";

const esMessages = loadMessages("es-AR");

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => {
    const root = (esMessages as Record<string, unknown>)[ns] as Record<
      string,
      unknown
    >;
    return (key: string, params?: Record<string, unknown>) => {
      const val = key.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object") {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, root);
      if (typeof val !== "string") return key;
      if (!params) return val;
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
        val,
      );
    };
  },
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("AuthorsListView (C3)", () => {
  const sampleRows: AuthorListRow[] = [
    {
      id: "64b000000000000000000031",
      href: "/content/authors/64b000000000000000000031",
      name: "Ana Gómez",
      avatarUrl: "https://example.public.blob.vercel-storage.com/ana.png",
      avatarAlt: "Foto de Ana",
      status: "published",
      updated: "22/11 10:00 · Admin",
    },
    {
      id: "64b000000000000000000032",
      href: "/content/authors/64b000000000000000000032",
      name: "Juan Pérez",
      status: "draft",
      updated: "22/11 10:05 · Admin",
    },
  ];

  it("renders avatar thumbnails, initials fallback, status chips, and Nueva persona CTA", async () => {
    const ui = await AuthorsListView({
      newHref: "/content/authors/new",
      currentQuery: "",
      page: 1,
      pageSize: 25,
      total: 2,
      rows: sampleRows,
    });
    render(ui);

    expect(screen.getByRole("link", { name: /Nueva persona/i })).toHaveAttribute(
      "href",
      "/content/authors/new",
    );
    expect(screen.getAllByAltText("Foto de Ana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Publicado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0);
  });

  it("renders empty filtered state with Limpiar filtros and hides Nueva persona when read-only", async () => {
    const ui = await AuthorsListView({
      newHref: undefined,
      currentQuery: "inexistente",
      page: 1,
      pageSize: 25,
      total: 0,
      rows: [],
    });
    render(ui);

    expect(
      screen.queryByRole("link", { name: /Nueva persona/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No encontramos nada con esos filtros."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Limpiar filtros" }).length,
    ).toBeGreaterThan(0);
  });
});
