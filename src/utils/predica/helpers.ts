/**
 * Pure helper functions for the sermon PDF generator.
 *
 * These are kept in src/ so Vitest can import them as TypeScript.
 * The Node ESM script at .claude/scripts/predica/build-predica-pdf.mjs
 * re-exports everything from here (transpiled at runtime via tsx/import).
 *
 * All functions are pure (no side effects, no Playwright, no filesystem I/O).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Per-locale content for a single sermon. */
export interface SermonLocaleData {
  title: string;
  lead: string;
  thesis: string;
  mainPoints: string[];
  keyQuotes: string[];
  scriptureHeadline?: string;
  scriptureRefs: string[];
  closing?: string;
}

/** Fields shared across both locales (from the top-level sermon.json). */
export interface SermonCommon {
  slug: string;
  sermonDate: string; // YYYY-MM-DD
  preacher: string;
  serviceLabel?: { "es-AR": string; "en-US": string };
  /** Pre-inlined logo as a base64 data URI, e.g. "data:image/png;base64,..." */
  logoDataUri?: string;
}

/** Supported locale identifiers. */
export type SupportedLocale = "es-AR" | "en-US";

// ── Section label maps ────────────────────────────────────────────────────────

const LABELS = {
  "es-AR": {
    eyebrowSep: "·",
    preacher: "Predicó",
    lead: "Introducción",
    thesis: "Tesis",
    mainPoints: "Puntos principales",
    keyQuotes: "Citas clave",
    scripture: "Referencias bíblicas",
    closing: "Cierre",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Culto dominical",
  },
  "en-US": {
    eyebrowSep: "·",
    preacher: "Preached by",
    lead: "Introduction",
    thesis: "Thesis",
    mainPoints: "Main points",
    keyQuotes: "Key quotes",
    scripture: "Scripture references",
    closing: "Closing",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Sunday service",
  },
} as const satisfies Record<SupportedLocale, Record<string, string>>;

// ── escapeHtml ────────────────────────────────────────────────────────────────

/**
 * Escape all HTML special characters so dynamic sermon content cannot break
 * layout or introduce injection vectors when interpolated into the HTML template.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── formatSermonDate ──────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string for the sermon cover.
 *
 * - es-AR → "7 de junio de 2026"
 * - en-US → "June 7, 2026"
 *
 * Uses Intl.DateTimeFormat with timeZone: "UTC" to avoid local-time day shifts.
 */
export function formatSermonDate(dateStr: string, locale: SupportedLocale): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Construct via UTC components to prevent timezone-induced off-by-one days.
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

// ── buildPdfHtml ──────────────────────────────────────────────────────────────

/**
 * Build the full HTML document for one locale's sermon PDF.
 *
 * All dynamic values are passed through escapeHtml().
 * Sections that have no data (closing, scriptureHeadline) are simply omitted.
 * Chromium print-to-PDF will use @page rules embedded in the <style> block.
 *
 * @param localeData  - The locale-specific sermon content.
 * @param common      - Shared metadata (slug, date, preacher, logo).
 * @param locale      - Which locale to render ("es-AR" | "en-US").
 * @returns           A complete HTML document string ready for Playwright setContent().
 */
