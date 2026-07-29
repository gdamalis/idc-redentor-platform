import { describe, it, expect } from "vitest";
import {
  FEATURED_WIDTH,
  FEATURED_HEIGHT,
  deriveScripture,
  composeImageBrief,
  titleFontSize,
  buildFeaturedCardHtml,
} from "./featuredCard";

describe("deriveScripture", () => {
  // The real sermon.json shape: chapter/verses top-level, book locale-nested.
  const matthew = {
    chapter: "13",
    fromVerse: "31",
    toVerse: "33",
    "es-AR": { book: "Mateo", verseContent: "…", bibleVersion: "NVI" },
    "en-US": { book: "Matthew", verseContent: "…", bibleVersion: "NIV" },
  };

  it("builds the reference from the locale-nested structured ref", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] })).toBe(
      "Mateo 13:31-33",
    );
  });

  it("reads the book from the requested locale", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] }, "en-US")).toBe(
      "Matthew 13:31-33",
    );
  });

  it("defaults to es-AR", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] }, "es-AR")).toBe(
      deriveScripture({ scriptureReferences: [matthew] }),
    );
  });

  it("omits the range when toVerse is absent", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "27", fromVerse: "4", "es-AR": { book: "Salmo" } },
        ],
      }),
    ).toBe("Salmo 27:4");
  });

  it("uses only the first reference", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "1", fromVerse: "1", "es-AR": { book: "Juan" } },
          { chapter: "2", fromVerse: "2", "es-AR": { book: "Hechos" } },
        ],
      }),
    ).toBe("Juan 1:1");
  });

  it("tolerates a flat legacy ref shape with no locale nesting", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { book: "Romanos", chapter: "8", fromVerse: "1" },
        ],
      }),
    ).toBe("Romanos 8:1");
  });

  it("accepts numeric chapter and verse values", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          {
            chapter: 8,
            fromVerse: 1,
            toVerse: 4,
            "es-AR": { book: "Romanos" },
          },
        ],
      }),
    ).toBe("Romanos 8:1-4");
  });

  it("returns undefined when there is nothing usable", () => {
    expect(deriveScripture({ scriptureReferences: [] })).toBeUndefined();
    expect(deriveScripture({})).toBeUndefined();
    expect(deriveScripture(null)).toBeUndefined();
    expect(deriveScripture(undefined)).toBeUndefined();
    expect(
      deriveScripture({ scriptureReferences: "Efesios 2:14" }),
    ).toBeUndefined();
    expect(deriveScripture({ scriptureReferences: [null] })).toBeUndefined();
  });

  it("returns undefined when a required part is missing or blank", () => {
    // no book
    expect(
      deriveScripture({
        scriptureReferences: [{ chapter: "2", fromVerse: "11" }],
      }),
    ).toBeUndefined();
    // blank chapter — old code emitted "Efesios :11"
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "", fromVerse: "11", "es-AR": { book: "Efesios" } },
        ],
      }),
    ).toBeUndefined();
    // blank fromVerse
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "2", fromVerse: "  ", "es-AR": { book: "Efesios" } },
        ],
      }),
    ).toBeUndefined();
  });

  it("omits a blank toVerse instead of emitting a dangling dash", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          {
            chapter: "2",
            fromVerse: "11",
            toVerse: "",
            "es-AR": { book: "Efesios" },
          },
        ],
      }),
    ).toBe("Efesios 2:11");
  });
});

