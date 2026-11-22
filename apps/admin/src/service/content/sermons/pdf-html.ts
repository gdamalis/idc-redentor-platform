/**
 * Pure branded sermon PDF HTML builder (`ICR-200`, matching
 * `apps/web/src/utils/predica/helpers.ts` and `renderSermonPdf.ts` verbatim so
 * regenerated PDFs preserve the church's exact branded layout, typography, and
 * self-contained `@font-face` data URIs with zero outbound network requests).
 */
import type { Locale } from "@idcr/content";
import {
  OUTFIT_VARIABLE_LATIN_WOFF2_BASE64,
  PLAYFAIR_DISPLAY_ITALIC_400_LATIN_WOFF2_BASE64,
  PLAYFAIR_DISPLAY_NORMAL_LATIN_WOFF2_BASE64,
} from "./pdf-assets";
import type { SermonPdfContentBlock } from "./tiptap-regen-content";

export interface SermonPdfScriptureRef {
  readonly chapter: string;
  readonly fromVerse: string;
  readonly toVerse?: string;
  readonly "es-AR": {
    readonly book: string;
    readonly verseContent: string;
    readonly bibleVersion: string;
  };
  readonly "en-US": {
    readonly book: string;
    readonly verseContent: string;
    readonly bibleVersion: string;
  };
}

export interface SermonPdfLocaleData {
  readonly title: string;
  readonly content: readonly SermonPdfContentBlock[];
}

export interface SermonPdfCommon {
  readonly slug: string;
  readonly sermonDate: string;
  readonly preacher: string;
  readonly additionalPreachers?: readonly string[];
  readonly serviceLabel?: { readonly "es-AR": string; readonly "en-US": string };
  readonly scriptureReferences?: readonly SermonPdfScriptureRef[];
  readonly logoDataUri?: string;
}

