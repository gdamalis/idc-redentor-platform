/**
 * Server-side sermon PDF render (ICR-114 regen webhook/cron).
 *
 * Renders the branded sermon PDF(s) from the two per-locale DRAFT `Sermon` fetches
 * (`getSermonById(id, locale, true)` — see the webhook route.ts) using the SAME pure
 * `buildPdfHtml` the local `/predica` pipeline uses (src/utils/predica/helpers.ts),
 * so the regenerated PDF matches the branded output exactly.
 *
 * Two things differ from the local pipeline, both required because this runs inside
 * a Vercel serverless function with no guarantee of outbound network access at
 * render time:
 *
 *  1. **Self-contained HTML** — `buildPdfHtml`'s Google-Fonts `<link>` (network) is
 *     replaced with inlined `@font-face` data-URIs sourced from the committed
 *     `assets/pdfAssets.ts` (fonts + logo, base64). See `toSelfContainedHtml`.
 *  2. **Env-aware Chromium launch** — `@sparticuz/chromium`'s bundled Linux binary
 *     on Vercel/Lambda, vs. `@playwright/test`'s locally-installed Chromium for local
 *     dev/spikes. See `launchBrowser`.
 *
 * `renderSermonPdfs` is the only export the cron route (CP7) calls. `mapSermonsToPdf`
 * and `toSelfContainedHtml` are exported for CI-safe unit testing without a browser
 * (renderSermonPdf.test.ts) — the actual Chromium render is covered by a manual local
 * spike (not committed; see the ICR-114 PR description for the command + output).
 */
import type { Document } from "@contentful/rich-text-types";
import type { Browser } from "playwright-core";

import type { ScriptureRef, Sermon } from "@src/types/Sermon";
import { buildPdfHtml } from "@src/utils/predica/helpers";
import type { SermonCommon, SermonLocaleData, SupportedLocale } from "@src/utils/predica/helpers";
import { richTextToContentBlocks } from "@src/utils/predica/regenContent";
import type { SermonScriptureRef } from "@src/utils/predica/sermonEntry";
import {
  LOGO_PNG_DATA_URI,
  OUTFIT_VARIABLE_LATIN_WOFF2_BASE64,
  PLAYFAIR_DISPLAY_ITALIC_400_LATIN_WOFF2_BASE64,
  PLAYFAIR_DISPLAY_NORMAL_LATIN_WOFF2_BASE64,
} from "@src/utils/predica/assets/pdfAssets";

const PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  margin: { top: "18mm", bottom: "18mm", left: "17mm", right: "17mm" },
} as const;

// ── mapSermonsToPdf ───────────────────────────────────────────────────────────

export interface MappedSermonPdf {
  common: SermonCommon;
  byLocale: Record<SupportedLocale, SermonLocaleData>;
}

/**
 * Bilingual scripture merge, paired by index (mirrors regenContent.ts's
 * `buildCanonicalScripture`): numeric `chapter`/`fromVerse`/`toVerse` become strings
 * (the shape `SermonScriptureRef`/`buildPdfHtml` expect), and a length mismatch
 * between the two locale fetches falls back to whichever locale has that entry.
 */
function mergeScriptureReferences(
  esRefs: ScriptureRef[] | undefined,
  enRefs: ScriptureRef[] | undefined,
): SermonScriptureRef[] | undefined {
  const es = esRefs ?? [];
  const en = enRefs ?? [];
  const length = Math.max(es.length, en.length);
  const refs: SermonScriptureRef[] = [];
  for (let i = 0; i < length; i += 1) {
    const esRef = es[i];
    const enRef = en[i];
    const coords = esRef ?? enRef;
    if (!coords) continue;
    refs.push({
      chapter: String(coords.chapter),
      fromVerse: String(coords.fromVerse),
      toVerse: coords.toVerse != null ? String(coords.toVerse) : undefined,
      "es-AR": {
        book: esRef?.book ?? "",
        verseContent: esRef?.verseContent ?? "",
        bibleVersion: esRef?.bibleVersion ?? "",
      },
      "en-US": {
        book: enRef?.book ?? "",
        verseContent: enRef?.verseContent ?? "",
        bibleVersion: enRef?.bibleVersion ?? "",
      },
    });
  }
  return refs.length > 0 ? refs : undefined;
}

/**
 * Map the two per-locale draft `Sermon` fetches into the shapes `buildPdfHtml`
 * expects. `serviceLabel` is deliberately omitted (M3 — not a fetchable
 * content-type field; the PDF falls back to its own default label for both the
 * current and regenerated PDF, so they match). At least one locale must be
 * present — callers already drop a job whose entry has vanished entirely from
 * Contentful before reaching this function (see the webhook's "not-found" branch /
 * CP7's entry-gone check).
 */
