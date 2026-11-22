import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "@src/i18n/load-messages";

const { mockSearchBibleVerses, mockCreateOrReuseBibleVerse } = vi.hoisted(
  () => ({
    mockSearchBibleVerses: vi.fn(),
    mockCreateOrReuseBibleVerse: vi.fn(),
  }),
);

vi.mock("@src/app/[locale]/(app)/content/actions", () => ({
  searchBibleVersesAction: mockSearchBibleVerses,
  createOrReuseBibleVerseAction: mockCreateOrReuseBibleVerse,
}));

import { VersePicker } from "./verse-picker";

const esMessages = loadMessages("es-AR");

describe("VersePicker (Checkpoint 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays each verse's real stored version label (e.g. RVR1960, RVR) and selects it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockSearchBibleVerses.mockResolvedValue({
      ok: true,
      items: [
        {
          id: "v-1",
          status: "published",
          revision: 1,
          fields: {
            book: { "es-AR": "Juan", "en-US": "John" },
            chapter: 3,
            fromVerse: 16,
            version: { "es-AR": "RVR1960", "en-US": "KJV" },
            text: { "es-AR": "Porque de tal manera amó Dios al mundo..." },
          },
        },
        {
          id: "v-2",
          status: "draft",
          revision: 1,
          fields: {
            book: { "es-AR": "Joel", "en-US": "Joel" },
            chapter: 2,
            fromVerse: 13,
            version: { "es-AR": "RVR" },
            text: { "es-AR": "Rasgad vuestro corazón..." },
          },
        },
      ],
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <VersePicker
          open
          onOpenChange={() => {}}
          sharedUsageCount={3}
          onSelect={onSelect}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Juan 3:16 · RVR1960")).toBeDefined();
    });
    expect(screen.getByText("Joel 2:13 · RVR")).toBeDefined();
    expect(
      screen.getByText(/Esta cita se usa en 3 entradas/),
    ).toBeDefined();

    await user.click(screen.getByText("Juan 3:16 · RVR1960"));
    await user.click(screen.getByRole("button", { name: "Usar esta cita" }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v-1" }),
    );
  });

  it("creates or reuses a verse by Spanish version-scoped natural key from the Create tab", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockSearchBibleVerses.mockResolvedValue({ ok: true, items: [] });
    mockCreateOrReuseBibleVerse.mockResolvedValue({
      ok: true,
      reused: true,
      verse: {
        id: "v-reused",
        status: "published",
        revision: 2,
        fields: {
          book: { "es-AR": "Juan", "en-US": "John" },
          chapter: 3,
          fromVerse: 16,
          version: { "es-AR": "NVI", "en-US": "NIV" },
        },
      },
    });

    render(
      <NextIntlClientProvider locale="es-AR" messages={esMessages}>
        <VersePicker open onOpenChange={() => {}} onSelect={onSelect} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("tab", { name: "Crear cita nueva" }));
    await user.click(screen.getByRole("button", { name: "Guardar y usar" }));

    await waitFor(() => {
      expect(mockCreateOrReuseBibleVerse).toHaveBeenCalledWith({
        draft: expect.objectContaining({
          book: { "es-AR": "Juan", "en-US": "John" },
          chapter: 3,
          fromVerse: 16,
          version: { "es-AR": "NVI", "en-US": "NIV" },
        }),
      });
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v-reused" }),
    );
  });
});
