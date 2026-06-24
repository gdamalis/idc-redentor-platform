#!/usr/bin/env node
/**
 * build-predica-pdf.mjs — Bilingual branded sermon PDF generator.
 *
 * Reads a structured sermon.json and renders TWO branded A4 PDFs
 * (es-AR + en-US) via Playwright headless-Chromium print-to-PDF.
 *
 * Usage:
 *   node .claude/scripts/predica/build-predica-pdf.mjs <path-to-sermon.json> [--out <dir>]
 *
 * Output:
 *   <outDir>/predica.es-AR.pdf
 *   <outDir>/predica.en-US.pdf
 *   (default outDir = directory of the input sermon.json)
 *
 * Exit codes:
 *   0  both PDFs written successfully
 *   2  usage error (missing/bad args, unreadable/invalid JSON, schema error)
 *   1  render failure (Playwright / filesystem error)
 *
 * ── sermon.json contract ──────────────────────────────────────────────────────
 *
 * {
 *   "slug": "string",                          // kebab-case identifier
 *   "sermonDate": "YYYY-MM-DD",                // ISO date
 *   "preacher": "Full Name",
 *   "serviceLabel": {                          // optional; defaults shown
 *     "es-AR": "Culto dominical",
 *     "en-US": "Sunday service"
 *   },
 *   "locales": {
 *     "es-AR": {
 *       "title": "...",
 *       "lead": "...",                         // introductory paragraph
 *       "thesis": "...",                       // central thesis (callout box)
 *       "mainPoints": ["..."],                 // bulleted list
 *       "keyQuotes": ["...", "..."],           // 1–2 blockquotes
 *       "scriptureHeadline": "«...» · Ref",   // optional cover verse
 *       "scriptureRefs": ["Efesios 2:11-22 (RVR1960)", "..."],
 *       "closing": "..."                       // optional
 *     },
 *     "en-US": {
 *       // same keys, English text, NIV scripture
 *     }
 *   }
 * }
 *
 * ── Branding ─────────────────────────────────────────────────────────────────
 *
 * Fonts:   Playfair Display (headings) + Outfit (body) via Google Fonts.
 * Palette: primary #0070B3 · sand #EBE2D6 · slate #0F1729 · bg #F8FAFB
 *          muted #647488 · border #E2E8F0 · accent (terracotta) #C05A2A
 * Logo:    public/assets/img/redentor_logo.png inlined as a base64 data URI.
 * Page:    A4, margin 18mm top/bottom × 17mm left/right.
 */

import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

// ── Re-export pure helpers ────────────────────────────────────────────────────
// The canonical source of truth for these functions is
// src/utils/predica/helpers.ts (TypeScript, Vitest-tested).
// We duplicate the JS-compatible implementation here so this file runs
// directly under Node ESM without a build step.

/**
 * Escape all HTML special characters to prevent layout breaks / injection.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format a YYYY-MM-DD date string for the sermon cover using Intl.DateTimeFormat.
 *
 * - es-AR → "7 de junio de 2026"
 * - en-US → "June 7, 2026"
 *
 * Uses timeZone: "UTC" to prevent local-time day shifts.
 *
 * @param {string} dateStr  YYYY-MM-DD
 * @param {string} locale   "es-AR" | "en-US"
 * @returns {string}
 */
export function formatSermonDate(dateStr, locale) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** @type {Record<string, Record<string, string>>} */
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
};

/**
 * Build the complete HTML document for one locale's sermon PDF.
 *
 * All dynamic values are passed through escapeHtml().
 * Optional sections (closing, scriptureHeadline) are omitted when absent.
 *
 * @param {object} localeData  - Per-locale sermon content (title, lead, …)
 * @param {object} common      - Shared metadata (slug, sermonDate, preacher, logoDataUri, …)
 * @param {string} locale      - "es-AR" | "en-US"
 * @returns {string}           - Complete HTML document string.
 */
export function buildPdfHtml(localeData, common, locale) {
  const L = LABELS[locale];
  const formattedDate = formatSermonDate(common.sermonDate, locale);
  const serviceLabel = common.serviceLabel?.[locale] ?? L.defaultService;

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
      --color-accent:     #C05A2A;
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

// ── CLI helpers ───────────────────────────────────────────────────────────────

function usage() {
  process.stderr.write(
    [
      "usage: node .claude/scripts/predica/build-predica-pdf.mjs <path-to-sermon.json> [--out <dir>]",
      "",
      "  <path-to-sermon.json>  Path to the sermon JSON input file (required).",
      "  --out <dir>            Output directory for the generated PDFs.",
      "                         Default: same directory as the input JSON.",
      "",
      "Output files:",
      "  <outDir>/predica.es-AR.pdf",
      "  <outDir>/predica.en-US.pdf",
      "",
      "Exit codes:",
      "  0  success",
      "  2  usage / input error (bad args, unreadable/invalid JSON, schema violation)",
      "  1  render failure (Playwright / filesystem error)",
      "",
    ].join("\n"),
  );
}

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// ── Schema validation ─────────────────────────────────────────────────────────

const SUPPORTED_LOCALES = ["es-AR", "en-US"];

/**
 * Validate the parsed sermon JSON. Returns an array of error strings; empty = valid.
 * @param {unknown} raw
 * @returns {string[]}
 */
function validateSermon(raw) {
  const errs = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["Root must be a JSON object."];
  }
  const s = /** @type {Record<string,unknown>} */ (raw);

  if (typeof s.slug !== "string" || !s.slug.trim()) errs.push("slug: required string");
  if (typeof s.sermonDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.sermonDate))
    errs.push("sermonDate: required YYYY-MM-DD string");
  if (typeof s.preacher !== "string" || !s.preacher.trim()) errs.push("preacher: required string");

  if (!s.locales || typeof s.locales !== "object" || Array.isArray(s.locales)) {
    errs.push("locales: required object");
    return errs;
  }
  const locs = /** @type {Record<string,unknown>} */ (s.locales);

  for (const loc of SUPPORTED_LOCALES) {
    if (!locs[loc] || typeof locs[loc] !== "object") {
      errs.push(`locales.${loc}: required object`);
      continue;
    }
    const ld = /** @type {Record<string,unknown>} */ (locs[loc]);
    const required = ["title", "lead", "thesis"];
    for (const f of required) {
      if (typeof ld[f] !== "string" || !String(ld[f]).trim())
        errs.push(`locales.${loc}.${f}: required non-empty string`);
    }
    if (!Array.isArray(ld.mainPoints) || ld.mainPoints.length === 0)
      errs.push(`locales.${loc}.mainPoints: required non-empty array`);
    if (!Array.isArray(ld.keyQuotes) || ld.keyQuotes.length === 0)
      errs.push(`locales.${loc}.keyQuotes: required non-empty array`);
    if (!Array.isArray(ld.scriptureRefs) || ld.scriptureRefs.length === 0)
      errs.push(`locales.${loc}.scriptureRefs: required non-empty array`);
  }

  return errs;
}

