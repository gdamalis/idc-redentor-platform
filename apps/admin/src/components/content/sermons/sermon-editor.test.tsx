import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import { createRichTextExtensions } from "@idcr/content/tiptap";
import { validateRichText, type RichTextDoc, type SermonFields } from "@idcr/content";
import { loadMessages } from "@src/i18n/load-messages";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@src/i18n/routing", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
  usePathname: () => "/content/sermons/65f000000000000000000001",
}));

const saveSermonDraftMock = vi.fn();
const createSermonMock = vi.fn();
const prepareSermonPublishMock = vi.fn();
const confirmSermonPublishMock = vi.fn();
const discardSermonChangesMock = vi.fn();
const requestSermonPdfRegenMock = vi.fn();
const getSermonPdfStatusMock = vi.fn();
const searchContentEntriesMock = vi.fn();
const searchBibleVersesMock = vi.fn();
const createOrReuseBibleVerseMock = vi.fn();
const listMediaMock = vi.fn();
const getMediaByIdsMock = vi.fn();

vi.mock("@src/app/[locale]/(app)/content/sermons/actions", () => ({
  createSermonAction: (...args: unknown[]) => createSermonMock(...args),
  saveSermonDraftAction: (...args: unknown[]) => saveSermonDraftMock(...args),
  prepareSermonPublishAction: (...args: unknown[]) =>
    prepareSermonPublishMock(...args),
  confirmSermonPublishAction: (...args: unknown[]) =>
    confirmSermonPublishMock(...args),
  discardSermonChangesAction: (...args: unknown[]) =>
    discardSermonChangesMock(...args),
  requestSermonPdfRegenAction: (...args: unknown[]) =>
    requestSermonPdfRegenMock(...args),
  getSermonPdfStatusAction: (...args: unknown[]) =>
    getSermonPdfStatusMock(...args),
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
    searchContentEntriesMock(...args),
  searchBibleVersesAction: (...args: unknown[]) =>
    searchBibleVersesMock(...args),
  createOrReuseBibleVerseAction: (...args: unknown[]) =>
    createOrReuseBibleVerseMock(...args),
}));

vi.mock("@src/app/[locale]/(app)/content/media/actions", () => ({
  listMediaAction: (...args: unknown[]) => listMediaMock(...args),
  getMediaByIdsAction: (...args: unknown[]) => getMediaByIdsMock(...args),
}));

import { SermonEditor, type SermonEditorProps } from "./sermon-editor";
import { SermonPdfStatusCard } from "./sermon-pdf-status-card";

const MULTI_PREACHER_SERMON_DOC: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Parte 1: Fe viva" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Escuchá el " },
        { type: "text", text: "primer segmento", marks: [{ type: "bold" }] },
        { type: "text", text: " y descargá el resumen." },
      ],
    },
    { type: "embeddedMedia", attrs: { mediaId: "65f0000000000000000000a1" } },
    { type: "embeddedMedia", attrs: { mediaId: "65f0000000000000000000b1" } },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "La fe viene por el oír." }],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Oír" }] },
          ],
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Creer" }] },
          ],
        },
      ],
    },
  ],
};

function makeMedia(
  id: string,
  contentType: string,
  extra: Partial<{ durationSeconds: number; size: number; filename: string; titleEs: string }> = {},
) {
  return {
    _id: id,
    pathname: `media/${id}/${extra.filename ?? "file"}`,
    url: `https://abc.public.blob.vercel-storage.com/media/${id}/${extra.filename ?? "file"}`,
    filename: extra.filename ?? "file",
    contentType,
    size: extra.size ?? 1024 * 1024,
    sha256: "a".repeat(64),
    title: { "es-AR": extra.titleEs ?? "Archivo" },
    ...(extra.durationSeconds !== undefined && {
      durationSeconds: extra.durationSeconds,
    }),
    createdBy: "u1",
    createdAt: "2026-11-20T12:00:00.000Z",
  };
}

