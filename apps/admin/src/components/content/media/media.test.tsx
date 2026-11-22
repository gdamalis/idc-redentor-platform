import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "@src/i18n/load-messages";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";

const {
  mockUpload,
  mockPrepareMediaUploadAction,
  mockConfirmMediaUploadAction,
  mockListMediaAction,
  mockGetMediaByIdsAction,
  mockGetMediaUsagesAction,
  mockUpdateMediaDetailsAction,
  mockDeleteMediaAction,
  mockRouterPush,
  mockRouterRefresh,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockPrepareMediaUploadAction: vi.fn(),
  mockConfirmMediaUploadAction: vi.fn(),
  mockListMediaAction: vi.fn(),
  mockGetMediaByIdsAction: vi.fn(),
  mockGetMediaUsagesAction: vi.fn(),
  mockUpdateMediaDetailsAction: vi.fn(),
  mockDeleteMediaAction: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  upload: mockUpload,
}));

vi.mock("@src/lib/media/client-file", () => ({
  computeFileSha256: vi.fn(async () => "a".repeat(64)),
  readImageDimensions: vi.fn(async () => ({ width: 1600, height: 1067 })),
  readAudioDuration: vi.fn(async () => 2280),
}));

vi.mock("@src/app/[locale]/(app)/content/media/actions", () => ({
  prepareMediaUploadAction: mockPrepareMediaUploadAction,
  confirmMediaUploadAction: mockConfirmMediaUploadAction,
  listMediaAction: mockListMediaAction,
  getMediaByIdsAction: mockGetMediaByIdsAction,
  getMediaUsagesAction: mockGetMediaUsagesAction,
  updateMediaDetailsAction: mockUpdateMediaDetailsAction,
  deleteMediaAction: mockDeleteMediaAction,
}));

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
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

import { MediaUploadPanel } from "./media-upload-panel";
import { MediaPicker } from "./media-picker";
import { MediaField } from "./media-field";
import { MediaLibraryView } from "./media-library-view";

const esMessages = loadMessages("es-AR");
const enMessages = loadMessages("en-US");

