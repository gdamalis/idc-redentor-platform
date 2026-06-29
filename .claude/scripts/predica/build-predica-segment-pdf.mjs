#!/usr/bin/env node
/**
 * build-predica-segment-pdf.mjs — Compact ONE-PAGE branded PDF per preacher, for a
 * multi-preacher service ("four short messages in one post"). Reuses the brand palette,
 * fonts and helpers (escapeHtml / formatSermonDate) of build-predica-pdf.mjs.
 *
 * Input: a `combined.parts.json` (the custom multi-preacher document) — see the
 * `parts[]` shape below. For each part × each locale it renders ONE A4 page sized to
 * fit a 5–8 min message: logo · eyebrow (date · service · "Parte N/4") · preacher ·
 * mini-title · short lead · key-scripture blockquote · ≤3 short body blocks · footer.
 *
 * Usage:
 *   node .claude/scripts/predica/build-predica-segment-pdf.mjs <combined.parts.json> [--out <dir>]
 *
 * Output (default outDir = directory of the input JSON):
 *   <outDir>/predica.p<order>.es-AR.pdf   (× number of parts)
 *   <outDir>/predica.p<order>.en-US.pdf
 *
 * Exit codes: 0 success · 2 usage/input error · 1 render failure
 *
 * parts[] item shape (per locale under `.locales`):
 *   { order, preacher, locales: { "es-AR": { miniTitle, lead, keyScripture?, bodyBlocks[] }, "en-US": {…} } }
 *   bodyBlocks: { type: "p"|"h3"|"blockquote", text } | { type: "ul"|"ol", items[] }
 */

import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { escapeHtml, formatSermonDate } from "./build-predica-pdf.mjs";

const LOCALES = ["es-AR", "en-US"];

const LABELS = {
  "es-AR": { preacher: "Predicó", part: "Parte", of: "de", footer: "Iglesia de Cristo Redentor", defaultService: "Culto dominical" },
  "en-US": { preacher: "Preached by", part: "Part", of: "of", footer: "Iglesia de Cristo Redentor", defaultService: "Sunday service" },
};

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

function bodyBlockHtml(block, e) {
  switch (block?.type) {
    case "h3":
      return `<h3>${e(block.text ?? "")}</h3>`;
    case "blockquote":
      return `<blockquote>${e(block.text ?? "")}</blockquote>`;
    case "ul":
      return `<ul>${(block.items ?? []).map((i) => `<li>${e(i)}</li>`).join("")}</ul>`;
    case "ol":
      return `<ol>${(block.items ?? []).map((i) => `<li>${e(i)}</li>`).join("")}</ol>`;
    case "p":
    default:
      return `<p>${e(block.text ?? "")}</p>`;
  }
}