function makeBaseProps(
  overrides: Partial<SermonEditorProps> = {},
): SermonEditorProps {
  const draft: SermonFields = {
    slug: "culto-especial",
    title: { "es-AR": "Culto especial", "en-US": "Special Service" },
    thesis: { "es-AR": "Tesis central" },
    mainPoints: { "es-AR": ["Punto uno"] },
    excerpt: { "es-AR": "Extracto" },
    sermonDate: "2026-11-15",
    content: { "es-AR": MULTI_PREACHER_SERMON_DOC },
    featuredImageId: "65f0000000000000000000f1",
    audioMediaId: "65f0000000000000000000a0",
    audioLanguages: ["es-AR"],
    durationSeconds: 2280,
    pdfSummaryMediaId: { "es-AR": "65f0000000000000000000p1" },
    preacherId: "65f0000000000000000000c1",
    scriptureRefIds: ["65f0000000000000000000d1", "65f0000000000000000000d2"],
    seoTitle: { "es-AR": "Culto especial" },
    seoDescription: { "es-AR": "Descripción" },
    contentHash: "hash-1",
  };

  return {
    docId: "65f000000000000000000001",
    initialDoc: {
      _id: "65f000000000000000000001",
      draft,
      revision: 1,
      createdAt: "2026-11-20T10:00:00.000Z",
      updatedAt: "2026-11-20T10:00:00.000Z",
      updatedBy: "service:predica-ingest",
      updatedByLabel: "Importación automática",
    },
    initialStatus: "draft",
    initialValues: draft,
    permissions: {
      canWrite: true,
      canPublish: true,
      canPublishProtected: true,
    },
    canManageMedia: true,
    isTrialMode: false,
    isPublishEmailsEnabled: false,
    initialAuthors: {
      "65f0000000000000000000c1": {
        id: "65f0000000000000000000c1",
        label: "Pastor Juan",
        status: "published",
      },
    },
    initialVerses: [
      {
        id: "65f0000000000000000000d1",
        status: "published",
        revision: 1,
        fields: {
          book: { "es-AR": "Juan", "en-US": "John" },
          chapter: 3,
          fromVerse: 16,
          text: { "es-AR": "Porque de tal manera", "en-US": "For God so loved" },
          version: { "es-AR": "RVR1960", "en-US": "KJV" },
        },
      },
      {
        id: "65f0000000000000000000d2",
        status: "published",
        revision: 1,
        fields: {
          book: { "es-AR": "Salmos", "en-US": "Psalms" },
          chapter: 23,
          fromVerse: 1,
          text: { "es-AR": "El Señor es mi pastor" },
          version: { "es-AR": "RVR" },
        },
      },
    ],
    verseUsageCounts: { "65f0000000000000000000d1": 3 },
    initialRelatedSermons: {},
    initialMedia: {
      "65f0000000000000000000f1": makeMedia(
        "65f0000000000000000000f1",
        "image/jpeg",
        { filename: "portada.jpg", titleEs: "Portada" },
      ),
      "65f0000000000000000000a0": makeMedia(
        "65f0000000000000000000a0",
        "audio/mpeg",
        { filename: "sermon.mp3", titleEs: "Audio completo", durationSeconds: 2280 },
      ),
      "65f0000000000000000000a1": makeMedia(
        "65f0000000000000000000a1",
        "audio/mpeg",
        { filename: "seg-1.mp3", titleEs: "Audio parte 1", durationSeconds: 600 },
      ),
      "65f0000000000000000000b1": makeMedia(
        "65f0000000000000000000b1",
        "application/pdf",
        { filename: "seg-1.pdf", titleEs: "Resumen parte 1" },
      ),
      "65f0000000000000000000p1": makeMedia(
        "65f0000000000000000000p1",
        "application/pdf",
        { filename: "culto-especial-es-AR-v1.pdf", titleEs: "PDF ES" },
      ),
    },
    initialPdfStatus: {
      stateByLocale: { "es-AR": "ok", "en-US": "none" },
      isPending: false,
      version: 1,
      lastRenderedAt: "2026-11-20T12:00:00.000Z",
      pdfs: {
        "es-AR": makeMedia("65f0000000000000000000p1", "application/pdf", {
          filename: "culto-especial-es-AR-v1.pdf",
          titleEs: "PDF ES",
        }),
      },
    },
    ...overrides,
  };
}