describe("composeImageBrief", () => {
  it("interpolates the title, thesis, and scripture into the theme", () => {
    const brief = composeImageBrief({
      title: "El amor que derriba muros",
      thesis: "Cristo es nuestra paz",
      scripture: "Efesios 2:14",
    });
    expect(brief).toContain("El amor que derriba muros");
    expect(brief).toContain("Cristo es nuestra paz");
    expect(brief).toContain("Efesios 2:14");
  });

  it("works with only a title", () => {
    const brief = composeImageBrief({ title: "La gracia de Dios" });
    expect(brief).toContain("La gracia de Dios");
  });

  it("bakes in the church-appropriate guardrails", () => {
    const brief = composeImageBrief({ title: "x" });
    // No text in the image
    expect(brief).toMatch(/NO text/i);
    // No depiction of deity / faces
    expect(brief).toMatch(/NO depiction of God, Jesus/i);
    expect(brief).toMatch(/human faces/i);
    // Non-figurative
    expect(brief).toMatch(/Non-figurative/i);
  });

  it("includes the brand palette hexes", () => {
    const brief = composeImageBrief({ title: "x" });
    expect(brief).toContain("#0070B3");
    expect(brief).toContain("#EBE2D6");
    expect(brief).toContain("#0F1729");
  });
});

describe("titleFontSize", () => {
  it("steps down the size as the title grows", () => {
    const short = titleFontSize("La gracia"); // 9
    const medium = titleFontSize("El amor que derriba muros del corazón hoy"); // ~41
    const long = titleFontSize(
      "Un título notablemente largo que necesita reducir el tamaño para caber en dos líneas",
    );
    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThanOrEqual(long);
    expect(long).toBeGreaterThanOrEqual(40);
    expect(short).toBeLessThanOrEqual(76);
  });
});

describe("buildFeaturedCardHtml", () => {
  const base = {
    title: "El amor que derriba muros",
    sermonDate: "2026-06-07",
    preacher: "Jonathan Hanegan",
    scripture: "Efesios 2:14",
    logoDataUri: "data:image/png;base64,LOGO",
  };

  it("renders at 1200×630 and includes the title", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain(`width: ${FEATURED_WIDTH}px`);
    expect(html).toContain(`height: ${FEATURED_HEIGHT}px`);
    expect(html).toContain("El amor que derriba muros");
  });

  it("builds the es-AR eyebrow with kicker + long date, uppercased", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain("PRÉDICA · 7 DE JUNIO DE 2026");
  });

  it("uses the AI background when provided and does not apply the fallback gradient element", () => {
    const html = buildFeaturedCardHtml(
      { ...base, backgroundDataUri: "data:image/png;base64,BG" },
      "es-AR",
    );
    expect(html).toContain("background-image:url('data:image/png;base64,BG')");
    // The .bg--fallback CSS rule always exists; assert the element doesn't use it.
    expect(html).not.toContain('class="bg bg--fallback"');
  });

  it("uses the on-brand gradient fallback element when there is no AI background", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain('class="bg bg--fallback"');
    expect(html).not.toContain("background-image:url(");
  });

  it("always renders the legibility scrim", () => {
    expect(buildFeaturedCardHtml(base, "es-AR")).toContain('class="scrim"');
  });

  it("renders the logo image when a data URI is given", () => {
    expect(buildFeaturedCardHtml(base, "es-AR")).toContain('src="data:image/png;base64,LOGO"');
  });

  it("falls back to the wordmark when no logo is given", () => {
    const html = buildFeaturedCardHtml({ ...base, logoDataUri: undefined }, "es-AR");
    expect(html).toContain("logo-fallback");
    expect(html).toContain("Iglesia de Cristo Redentor");
  });

  it("omits the meta line when scripture and preacher are both absent", () => {
    const html = buildFeaturedCardHtml(
      { title: base.title, sermonDate: base.sermonDate },
      "es-AR",
    );
    expect(html).not.toContain('class="meta"');
  });

  it("includes both meta parts with a separator when present", () => {
    const html = buildFeaturedCardHtml(base, "es-AR");
    expect(html).toContain('class="meta"');
    expect(html).toContain("Efesios 2:14");
    expect(html).toContain("Jonathan Hanegan");
  });

  it("escapes HTML in the title to prevent injection", () => {
    const html = buildFeaturedCardHtml(
      { ...base, title: '<script>alert("x")</script>' },
      "es-AR",
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the en-US kicker for the en-US locale", () => {
    const html = buildFeaturedCardHtml(base, "en-US");
    expect(html).toContain("SERMON · JUNE 7, 2026");
  });
});
