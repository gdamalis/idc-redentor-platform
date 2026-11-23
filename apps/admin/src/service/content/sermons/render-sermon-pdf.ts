import type { Browser, Page } from "playwright-core";
import type { Locale, SermonFields } from "@idcr/content";
import { LOGO_PNG_DATA_URI } from "./pdf-assets";
import {
  buildSelfContainedPdfHtml,
  type SermonPdfCommon,
  type SermonPdfLocaleData,
  type SermonPdfScriptureRef,
} from "./pdf-html";
import {
  hasEnglishPdfContent,
  type ResolvedSermonDependencies,
} from "./sermon-hash.service";
import { tiptapToContentBlocks } from "./tiptap-regen-content";

const PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  margin: { top: "18mm", bottom: "18mm", left: "17mm", right: "17mm" },
} as const;

export interface MappedSermonPdf {
  readonly common: SermonPdfCommon;
  readonly locales: Partial<Record<Locale, SermonPdfLocaleData>>;
}

/**
 * Pure mapper from a Mongo `SermonFields` draft + pre-resolved authors/verses
 * into `buildSelfContainedPdfHtml` inputs. Always includes `"es-AR"`; includes
 * `"en-US"` only when English content or title is present.
 */
export function mapSermonSnapshotToPdf(
  snapshot: SermonFields,
  resolved: ResolvedSermonDependencies,
  logoDataUri: string = LOGO_PNG_DATA_URI,
): MappedSermonPdf {
  const preacher = snapshot.preacherId
    ? (resolved.authorsById.get(snapshot.preacherId)?.name ?? "")
    : "";

  const additionalPreachers: string[] = [];
  for (const id of snapshot.additionalPreacherIds ?? []) {
    const name = resolved.authorsById.get(id)?.name;
    if (name) additionalPreachers.push(name);
  }

  const scriptureReferences: SermonPdfScriptureRef[] = [];
  for (const id of snapshot.scriptureRefIds ?? []) {
    const verse = resolved.versesById.get(id);
    if (!verse) continue;
    scriptureReferences.push({
      chapter: String(verse.chapter),
      fromVerse: String(verse.fromVerse),
      ...(verse.toVerse !== undefined && { toVerse: String(verse.toVerse) }),
      "es-AR": {
        book: verse.book["es-AR"] ?? "",
        verseContent: verse.text?.["es-AR"] ?? "",
        bibleVersion: verse.version?.["es-AR"] ?? "",
      },
      "en-US": {
        book: verse.book["en-US"] ?? verse.book["es-AR"] ?? "",
        verseContent: verse.text?.["en-US"] ?? verse.text?.["es-AR"] ?? "",
        bibleVersion: verse.version?.["en-US"] ?? verse.version?.["es-AR"] ?? "",
      },
    });
  }

  const locales: Partial<Record<Locale, SermonPdfLocaleData>> = {
    "es-AR": {
      title: snapshot.title["es-AR"] ?? "",
      content: tiptapToContentBlocks(snapshot.content?.["es-AR"]),
    },
  };

  if (hasEnglishPdfContent(snapshot)) {
    locales["en-US"] = {
      title: snapshot.title["en-US"] ?? snapshot.title["es-AR"] ?? "",
      content: tiptapToContentBlocks(
        snapshot.content?.["en-US"] ?? snapshot.content?.["es-AR"],
      ),
    };
  }

  return {
    common: {
      slug: snapshot.slug ?? "",
      sermonDate: snapshot.sermonDate ?? "",
      preacher,
      ...(additionalPreachers.length > 0 && { additionalPreachers }),
      ...(scriptureReferences.length > 0 && { scriptureReferences }),
      logoDataUri,
    },
    locales,
  };
}

function isServerlessEnv(): boolean {
  return (
    Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

/**
 * Env-aware Chromium launcher (mirrors `apps/web`'s ICR-114/143 setup):
 * - Vercel/Lambda -> `@sparticuz/chromium` + `playwright-core`
 * - Local dev -> `@playwright/test` locally installed Chromium
 */
async function launchBrowser(): Promise<Browser> {
  if (isServerlessEnv()) {
    const [{ default: chromium }, { chromium: playwrightChromium }] =
      await Promise.all([
        import("@sparticuz/chromium"),
        import("playwright-core"),
      ]);
    // Disable SwiftShader/WebGL for HTML-to-PDF rendering: avoids GPU thread
    // crashes and cuts peak RAM inside --single-process serverless Chromium.
    chromium.setGraphicsMode = false;
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium: devChromium } = await import("@playwright/test");
  return devChromium.launch();
}

async function renderLocalePdfOnPage(
  page: Page,
  localeData: SermonPdfLocaleData,
  common: SermonPdfCommon,
  locale: Locale,
  version: number,
): Promise<Buffer> {
  const html = buildSelfContainedPdfHtml(localeData, common, locale, version);
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  return await page.pdf(PDF_OPTIONS);
}

export interface RenderedSermonPdfs {
  readonly "es-AR": Buffer;
  readonly "en-US"?: Buffer;
}

/**
 * Renders branded sermon PDF buffer(s) for one sermon snapshot in a single
 * Chromium instance & single reused Page (always `"es-AR"`, plus `"en-US"`
 * when English content exists). Reusing one Page prevents `--single-process`
 * + `--no-startup-window` serverless Chromium from exiting when the first page
 * closes before the second locale renders.
 */
export async function renderSermonPdfs(
  snapshot: SermonFields,
  resolved: ResolvedSermonDependencies,
  version: number,
  browserFactory: () => Promise<Browser> = launchBrowser,
): Promise<RenderedSermonPdfs> {
  const { common, locales } = mapSermonSnapshotToPdf(snapshot, resolved);
  const esData = locales["es-AR"]!;
  const enData = locales["en-US"];

  const browser = await browserFactory();
  try {
    const page = await browser.newPage();
    try {
      const pdfEsAR = await renderLocalePdfOnPage(
        page,
        esData,
        common,
        "es-AR",
        version,
      );
      if (enData) {
        const pdfEnUS = await renderLocalePdfOnPage(
          page,
          enData,
          common,
          "en-US",
          version,
        );
        return { "es-AR": pdfEsAR, "en-US": pdfEnUS };
      }
      return { "es-AR": pdfEsAR };
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}
