import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { AuthorFields } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { AuthorEditor } from "./author-editor";

const {
  mockSaveDraftAction,
  mockCheckContentUsagesAction,
  mockSearchPlatformUsersAction,
} = vi.hoisted(() => ({
  mockSaveDraftAction: vi.fn(),
  mockCheckContentUsagesAction: vi.fn(),
  mockSearchPlatformUsersAction: vi.fn(),
}));

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  createContentAction: vi.fn(),
  saveDraftAction: (...args: unknown[]) => mockSaveDraftAction(...args),
  preparePublishAction: vi.fn(),
  confirmPublishAction: vi.fn(),
  discardChangesAction: vi.fn(),
  unpublishContentAction: vi.fn(),
  deleteContentAction: vi.fn(),
  retryRevalidationAction: vi.fn(),
  checkContentUsagesAction: (...args: unknown[]) =>
    mockCheckContentUsagesAction(...args),
}));

vi.mock("@src/app/[locale]/(app)/content/authors/actions", () => ({
  searchPlatformUsersAction: (...args: unknown[]) =>
    mockSearchPlatformUsersAction(...args),
}));

vi.mock("@src/components/content/media", () => ({
  MediaField: ({ value }: { value?: string }) => (
    <div data-testid="mock-media-field">{value ?? "no-avatar"}</div>
  ),
}));

vi.mock("@src/i18n/routing", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const esMessages = loadMessages("es-AR");

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const AUTHOR_DOC: SerializedContentDoc<AuthorFields> = {
  _id: "64b000000000000000000030",
  draft: {
    name: "Pastor Ejemplo",
    email: "pastor@example.org",
    userId: "64b000000000000000000099",
  },
  revision: 1,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  updatedBy: "u1",
};

describe("AuthorEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("hides LocaleTabs (D20) and Preview, shows internal email label, and guards userId picker without users:read", () => {
    renderWithIntl(
      <AuthorEditor
        docId={AUTHOR_DOC._id}
        initialDoc={AUTHOR_DOC}
        initialStatus="draft"
        initialValues={AUTHOR_DOC.draft}
        initialAvatar={null}
        initialLinkedUser={null}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: false,
          canManageMedia: true,
          canReadUsers: false,
        }}
        isTrialMode={false}
      />,
    );

    // Non-localized -> no LocaleTabs & no Preview button
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vista previa" }),
    ).not.toBeInTheDocument();

    // Internal email label
    expect(
      screen.getByLabelText("Email (interno, no se muestra en el sitio)"),
    ).toHaveValue("pastor@example.org");

    // Without users:read, no picker button ("Elegir..." or "Cambiar") & zero calls to admin.users (C3 M27)
    expect(
      screen.queryByRole("button", { name: "Elegir usuario del panel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cambiar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Solo quienes tienen permiso para ver usuarios/),
    ).toBeInTheDocument();
    expect(mockSearchPlatformUsersAction).not.toHaveBeenCalled();
  });

  it("allows clearing optional email to undefined and picking a platform user when canReadUsers is true (AC8)", async () => {
    const user = userEvent.setup();
    mockSearchPlatformUsersAction.mockResolvedValue({
      ok: true,
      items: [
        {
          id: "64b000000000000000000088",
          displayName: "Ana Ejemplo",
          email: "ana@example.org",
        },
      ],
    });
    mockSaveDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        ...AUTHOR_DOC,
        draft: { name: "Pastor Ejemplo", userId: "64b000000000000000000088" },
        revision: 2,
      },
      status: "draft",
      changedFields: ["email", "userId"],
      noOp: false,
    });

    renderWithIntl(
      <AuthorEditor
        docId={AUTHOR_DOC._id}
        initialDoc={AUTHOR_DOC}
        initialStatus="draft"
        initialValues={AUTHOR_DOC.draft}
        initialAvatar={null}
        initialLinkedUser={{
          id: "64b000000000000000000099",
          displayName: "Usuario Previo",
          email: "prev@example.org",
        }}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: false,
          canManageMedia: true,
          canReadUsers: true,
        }}
        isTrialMode={false}
      />,
    );

    // Clear email -> normalizes to undefined
    const emailInput = screen.getByLabelText(
      "Email (interno, no se muestra en el sitio)",
    );
    await user.clear(emailInput);

    // Pick a different platform user
    await user.click(screen.getByRole("button", { name: "Cambiar" }));
    const anaOption = await screen.findByText("Ana Ejemplo");
    await user.click(anaOption);
    await user.click(screen.getByRole("button", { name: "Seleccionar" }));

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(mockSaveDraftAction).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "authors",
          docId: AUTHOR_DOC._id,
          patch: { email: undefined, userId: "64b000000000000000000088" },
        }),
      );
    });
  });
});
