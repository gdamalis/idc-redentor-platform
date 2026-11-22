import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { EventBannerFields, SeoEntryFields } from "@idcr/content";
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

import { EventBannerEditor } from "./event-banner-editor";
import { SeoEntryEditor } from "./seo-entry-editor";

const esMessages = loadMessages("es-AR");

describe("EventBannerEditor & SeoEntryEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("EventBannerEditor renders event info, non-localized time/date, and shared location card", async () => {
    const user = userEvent.setup();
    const initial: EventBannerFields = {
      machineName: "event-sunday-meetings",
      event: {
        name: { "es-AR": "Reuniones dominicales" },
        dayOfWeek: { "es-AR": "Domingos" },
        time: "17:00",
        note: { "es-AR": "Abierto a todos" },
      },
      image: "67a000000000000000000002",
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "eb-1",
        draft: { ...initial, event: { ...initial.event, time: "18:00" } },
        published: initial,
        revision: 2,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "changed",
      changedFields: ["event"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <EventBannerEditor
          initialDoc={{
            _id: "eb-1",
            draft: initial,
            published: initial,
            revision: 1,
            createdAt: "2026-11-20T00:00:00.000Z",
            updatedAt: "2026-11-21T00:00:00.000Z",
            updatedBy: "u1",
          }}
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
          friendlyTitle="Reuniones de los domingos"
          machineName="event-sunday-meetings"
          appearsOn={["Conocenos"]}
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

    expect(screen.getByTestId("shared-location-card")).toHaveTextContent(
      "Perón 4385",
    );
    const timeInput = screen.getByLabelText(/Horario/i);
    await user.clear(timeInput);
    await user.type(timeInput, "18:00");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(mockSaveDraftAction).toHaveBeenCalledTimes(1));
    expect(mockSaveDraftAction.mock.calls[0]?.[0].patch.event.time).toBe(
      "18:00",
    );
  });

  it("SeoEntryEditor shows exact advisory char counts (kills M14) and strips blank en-US keywords on save (C1 / M25)", async () => {
    const user = userEvent.setup();
    const initial: SeoEntryFields = {
      machineName: "seo-home",
      title: { "es-AR": "Inicio" },
      description: { "es-AR": "Bienvenidos" },
      keywords: { "es-AR": ["iglesia"] },
      siteName: { "es-AR": "IDCR" },
      type: "website",
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "seo-1",
        draft: initial,
        published: initial,
        revision: 2,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "changed",
      changedFields: ["keywords"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <SeoEntryEditor
          initialDoc={{
            _id: "seo-1",
            draft: initial,
            published: initial,
            revision: 1,
            createdAt: "2026-11-20T00:00:00.000Z",
            updatedAt: "2026-11-21T00:00:00.000Z",
            updatedBy: "u1",
          }}
          initialStatus="published"
          initialValues={initial}
          initialMediaById={{}}
          backHref="/content/seo"
          backLabel="SEO de páginas"
          friendlyTitle="SEO: Inicio"
          machineName="seo-home"
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

    // Exact text assertions kill M14 (`60` -> `600` mutation)
    expect(screen.getByTestId("seo-title-char-count")).toHaveTextContent(
      /^6 \/ 60 caracteres recomendados$/,
    );
    expect(screen.getByTestId("seo-description-char-count")).toHaveTextContent(
      /^11 \/ 160 caracteres recomendados$/,
    );

    const titleInput = screen.getByLabelText(/Título para buscadores/i);
    await user.type(titleInput, "a".repeat(60));
    expect(screen.getByTestId("seo-title-char-count")).toHaveTextContent(
      /^66 \/ 60 caracteres recomendados \(puede recortarse en resultados\)$/,
    );
    // Advisory only — Save draft stays enabled
    expect(
      screen.getByRole("button", { name: "Guardar borrador" }),
    ).toBeEnabled();

    // Switch to English, add a blank keyword row, and verify `en-US` is omitted on save (C1)
    await user.click(screen.getByRole("tab", { name: /English/i }));
    await user.click(
      screen.getByRole("button", { name: /Agregar palabra clave/i }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(mockSaveDraftAction).toHaveBeenCalledTimes(1));
    expect(mockSaveDraftAction.mock.calls[0]?.[0].patch.keywords).toEqual({
      "es-AR": ["iglesia"],
    });
  });
});
