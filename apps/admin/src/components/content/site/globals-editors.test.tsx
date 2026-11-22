import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type {
  ContactFormFields,
  FooterFields,
  LocationFields,
  NavigationMenuFields,
  SingleEmailFormFields,
} from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";

const { mockSaveDraftAction } = vi.hoisted(() => ({
  mockSaveDraftAction: vi.fn(),
}));

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  createContentAction: vi.fn(),
  saveDraftAction: mockSaveDraftAction,
  preparePublishAction: vi.fn(),
  confirmPublishAction: vi.fn(),
  discardChangesAction: vi.fn(),
  unpublishContentAction: vi.fn(),
  deleteContentAction: vi.fn(),
  retryRevalidationAction: vi.fn(),
  checkContentUsagesAction: vi.fn(),
  searchBibleVersesAction: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  createOrReuseBibleVerseAction: vi.fn(),
}));

vi.mock("@src/app/[locale]/(app)/content/media/actions", () => ({
  getMediaByIdsAction: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  listMediaAction: vi.fn().mockResolvedValue({ ok: true, items: [], total: 0 }),
}));

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NavigationMenuEditor } from "./navigation-menu-editor";
import { FooterEditor } from "./footer-editor";
import { LocationEditor } from "./location-editor";
import { SingleEmailFormEditor } from "./single-email-form-editor";
import { ContactFormEditor } from "./contact-form-editor";

const esMessages = loadMessages("es-AR");
const fullPerms = {
  canWrite: true,
  canPublish: true,
  canPublishProtected: true,
};

function makeDoc<T>(id: string, draft: T) {
  return {
    _id: id,
    draft,
    published: draft,
    revision: 1,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
    updatedBy: "u1",
  };
}

