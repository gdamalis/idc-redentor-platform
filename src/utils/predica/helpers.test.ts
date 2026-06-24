/**
 * Unit tests for the sermon PDF generator pure helpers.
 * Exercises escapeHtml, formatSermonDate, and buildPdfHtml without invoking Playwright.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { escapeHtml, formatSermonDate, buildPdfHtml } from "@src/utils/predica/helpers";

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("leaves plain text untouched", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("bread & wine")).toBe("bread &amp; wine");
  });

  it("escapes less-than and greater-than", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes single quotes / apostrophes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("handles all special chars together", () => {
    expect(escapeHtml(`<b class="x">a&b</b>`)).toBe(
      "&lt;b class=&quot;x&quot;&gt;a&amp;b&lt;/b&gt;",
    );
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes text that could break layout via injection", () => {
    const injection = `</div><script>alert(1)</script>`;
    const escaped = escapeHtml(injection);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("&lt;");
    expect(escaped).toContain("&gt;");
  });
});

// ── formatSermonDate ──────────────────────────────────────────────────────────

describe("formatSermonDate", () => {
  it("formats a date in es-AR as Spanish long form (7 de junio de 2026)", () => {
    const result = formatSermonDate("2026-06-07", "es-AR");
    // Should contain the day number, month name in Spanish, and year
    expect(result).toMatch(/7/);
    expect(result.toLowerCase()).toMatch(/junio/);
    expect(result).toMatch(/2026/);
  });

  it("formats a date in en-US as English long form (June 7, 2026)", () => {
    const result = formatSermonDate("2026-06-07", "en-US");
    expect(result).toMatch(/June/i);
    expect(result).toMatch(/7/);
    expect(result).toMatch(/2026/);
  });

  it("produces different output for the two locales", () => {
    const es = formatSermonDate("2026-06-07", "es-AR");
    const en = formatSermonDate("2026-06-07", "en-US");
    expect(es).not.toBe(en);
  });

  it("handles a date at month/year boundary correctly (December 31)", () => {
    const result = formatSermonDate("2025-12-31", "en-US");
    expect(result).toMatch(/December/i);
    expect(result).toMatch(/31/);
    expect(result).toMatch(/2025/);
  });
});

// ── buildPdfHtml ──────────────────────────────────────────────────────────────

const COMMON_FIXTURE = {
  slug: "test-sermon",
  sermonDate: "2026-06-07",
  preacher: "Jonathan Hanegan",
  serviceLabel: { "es-AR": "Culto dominical", "en-US": "Sunday service" },
  logoDataUri: "data:image/png;base64,iVBORw0KGgo=",
};

const ES_LOCALE_DATA = {
  title: "El amor que derriba muros",
  lead: "Dios reconcilia a toda la humanidad.",
  thesis: "Cristo es nuestra paz que rompe toda barrera.",
  mainPoints: ["La división humana", "La obra reconciliadora", "El llamado a la unidad"],
  keyQuotes: ["«Porque él es nuestra paz» · Efesios 2:14"],
  scriptureHeadline: "«Él es nuestra paz» · Efesios 2:14",
  scriptureRefs: ["Efesios 2:11-22 (RVR1960)"],
  closing: "Que seamos un pueblo unido.",
};

const EN_LOCALE_DATA = {
  title: "The love that breaks down walls",
  lead: "God reconciles all of humanity.",
  thesis: "Christ is our peace who breaks every barrier.",
  mainPoints: ["Human division", "The reconciling work", "The call to unity"],
  keyQuotes: ['"For he himself is our peace" · Ephesians 2:14'],
  scriptureHeadline: '"He himself is our peace" · Ephesians 2:14',
  scriptureRefs: ["Ephesians 2:11-22 (NIV)"],
  closing: "May we be a united people.",
};

describe("buildPdfHtml — es-AR", () => {
  let html: string;

  beforeEach(() => {
    html = buildPdfHtml(ES_LOCALE_DATA, COMMON_FIXTURE, "es-AR");
  });

  it("returns a non-empty HTML string", () => {
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
  });

  it("includes the escaped sermon title", () => {
    expect(html).toContain("El amor que derriba muros");
  });

  it("includes the escaped thesis text", () => {
    expect(html).toContain("Cristo es nuestra paz que rompe toda barrera.");
  });

  it("includes all main points", () => {
    expect(html).toContain("La división humana");
    expect(html).toContain("La obra reconciliadora");
    expect(html).toContain("El llamado a la unidad");
  });

  it("includes the key quote", () => {
    expect(html).toContain("«Porque él es nuestra paz» · Efesios 2:14");
  });

  it("includes the scripture reference", () => {
    expect(html).toContain("Efesios 2:11-22 (RVR1960)");
  });

  it("includes the closing", () => {
    expect(html).toContain("Que seamos un pueblo unido.");
  });

  it("uses Spanish section labels (Tesis, Puntos principales, Citas clave, Referencias)", () => {
    expect(html).toMatch(/Tesis/);
    expect(html).toMatch(/Puntos principales/i);
    expect(html).toMatch(/Citas clave/i);
    expect(html).toMatch(/Referencias bíblicas/i);
  });

  it("uses Spanish preacher label (Predicó)", () => {
    expect(html).toMatch(/Predicó/);
    expect(html).toContain("Jonathan Hanegan");
  });

  it("includes the formatted date in Spanish long form", () => {
    // The cover should show the formatted date for es-AR
    expect(html.toLowerCase()).toMatch(/junio/);
    expect(html).toMatch(/2026/);
  });

  it("includes the service label in Spanish", () => {
    expect(html).toContain("Culto dominical");
  });

  it("includes the logo as a data URI img tag", () => {
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
  });

  it("includes the Iglesia de Cristo Redentor footer signature", () => {
    expect(html).toContain("Iglesia de Cristo Redentor");
  });

  it("escapes HTML-special characters that appear in the title", () => {
    const injectionData = {
      ...ES_LOCALE_DATA,
      title: '<script>alert("xss")</script>',
      thesis: "Safe thesis",
    };
    const injected = buildPdfHtml(injectionData, COMMON_FIXTURE, "es-AR");
    expect(injected).not.toContain("<script>");
    expect(injected).toContain("&lt;script&gt;");
  });

  it("escapes HTML-special characters in thesis", () => {
    const injectionData = {
      ...ES_LOCALE_DATA,
      thesis: "A & B > C",
    };
    const injected = buildPdfHtml(injectionData, COMMON_FIXTURE, "es-AR");
    expect(injected).not.toContain("A & B > C");
    expect(injected).toContain("A &amp; B &gt; C");
  });

  it("escapes HTML-special characters in main points", () => {
    const injectionData = {
      ...ES_LOCALE_DATA,
      mainPoints: ['Point with <b>tag</b>'],
    };
    const injected = buildPdfHtml(injectionData, COMMON_FIXTURE, "es-AR");
    expect(injected).not.toContain("<b>tag</b>");
    expect(injected).toContain("&lt;b&gt;tag&lt;/b&gt;");
  });

  it("omits closing section when closing is not provided", () => {
    const noClosing = { ...ES_LOCALE_DATA, closing: undefined };
    const rendered = buildPdfHtml(noClosing, COMMON_FIXTURE, "es-AR");
    // Should not crash and should not contain the es closing text
    expect(rendered).not.toContain("Que seamos un pueblo unido.");
  });

  it("omits scriptureHeadline when not provided", () => {
    const noHeadline = { ...ES_LOCALE_DATA, scriptureHeadline: undefined };
    const rendered = buildPdfHtml(noHeadline, COMMON_FIXTURE, "es-AR");
    // Should not crash; the scriptureHeadline text must be absent
    expect(rendered).not.toContain("«Él es nuestra paz» · Efesios 2:14");
  });
});

describe("buildPdfHtml — en-US", () => {
  let html: string;

  beforeEach(() => {
    html = buildPdfHtml(EN_LOCALE_DATA, COMMON_FIXTURE, "en-US");
  });

  it("uses English section labels (Thesis, Main points, Key quotes, Scripture)", () => {
    expect(html).toMatch(/Thesis/i);
    expect(html).toMatch(/Main points/i);
    expect(html).toMatch(/Key quotes/i);
    expect(html).toMatch(/Scripture/i);
  });

  it("uses English preacher label (Preached by)", () => {
    expect(html).toMatch(/Preached by/i);
    expect(html).toContain("Jonathan Hanegan");
  });

  it("includes the formatted date in English long form (June)", () => {
    expect(html).toMatch(/June/i);
    expect(html).toMatch(/2026/);
  });

  it("includes the service label in English", () => {
    expect(html).toContain("Sunday service");
  });

  it("includes the English title", () => {
    expect(html).toContain("The love that breaks down walls");
  });

  it("includes the English thesis", () => {
    expect(html).toContain("Christ is our peace who breaks every barrier.");
  });
});
