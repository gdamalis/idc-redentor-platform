import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { PostFields } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { PostEditor } from "./post-editor";

const {
  mockCreatePostAction,
  mockSavePostDraftAction,
  mockPreparePostPublishAction,
  mockConfirmPostPublishAction,
  mockSearchContentEntriesAction,
} = vi.hoisted(() => ({
  mockCreatePostAction: vi.fn(),
  mockSavePostDraftAction: vi.fn(),
  mockPreparePostPublishAction: vi.fn(),
  mockConfirmPostPublishAction: vi.fn(),
  mockSearchContentEntriesAction: vi.fn(),
}));

vi.mock("@src/app/[locale]/(app)/content/posts/actions", () => ({
  createPostAction: (...args: unknown[]) => mockCreatePostAction(...args),
  savePostDraftAction: (...args: unknown[]) => mockSavePostDraftAction(...args),
  preparePostPublishAction: (...args: unknown[]) =>
    mockPreparePostPublishAction(...args),
  confirmPostPublishAction: (...args: unknown[]) =>
    mockConfirmPostPublishAction(...args),
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
  searchContentEntriesAction: (...args: unknown[]) =>
    mockSearchContentEntriesAction(...args),
}));

vi.mock("@src/components/content/media", () => ({
  MediaField: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (id: string | undefined) => void;
  }) => (
    <div data-testid="mock-media-field">
      <span>{value ?? "empty-media"}</span>
      <button type="button" onClick={() => onChange("64b0000000000000000000aa")}>
        Pick mock image
      </button>
    </div>
  ),
}));