export function mapSermonsToPdf(
  esAR: Sermon | undefined,
  enUS: Sermon | undefined,
  logoDataUri: string,
): MappedSermonPdf {
  const source = esAR ?? enUS;
  if (!source) {
    throw new Error("mapSermonsToPdf: both locales are missing — nothing to render");
  }

  return {
    common: {
      slug: source.slug,
      sermonDate: source.sermonDate,
      preacher: source.preacher.name,
      additionalPreachers: source.additionalPreachers?.map((p) => p.name),
      scriptureReferences: mergeScriptureReferences(
        esAR?.scriptureReferences,
        enUS?.scriptureReferences,
      ),
      logoDataUri,
    },
    byLocale: {
      "es-AR": {
        title: esAR?.title ?? enUS?.title ?? "",
        content: richTextToContentBlocks(esAR?.content?.json as Document | undefined),
      },
      "en-US": {
        title: enUS?.title ?? esAR?.title ?? "",
        content: richTextToContentBlocks(enUS?.content?.json as Document | undefined),
      },
    },
  };
}

// ── Self-contained HTML (no outbound network at render) ───────────────────────

// Matches buildPdfHtml's <head> Google-Fonts block: the two preconnect <link>s
// through the closing tag of the css2 stylesheet <link> (helpers.ts, ~lines 221-226).
const GOOGLE_FONTS_LINK_RE =
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>[\s\S]*?rel="stylesheet"\s*\/>/;

/**
 * The two brand families as inlined `@font-face` data-URIs. Both ship as variable
 * fonts (see assets/pdfAssets.ts), so a single normal-style face per family covers
 * the whole weight RANGE buildPdfHtml uses (Outfit 300-600; Playfair Display
 * 400-700), plus one italic-400 face for Playfair Display's blockquote styling.
 */
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
 * Replace `buildPdfHtml`'s Google-Fonts `<link>` (network) with inlined
 * `@font-face` data-URIs, so the serverless render never leaves the function to
 * fetch fonts. The logo is already self-contained via `common.logoDataUri`
 * (buildPdfHtml renders it as a `data:` URI `<img>` directly) — no transform needed
 * there; callers just pass `LOGO_PNG_DATA_URI` in `mapSermonsToPdf`.
 */
export function toSelfContainedHtml(html: string): string {
  if (!GOOGLE_FONTS_LINK_RE.test(html)) {
    throw new Error("toSelfContainedHtml: expected Google-Fonts <link> block not found in HTML");
  }
  return html.replace(GOOGLE_FONTS_LINK_RE, fontFaceStyleBlock());
}

// ── Env-aware browser launch ───────────────────────────────────────────────────

function isServerlessEnv(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * `@sparticuz/chromium`'s bundled binary is Linux-only and will NOT launch on a
 * macOS dev host — so the branch taken here MUST match the actual runtime, not just
 * `NODE_ENV`. Vercel/Lambda → the serverless Chromium (`serverExternalPackages` in
 * next.config.ts keeps both packages un-bundled). Local (dev/spike) →
 * `@playwright/test`'s locally-installed Chromium, imported dynamically so a
 * devDependency never gets traced into the Vercel function (also externalized in
 * next.config.ts as a backstop — see that file's comment).
 */
async function launchBrowser(): Promise<Browser> {
  if (isServerlessEnv()) {
    const [{ default: chromium }, { chromium: playwrightChromium }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium: devChromium } = await import("@playwright/test");
  return devChromium.launch();
}

async function renderLocalePdf(
  browser: Browser,
  localeData: SermonLocaleData,
  common: SermonCommon,
  locale: SupportedLocale,
  version: number,
): Promise<Buffer> {
  const html = toSelfContainedHtml(buildPdfHtml(localeData, common, locale, version));
  const page = await browser.newPage();
  try {
    // Fonts are inlined now, so "load" (not "networkidle") is sufficient — but
    // explicitly wait for font-face parsing/decoding to finish before printing.
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    return await page.pdf(PDF_OPTIONS);
  } finally {
    await page.close();
  }
}

/**
 * Render both locale PDFs for one sermon entry. Fetches nothing itself — the cron
 * route (CP7) passes the already-fetched draft `Sermon` objects (one `getSermonById`
 * call per locale) plus the job's next version (CP2's `nextVersion`), stamped into
 * each PDF's footer (and, by the CP6 write-back, the asset title).
 */
export async function renderSermonPdfs(
  esAR: Sermon | undefined,
  enUS: Sermon | undefined,
  version: number,
): Promise<Record<SupportedLocale, Buffer>> {
  const { common, byLocale } = mapSermonsToPdf(esAR, enUS, LOGO_PNG_DATA_URI);
  const browser = await launchBrowser();
  try {
    const [pdfEsAR, pdfEnUS] = await Promise.all([
      renderLocalePdf(browser, byLocale["es-AR"], common, "es-AR", version),
      renderLocalePdf(browser, byLocale["en-US"], common, "en-US", version),
    ]);
    return { "es-AR": pdfEsAR, "en-US": pdfEnUS };
  } finally {
    await browser.close();
  }
}
