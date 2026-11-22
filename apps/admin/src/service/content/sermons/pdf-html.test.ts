// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildSelfContainedPdfHtml,
  escapeHtml,
  formatSermonDate,
  renderContentBlocks,
  renderScriptureReferences,
} from "./pdf-html";

describe("pdf-html", () => {
  it("escapes HTML special characters safely", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );
  });

  it("formats YYYY-MM-DD and ISO datetime strings in UTC for both locales", () => {
    expect(formatSermonDate("2026-06-07", "es-AR")).toContain("2026");
    expect(formatSermonDate("2026-06-07", "es-AR")).toContain("7");
    expect(formatSermonDate("2026-06-07T00:00:00Z", "en-US")).toBe(
      "June 7, 2026",
    );
  });

  it("skips embeddedAsset blocks in print while rendering headings, lists, and quotes", () => {
    const html = renderContentBlocks([
      { type: "h2", text: "Título <2>" },
      { type: "p", text: "Párrafo" },
      { type: "embeddedAsset", assetId: "media-1" },
      { type: "blockquote", text: "Cita" },
      { type: "ul", items: ["A", "B"] },
      { type: "ol", items: ["1"] },
    ]);
    expect(html).toContain("<h2>Título &lt;2&gt;</h2>");
    expect(html).toContain("<p>Párrafo</p>");
    expect(html).toContain("<blockquote>Cita</blockquote>");
    expect(html).toContain("<li>A</li>");
    expect(html).not.toContain("media-1");
  });

  it("builds self-contained HTML with inlined @font-face, no Google Fonts link, and version footer", () => {
    const html = buildSelfContainedPdfHtml(
      {
        title: "La gracia",
        content: [{ type: "p", text: "Cuerpo" }],
      },
      {
        slug: "la-gracia",
        sermonDate: "2026-11-15",
        preacher: "Juan Pérez",
        additionalPreachers: ["María Gómez"],
        logoDataUri: "data:image/png;base64,AAA",
        scriptureReferences: [
          {
            chapter: "2",
            fromVerse: "8",
            toVerse: "9",
            "es-AR": {
              book: "Efesios",
              verseContent: "Por gracia",
              bibleVersion: "RVR1960",
            },
            "en-US": {
              book: "Ephesians",
              verseContent: "By grace",
              bibleVersion: "NIV",
            },
          },
        ],
      },
      "es-AR",
      3,
    );

    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain("Iglesia de Cristo Redentor · v3");
    expect(html).toContain("Juan Pérez · María Gómez");
    expect(html).toContain("Efesios 2:8-9 (NVI)");
    expect(renderScriptureReferences(undefined, "en-US")).toBe("");
  });
});
