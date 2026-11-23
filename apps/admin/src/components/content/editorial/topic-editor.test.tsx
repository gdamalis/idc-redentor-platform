import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { TopicFields } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { TopicEditor } from "./topic-editor";

const {
  mockCreateTopicAction,
  mockSaveTopicDraftAction,
  mockPrepareTopicPublishAction,
  mockConfirmTopicPublishAction,
  mockDiscardTopicChangesAction,
} = vi.hoisted(() => ({
  mockCreateTopicAction: vi.fn(),
  mockSaveTopicDraftAction: vi.fn(),
  mockPrepareTopicPublishAction: vi.fn(),
  mockConfirmTopicPublishAction: vi.fn(),
  mockDiscardTopicChangesAction: vi.fn(),
}));

vi.mock("@src/app/[locale]/(app)/content/topics/actions", () => ({
  createTopicAction: (...args: unknown[]) => mockCreateTopicAction(...args),
  saveTopicDraftAction: (...args: unknown[]) =>
    mockSaveTopicDraftAction(...args),
  prepareTopicPublishAction: (...args: unknown[]) =>
    mockPrepareTopicPublishAction(...args),
  confirmTopicPublishAction: (...args: unknown[]) =>
    mockConfirmTopicPublishAction(...args),
  discardTopicChangesAction: (...args: unknown[]) =>
    mockDiscardTopicChangesAction(...args),
}));

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

vi.mock("@src/components/content/rich-text/rich-text-editor", () => ({
  RichTextEditor: ({ profile }: { profile: string }) => (
    <div data-testid="mock-rich-text" data-profile={profile} />
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

const PRIVACY_DOC: SerializedContentDoc<TopicFields> = {
  _id: "64b000000000000000000020",
  draft: {
    name: { "es-AR": "Política de Privacidad", "en-US": "Privacy Policy" },
    shortDescription: {
      "es-AR": "Cómo protegemos tus datos.",
      "en-US": "How we protect your data.",
    },
    slug: { "es-AR": "privacidad", "en-US": "privacy" },
    featuredImageId: "64b0000000000000000000ff",
    protected: true,
  },
  published: {
    name: { "es-AR": "Política de Privacidad", "en-US": "Privacy Policy" },
    shortDescription: {
      "es-AR": "Cómo protegemos tus datos.",
      "en-US": "How we protect your data.",
    },
    slug: { "es-AR": "privacidad", "en-US": "privacy" },
    featuredImageId: "64b0000000000000000000ff",
    protected: true,
  },
  revision: 2,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-21T10:00:00.000Z",
  updatedBy: "u1",
  updatedByLabel: "Admin",
};

describe("TopicEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("renders corrected topic model (no SEO, no image field), localized slugs, and enforces protected UX without content:publish-protected (AC5)", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <TopicEditor
        docId={PRIVACY_DOC._id}
        initialDoc={PRIVACY_DOC}
        initialStatus="published"
        initialValues={PRIVACY_DOC.draft}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: false,
        }}
        isTrialMode={false}
      />,
    );

    // Zero nonexistent SEO fields & zero image picker
    expect(screen.queryByText("Buscadores (SEO)")).not.toBeInTheDocument();
    expect(screen.queryByText("Imagen destacada")).not.toBeInTheDocument();

    // Protected chip + legal notice + disabled Publish + disabled protected checkbox
    expect(screen.getByText("Protegido")).toBeInTheDocument();
    expect(screen.getByText(/Texto legal protegido/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publicar cambios" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Contenido legal protegido" }),
    ).toBeDisabled();

    // Spanish slug shown locked, then switching to English tab shows English slug locked
    expect(screen.getByText("/es-AR/privacidad")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /English/i }));
    expect(screen.getByText("/en-US/privacy")).toBeInTheDocument();

    // Preview button remains enabled
    expect(
      screen.getByRole("button", { name: "Vista previa" }),
    ).not.toBeDisabled();
  });

  it("shows legal-weight notice in PublishDialog (no approval tick, D15) and preserves featuredImageId via excludeFromPatch", async () => {
    const user = userEvent.setup();
    const changedDoc: SerializedContentDoc<TopicFields> = {
      ...PRIVACY_DOC,
      draft: {
        ...PRIVACY_DOC.draft,
        shortDescription: {
          "es-AR": "Versión actualizada.",
          "en-US": "Updated version.",
        },
      },
      revision: 3,
    };

    mockPrepareTopicPublishAction.mockResolvedValue({
      ok: true,
      doc: changedDoc,
      status: "changed",
      isFirstPublish: false,
      willCascade: [],
    });

    renderWithIntl(
      <TopicEditor
        docId={changedDoc._id}
        initialDoc={changedDoc}
        initialStatus="changed"
        initialValues={changedDoc.draft}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: true,
        }}
        isTrialMode={false}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Contenido legal protegido" }),
    ).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Publicar cambios" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("protected-publish-legal-notice"),
      ).toHaveTextContent(/texto legal protegido en español e inglés/i);
    });
    // D15: no "revisado y aprobado" tick in v1
    expect(screen.queryByText(/revisado y aprobado/i)).not.toBeInTheDocument();
  });

  it("translates reserved-route-slug errors cleanly on save (EC6)", async () => {
    const user = userEvent.setup();
    mockCreateTopicAction.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: { "slug.es-AR": ["reserved-route-slug"] },
    });

    renderWithIntl(
      <TopicEditor
        initialStatus="draft"
        initialValues={{ name: { "es-AR": "" } }}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: false,
        }}
        isTrialMode={false}
      />,
    );

    await user.type(screen.getByLabelText(/Nombre de la página/), "Blog");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(
        screen.getAllByText(
          "Esa dirección está reservada para una página del sitio. Elegí otra.",
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  it("shows format error (not missing error) for malformed slug.en-US on a protected topic (C2)", async () => {
    const user = userEvent.setup();
    mockSaveTopicDraftAction.mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: {
        "slug.en-US": ["Must be a lowercase kebab-case slug"],
      },
    });

    renderWithIntl(
      <TopicEditor
        docId={PRIVACY_DOC._id}
        initialDoc={PRIVACY_DOC}
        initialStatus="published"
        initialValues={PRIVACY_DOC.draft}
        permissions={{
          canWrite: true,
          canPublish: true,
          canPublishProtected: true,
        }}
        isTrialMode={false}
      />,
    );

    await user.type(screen.getByLabelText(/Descripción corta/), " edit");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(
        screen.getAllByText("Ingresá una dirección válida en inglés.").length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByText(/Falta la dirección en inglés/),
    ).not.toBeInTheDocument();
  });
});
