import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { SectionFields } from "@idcr/content";
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

import { SectionEditor } from "./section-editor";

const esMessages = loadMessages("es-AR");

function renderSection(initialValues: SectionFields) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      <SectionEditor
        initialDoc={{
          _id: "sec-1",
          draft: initialValues,
          published: initialValues,
          revision: 3,
          createdAt: "2026-11-20T00:00:00.000Z",
          updatedAt: "2026-11-21T00:00:00.000Z",
          updatedBy: "u1",
        }}
        initialStatus="published"
        initialValues={initialValues}
        initialMediaById={{}}
        backHref="/content/sections"
        backLabel="Secciones"
        friendlyTitle="Portada: nuestra misión"
        machineName={initialValues.machineName}
        appearsOn={["Inicio"]}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: true,
        }}
        canManageMedia
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("SectionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hero-specific fields (subHeadline, targetPage, single image) with read-only identity and patches only changed keys", async () => {
    const user = userEvent.setup();
    const hero: SectionFields = {
      machineName: "our-mission",
      layout: "hero",
      headline: { "es-AR": "Bienvenidos" },
      subHeadline: { "es-AR": "A casa" },
      body: {
        "es-AR": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }],
        },
      },
      ctaText: { "es-AR": "Conocenos" },
      targetPage: "come-meet-us",
      image: "67a000000000000000000001",
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "sec-1",
        draft: { ...hero, subHeadline: { "es-AR": "A nuestra casa" } },
        published: hero,
        revision: 4,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "changed",
      changedFields: ["subHeadline"],
      noOp: false,
    });

    renderSection(hero);

    expect(screen.getByTestId("fixed-machine-name")).toHaveTextContent(
      "our-mission",
    );
    expect(screen.getByTestId("fixed-section-layout")).toHaveTextContent(
      "Portada",
    );
    expect(screen.getByLabelText(/Subtítulo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Página destino/i)).toBeInTheDocument();
    // Inline rich-text profile: Bold & Italic present, Heading/List/Link absent (kills M6)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Negrita" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Cursiva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enlace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lista con viñetas" })).toBeNull();
    expect(screen.queryByLabelText("Estilo de párrafo")).toBeNull();
    // Fixed entry offers no Delete or Unpublish
    expect(screen.queryByRole("button", { name: /Eliminar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Despublicar/i })).toBeNull();

    // Clearing optional subHeadline normalizes to `undefined` ($unset, kills M25)
    const subInput = screen.getByLabelText(/Subtítulo/i);
    await user.clear(subInput);
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(mockSaveDraftAction).toHaveBeenCalledTimes(1);
    });
    const call = mockSaveDraftAction.mock.calls[0]?.[0];
    expect(call.patch).toEqual({ subHeadline: undefined });
    expect(call.patch.machineName).toBeUndefined();
    expect(call.patch.layout).toBeUndefined();
  });

  it("renders cta fields, strips leading ? on urlParameters on save (C1 / M25), and hides body/images", async () => {
    const user = userEvent.setup();
    const cta: SectionFields = {
      machineName: "connect-with-us",
      layout: "cta",
      headline: { "es-AR": "Conectate" },
      ctaText: { "es-AR": "Escribinos" },
      targetPage: "come-meet-us",
      urlParameters: "subject=oracion",
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "sec-1",
        draft: { ...cta, urlParameters: "subject=consulta" },
        published: cta,
        revision: 4,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "changed",
      changedFields: ["urlParameters"],
      noOp: false,
    });

    renderSection(cta);

    const paramsInput = screen.getByLabelText(/Parámetros de URL/i);
    expect(paramsInput).toHaveValue("subject=oracion");
    expect(screen.queryByLabelText(/Subtítulo/i)).toBeNull();
    expect(screen.queryByText(/Galería de imágenes/i)).toBeNull();

    await user.clear(paramsInput);
    await user.type(paramsInput, "?subject=consulta");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(mockSaveDraftAction).toHaveBeenCalledTimes(1));
    expect(mockSaveDraftAction.mock.calls[0]?.[0].patch).toEqual({
      urlParameters: "subject=consulta",
    });
  });

  it("renders textBlock fields (body, multi-image gallery) and hides ctaText/targetPage", () => {
    renderSection({
      machineName: "info-community",
      layout: "textBlock",
      headline: { "es-AR": "Comunidad" },
      body: {
        "es-AR": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }],
        },
      },
      images: ["67a000000000000000000002"],
    });

    expect(screen.getByText(/Galería de imágenes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Texto del botón/i)).toBeNull();
    expect(screen.queryByLabelText(/Página destino/i)).toBeNull();
  });
});