vi.mock("@src/components/content/rich-text/rich-text-editor", () => ({
  RichTextEditor: ({
    profile,
    value,
  }: {
    profile: string;
    value?: unknown;
  }) => (
    <div data-testid="mock-rich-text" data-profile={profile}>
      {JSON.stringify(value ?? null)}
    </div>
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

const FULL_PERMS = {
  canWrite: true,
  canPublish: true,
  canPublishProtected: false,
  canManageMedia: true,
};

describe("PostEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows strict publish ErrorSummary when featuredImage/author/date are missing (AC2)", async () => {
    const user = userEvent.setup();
    mockPreparePostPublishAction.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: {
        featuredImageId: ["Required"],
        authorId: ["Required"],
        publishedDate: ["Required"],
      },
    });

    renderWithIntl(
      <PostEditor
        initialStatus="draft"
        initialValues={{ title: { "es-AR": "Nuevo artículo" } }}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />,
    );

    // Article profile is strictly enforced (no sermon/embeddedMedia)
    expect(screen.getByTestId("mock-rich-text")).toHaveAttribute(
      "data-profile",
      "article",
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => {
      expect(screen.getAllByText("Falta la imagen destacada.").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Elegí un autor.").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText("Ingresá la fecha de publicación.").length,
      ).toBeGreaterThan(0);
    });
  });

  it("hides subscriber-email checkbox when CONTENT_PUBLISH_EMAILS is off and shows it checked when enabled (D18)", async () => {
    const user = userEvent.setup();
    const doc: SerializedContentDoc<PostFields> = {
      _id: "64b000000000000000000010",
      draft: {
        title: { "es-AR": "Artículo listo" },
        slug: "articulo-listo",
        category: "Events",
      },
      revision: 1,
      createdAt: "2026-11-20T10:00:00.000Z",
      updatedAt: "2026-11-20T10:00:00.000Z",
      updatedBy: "u1",
      updatedByLabel: "Ana",
    };

    // Case 1: global switch OFF -> checkbox hidden
    mockPreparePostPublishAction.mockResolvedValueOnce({
      ok: true,
      doc,
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: false,
      willCascade: [],
    });

    const { unmount } = renderWithIntl(
      <PostEditor
        docId={doc._id}
        initialDoc={doc}
        initialStatus="draft"
        initialValues={doc.draft}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => {
      expect(screen.getByText("¿Publicar «Artículo listo»?")).toBeInTheDocument();
    });
    expect(
      screen.queryByLabelText("Avisar por email a los suscriptores"),
    ).not.toBeInTheDocument();
    unmount();

    // Case 2: global switch ON + first publish -> checkbox shown & checked, sends notify: true
    mockPreparePostPublishAction.mockResolvedValueOnce({
      ok: true,
      doc,
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: true,
      willCascade: [],
    });
    mockConfirmPostPublishAction.mockResolvedValueOnce({
      ok: true,
      doc: { ...doc, published: doc.draft, firstPublishedAt: "2026-11-22T15:00:00.000Z", revision: 2 },
      status: "published",
      revalidated: true,
      notified: true,
    });

    renderWithIntl(
      <PostEditor
        docId={doc._id}
        initialDoc={doc}
        initialStatus="draft"
        initialValues={doc.draft}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    const emailBox = await screen.findByLabelText(
      "Avisar por email a los suscriptores",
    );
    expect(emailBox).toBeChecked();

    const confirmButtons = screen.getAllByRole("button", { name: "Publicar" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => {
      expect(mockConfirmPostPublishAction).toHaveBeenCalledWith(
        expect.objectContaining({ notify: true }),
      );
    });

    // Case 3 (C3 M23 / EC3): global switch ON + republish (isFirstPublish: false) -> checkbox hidden & notify: false
    const changedDoc: SerializedContentDoc<PostFields> = {
      ...doc,
      published: doc.draft,
      firstPublishedAt: "2026-11-22T15:00:00.000Z",
      revision: 2,
    };
    mockPreparePostPublishAction.mockResolvedValueOnce({
      ok: true,
      doc: changedDoc,
      status: "changed",
      isFirstPublish: false,
      isPublishEmailsEnabled: true,
      willCascade: [],
    });
    mockConfirmPostPublishAction.mockResolvedValueOnce({
      ok: true,
      doc: { ...changedDoc, revision: 3 },
      status: "published",
      revalidated: true,
      notified: false,
    });

    renderWithIntl(
      <PostEditor
        docId={changedDoc._id}
        initialDoc={changedDoc}
        initialStatus="changed"
        initialValues={changedDoc.draft}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar cambios" }));
    await waitFor(() => {
      expect(
        screen.getByText("¿Publicar los cambios de «Artículo listo»?"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByLabelText("Avisar por email a los suscriptores"),
    ).not.toBeInTheDocument();

    const republishConfirmBtns = screen.getAllByRole("button", {
      name: "Publicar",
    });
    await user.click(republishConfirmBtns[republishConfirmBtns.length - 1]!);
    await waitFor(() => {
      expect(mockConfirmPostPublishAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ notify: false }),
      );
    });
  });

  it("auto-opens SEO details on publish error and keeps it open while typing (C1)", async () => {
    const user = userEvent.setup();
    mockPreparePostPublishAction.mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: { "seoTitle.es-AR": ["Required"] },
    });

    renderWithIntl(
      <PostEditor
        initialStatus="draft"
        initialValues={{ title: { "es-AR": "SEO Test" } }}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    const seoInput = await screen.findByLabelText(/Título para buscadores/);
    expect(seoInput).toBeVisible();

    await user.type(seoInput, "Mi SEO");
    expect(seoInput).toBeVisible();
    expect(seoInput).toHaveValue("Mi SEO");
  });

  it("locks published slug behind localized warning (AC7), displays unknown stored category (EC7), and never patches untouched content (AC1)", async () => {
    const user = userEvent.setup();
    const importedBody = {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Texto intacto" }] }],
    };
    const publishedDoc: SerializedContentDoc<PostFields> = {
      _id: "64b000000000000000000011",
      draft: {
        title: { "es-AR": "Publicado" },
        subtitle: { "es-AR": "Subtítulo inicial" },
        slug: "publicado",
        category: "LegacyUnknown",
        publishedDate: "2026-03-15T00:00:00.000Z",
        content: { "es-AR": importedBody },
      },
      published: {
        title: { "es-AR": "Publicado" },
        subtitle: { "es-AR": "Subtítulo inicial" },
        slug: "publicado",
        category: "LegacyUnknown",
        publishedDate: "2026-03-15T00:00:00.000Z",
        content: { "es-AR": importedBody },
      },
      revision: 3,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      updatedBy: "u1",
    };

    mockSavePostDraftAction.mockResolvedValue({
      ok: true,
      doc: {
        ...publishedDoc,
        draft: { ...publishedDoc.draft, category: "Community" },
        revision: 4,
      },
      status: "changed",
      changedFields: ["category"],
      noOp: false,
    });

    renderWithIntl(
      <PostEditor
        docId={publishedDoc._id}
        initialDoc={publishedDoc}
        initialStatus="published"
        initialValues={publishedDoc.draft}
        initialFeaturedImage={null}
        initialAuthor={null}
        initialRelatedPosts={[]}
        permissions={FULL_PERMS}
        isTrialMode={false}
        isPublishEmailsEnabled={false}
      />,
    );

    // Unknown stored category shown as-is with guidance
    expect(screen.getByText("LegacyUnknown (no reconocida)")).toBeInTheDocument();
    expect(
      screen.getByText(/Esta categoría no es reconocida por el sitio/),
    ).toBeInTheDocument();

    // Slug is locked behind "Cambiar" with localized warning
    expect(screen.getByText("/blog/publicado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(
      screen.getByText(/los enlaces viejos dejan de funcionar y los «me gusta» vuelven a cero/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    // Edit ONLY category -> save patch must NOT include untouched content or publishedDate
    await user.selectOptions(screen.getByLabelText("Categoría"), "Community");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => {
      expect(mockSavePostDraftAction).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: publishedDoc._id,
          patch: { category: "Community" },
        }),
      );
    });
  });
});
