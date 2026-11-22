import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { loadMessages } from "@src/i18n/load-messages";
import { EntryEditor } from "./entry-editor";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";

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
}));

const { mockRouterPush, mockRouterReplace, mockRouterRefresh } = vi.hoisted(
  () => ({
    mockRouterPush: vi.fn(),
    mockRouterReplace: vi.fn(),
    mockRouterRefresh: vi.fn(),
  }),
);

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
}));

const esMessages = loadMessages("es-AR");

interface TestDraft {
  title: { "es-AR": string; "en-US"?: string };
  slug?: string;
}

const baseDoc: SerializedContentDoc<TestDraft> = {
  _id: "65f1234567890abcdef12345",
  draft: { title: { "es-AR": "Mi artículo" }, slug: "mi-articulo" },
  revision: 2,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-21T15:00:00.000Z",
  updatedBy: "u1",
  updatedByLabel: "Ana",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EntryEditor frame (Checkpoint 4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockRouterRefresh.mockReset();
  });

  it("shows focused ErrorSummary (no dialog) when strict publish check fails, and saves draft first", async () => {
    const user = userEvent.setup();
    const preparePublish = vi.fn().mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: {
        featuredImageId: ["Required"],
      },
      savedDoc: { ...baseDoc, revision: 3 },
      savedStatus: "draft",
    });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode
        actionOverrides={{ preparePublish }}
        renderLocalizedFields={({ form }) => (
          <input
            aria-label="Título"
            value={form.values.title["es-AR"]}
            onChange={(e) =>
              form.setField("title", { ...form.values.title, "es-AR": e.target.value })
            }
          />
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getByText(/Todavía no se puede publicar/)).toBeDefined();
    });
    expect(screen.getByText("Falta la imagen destacada.")).toBeDefined();
    // No publish confirmation dialog opened
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses actionOverrides, shows PublishDialog with trial banner + isPublishEmailsEnabled, and threads approvedConfirmed/notify", async () => {
    const user = userEvent.setup();
    const preparePublish = vi.fn().mockResolvedValue({
      ok: true,
      doc: { ...baseDoc, revision: 3 },
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: true,
      willCascade: [
        { collection: "authors", docId: "a1", label: "Juan Pérez" },
      ],
    });
    const confirmPublish = vi.fn().mockResolvedValue({
      ok: true,
      doc: {
        ...baseDoc,
        revision: 4,
        published: baseDoc.draft,
      },
      status: "published",
      revalidated: true,
      notified: true,
    });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode
        isPublishEmailsEnabled
        actionOverrides={{ preparePublish, confirmPublish }}
        publishDialogExtras={(ctx) =>
          ctx.isFirstPublish && ctx.isPublishEmailsEnabled ? (
            <div data-testid="email-box-slot">Avisar por email</div>
          ) : null
        }
        getPublishOptions={() => ({ notify: true, approvedConfirmed: true })}
        renderLocalizedFields={({ form }) => (
          <input
            aria-label="Título"
            value={form.values.title["es-AR"]}
            onChange={(e) =>
              form.setField("title", { ...form.values.title, "es-AR": e.target.value })
            }
          />
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
    expect(screen.getByTestId("trial-mode-banner")).toBeDefined();
    expect(screen.getByTestId("email-box-slot")).toBeDefined();
    expect(screen.getByText(/También se publica: Juan Pérez/)).toBeDefined();

    // Confirm inside PublishDialog
    const publishButtons = screen.getAllByRole("button", { name: "Publicar" });
    await user.click(publishButtons[publishButtons.length - 1]!);

    await waitFor(() => {
      expect(confirmPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "posts",
          docId: baseDoc._id,
          notify: true,
          approvedConfirmed: true,
        }),
      );
    });
    expect(screen.getByText("Publicado. Ya está en el sitio.")).toBeDefined();
  });

  it("opens ConflictDialog on revision mismatch and retries with explicit overwrite: true only on user confirmation", async () => {
    const user = userEvent.setup();
    const saveDraft = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: "conflict",
        updatedBy: "u2",
        updatedByLabel: "Carlos",
        updatedAt: "2026-11-21T16:00:00.000Z",
        currentRevision: 5,
      })
      .mockResolvedValueOnce({
        ok: true,
        doc: { ...baseDoc, revision: 6, draft: { title: { "es-AR": "Nuevo" }, slug: "mi-articulo" } },
        status: "draft",
        changedFields: ["title"],
        noOp: false,
      });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: false, canPublishProtected: false }}
        isTrialMode={false}
        actionOverrides={{ saveDraft }}
        renderLocalizedFields={({ form }) => (
          <input
            aria-label="Título"
            value={form.values.title["es-AR"]}
            onChange={(e) =>
              form.setField("title", { ...form.values.title, "es-AR": e.target.value })
            }
          />
        )}
      />,
    );

    // Write-only user sees Publish disabled with explanation
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    expect(screen.getByText(/No tenés permiso para publicar/)).toBeDefined();

    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Nuevo");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(
        screen.getByText("Esta entrada cambió desde que la abriste"),
      ).toBeDefined();
    });
    expect(saveDraft).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ overwrite: undefined }),
    );

    await user.click(
      screen.getByRole("button", { name: "Sobrescribir con mi versión" }),
    );

    await waitFor(() => {
      expect(saveDraft).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ overwrite: true }),
      );
    });
  });

  it("hides LocaleTabs when renderLocalizedFields is omitted (D20: location/authors) and uses custom countMissingEn", () => {
    const first = renderWithIntl(
      <EntryEditor<{ name: string }>
        collection="authors"
        docId="a1"
        initialStatus="draft"
        initialValues={{ name: "Juan" }}
        backHref="/content/authors"
        backLabel="Personas"
        getTitle={(v) => v.name}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode={false}
        renderGeneralFields={({ form }) => (
          <input
            aria-label="Nombre"
            value={form.values.name}
            onChange={(e) => form.setField("name", e.target.value)}
          />
        )}
      />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    first.unmount();

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode={false}
        countMissingEn={() => 4}
        renderLocalizedFields={() => <div>Campos</div>}
      />,
    );

    expect(screen.getByText("· faltan 4")).toBeDefined();
  });

  it("sends full on-screen draft on clean-form conflict overwrite in preparePublish (C1)", async () => {
    const user = userEvent.setup();
    const preparePublish = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: "conflict",
        updatedBy: "u2",
        updatedByLabel: "Carlos",
        updatedAt: "2026-11-21T16:00:00.000Z",
        currentRevision: 5,
      })
      .mockResolvedValueOnce({
        ok: true,
        doc: { ...baseDoc, revision: 6 },
        status: "draft",
        isFirstPublish: true,
        isPublishEmailsEnabled: false,
        willCascade: [],
      });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode={false}
        actionOverrides={{ preparePublish }}
        renderLocalizedFields={() => <div>Campos</div>}
      />,
    );

    // Clean form (isDirty === false): click Publish -> conflict
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(
        screen.getByText("Esta entrada cambió desde que la abriste"),
      ).toBeDefined();
    });
    expect(preparePublish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ draftPatch: undefined, overwrite: undefined }),
    );

    // Confirm Overwrite -> MUST send full on-screen draft + overwrite: true
    await user.click(
      screen.getByRole("button", { name: "Sobrescribir con mi versión" }),
    );

    await waitFor(() => {
      expect(preparePublish).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          draftPatch: baseDoc.draft,
          overwrite: true,
        }),
      );
    });
  });

  it("replaces /new URL without unmounting on direct preparePublish and respects isPublishEmailsEnabled={false} fallback (C3)", async () => {
    const user = userEvent.setup();
    const newId = "65f1234567890abcdef77777";
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const preparePublish = vi.fn().mockResolvedValue({
      ok: true,
      doc: { ...baseDoc, _id: newId, revision: 1 },
      status: "draft",
      isFirstPublish: true,
      willCascade: [],
    });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode={false}
        isPublishEmailsEnabled={false}
        actionOverrides={{ preparePublish }}
        publishDialogExtras={(ctx) =>
          ctx.isFirstPublish && ctx.isPublishEmailsEnabled ? (
            <div data-testid="email-box-slot">Avisar por email</div>
          ) : null
        }
        renderLocalizedFields={() => <div>Campos</div>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      `/es-AR/content/posts/${newId}`,
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("email-box-slot")).toBeNull();
    replaceStateSpy.mockRestore();
  });

  it("resumes saveDraft immediately after confirming lossy-save warning without stale closure", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue({
      ok: true,
      doc: {
        ...baseDoc,
        revision: 3,
        draft: { title: { "es-AR": "Con formato simplificado" }, slug: "mi-articulo" },
      },
      status: "draft",
      changedFields: ["title"],
      noOp: false,
    });

    renderWithIntl(
      <EntryEditor<TestDraft>
        collection="posts"
        docId={baseDoc._id}
        initialDoc={baseDoc}
        initialStatus="draft"
        initialValues={baseDoc.draft}
        backHref="/content/posts"
        backLabel="Blog"
        getTitle={(v) => v.title["es-AR"]}
        permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
        isTrialMode={false}
        actionOverrides={{ saveDraft }}
        renderLocalizedFields={({ form }) => (
          <div>
            <button
              type="button"
              onClick={() => {
                form.markLossyField("title.es-AR", true);
                form.setField("title", { "es-AR": "Con formato simplificado" });
              }}
            >
              Simular cambio lossy
            </button>
          </div>
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Simular cambio lossy" }));
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    expect(
      await screen.findByText("¿Guardar y simplificar formato?"),
    ).toBeDefined();
    expect(saveDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Guardar igual" }));

    await waitFor(() => {
      expect(saveDraft).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("¿Guardar y simplificar formato?")).toBeNull();
  });

  it("strips leading locale prefix when confirming unsaved-leave navigation so locale is never doubled", async () => {
    const user = userEvent.setup();
    const localizedHref = "/es-AR/content/posts";

    renderWithIntl(
      <div>
        <a href={localizedHref}>Volver al blog</a>
        <EntryEditor<TestDraft>
          collection="posts"
          docId={baseDoc._id}
          initialDoc={baseDoc}
          initialStatus="draft"
          initialValues={baseDoc.draft}
          backHref="/content/posts"
          backLabel="Blog"
          getTitle={(v) => v.title["es-AR"]}
          permissions={{ canWrite: true, canPublish: true, canPublishProtected: true }}
          isTrialMode={false}
          renderLocalizedFields={({ form }) => (
            <input
              aria-label="Título"
              value={form.values.title["es-AR"]}
              onChange={(e) =>
                form.setField("title", { ...form.values.title, "es-AR": e.target.value })
              }
            />
          )}
        />
      </div>,
    );

    await user.type(screen.getByLabelText("Título"), " editado");
    await user.click(screen.getByRole("link", { name: "Volver al blog" }));

    expect(await screen.findByText("Tenés cambios sin guardar")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(mockRouterPush).toHaveBeenCalledWith("/content/posts", {
      locale: "es-AR",
    });
  });
});
