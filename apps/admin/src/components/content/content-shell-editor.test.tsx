import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
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

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { ContentShellEditor } from "./content-shell-editor";

const esMessages = loadMessages("es-AR");

describe("ContentShellEditor patch-safety invariant (PM Catch #4)", () => {
  it("patches ONLY its rendered top-level field and NEVER touches unrendered fields or topics.protected", async () => {
    const user = userEvent.setup();
    const initialValues = {
      name: { "es-AR": "Política de privacidad" },
      slug: { "es-AR": "privacidad", "en-US": "privacy" },
      body: { "es-AR": { type: "doc", content: [{ type: "paragraph" }] } },
      protected: true,
    };

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "t1",
        draft: { ...initialValues, name: { "es-AR": "Privacidad actualizada" } },
        revision: 2,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "draft",
      changedFields: ["name"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <ContentShellEditor
          collection="topics"
          docId="t1"
          initialDoc={{
            _id: "t1",
            draft: initialValues,
            revision: 1,
            createdAt: "2026-11-20T00:00:00.000Z",
            updatedAt: "2026-11-21T00:00:00.000Z",
            updatedBy: "u1",
          }}
          initialStatus="draft"
          initialValues={initialValues}
          backHref="/content/topics"
          backLabel="Páginas informativas"
          fallbackTitle="Política de privacidad"
          editableField={{
            kind: "localizedText",
            key: "name",
            labelKey: "lists.columns.name",
          }}
          permissions={{
            canWrite: true,
            canPublish: true,
            canPublishProtected: false,
          }}
          isTrialMode
          isPublishEmailsEnabled={false}
          isProtected
          protectedKind="legal"
        />
      </NextIntlClientProvider>,
    );

    // Protected legal notice & disabled Publish
    expect(screen.getByText(/Texto legal protegido/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();

    const input = screen.getByLabelText(/Nombre/);
    await user.clear(input);
    await user.type(input, "Privacidad actualizada");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(mockSaveDraftAction).toHaveBeenCalledTimes(1);
    });

    const sentPatch = mockSaveDraftAction.mock.calls[0]![0].patch as Record<
      string,
      unknown
    >;
    expect(Object.keys(sentPatch)).toEqual(["name"]);
    expect(sentPatch).not.toHaveProperty("protected");
    expect(sentPatch).not.toHaveProperty("body");
    expect(sentPatch).not.toHaveProperty("slug");
  });

  it("strips excluded fields (protected, slug) even when restored from tampered localStorage recovery", async () => {
    window.localStorage.clear();
    mockSaveDraftAction.mockReset();

    const user = userEvent.setup();
    const initialValues = {
      name: { "es-AR": "Política de privacidad" },
      slug: { "es-AR": "privacidad", "en-US": "privacy" },
      body: { "es-AR": { type: "doc", content: [{ type: "paragraph" }] } },
      protected: true,
    };

    window.localStorage.setItem(
      "idcr-admin:draft:topics:t1",
      JSON.stringify({
        revision: 1,
        savedAt: Date.now(),
        values: {
          ...initialValues,
          name: { "es-AR": "Privacidad restaurada" },
          protected: false,
          slug: { "es-AR": "hacked" },
        },
      }),
    );

    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        _id: "t1",
        draft: { ...initialValues, name: { "es-AR": "Privacidad restaurada" } },
        revision: 2,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T00:00:00.000Z",
        updatedBy: "u1",
      },
      status: "draft",
      changedFields: ["name"],
      noOp: false,
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <ContentShellEditor
          collection="topics"
          docId="t1"
          initialDoc={{
            _id: "t1",
            draft: initialValues,
            revision: 1,
            createdAt: "2026-11-20T00:00:00.000Z",
            updatedAt: "2026-11-21T00:00:00.000Z",
            updatedBy: "u1",
          }}
          initialStatus="draft"
          initialValues={initialValues}
          backHref="/content/topics"
          backLabel="Páginas informativas"
          fallbackTitle="Política de privacidad"
          editableField={{
            kind: "localizedText",
            key: "name",
            labelKey: "lists.columns.name",
          }}
          permissions={{
            canWrite: true,
            canPublish: true,
            canPublishProtected: false,
          }}
          isTrialMode
          isPublishEmailsEnabled={false}
          isProtected
          protectedKind="legal"
        />
      </NextIntlClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Restaurar" }));
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(mockSaveDraftAction).toHaveBeenCalledTimes(1);
    });

    const sentPatch = mockSaveDraftAction.mock.calls[0]![0].patch as Record<
      string,
      unknown
    >;
    expect(Object.keys(sentPatch)).toEqual(["name"]);
    expect(sentPatch).not.toHaveProperty("protected");
    expect(sentPatch).not.toHaveProperty("slug");
    window.localStorage.clear();
  });
});
