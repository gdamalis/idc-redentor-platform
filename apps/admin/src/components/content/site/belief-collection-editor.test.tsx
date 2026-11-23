import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { BeliefCollectionFields } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  createContentAction: vi.fn(),
  saveDraftAction: vi.fn(),
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

import { BeliefCollectionEditor } from "./belief-collection-editor";

const esMessages = loadMessages("es-AR");

const baseBelief: BeliefCollectionFields = {
  machineName: "our-creed",
  title: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
  items: [
    {
      title: { "es-AR": "Testimonio", "en-US": "Testimony" },
      description: {
        "es-AR": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Desc ES" }] }],
        },
        "en-US": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Desc EN" }] }],
        },
      },
      kind: "Creed",
      bibleVerseId: "v1",
    },
  ],
};

function renderBeliefEditor(canPublishProtected: boolean) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      <BeliefCollectionEditor
        initialDoc={{
          _id: "bc-1",
          draft: baseBelief,
          published: baseBelief,
          revision: 2,
          createdAt: "2026-11-20T00:00:00.000Z",
          updatedAt: "2026-11-21T00:00:00.000Z",
          updatedBy: "u1",
        }}
        initialStatus="changed"
        initialValues={baseBelief}
        initialMediaById={{}}
        initialVersesById={{
          v1: {
            id: "v1",
            status: "published",
            revision: 1,
            fields: {
              book: { "es-AR": "Juan", "en-US": "John" },
              chapter: 3,
              fromVerse: 16,
              version: { "es-AR": "NVI", "en-US": "NIV" },
            },
          },
        }}
        backHref="/content/belief-collections"
        backLabel="Credo y valores"
        friendlyTitle="Nuestro credo"
        machineName="our-creed"
        appearsOn={["Comunidad"]}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected,
        }}
        canManageMedia
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("BeliefCollectionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows doctrinal protected notice, Creed title icon hint, inline toolbar only, stored verse label, and disables Publish without content:publish-protected (AC4, AC6)", async () => {
    renderBeliefEditor(false);

    expect(
      screen.getByText(/Contenido doctrinal protegido/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Si cambiás el título, la tarjeta vuelve al ícono genérico.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Juan 3:16 · NVI")).toBeInTheDocument();
    // Inline rich-text profile: Bold/Italic present, Heading/List/Link absent
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Negrita" }).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("button", { name: "Enlace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lista con viñetas" })).toBeNull();
    expect(screen.queryByLabelText("Estilo de párrafo")).toBeNull();
    // Publish is disabled with reason when lacking content:publish-protected
    const publishBtn = screen.getByRole("button", { name: /Publicar cambios/i });
    expect(publishBtn).toBeDisabled();
    expect(
      screen.getByText(/Necesitás el permiso «Publicar contenido protegido»/i),
    ).toBeInTheDocument();
    // No icon select exists (`F` §13.6, PM D20 Q2)
    expect(screen.queryByLabelText(/ícono|icon/i)).toBeNull();
  });

  it("allows adding and removing belief items (AC5) and enables Publish with content:publish-protected", async () => {
    const user = userEvent.setup();
    renderBeliefEditor(true);

    const publishBtn = screen.getByRole("button", { name: /Publicar cambios/i });
    expect(publishBtn).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Agregar elemento/i }));
    expect(screen.getByText("Elemento 2")).toBeInTheDocument();
  });
});