export function buildPdfHtml(
  localeData: SermonLocaleData,
  common: SermonCommon,
  locale: SupportedLocale,
): string {
  const L = LABELS[locale];
  const formattedDate = formatSermonDate(common.sermonDate, locale);
  const serviceLabel =
    common.serviceLabel?.[locale] ?? L.defaultService;

  // All dynamic text goes through escapeHtml
  const e = escapeHtml;
  const title = e(localeData.title);
  const lead = e(localeData.lead);
  const thesis = e(localeData.thesis);
  const preacher = e(common.preacher);
  const eyebrow = e(`${formattedDate} ${L.eyebrowSep} ${serviceLabel}`);

  const mainPointsHtml = localeData.mainPoints
    .map((pt) => `<li>${e(pt)}</li>`)
    .join("\n          ");

  const keyQuotesHtml = localeData.keyQuotes
    .map((q) => `<blockquote>${e(q)}</blockquote>`)
    .join("\n          ");

  const scriptureRefsHtml = localeData.scriptureRefs
    .map((ref) => `<li>${e(ref)}</li>`)
    .join("\n          ");

  const scriptureHeadlineHtml = localeData.scriptureHeadline
    ? `<p class="scripture-headline">${e(localeData.scriptureHeadline)}</p>`
    : "";

  const closingHtml = localeData.closing
    ? `
      <section class="closing">
        <h2>${e(L.closing)}</h2>
        <p>${e(localeData.closing)}</p>
      </section>`
    : "";

  const logoHtml = common.logoDataUri
    ? `<img src="${common.logoDataUri}" alt="Logo Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap"
    rel="stylesheet"
  />
  <style>
    /* ── Print page setup ── */
    @page {
      size: A4;
      margin: 18mm 17mm;
    }

    /* ── Brand palette ── */
    :root {
      --color-primary:    #0070B3;
      --color-sand:       #EBE2D6;
      --color-slate:      #0F1729;
      --color-bg:         #F8FAFB;
      --color-muted:      #647488;
      --color-border:     #E2E8F0;
      --color-accent:     #C05A2A; /* warm terracotta for verse / quote accent */
    }

    /* ── Base ── */
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--color-bg);
      color: var(--color-slate);
      font-family: 'Outfit', Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Headings ── */
    h1, h2, h3 {
      font-family: 'Playfair Display', Georgia, serif;
      margin: 0 0 0.5em;
      line-height: 1.2;
    }

    h1 { font-size: 26pt; font-weight: 700; color: var(--color-slate); }
    h2 { font-size: 13pt; font-weight: 600; color: var(--color-primary); margin-top: 1.6em; }

    /* ── Cover ── */
    .cover {
      text-align: center;
      padding: 2em 0 1.5em;
      break-after: avoid;
    }

    .logo {
      max-width: 120px;
      height: auto;
      margin-bottom: 1.5em;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .logo-fallback {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      color: var(--color-primary);
      margin-bottom: 1.5em;
    }

    .eyebrow {
      font-family: 'Outfit', Arial, sans-serif;
      font-size: 8pt;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-muted);
      margin-bottom: 0.75em;
    }

    .cover h1 {
      margin-bottom: 0.3em;
    }

    .scripture-headline {
      font-family: 'Playfair Display', Georgia, serif;
      font-style: italic;
      font-size: 11.5pt;
      color: var(--color-accent);
      margin: 0.5em 0 0.75em;
    }

    .preacher-line {
      font-size: 9.5pt;
      color: var(--color-muted);
      margin-top: 0.5em;
    }

    .preacher-label {
      font-weight: 600;
    }

    hr.cover-rule {
      border: none;
      border-top: 1.5px solid var(--color-border);
      margin: 1.5em auto;
      width: 60%;
    }

    /* ── Body sections ── */
    section {
      margin-top: 1.4em;
    }

    p {
      margin: 0 0 0.75em;
    }

    /* ── Thesis callout ── */
    .thesis-box {
      background: var(--color-sand);
      border-left: 4px solid var(--color-primary);
      padding: 0.85em 1.1em;
      border-radius: 3px;
      margin-top: 0.5em;
      break-inside: avoid;
    }

    .thesis-box p {
      margin: 0;
      font-size: 11pt;
      font-style: italic;
      font-family: 'Playfair Display', Georgia, serif;
    }

    /* ── Main points list ── */
    .main-points ul {
      margin: 0.4em 0 0;
      padding-left: 1.5em;
    }

    .main-points li {
      margin-bottom: 0.35em;
      break-inside: avoid;
    }

    /* ── Key quotes ── */
    .key-quotes blockquote {
      border-left: 3px solid var(--color-accent);
      margin: 0.6em 0;
      padding: 0.5em 0.9em;
      font-style: italic;
      font-family: 'Playfair Display', Georgia, serif;
      color: var(--color-slate);
      break-inside: avoid;
    }

    /* ── Scripture references ── */
    .scripture-refs ul {
      margin: 0.4em 0 0;
      padding-left: 1.5em;
    }

    .scripture-refs li {
      font-size: 9.5pt;
      color: var(--color-muted);
      margin-bottom: 0.25em;
      break-inside: avoid;
    }

    /* ── Closing ── */
    .closing p {
      font-style: italic;
    }

    /* ── Footer signature ── */
    .footer-sig {
      text-align: center;
      margin-top: 2.5em;
      padding-top: 1em;
      border-top: 1px solid var(--color-border);
      font-size: 9pt;
      color: var(--color-muted);
      letter-spacing: 0.05em;
      break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- ── Cover ── -->
  <div class="cover">
    ${logoHtml}
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    ${scriptureHeadlineHtml}
    <p class="preacher-line">
      <span class="preacher-label">${e(L.preacher)}:</span> ${preacher}
    </p>
    <hr class="cover-rule" />
  </div>

  <!-- ── Lead ── -->
  <section class="lead">
    <p>${lead}</p>
  </section>

  <!-- ── Thesis ── -->
  <section class="thesis">
    <h2>${e(L.thesis)}</h2>
    <div class="thesis-box">
      <p>${thesis}</p>
    </div>
  </section>

  <!-- ── Main points ── -->
  <section class="main-points">
    <h2>${e(L.mainPoints)}</h2>
    <ul>
          ${mainPointsHtml}
    </ul>
  </section>

  <!-- ── Key quotes ── -->
  <section class="key-quotes">
    <h2>${e(L.keyQuotes)}</h2>
          ${keyQuotesHtml}
  </section>

  <!-- ── Scripture references ── -->
  <section class="scripture-refs">
    <h2>${e(L.scripture)}</h2>
    <ul>
          ${scriptureRefsHtml}
    </ul>
  </section>
  ${closingHtml}

  <!-- ── Footer signature ── -->
  <div class="footer-sig">
    ${e(L.footer)}
  </div>

</body>
</html>`;
}