describe("Globals editors (menu, footer, location, subscribe, contact)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("NavigationMenuEditor renders ordered items with closed SITE_PAGES select", async () => {
    const user = userEvent.setup();
    const initial: NavigationMenuFields = {
      kind: "navigationMenu",
      machineName: "main-menu",
      menuItems: [
        { groupName: { "es-AR": "Comunidad" }, groupLink: "community" },
      ],
    };

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <NavigationMenuEditor
          initialDoc={makeDoc("g-menu", initial)}
          initialStatus="published"
          initialValues={initial}
          backHref="/content"
          backLabel="Contenido"
          friendlyTitle="Menú principal"
          machineName="main-menu"
          appearsOn={["Inicio"]}
          permissions={fullPerms}
          isTrialMode={false}
          isPublishEmailsEnabled={false}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Comunidad")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Agregar enlace/i }));
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("FooterEditor offers only facebook/instagram/youtube platforms and shows SharedLocationCard", () => {
    const initial: FooterFields = {
      kind: "footer",
      machineName: "footer",
      logo: "67a000000000000000000003",
      shortDescription: { "es-AR": "Iglesia de Cristo Redentor" },
      socialLinks: [
        { platform: "instagram", url: "https://instagram.com/idcredentor" },
      ],
    };

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <FooterEditor
          initialDoc={makeDoc("g-footer", initial)}
          initialStatus="published"
          initialValues={initial}
          initialMediaById={{}}
          sharedLocation={{
            addressLine1: "Perón 4385",
            city: "Buenos Aires",
            country: "Argentina",
          }}
          backHref="/content"
          backLabel="Contenido"
          friendlyTitle="Pie de página"
          machineName="footer"
          appearsOn={["Inicio"]}
          permissions={fullPerms}
          canManageMedia
          isTrialMode={false}
          isPublishEmailsEnabled={false}
        />
      </NextIntlClientProvider>,
    );

    const platformSelect = screen.getByLabelText(/Plataforma/i);
    const values = Array.from(platformSelect.querySelectorAll("option")).map(
      (opt) => opt.value,
    );
    expect(values).toEqual(["facebook", "instagram", "youtube"]);
    expect(screen.getByTestId("shared-location-card")).toHaveTextContent(
      "Perón 4385",
    );
  });

  it("LocationEditor hides LocaleTabs (non-localized) and shows shared address notice", async () => {
    const user = userEvent.setup();
    const initial: LocationFields = {
      kind: "location",
      machineName: "location",
      addressLine1: "Perón 4385",
      city: "Buenos Aires",
      country: "Argentina",
      lat: -34.6058,
      lon: -58.4287,
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: makeDoc("g-loc", { ...initial, city: "CABA" }),
      status: "changed",
      changedFields: ["city"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <LocationEditor
          initialDoc={makeDoc("g-loc", initial)}
          initialStatus="published"
          initialValues={initial}
          backHref="/content"
          backLabel="Contenido"
          friendlyTitle="Dirección y mapa"
          machineName="location"
          appearsOn={["Inicio"]}
          permissions={fullPerms}
          isTrialMode={false}
          isPublishEmailsEnabled={false}
        />
      </NextIntlClientProvider>,
    );

    // Non-localized: LocaleTabs MUST be absent
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(
      screen.getByText(/tanto en el pie de página como en la sección/i),
    ).toBeInTheDocument();

    const cityInput = screen.getByLabelText(/Ciudad/i);
    await user.clear(cityInput);
    await user.type(cityInput, "CABA");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(mockSaveDraftAction).toHaveBeenCalledTimes(1));
    expect(mockSaveDraftAction.mock.calls[0]?.[0].patch).toEqual({
      city: "CABA",
    });
  });

  it("SingleEmailFormEditor binds all 5 localized fields", () => {
    const initial: SingleEmailFormFields = {
      kind: "singleEmailForm",
      machineName: "single-email-subscribe",
      title: { "es-AR": "Suscribite" },
      shortDescription: { "es-AR": "Recibí novedades" },
      ctaText: { "es-AR": "Suscribirme" },
      inputPlaceholder: { "es-AR": "tu@correo.com" },
      successMessage: { "es-AR": "¡Gracias!" },
    };

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <SingleEmailFormEditor
          initialDoc={makeDoc("g-sub", initial)}
          initialStatus="published"
          initialValues={initial}
          backHref="/content"
          backLabel="Contenido"
          friendlyTitle="Suscripción por correo"
          machineName="single-email-subscribe"
          appearsOn={["Inicio"]}
          permissions={fullPerms}
          isTrialMode={false}
          isPublishEmailsEnabled={false}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Suscribite")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Recibí novedades")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Suscribirme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("tu@correo.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("¡Gracias!")).toBeInTheDocument();
  });

  it("ContactFormEditor locks field structure (no add/remove/reorder) while allowing label, placeholder, dropdown options, verse, and inlineLink agreementNote (AC3)", async () => {
    const user = userEvent.setup();
    const initial: ContactFormFields = {
      kind: "contactForm",
      machineName: "contact-form",
      title: { "es-AR": "Contacto" },
      description: { "es-AR": "Escribinos" },
      ctaText: { "es-AR": "Enviar" },
      bibleVerseId: "v1",
      agreementNote: {
        "es-AR": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Política" }] }],
        },
      },
      fields: [
        {
          inputId: "name",
          type: "Short text",
          required: true,
          name: { "es-AR": "Nombre" },
          placeholder: { "es-AR": "Tu nombre" },
        },
        {
          inputId: "subject",
          type: "Dropdown",
          required: true,
          name: { "es-AR": "Asunto" },
          values: { "es-AR": ["Información", "Oración"] },
        },
      ],
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: makeDoc("g-contact", initial),
      status: "changed",
      changedFields: ["fields"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <ContactFormEditor
          initialDoc={makeDoc("g-contact", initial)}
          initialStatus="published"
          initialValues={initial}
          initialMediaById={{}}
          initialVersesById={{
            v1: {
              id: "v1",
              status: "published",
              revision: 1,
              fields: {
                book: { "es-AR": "Salmos", "en-US": "Psalms" },
                chapter: 23,
                fromVerse: 1,
                version: { "es-AR": "RVR1960", "en-US": "NIV" },
              },
            },
          }}
          backHref="/content"
          backLabel="Contenido"
          friendlyTitle="Formulario de contacto"
          machineName="contact-form"
          appearsOn={["Conocenos"]}
          permissions={fullPerms}
          canManageMedia
          isTrialMode={false}
          isPublishEmailsEnabled={false}
        />
      </NextIntlClientProvider>,
    );

    // Verse displays stored version verbatim
    expect(screen.getByText("Salmos 23:1 · RVR1960")).toBeInTheDocument();

    // Locked fields section shows both fields, read-only inputIds, and NO add/remove field controls
    const lockedBox = screen.getByTestId("contact-form-locked-fields");
    const nameFieldCard = within(lockedBox).getByTestId("contact-field-name");
    expect(within(nameFieldCard).getByText("name")).toBeInTheDocument();
    expect(within(nameFieldCard).getByText("Texto corto")).toBeInTheDocument();
    expect(within(nameFieldCard).getByText("Obligatorio")).toBeInTheDocument();
    expect(
      within(nameFieldCard).queryByRole("button", { name: /Quitar|Subir|Bajar/i }),
    ).toBeNull();

    // Dropdown field allows editing/adding options
    const subjectCard = within(lockedBox).getByTestId("contact-field-subject");
    expect(within(subjectCard).getByDisplayValue("Información")).toBeInTheDocument();
    expect(within(subjectCard).getByDisplayValue("Oración")).toBeInTheDocument();

    // Edit label on `name` field and verify structural keys stay intact in patch
    const labelInput = within(nameFieldCard).getByLabelText(/Etiqueta/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Nombre completo");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(mockSaveDraftAction).toHaveBeenCalledTimes(1));
    const patchedFields = mockSaveDraftAction.mock.calls[0]?.[0].patch.fields;
    expect(patchedFields).toHaveLength(2);
    expect(patchedFields[0]).toMatchObject({
      inputId: "name",
      type: "Short text",
      required: true,
      name: { "es-AR": "Nombre completo" },
    });
    expect(patchedFields[1]).toMatchObject({
      inputId: "subject",
      type: "Dropdown",
      required: true,
    });
  });
});