function buildSegmentHtml(part, common, locale) {
  const L = LABELS[locale];
  const e = escapeHtml;
  const ld = part.locales[locale];
  const formattedDate = formatSermonDate(common.sermonDate, locale);
  const serviceLabel = common.serviceLabel?.[locale] ?? L.defaultService;
  const total = common.totalParts;

  const eyebrow = e(`${formattedDate} · ${serviceLabel} · ${L.part} ${part.order} ${L.of} ${total}`);
  const keyScriptureHtml = ld.keyScripture ? `<blockquote class="key">${e(ld.keyScripture)}</blockquote>` : "";
  const bodyHtml = (ld.bodyBlocks ?? []).map((b) => bodyBlockHtml(b, e)).join("\n");
  const logoHtml = common.logoDataUri
    ? `<img src="${common.logoDataUri}" alt="Iglesia de Cristo Redentor" class="logo" />`
    : `<p class="logo-fallback">Iglesia de Cristo Redentor</p>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 16mm 17mm; }
  :root { --primary:#0070B3; --sand:#EBE2D6; --slate:#0F1729; --muted:#647488; --border:#E2E8F0; --accent:#C05A2A; }
  *,*::before,*::after { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:#fff; color:var(--slate); font-family:'Outfit',Arial,sans-serif; font-size:10.5pt; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .logo { max-width:96px; height:auto; display:block; margin:0 auto 1em; }
  .logo-fallback { font-family:'Playfair Display',Georgia,serif; font-size:13pt; color:var(--primary); text-align:center; margin:0 0 1em; }
  .eyebrow { text-align:center; font-size:7.5pt; font-weight:500; letter-spacing:0.11em; text-transform:uppercase; color:var(--muted); margin:0 0 0.5em; }
  h1 { font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:21pt; line-height:1.15; text-align:center; margin:0 0 0.15em; }
  .preacher { text-align:center; font-size:9.5pt; color:var(--muted); margin:0 0 1.1em; }
  .preacher b { color:var(--slate); }
  hr.rule { border:0; border-top:1.5px solid var(--border); width:54%; margin:0 auto 1.2em; }
  .lead { font-size:11pt; }
  blockquote.key { border-left:3px solid var(--accent); margin:1em 0; padding:0.45em 0.9em; font-style:italic; font-family:'Playfair Display',Georgia,serif; color:var(--slate); background:#FBF7F2; break-inside:avoid; }
  h3 { font-family:'Playfair Display',Georgia,serif; font-size:12pt; color:var(--primary); margin:1.1em 0 0.35em; }
  p { margin:0 0 0.6em; }
  ul,ol { margin:0.3em 0 0.7em; padding-left:1.4em; }
  li { margin-bottom:0.3em; break-inside:avoid; }
  blockquote { border-left:3px solid var(--sand); margin:0.7em 0; padding:0.3em 0.9em; font-style:italic; }
  .footer { text-align:center; margin-top:2em; padding-top:0.8em; border-top:1px solid var(--border); font-size:8.5pt; color:var(--muted); letter-spacing:0.05em; }
</style>
</head>
<body>
  ${logoHtml}
  <p class="eyebrow">${eyebrow}</p>
  <h1>${e(ld.miniTitle)}</h1>
  <p class="preacher"><b>${e(L.preacher)}:</b> ${e(part.preacher)}</p>
  <hr class="rule" />
  ${ld.lead ? `<p class="lead">${e(ld.lead)}</p>` : ""}
  ${keyScriptureHtml}
  ${bodyHtml}
  <div class="footer">${e(L.footer)}</div>
</body>
</html>`;
}

async function loadLogoDataUri() {
  try {
    const buf = await readFile(new URL("../../../apps/web/public/assets/img/redentor_logo.png", import.meta.url));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help")
    die(args.length === 0 ? 2 : 0, "usage: node build-predica-segment-pdf.mjs <combined.parts.json> [--out <dir>]");

  const jsonPath = args[0];
  if (jsonPath.startsWith("--")) die(2, "error: first argument must be the combined.parts.json path");
  const outIdx = args.indexOf("--out");
  const outDir = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : path.dirname(path.resolve(jsonPath));

  let doc;
  try {
    doc = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (e) {
    die(2, `error: cannot read/parse ${jsonPath}: ${e.message}`);
  }
  if (!Array.isArray(doc.parts) || doc.parts.length === 0) die(2, "error: parts[] is required and non-empty");
  if (typeof doc.sermonDate !== "string") die(2, "error: sermonDate is required");

  await mkdir(outDir, { recursive: true });
  const common = {
    sermonDate: doc.sermonDate,
    serviceLabel: doc.serviceLabel,
    totalParts: doc.parts.length,
    logoDataUri: await loadLogoDataUri(),
  };

  const browser = await chromium.launch();
  const written = [];
  try {
    for (const part of doc.parts) {
      for (const locale of LOCALES) {
        if (!part.locales?.[locale]?.miniTitle) die(2, `error: part ${part.order} missing locales.${locale}.miniTitle`);
        const html = buildSegmentHtml(part, common, locale);
        const outPath = path.join(outDir, `predica.p${part.order}.${locale}.pdf`);
        const page = await browser.newPage();
        try {
          await page.setContent(html, { waitUntil: "networkidle" });
          await page.emulateMedia({ media: "print" });
          await page.pdf({ path: outPath, format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "17mm", right: "17mm" } });
          written.push(outPath);
          process.stdout.write(`  written: ${outPath}\n`);
        } finally {
          await page.close();
        }
      }
    }
  } catch (e) {
    await browser.close();
    die(1, `render error: ${e.message ?? String(e)}`);
  }
  await browser.close();
  process.stdout.write(`\ndone — ${written.length} PDF(s) in ${outDir}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