function renderIntl(
  ui: React.ReactElement,
  locale: "es-AR" | "en-US" = "es-AR",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en-US" ? enMessages : esMessages}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

const IMAGE_DOC: SerializedMediaDoc = {
  _id: "507f1f77bcf86cd799439011",
  pathname: "media/507f1f77bcf86cd799439011/bautismo.jpg",
  url: "https://abc123.public.blob.vercel-storage.com/media/507f1f77bcf86cd799439011/bautismo.jpg",
  filename: "bautismo.jpg",
  contentType: "image/jpeg",
  size: 1_200_000,
  sha256: "a".repeat(64),
  width: 1600,
  height: 1067,
  title: { "es-AR": "Bautismo 2026" },
  alt: { "es-AR": "Bautismo en el río" },
  createdBy: "u1",
  createdAt: "2026-11-22T08:00:00.000Z",
};

const UNDESCRIBED_IMAGE_DOC: SerializedMediaDoc = {
  ...IMAGE_DOC,
  _id: "507f1f77bcf86cd799439012",
  pathname: "media/507f1f77bcf86cd799439012/sin-alt.jpg",
  title: { "es-AR": "Foto sin descripción" },
  alt: undefined,
  decorative: undefined,
};

const AUDIO_DOC: SerializedMediaDoc = {
  _id: "507f1f77bcf86cd799439013",
  pathname: "media/507f1f77bcf86cd799439013/sermon.mp3",
  url: "https://abc123.public.blob.vercel-storage.com/media/507f1f77bcf86cd799439013/sermon.mp3",
  filename: "sermon.mp3",
  contentType: "audio/mpeg",
  size: 12_000_000,
  sha256: "b".repeat(64),
  durationSeconds: 2280,
  title: { "es-AR": "Prédica de gracia" },
  createdBy: "u1",
  createdAt: "2026-11-22T08:00:00.000Z",
};

describe("MediaUploadPanel (AC1, AC3, AC4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers existing item on SHA-256 duplicate without uploading a second copy (AC4)", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });
    mockPrepareMediaUploadAction.mockResolvedValue({
      ok: true,
      status: "duplicate",
      existing: IMAGE_DOC,
    });

    renderIntl(
      <MediaUploadPanel
        acceptKinds={["image"]}
        submitLabel="Guardar y usar"
        onComplete={onComplete}
      />,
    );

    const fileInput = screen.getByLabelText("Elegir archivo");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "copia.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText("Este archivo ya está en la biblioteca"),
      ).toBeDefined();
    });
    expect(mockUpload).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Usar el archivo existente/i }));
    expect(onComplete).toHaveBeenCalledWith(IMAGE_DOC);
  });

  it("requires Spanish alt or decorative before saving uploaded image and isolates Enter from parent form (AC3, Lesson H #2)", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const parentSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });
    mockPrepareMediaUploadAction.mockResolvedValue({
      ok: true,
      status: "ready",
      mediaId: IMAGE_DOC._id,
      pathname: IMAGE_DOC.pathname,
      normalizedContentType: "image/jpeg",
      maxBytes: 15 * 1024 * 1024,
      multipart: false,
    });
    mockUpload.mockResolvedValue({
      pathname: IMAGE_DOC.pathname,
      url: IMAGE_DOC.url,
      contentType: "image/jpeg",
    });
    mockConfirmMediaUploadAction.mockResolvedValue({
      ok: true,
      doc: IMAGE_DOC,
    });

    renderIntl(
      <form onSubmit={parentSubmit}>
        <MediaPicker
          open
          onOpenChange={vi.fn()}
          accept="image"
          canUpload
          onSelect={vi.fn()}
        />
      </form>,
    );

    await user.click(screen.getByRole("tab", { name: "Subir" }));

    const fileInput = screen.getByLabelText("Elegir archivo");
    const file = new File([new Uint8Array([1, 2, 3])], "retiro-2026.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = await screen.findByRole("button", {
      name: "Guardar y usar",
    });
    expect(submitBtn).toBeDisabled();

    // Filling Spanish description enables submission
    const altInput = screen.getByLabelText(/Descripción de la imagen \(español\)/i);
    await user.type(altInput, "Jóvenes cantando");
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);
    await waitFor(() => {
      expect(mockConfirmMediaUploadAction).toHaveBeenCalled();
    });
    expect(parentSubmit).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("MediaPicker & MediaField (AC3, AC6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides Upload tab for content:write-only users, enforces AC3 undescribed image lock, and picks valid image", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [UNDESCRIBED_IMAGE_DOC, IMAGE_DOC],
      total: 2,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });

    renderIntl(
      <MediaPicker
        open
        onOpenChange={vi.fn()}
        accept="image"
        canUpload={false}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Bautismo 2026")).toBeDefined();
    });
    // AC6: content:write-only sees Library tab only (no Subir tab)
    expect(screen.getByRole("tab", { name: "Biblioteca" })).toBeDefined();
    expect(screen.queryByRole("tab", { name: "Subir" })).toBeNull();

    // Selecting undescribed image disables confirm button (AC3)
    await user.click(screen.getByText("Foto sin descripción"));
    const useBtn = screen.getByRole("button", { name: "Usar este archivo" });
    expect(useBtn).toBeDisabled();
    expect(
      screen.getByText(/Completá la descripción en español/i),
    ).toBeDefined();

    // Selecting described image enables confirm and returns item
    await user.click(screen.getByText("Bautismo 2026"));
    expect(useBtn).toBeEnabled();
    await user.click(useBtn);
    expect(onSelect).toHaveBeenCalledWith([IMAGE_DOC]);
  });

  it("MediaField renders audio preview with duration and passes full doc to onSelectDoc", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSelectDoc = vi.fn();
    mockGetMediaByIdsAction.mockResolvedValue({
      ok: true,
      items: [AUDIO_DOC],
    });
    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [AUDIO_DOC],
      total: 1,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });

    renderIntl(
      <MediaField
        accept="audio"
        value={AUDIO_DOC._id}
        canUpload={false}
        onChange={onChange}
        onSelectDoc={onSelectDoc}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Prédica de gracia")).toBeDefined();
    });
    expect(screen.getByText(/38:00/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(onSelectDoc).toHaveBeenCalledWith(null);
  });

  it("C1 + C2: MediaPicker hydrates off-page selectedIds via getMediaByIdsAction so paginated multi-select never drops them", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const PAGE2_DOC: SerializedMediaDoc = {
      ...IMAGE_DOC,
      _id: "507f1f77bcf86cd799439099",
      pathname: "media/507f1f77bcf86cd799439099/pagina2.jpg",
      filename: "pagina2.jpg",
      title: { "es-AR": "Foto página 2" },
      alt: { "es-AR": "Foto de la página 2" },
    };

    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [IMAGE_DOC],
      total: 25,
      page: 1,
      pageSize: 24,
      hasMore: true,
    });
    mockGetMediaByIdsAction.mockResolvedValue({
      ok: true,
      items: [PAGE2_DOC],
    });

    renderIntl(
      <MediaPicker
        open
        onOpenChange={vi.fn()}
        accept="image"
        multiple
        selectedIds={[PAGE2_DOC._id]}
        canUpload={false}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(mockGetMediaByIdsAction).toHaveBeenCalledWith([PAGE2_DOC._id]);
      expect(screen.getByText("Bautismo 2026")).toBeDefined();
    });

    await user.click(screen.getByText("Bautismo 2026"));
    await user.click(
      screen.getByRole("button", { name: /Usar 2 archivos/i }),
    );
    expect(onSelect).toHaveBeenCalledWith([PAGE2_DOC, IMAGE_DOC]);
  });

  it("C1: disables Library tab during active upload and resets isUploading on MediaUploadPanel unmount", async () => {
    const user = userEvent.setup();
    const onUploadingChange = vi.fn();
    let resolveUpload!: (val: {
      pathname: string;
      url: string;
      contentType: string;
    }) => void;
    mockUpload.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    mockPrepareMediaUploadAction.mockResolvedValue({
      ok: true,
      status: "ready",
      mediaId: IMAGE_DOC._id,
      pathname: IMAGE_DOC.pathname,
      normalizedContentType: "image/jpeg",
      maxBytes: 15 * 1024 * 1024,
      multipart: false,
    });
    mockListMediaAction.mockResolvedValue({
      ok: true,
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });

    const { unmount } = renderIntl(
      <MediaPicker
        open
        onOpenChange={vi.fn()}
        accept="image"
        canUpload
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Subir" }));
    const fileInput = screen.getByLabelText("Elegir archivo");
    const file = new File([new Uint8Array([1, 2, 3])], "mid.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Biblioteca" })).toBeDisabled();
    });
    unmount();
    resolveUpload({
      pathname: IMAGE_DOC.pathname,
      url: IMAGE_DOC.url,
      contentType: "image/jpeg",
    });

    // Direct MediaUploadPanel unmount resets onUploadingChange(false)
    const panel = renderIntl(
      <MediaUploadPanel
        acceptKinds={["image"]}
        submitLabel="Guardar"
        onComplete={vi.fn()}
        onUploadingChange={onUploadingChange}
      />,
    );
    panel.unmount();
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
  });

  it("C2 + C3: MediaField accepts initialMedia with Date createdAt and displays en-US title", () => {
    const mediaDocWithDate = {
      ...IMAGE_DOC,
      title: { "es-AR": "Bautismo 2026", "en-US": "Baptism 2026" },
      createdAt: new Date("2026-11-22T08:00:00.000Z"),
    };
    renderIntl(
      <MediaField
        accept="image"
        value={IMAGE_DOC._id}
        initialMedia={mediaDocWithDate}
        canUpload={false}
        onChange={vi.fn()}
      />,
      "en-US",
    );
    expect(screen.getByText("Baptism 2026")).toBeDefined();
  });
});

