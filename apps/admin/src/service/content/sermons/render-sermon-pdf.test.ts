// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import type { AuthorFields, BibleVerseFields, SermonFields } from "@idcr/content";
import {
  mapSermonSnapshotToPdf,
  renderSermonPdfs,
} from "./render-sermon-pdf";

const RESOLVED = {
  authorsById: new Map<string, AuthorFields>([
    ["a1", { name: "Juan Pérez" }],
    ["a2", { name: "María Gómez" }],
  ]),
  versesById: new Map<string, BibleVerseFields>([
    [
      "v1",
      {
        book: { "es-AR": "Juan", "en-US": "John" },
        chapter: 3,
        fromVerse: 16,
        text: { "es-AR": "Porque tanto amó Dios", "en-US": "For God so loved" },
        version: { "es-AR": "RVR1960", "en-US": "KJV" },
      },
    ],
  ]),
};

const BILINGUAL_SERMON: SermonFields = {
  slug: "amor-de-dios",
  title: { "es-AR": "El amor de Dios", "en-US": "The Love of God" },
  sermonDate: "2026-11-15",
  preacherId: "a1",
  additionalPreacherIds: ["a2"],
  scriptureRefIds: ["v1"],
  content: {
    "es-AR": {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Texto ES" }] },
        { type: "embeddedMedia", attrs: { mediaId: "m1" } },
      ],
    },
    "en-US": {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Text EN" }] },
      ],
    },
  },
};

function makeFakeBrowser() {
  const htmls: string[] = [];
  const pageClose = vi.fn(async () => undefined);
  const browserClose = vi.fn(async () => undefined);

  const browser = {
    newPage: vi.fn(async () => ({
      setContent: vi.fn(async (html: string) => {
        htmls.push(html);
      }),
      evaluate: vi.fn(async () => undefined),
      emulateMedia: vi.fn(async () => undefined),
      pdf: vi.fn(async () => Buffer.from("%PDF-1.4-mock")),
      close: pageClose,
    })),
    close: browserClose,
  } as unknown as Browser;

  return { browser, htmls, pageClose, browserClose };
}

describe("render-sermon-pdf", () => {
  it("maps bilingual sermon snapshots including co-preachers and scripture refs", () => {
    const mapped = mapSermonSnapshotToPdf(BILINGUAL_SERMON, RESOLVED);
    expect(mapped.common.preacher).toBe("Juan Pérez");
    expect(mapped.common.additionalPreachers).toEqual(["María Gómez"]);
    expect(mapped.common.scriptureReferences).toHaveLength(1);
    expect(mapped.locales["es-AR"]?.title).toBe("El amor de Dios");
    expect(mapped.locales["en-US"]?.title).toBe("The Love of God");
  });

  it("omits en-US locale when sermon has Spanish content only", async () => {
    const esOnly: SermonFields = {
      ...BILINGUAL_SERMON,
      title: { "es-AR": "Solo español" },
      content: { "es-AR": BILINGUAL_SERMON.content!["es-AR"] },
    };
    const { browser, htmls, browserClose } = makeFakeBrowser();
    const out = await renderSermonPdfs(esOnly, RESOLVED, 2, async () => browser);

    expect(out["es-AR"]).toBeInstanceOf(Buffer);
    expect(out["en-US"]).toBeUndefined();
    expect(htmls).toHaveLength(1);
    expect(htmls[0]).toContain("Solo español");
    expect(htmls[0]).toContain("· v2");
    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it("renders both es-AR and en-US PDFs and always closes browser", async () => {
    const { browser, htmls, pageClose, browserClose } = makeFakeBrowser();
    const out = await renderSermonPdfs(
      BILINGUAL_SERMON,
      RESOLVED,
      4,
      async () => browser,
    );

    expect(out["es-AR"]).toBeInstanceOf(Buffer);
    expect(out["en-US"]).toBeInstanceOf(Buffer);
    expect(htmls).toHaveLength(2);
    expect(pageClose).toHaveBeenCalledTimes(2);
    expect(browserClose).toHaveBeenCalledTimes(1);
  });
});
