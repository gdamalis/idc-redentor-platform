import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { SITE_PAGE_SLUGS } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  searchBibleVersesAction: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  createOrReuseBibleVerseAction: vi.fn(),
}));

import { FixedIdentityMeta } from "./fixed-identity-meta";
import { SitePageSelect } from "./site-page-select";
import { SharedLocationCard } from "./shared-location-card";
import { SingleVerseField } from "./single-verse-field";
import { LocalizedStringListField } from "./localized-string-list-field";

const esMessages = loadMessages("es-AR");
const enMessages = loadMessages("en-US");

function wrap(ui: ReactNode, locale: "es-AR" | "en-US" = "es-AR") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en-US" ? enMessages : esMessages}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Shared site-editor building blocks", () => {
  it("FixedIdentityMeta renders read-only machineName, layout, and appearsOn chips", () => {
    wrap(
      <FixedIdentityMeta
        machineName="our-mission"
        layout="hero"
        appearsOn={["Inicio"]}
      />,
    );
    expect(screen.getByTestId("fixed-machine-name")).toHaveTextContent(
      "our-mission",
    );
    expect(screen.getByTestId("fixed-section-layout")).toHaveTextContent(
      "Portada",
    );
    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("SitePageSelect offers strictly the 6 SITE_PAGES and emits valid slugs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<SitePageSelect value="home" allowEmpty onChange={onChange} />);

    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map(
      (opt) => opt.value,
    );
    expect(options).toEqual(["", ...SITE_PAGE_SLUGS]);

    await user.selectOptions(select, "come-meet-us");
    expect(onChange).toHaveBeenCalledWith("come-meet-us");

    await user.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("SharedLocationCard shows address summary with link to /content/location and handles null", () => {
    const { rerender } = wrap(
      <SharedLocationCard
        location={{
          addressLine1: "Perón 4385",
          neighborhood: "Almagro",
          city: "Buenos Aires",
          country: "Argentina",
          googleMapsUrl: "https://maps.google.com/?q=idcr",
          mapEmbedUrl: "https://maps.google.com/embed?pb=1",
        }}
      />,
    );
    expect(screen.getByText("Perón 4385")).toBeInTheDocument();
    expect(
      screen.getByText("Almagro, Buenos Aires, Argentina"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Editar dirección/i });
    expect(link).toHaveAttribute("href", "/content/location");

    rerender(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <SharedLocationCard location={null} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText(/todavía no está configurada/i),
    ).toBeInTheDocument();
  });

  it("SingleVerseField displays stored version verbatim and unlinks without deleting", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <SingleVerseField
        value="v1"
        initialVerse={{
          id: "v1",
          status: "published",
          revision: 1,
          fields: {
            book: { "es-AR": "Juan", "en-US": "John" },
            chapter: 3,
            fromVerse: 16,
            version: { "es-AR": "RVR1960", "en-US": "KJV" },
            text: { "es-AR": "Porque de tal manera amó Dios al mundo..." },
          },
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Juan 3:16 · RVR1960")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("LocalizedStringListField adds, edits, and copies from Spanish on en-US tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <LocalizedStringListField
        activeLocale="en-US"
        value={{ "es-AR": ["Información", "Oración"] }}
        addLabel="Agregar opción"
        idPrefix="opts"
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Información · Oración")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar del español" }));
    expect(onChange).toHaveBeenCalledWith({
      "es-AR": ["Información", "Oración"],
      "en-US": ["Información", "Oración"],
    });
  });
});