describe("MediaLibraryView (AC5, AC7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows type and unused filters, displays usages, and refuses deleting in-use media in both es-AR and en-US", async () => {
    const user = userEvent.setup();
    mockGetMediaUsagesAction.mockResolvedValue({
      ok: true,
      usedBy: [
        {
          collection: "posts",
          docId: "post-1",
          label: "Bienvenidos a casa",
          isPublished: true,
        },
      ],
    });

    const { unmount } = renderIntl(
      <MediaLibraryView
        initialItems={[IMAGE_DOC]}
        total={1}
        page={1}
        pageSize={24}
        currentKind=""
        currentUnused={false}
        currentQuery=""
        canManageMedia
      />,
      "es-AR",
    );

    expect(screen.getByRole("link", { name: "Imágenes" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Sin usar" })).toBeDefined();

    await user.click(screen.getByText("Bautismo 2026"));
    await waitFor(() => {
      expect(screen.getByText("Bienvenidos a casa")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => {
      expect(screen.getByText("No se puede eliminar")).toBeDefined();
      expect(
        screen.getByText(/se usa en: Bienvenidos a casa/i),
      ).toBeDefined();
    });
    expect(mockDeleteMediaAction).not.toHaveBeenCalled();

    unmount();

    // Repeat refusal check in en-US (AC5)
    renderIntl(
      <MediaLibraryView
        initialItems={[IMAGE_DOC]}
        total={1}
        page={1}
        pageSize={24}
        currentKind=""
        currentUnused={false}
        currentQuery=""
        canManageMedia
      />,
      "en-US",
    );

    await user.click(screen.getByText("Bautismo 2026"));
    await waitFor(() => {
      expect(screen.getByText("Bienvenidos a casa")).toBeDefined();
    });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.getByText("Can't be deleted")).toBeDefined();
    });
  });

  it("deletes unused media after confirmation", async () => {
    const user = userEvent.setup();
    mockGetMediaUsagesAction.mockResolvedValue({ ok: true, usedBy: [] });
    mockDeleteMediaAction.mockResolvedValue({
      ok: true,
      docId: IMAGE_DOC._id,
      blobDeleted: true,
    });

    renderIntl(
      <MediaLibraryView
        initialItems={[IMAGE_DOC]}
        total={1}
        page={1}
        pageSize={24}
        currentKind=""
        currentUnused={false}
        currentQuery=""
        canManageMedia
      />,
    );

    await user.click(screen.getByText("Bautismo 2026"));
    await waitFor(() => {
      expect(
        screen.getByText("Este archivo no se usa en ninguna entrada."),
      ).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Eliminar" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => {
      expect(mockDeleteMediaAction).toHaveBeenCalledWith(IMAGE_DOC._id);
    });
  });

  it("C3.2: renders en-US localized title and links globals usages directly to their singleton editor", async () => {
    const user = userEvent.setup();
    const bilingualImg: SerializedMediaDoc = {
      ...IMAGE_DOC,
      title: { "es-AR": "Logo pie", "en-US": "Footer Logo" },
    };
    mockGetMediaUsagesAction.mockResolvedValue({
      ok: true,
      usedBy: [
        {
          collection: "globals",
          docId: "global-footer-id",
          label: "footer",
          isPublished: true,
        },
      ],
    });

    renderIntl(
      <MediaLibraryView
        initialItems={[bilingualImg]}
        total={1}
        page={1}
        pageSize={24}
        currentKind=""
        currentUnused={false}
        currentQuery=""
        canManageMedia
      />,
      "en-US",
    );

    expect(screen.getByText("Footer Logo")).toBeDefined();
    await user.click(screen.getByText("Footer Logo"));

    const footerLink = await screen.findByRole("link", { name: "footer" });
    expect(footerLink.getAttribute("href")).toBe("/content/footer");
  });
});