// ── Logo loader ───────────────────────────────────────────────────────────────

/**
 * Read the church logo PNG and return it as a base64 data URI, or null on error.
 * Resolve relative to this script file so it works regardless of cwd.
 * @returns {Promise<string|null>}
 */
async function loadLogoDataUri() {
  try {
    const logoPath = new URL(
      "../../../public/assets/img/redentor_logo.png",
      import.meta.url,
    );
    const buf = await readFile(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    process.stderr.write(
      "WARNING: could not read redentor_logo.png — PDF will use text fallback\n",
    );
    return null;
  }
}

// ── PDF renderer ──────────────────────────────────────────────────────────────

/**
 * Render PDFs for all locales and write them to outDir.
 * Reuses a single Playwright browser; closes it in a finally.
 *
 * @param {object} sermon        - Validated sermon object.
 * @param {string} outDir        - Absolute path to the output directory.
 * @param {string|null} logoDataUri - Pre-loaded base64 data URI or null.
 * @param {boolean} [screenshot] - If true, also capture a PNG of the es-AR cover.
 * @returns {Promise<{ pdfs: string[], screenshot: string|null }>}
 */
async function renderPdfs(sermon, outDir, logoDataUri, screenshot = false) {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const writtenPdfs = [];
  let screenshotPath = null;

  try {
    for (const locale of SUPPORTED_LOCALES) {
      const localeData = sermon.locales[locale];
      const common = {
        slug: sermon.slug,
        sermonDate: sermon.sermonDate,
        preacher: sermon.preacher,
        serviceLabel: sermon.serviceLabel ?? undefined,
        logoDataUri: logoDataUri ?? undefined,
      };

      const html = buildPdfHtml(localeData, common, locale);
      const outPath = path.join(outDir, `predica.${locale}.pdf`);

      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.emulateMedia({ media: "print" });
        await page.pdf({
          path: outPath,
          format: "A4",
          printBackground: true,
          margin: { top: "18mm", bottom: "18mm", left: "17mm", right: "17mm" },
        });
        writtenPdfs.push(outPath);
        process.stdout.write(`  written: ${outPath}\n`);

        // Optional: capture a PNG of the es-AR cover for visual review.
        if (screenshot && locale === "es-AR") {
          await page.emulateMedia({ media: "screen" });
          screenshotPath = path.join(outDir, `predica.es-AR.cover.png`);
          await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
          await page.screenshot({ path: screenshotPath, fullPage: false });
          process.stdout.write(`  screenshot: ${screenshotPath}\n`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { pdfs: writtenPdfs, screenshot: screenshotPath };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const jsonPath = args[0];
  if (jsonPath.startsWith("--")) {
    usage();
    die(2, `error: expected a JSON file path as the first argument, got '${jsonPath}'`);
  }

  // Parse --out <dir>
  let outDir;
  const outIdx = args.indexOf("--out");
  if (outIdx !== -1) {
    const outVal = args[outIdx + 1];
    if (!outVal || outVal.startsWith("--")) {
      die(2, "error: --out requires a directory argument");
    }
    outDir = path.resolve(outVal);
  } else {
    outDir = path.dirname(path.resolve(jsonPath));
  }

  // Parse --screenshot flag
  const doScreenshot = args.includes("--screenshot");

  // Read + parse JSON
  let raw;
  try {
    const text = await readFile(jsonPath, "utf8");
    raw = JSON.parse(text);
  } catch (e) {
    die(2, `error: cannot read or parse '${jsonPath}': ${e.message}`);
  }

  // Validate schema
  const errs = validateSermon(raw);
  if (errs.length > 0) {
    process.stderr.write(`error: invalid sermon.json:\n`);
    for (const err of errs) process.stderr.write(`  - ${err}\n`);
    process.exit(2);
  }

  const sermon = raw;

  // Load logo (non-fatal)
  const logoDataUri = await loadLogoDataUri();

  // Render
  process.stdout.write(
    `rendering PDFs for ${sermon.slug} (${SUPPORTED_LOCALES.join(", ")})...\n`,
  );

  try {
    const result = await renderPdfs(sermon, outDir, logoDataUri, doScreenshot);
    process.stdout.write(`\ndone — ${result.pdfs.length} PDF(s) written to ${outDir}\n`);
    if (result.screenshot) {
      process.stdout.write(`screenshot: ${result.screenshot}\n`);
    }
    process.exit(0);
  } catch (e) {
    die(1, `render error: ${e.message ?? String(e)}`);
  }
}

// Guard: only run as the entry point, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