const LABELS = {
  "es-AR": {
    eyebrowSep: "·",
    preacher: "Predicó",
    scripture: "Referencias bíblicas",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Culto dominical",
    bibleVersion: "NVI",
  },
  "en-US": {
    eyebrowSep: "·",
    preacher: "Preached by",
    scripture: "Scripture references",
    footer: "Iglesia de Cristo Redentor",
    defaultService: "Sunday service",
    bibleVersion: "NIV",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formats a `YYYY-MM-DD` (or ISO date-time) string in UTC so timezone offsets
 * never shift the printed Sunday date.
 */
export function formatSermonDate(dateStr: string, locale: Locale): string {
  const datePart = dateStr.slice(0, 10);
  const parts = datePart.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return dateStr;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Renders content blocks to branded print HTML. `embeddedAsset` blocks
 * (interactive audio/PDF players in multi-preacher posts) are skipped in print.
 */
export function renderContentBlocks(
  blocks: readonly SermonPdfContentBlock[],
): string {
  const e = escapeHtml;
  return blocks
    .map((block) => {
      switch (block.type) {
        case "h2":
          return `<h2>${e(block.text ?? "")}</h2>`;
        case "h3":
          return `<h3>${e(block.text ?? "")}</h3>`;
        case "p":
          return `<p>${e(block.text ?? "")}</p>`;
        case "blockquote":
          return `<blockquote>${e(block.text ?? "")}</blockquote>`;
        case "ul":
          return `<ul>\n        ${(block.items ?? [])
            .map((i) => `<li>${e(i)}</li>`)
            .join("\n        ")}\n      </ul>`;
        case "ol":
          return `<ol>\n        ${(block.items ?? [])
            .map((i) => `<li>${e(i)}</li>`)
            .join("\n        ")}\n      </ol>`;
        case "embeddedAsset":
          return "";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n      ");
}

export function renderScriptureReferences(
  refs: readonly SermonPdfScriptureRef[] | undefined,
  locale: Locale,
): string {
  if (!refs || refs.length === 0) return "";
  const L = LABELS[locale];
  const e = escapeHtml;
  const items = refs
    .map((ref) => {
      const lv = ref[locale];
      const verseRange = ref.toVerse
        ? `${ref.fromVerse}-${ref.toVerse}`
        : ref.fromVerse;
      const refLine = `${lv.book} ${ref.chapter}:${verseRange} (${L.bibleVersion})`;
      const verse = lv.verseContent
        ? `\n          <blockquote class="verse">${e(lv.verseContent)}</blockquote>`
        : "";
      return `<li>\n          <span class="ref">${e(refLine)}</span>${verse}\n        </li>`;
    })
    .join("\n        ");
  return `
  <section class="scripture-refs">
    <h2>${e(L.scripture)}</h2>
    <ul>
        ${items}
    </ul>
  </section>`;
}

function fontFaceStyleBlock(): string {
  return `<style>
    @font-face {
      font-family: 'Outfit';
      font-style: normal;
      font-weight: 300 600;
      font-display: swap;
      src: url(data:font/woff2;base64,${OUTFIT_VARIABLE_LATIN_WOFF2_BASE64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
      src: url(data:font/woff2;base64,${PLAYFAIR_DISPLAY_NORMAL_LATIN_WOFF2_BASE64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: italic;
      font-weight: 400;
      font-display: swap;
      src: url(data:font/woff2;base64,${PLAYFAIR_DISPLAY_ITALIC_400_LATIN_WOFF2_BASE64}) format('woff2');
    }
  </style>`;
}

/**
 * Builds the complete self-contained branded HTML document for one locale's
 * sermon PDF (inlined base64 fonts & logo — zero outbound network requests).
 */
export function buildSelfContainedPdfHtml(
  localeData: SermonPdfLocaleData,
  common: SermonPdfCommon,
  locale: Locale,
  version?: number,
): string {
  const L = LABELS[locale];
  const formattedDate = common.sermonDate
    ? formatSermonDate(common.sermonDate, locale)
    : "";
  const serviceLabel = common.serviceLabel?.[locale] ?? L.defaultService;

  const e = escapeHtml;
  const title = e(localeData.title);
  const eyebrow = formattedDate
    ? e(`${formattedDate} ${L.eyebrowSep} ${serviceLabel}`)
    : e(serviceLabel);
  const bylineParts = [common.preacher, ...(common.additionalPreachers ?? [])]
    .map((p) => p.trim())
    .filter(Boolean);
  const byline = e(bylineParts.join(" · "));

  const bodyHtml = renderContentBlocks(localeData.content);
  const scriptureHtml = renderScriptureReferences(
    common.scriptureReferences,
    locale,
  );

  const logoHtml = common.logoDataUri
    ? `<img src="${common.logoDataUri}" alt="Logo Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

  const footerText =
    version != null ? `${e(L.footer)} ${L.eyebrowSep} v${version}` : e(L.footer);

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${fontFaceStyleBlock()}
  <style>
    @page {
      size: A4;
      margin: 18mm 17mm;
    }

    :root {
      --color-primary:    #0070B3;
      --color-sand:       #EBE2D6;
      --color-slate:      #0F1729;
      --color-bg:         #FFFFFF;
      --color-muted:      #647488;
      --color-border:     #E2E8F0;
      --color-accent:     #C05A2A;
    }

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

    h1, h2, h3 {
      font-family: 'Playfair Display', Georgia, serif;
      margin: 0 0 0.5em;
      line-height: 1.2;
    }

    h1 { font-size: 26pt; font-weight: 700; color: var(--color-slate); }
    h2 { font-size: 14pt; font-weight: 600; color: var(--color-primary); margin-top: 1.5em; }
    h3 { font-size: 11.5pt; font-weight: 600; color: var(--color-slate); margin-top: 1.2em; }

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

    .body {
      margin-top: 0.5em;
    }

    p {
      margin: 0 0 0.75em;
    }

    .body blockquote {
      border-left: 3px solid var(--color-accent);
      margin: 0.8em 0;
      padding: 0.4em 0.95em;
      font-style: italic;
      font-family: 'Playfair Display', Georgia, serif;
      color: var(--color-slate);
      break-inside: avoid;
    }

    .body ul, .body ol {
      margin: 0.4em 0 0.9em;
      padding-left: 1.5em;
    }

    .body li {
      margin-bottom: 0.35em;
      break-inside: avoid;
    }

    .scripture-refs {
      margin-top: 1.8em;
    }

    .scripture-refs ul {
      list-style: none;
      margin: 0.4em 0 0;
      padding: 0;
    }

    .scripture-refs li {
      margin-bottom: 0.7em;
      break-inside: avoid;
    }

    .scripture-refs .ref {
      display: block;
      font-size: 9.5pt;
      font-weight: 600;
      color: var(--color-slate);
    }

    .scripture-refs .verse {
      border-left: 2px solid var(--color-primary);
      margin: 0.25em 0 0;
      padding: 0.1em 0.7em;
      font-size: 9.5pt;
      font-style: italic;
      color: var(--color-muted);
    }

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

  <div class="cover">
    ${logoHtml}
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    ${
      byline
        ? `<p class="preacher-line">
      <span class="preacher-label">${e(L.preacher)}:</span> ${byline}
    </p>`
        : ""
    }
    <hr class="cover-rule" />
  </div>

  <main class="body">
      ${bodyHtml}
  </main>
  ${scriptureHtml}

  <div class="footer-sig">
    ${footerText}
  </div>

</body>
</html>`;
}