function renderWithIntl(ui: React.ReactElement, locale: "es-AR" | "en-US" = "es-AR") {
  return render(
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SermonEditor & sermon components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getSermonPdfStatusMock.mockResolvedValue({
      ok: true,
      pdfStatus: makeBaseProps().initialPdfStatus,
    });
    searchContentEntriesMock.mockResolvedValue({ ok: true, items: [] });
    searchBibleVersesMock.mockResolvedValue({ ok: true, items: [] });
    listMediaMock.mockResolvedValue({ ok: true, items: [], total: 0, hasMore: false });
    getMediaByIdsMock.mockResolvedValue({ ok: true, items: [] });
  });

  it("AC1 round-trip: sermon body with embedded audio & PDF blocks round-trips through TipTap sermon schema with zero loss", () => {
    expect(validateRichText(MULTI_PREACHER_SERMON_DOC, "sermon")).toEqual([]);
    const editor = new Editor({
      extensions: createRichTextExtensions("sermon"),
      content: MULTI_PREACHER_SERMON_DOC,
    });
    expect(editor.getJSON()).toEqual(MULTI_PREACHER_SERMON_DOC);
    editor.destroy();
  });

  it("AC2 & AC8: renders real stored verse version labels per locale (RVR1960, RVR, KJV) and shows/clears script-draft notice on human save", async () => {
    const user = userEvent.setup();
    const props = makeBaseProps();

    saveSermonDraftMock.mockResolvedValue({
      ok: true,
      doc: {
        ...props.initialDoc!,
        draft: {
          ...props.initialValues,
          thesis: { "es-AR": "Tesis revisada" },
        },
        revision: 2,
        updatedBy: "65f0000000000000000000aa",
        updatedByLabel: "Pastor Juan",
      },
      status: "draft",
      changedFields: ["thesis"],
      noOp: false,
    });

    renderWithIntl(<SermonEditor {...props} />);

    // AC8: script-draft notice visible initially
    expect(screen.getByTestId("sermon-script-draft-notice")).toHaveTextContent(
      "Borrador creado automáticamente a partir del audio",
    );

    // AC2: exact stored Spanish versions shown (never forced NVI)
    expect(
      screen.getByTestId("scripture-chip-65f0000000000000000000d1"),
    ).toHaveTextContent("Juan 3:16 · RVR1960");
    expect(
      screen.getByTestId("scripture-chip-65f0000000000000000000d2"),
    ).toHaveTextContent("Salmos 23:1 · RVR");

    // Read-only duration derived from audio media
    expect(screen.getByTestId("sermon-duration-readonly")).toHaveTextContent(
      "38 min",
    );

    // Switch to English tab -> shows stored English version label (KJV) verbatim!
    await user.click(screen.getByRole("tab", { name: /English/i }));
    expect(
      screen.getByTestId("scripture-chip-65f0000000000000000000d1"),
    ).toHaveTextContent("John 3:16 · KJV");

    // Edit a field and save -> clears script-draft notice (AC8) & never sends pdfSummaryMediaId
    await user.click(screen.getByRole("tab", { name: /Español/i }));
    const thesisInput = screen.getByLabelText(/Tesis/i);
    await user.clear(thesisInput);
    await user.type(thesisInput, "Tesis revisada");
    await user.click(screen.getByRole("button", { name: /Guardar borrador/i }));

    await waitFor(() => {
      expect(saveSermonDraftMock).toHaveBeenCalledTimes(1);
    });
    const sentPatch = saveSermonDraftMock.mock.calls[0]?.[0]?.patch as Record<
      string,
      unknown
    >;
    expect(sentPatch).not.toHaveProperty("pdfSummaryMediaId");
    expect(sentPatch).not.toHaveProperty("contentHash");

    await waitFor(() => {
      expect(
        screen.queryByTestId("sermon-script-draft-notice"),
      ).not.toBeInTheDocument();
    });
  });

  it("renders all 4 SermonPdfStatusCard states and hides email checkbox when global switch is off", async () => {
    const onStatusChange = vi.fn();

    const { rerender } = renderWithIntl(
      <SermonPdfStatusCard
        docId="s1"
        locale="es-AR"
        readOnly={false}
        onStatusChange={onStatusChange}
        status={{
          stateByLocale: { "es-AR": "ok", "en-US": "none" },
          isPending: false,
          version: 1,
          lastRenderedAt: "2026-11-20T12:00:00.000Z",
          pdfs: {
            "es-AR": makeMedia("p1", "application/pdf", {
              filename: "sermon-es-AR-v1.pdf",
            }),
          },
        }}
      />,
    );
    expect(screen.getByTestId("sermon-pdf-status-es-AR")).toHaveTextContent(
      "PDF al día",
    );
    expect(screen.getByRole("link", { name: /Abrir/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Regenerar/i }),
    ).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="es-AR" messages={loadMessages("es-AR")}>
        <SermonPdfStatusCard
          docId="s1"
          locale="es-AR"
          readOnly={false}
          onStatusChange={onStatusChange}
          status={{
            stateByLocale: { "es-AR": "pending", "en-US": "pending" },
            isPending: true,
            version: 1,
            pdfs: {},
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("sermon-pdf-status-es-AR")).toHaveTextContent(
      "Actualizando el PDF…",
    );

    rerender(
      <NextIntlClientProvider locale="es-AR" messages={loadMessages("es-AR")}>
        <SermonPdfStatusCard
          docId="s1"
          locale="es-AR"
          readOnly={false}
          onStatusChange={onStatusChange}
          status={{
            stateByLocale: { "es-AR": "failed", "en-US": "none" },
            isPending: false,
            version: 1,
            lastError: "Timeout",
            pdfs: {},
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("sermon-pdf-status-es-AR")).toHaveTextContent(
      "No se pudo generar el PDF.",
    );
    expect(
      screen.getByRole("button", { name: /Reintentar/i }),
    ).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="es-AR" messages={loadMessages("es-AR")}>
        <SermonPdfStatusCard
          docId="s1"
          locale="es-AR"
          readOnly={false}
          onStatusChange={onStatusChange}
          status={{
            stateByLocale: { "es-AR": "none", "en-US": "none" },
            isPending: false,
            version: 0,
            pdfs: {},
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("sermon-pdf-status-es-AR")).toHaveTextContent(
      "Esta prédica no tiene PDF.",
    );
    expect(
      screen.getByRole("button", { name: /Generar/i }),
    ).toBeInTheDocument();
  });

  it("shows PDF-pending note in PublishDialog and only shows email checkbox when global switch is enabled (AC5, Q3)", async () => {
    const user = userEvent.setup();
    const pendingPdfStatus = {
      stateByLocale: { "es-AR": "pending" as const, "en-US": "pending" as const },
      isPending: true,
      version: 1,
      pdfs: {},
    };
    const props = makeBaseProps({
      isPublishEmailsEnabled: false,
      initialPdfStatus: pendingPdfStatus,
    });

    getSermonPdfStatusMock.mockResolvedValue({
      ok: true,
      pdfStatus: pendingPdfStatus,
    });
    prepareSermonPublishMock.mockResolvedValue({
      ok: true,
      doc: props.initialDoc!,
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: false,
      willCascade: [],
    });

    renderWithIntl(<SermonEditor {...props} />);
    await user.click(screen.getByRole("button", { name: /^Publicar$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("publish-pdf-pending-note")).toBeInTheDocument();
    });
    expect(
      screen.queryByLabelText(/Avisar por email a los suscriptores/i),
    ).not.toBeInTheDocument();
  });

  it("shows checked subscriber-email box on first publish when global switch is enabled (Q3)", async () => {
    const user = userEvent.setup();
    const props = makeBaseProps({ isPublishEmailsEnabled: true });

    prepareSermonPublishMock.mockResolvedValue({
      ok: true,
      doc: props.initialDoc!,
      status: "draft",
      isFirstPublish: true,
      isPublishEmailsEnabled: true,
      willCascade: [],
    });

    renderWithIntl(<SermonEditor {...props} />);
    await user.click(screen.getByRole("button", { name: /^Publicar$/i }));

    const checkbox = await screen.findByLabelText(
      /Avisar por email a los suscriptores/i,
    );
    expect(checkbox).toBeChecked();
  });
});
