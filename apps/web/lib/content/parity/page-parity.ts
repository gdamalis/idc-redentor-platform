import { inflateSync } from "node:zlib";
import type { Locale } from "@idcr/content";
import { assertSafeParityBaseUrl, validateParityBaseUrl } from "./host-guard";
import {
  normalizeHtmlForPageParity,
  type MediaIdentityMap,
} from "./normalize";

const LOCALES: readonly Locale[] = ["es-AR", "en-US"];

const STATIC_ROUTE_SUFFIXES = [
  "",
  "/who-is-jesus",
  "/community",
  "/come-meet-us",
  "/blog",
  "/predicas",
] as const;

export interface RouteInventoryInput {
  readonly locales?: readonly Locale[];
  readonly postSlugs?: readonly string[];
  readonly sermonSlugs?: readonly string[];
  readonly topicSlugsByLocale?: Readonly<
    Partial<Record<Locale, readonly string[]>>
  >;
}

/**
 * Builds the complete mode-matched route inventory:
 * static routes × 2 locales + every blog post, sermon, and per-locale topic slug.
 */
export function buildParityRouteInventory(
  input: RouteInventoryInput = {},
): string[] {
  const locales = input.locales ?? LOCALES;
  const routes: string[] = [];

  for (const locale of locales) {
    for (const suffix of STATIC_ROUTE_SUFFIXES) {
      routes.push(`/${locale}${suffix}`);
    }
    for (const slug of input.postSlugs ?? []) {
      routes.push(`/${locale}/blog/${slug}`);
    }
    for (const slug of input.sermonSlugs ?? []) {
      routes.push(`/${locale}/predicas/${slug}`);
    }
    for (const slug of input.topicSlugsByLocale?.[locale] ?? []) {
      routes.push(`/${locale}/${slug}`);
    }
  }

  return routes;
}

export interface HtmlDiffSnippet {
  readonly index: number;
  readonly snippetA: string;
  readonly snippetB: string;
}

export interface RouteParityResult {
  readonly route: string;
  readonly statusA: number;
  readonly statusB: number;
  readonly ok: boolean;
  readonly reason?: string;
  readonly htmlDiff?: HtmlDiffSnippet;
}

export interface ScreenshotParityResult {
  readonly route: string;
  readonly ok: boolean;
  readonly byteEqual: boolean;
  readonly diffRatio: number;
  readonly reason?: string;
}

export interface PageParityReport {
  readonly baseUrlA: string;
  readonly baseUrlB: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly totalRoutes: number;
  readonly passedRoutes: number;
  readonly failedRoutes: number;
  readonly ok: boolean;
  readonly routes: readonly RouteParityResult[];
  readonly screenshots: readonly ScreenshotParityResult[];
}

export interface RunPageParityOptions {
  readonly baseUrlA: string;
  readonly baseUrlB: string;
  readonly routes: readonly string[];
  readonly mediaMap?: MediaIdentityMap;
  readonly normalizeLikeCounts?: boolean;
  readonly stripLivePreviewAttrs?: boolean;
  readonly headersA?: Readonly<Record<string, string>>;
  readonly headersB?: Readonly<Record<string, string>>;
  readonly fetchImpl?: typeof fetch;
  /** Optional Playwright screenshot comparison on key routes (default `false`). */
  readonly screenshotRoutes?: readonly string[];
  readonly screenshotDiffThreshold?: number;
  /** Routes explicitly expected to return HTTP 404 on both sides (e.g. draft-only slugs in published mode). */
  readonly allowedNotFoundRoutes?: readonly string[];
  /** Optional PNG capture override for unit tests (defaults to headless Playwright Chromium). */
  readonly screenshotCapture?: (
    url: string,
    headers?: Readonly<Record<string, string>>,
  ) => Promise<Buffer>;
}

function findFirstHtmlDiff(a: string, b: string): HtmlDiffSnippet | undefined {
  if (a === b) return undefined;
  const max = Math.min(a.length, b.length);
  let idx = 0;
  while (idx < max && a.charCodeAt(idx) === b.charCodeAt(idx)) {
    idx += 1;
  }
  const start = Math.max(0, idx - 60);
  return {
    index: idx,
    snippetA: a.slice(start, idx + 120),
    snippetB: b.slice(start, idx + 120),
  };
}

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Pure zero-dependency 8-bit PNG decoder (`node:zlib` `inflateSync` + standard
 * PNG scanline unfiltering) for Playwright screenshot pixel comparison.
 */
function decodePngToRgba(buf: Buffer): DecodedPng | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) return null;

    if (type === "IHDR" && length >= 13) {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8]!;
      colorType = buf[dataStart + 9]!;
      const interlace = buf[dataStart + 12]!;
      if (bitDepth !== 8 || interlace !== 0) return null;
    } else if (type === "IDAT") {
      idatChunks.push(buf.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0) return null;

  const channels =
    colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (channels === 0) return null;

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  if (inflated.length < height * (stride + 1)) return null;

  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)]!;
    const srcRow = y * (stride + 1) + 1;
    const dstRow = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const byte = inflated[srcRow + x]!;
      const a = x >= channels ? raw[dstRow + x - channels]! : 0;
      const b = y > 0 ? raw[dstRow - stride + x]! : 0;
      const c = y > 0 && x >= channels ? raw[dstRow - stride + x - channels]! : 0;
      let val: number;
      if (filter === 0) val = byte;
      else if (filter === 1) val = (byte + a) & 0xff;
      else if (filter === 2) val = (byte + b) & 0xff;
      else if (filter === 3) val = (byte + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (byte + paethPredictor(a, b, c)) & 0xff;
      else return null;
      raw[dstRow + x] = val;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const dst = i * 4;
    if (channels === 4) {
      rgba[dst] = raw[dst]!;
      rgba[dst + 1] = raw[dst + 1]!;
      rgba[dst + 2] = raw[dst + 2]!;
      rgba[dst + 3] = raw[dst + 3]!;
    } else if (channels === 3) {
      const src = i * 3;
      rgba[dst] = raw[src]!;
      rgba[dst + 1] = raw[src + 1]!;
      rgba[dst + 2] = raw[src + 2]!;
      rgba[dst + 3] = 255;
    } else if (channels === 2) {
      const src = i * 2;
      rgba[dst] = raw[src]!;
      rgba[dst + 1] = raw[src]!;
      rgba[dst + 2] = raw[src]!;
      rgba[dst + 3] = raw[src + 1]!;
    } else {
      rgba[dst] = raw[i]!;
      rgba[dst + 1] = raw[i]!;
      rgba[dst + 2] = raw[i]!;
      rgba[dst + 3] = 255;
    }
  }

  return { width, height, rgba };
}

/**
 * Compares two PNG screenshots on decoded RGBA pixels (`differingPixels / totalPixels`)
 * instead of compressed PNG bytes (where a single pixel shifts ~99% of DEFLATE bytes).
 */
export function comparePngPixels(
  bufA: Buffer,
  bufB: Buffer,
  channelTolerance = 2,
): { readonly byteEqual: boolean; readonly diffRatio: number } {
  if (bufA.equals(bufB)) {
    return { byteEqual: true, diffRatio: 0 };
  }

  const imgA = decodePngToRgba(bufA);
  const imgB = decodePngToRgba(bufB);
  if (!imgA || !imgB) {
    return { byteEqual: false, diffRatio: 1 };
  }

  const maxWidth = Math.max(imgA.width, imgB.width);
  const maxHeight = Math.max(imgA.height, imgB.height);
  const totalPixels = Math.max(maxWidth * maxHeight, 1);
  let differingPixels = 0;

  for (let y = 0; y < maxHeight; y += 1) {
    for (let x = 0; x < maxWidth; x += 1) {
      if (
        x >= imgA.width ||
        y >= imgA.height ||
        x >= imgB.width ||
        y >= imgB.height
      ) {
        differingPixels += 1;
        continue;
      }
      const idxA = (y * imgA.width + x) * 4;
      const idxB = (y * imgB.width + x) * 4;
      const dr = Math.abs(imgA.rgba[idxA]! - imgB.rgba[idxB]!);
      const dg = Math.abs(imgA.rgba[idxA + 1]! - imgB.rgba[idxB + 1]!);
      const db = Math.abs(imgA.rgba[idxA + 2]! - imgB.rgba[idxB + 2]!);
      const da = Math.abs(imgA.rgba[idxA + 3]! - imgB.rgba[idxB + 3]!);
      if (
        dr > channelTolerance ||
        dg > channelTolerance ||
        db > channelTolerance ||
        da > channelTolerance
      ) {
        differingPixels += 1;
      }
    }
  }

  return {
    byteEqual: false,
    diffRatio: differingPixels / totalPixels,
  };
}

const MAX_PARITY_REDIRECTS = 5;

async function fetchWithSafeRedirects(
  initialUrl: string,
  headers: Readonly<Record<string, string>> | undefined,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_PARITY_REDIRECTS; hop += 1) {
    assertSafeParityBaseUrl(currentUrl);
    const res = await fetchImpl(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = isRedirect ? res.headers.get("location") : null;
    if (!isRedirect || !location) {
      return res;
    }

    if (hop === MAX_PARITY_REDIRECTS) {
      throw new Error(
        `Too many redirects (>${MAX_PARITY_REDIRECTS}) while fetching ${initialUrl}`,
      );
    }

    const nextUrl = new URL(location, currentUrl).toString();
    // Validate redirect destination BEFORE issuing any request (production host deny guard)
    assertSafeParityBaseUrl(nextUrl);
    currentUrl = nextUrl;
  }

  throw new Error(`Redirect loop exceeded while fetching ${initialUrl}`);
}

async function runPlaywrightScreenshots(
  baseUrlA: string,
  baseUrlB: string,
  routes: readonly string[],
  threshold: number,
  headersA?: Readonly<Record<string, string>>,
  headersB?: Readonly<Record<string, string>>,
  screenshotCapture?: (
    url: string,
    headers?: Readonly<Record<string, string>>,
  ) => Promise<Buffer>,
): Promise<ScreenshotParityResult[]> {
  if (routes.length === 0) return [];

  if (screenshotCapture) {
    const results: ScreenshotParityResult[] = [];
    for (const route of routes) {
      try {
        const [bufA, bufB] = await Promise.all([
          screenshotCapture(`${baseUrlA}${route}`, headersA),
          screenshotCapture(`${baseUrlB}${route}`, headersB),
        ]);
        const { byteEqual, diffRatio } = comparePngPixels(bufA, bufB);
        results.push({
          route,
          ok: diffRatio <= threshold,
          byteEqual,
          diffRatio,
          ...(diffRatio > threshold && {
            reason: `Screenshot pixel diff ratio ${(diffRatio * 100).toFixed(2)}% exceeded threshold ${(threshold * 100).toFixed(2)}%`,
          }),
        });
      } catch (err) {
        results.push({
          route,
          ok: false,
          byteEqual: false,
          diffRatio: 1,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const results: ScreenshotParityResult[] = [];

  try {
    const createContext = async (
      extraHTTPHeaders?: Readonly<Record<string, string>>,
    ) => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
        ...(extraHTTPHeaders ? { extraHTTPHeaders: { ...extraHTTPHeaders } } : {}),
      });
      // Suppress ConsentBanner deterministically BEFORE navigation (`apps/web/src/lib/consent.ts:1`)
      await ctx.addInitScript(() => {
        try {
          window.localStorage.setItem("analytics-consent", "denied");
        } catch {
          // ignore storage errors on opaque origins
        }
      });
      // Enforce production-host deny list on every browser request and navigation redirect
      await ctx.route("**/*", async (route) => {
        const reqUrl = route.request().url();
        if (/^https?:/i.test(reqUrl)) {
          const check = validateParityBaseUrl(reqUrl);
          if (!check.ok) {
            await route.abort("blockedbyclient");
            return;
          }
        }
        await route.continue();
      });
      return ctx;
    };

    const [contextA, contextB] = await Promise.all([
      createContext(headersA),
      createContext(headersB),
    ]);

    const capture = async (
      context: Awaited<ReturnType<typeof browser.newContext>>,
      url: string,
    ): Promise<Buffer> => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        assertSafeParityBaseUrl(page.url());
        // Fallback click if a consent banner still renders with localized copy
        const consentBtn = page
          .locator(
            'button:has-text("Prefiero que no"), button:has-text("I\'d rather not"), button:has-text("Está bien"), button:has-text("That\'s fine")',
          )
          .first();
        if (await consentBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await consentBtn.click().catch(() => {});
        }
        const masks = [
          page.locator('iframe[src*="google.com/maps"]'),
          page.locator("div:has(> audio)"),
          page.locator("audio"),
          page.locator('[data-testid="sermon-audio-player"]'),
        ];
        return await page.screenshot({
          fullPage: true,
          animations: "disabled",
          mask: masks,
        });
      } finally {
        await page.close();
      }
    };

    for (const route of routes) {
      try {
        const [bufA, bufB] = await Promise.all([
          capture(contextA, `${baseUrlA}${route}`),
          capture(contextB, `${baseUrlB}${route}`),
        ]);
        const { byteEqual, diffRatio } = comparePngPixels(bufA, bufB);
        results.push({
          route,
          ok: diffRatio <= threshold,
          byteEqual,
          diffRatio,
          ...(diffRatio > threshold && {
            reason: `Screenshot pixel diff ratio ${(diffRatio * 100).toFixed(2)}% exceeded threshold ${(threshold * 100).toFixed(2)}%`,
          }),
        });
      } catch (err) {
        results.push({
          route,
          ok: false,
          byteEqual: false,
          diffRatio: 1,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await Promise.all([contextA.close(), contextB.close()]);
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * Compares rendered HTML (and optional Playwright screenshots) between two
 * non-production base URLs (`ICR-203` AC8, used by `ICR-205` at cutover).
 *
 * Refuses ANY host on the repo's production deny list BEFORE making any network call.
 */
export async function runPageParity(
  options: RunPageParityOptions,
): Promise<PageParityReport> {
  const startedAt = new Date().toISOString();
  const baseUrlA = assertSafeParityBaseUrl(options.baseUrlA);
  const baseUrlB = assertSafeParityBaseUrl(options.baseUrlB);
  const fetchImpl = options.fetchImpl ?? fetch;

  const allowedNotFoundSet = new Set(
    (options.allowedNotFoundRoutes ?? []).map((r) =>
      r.startsWith("/") ? r : `/${r}`,
    ),
  );
  const routes: RouteParityResult[] = [];

  for (const route of options.routes) {
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    const [resA, resB] = await Promise.all([
      fetchWithSafeRedirects(
        `${baseUrlA}${normalizedRoute}`,
        options.headersA,
        fetchImpl,
      ),
      fetchWithSafeRedirects(
        `${baseUrlB}${normalizedRoute}`,
        options.headersB,
        fetchImpl,
      ),
    ]);

    if (resA.status !== resB.status) {
      routes.push({
        route: normalizedRoute,
        statusA: resA.status,
        statusB: resB.status,
        ok: false,
        reason: `HTTP status mismatch: A=${resA.status}, B=${resB.status}`,
      });
      continue;
    }

    const isAllowedNotFound =
      resA.status === 404 && allowedNotFoundSet.has(normalizedRoute);
    if (resA.status >= 400 && !isAllowedNotFound) {
      routes.push({
        route: normalizedRoute,
        statusA: resA.status,
        statusB: resB.status,
        ok: false,
        reason: `Unexpected HTTP error status ${resA.status} on both A and B`,
      });
      continue;
    }

    const [rawA, rawB] = await Promise.all([resA.text(), resB.text()]);
    const normA = normalizeHtmlForPageParity(rawA, {
      mediaMap: options.mediaMap,
      normalizeLikeCounts: options.normalizeLikeCounts,
      stripLivePreviewAttrs: options.stripLivePreviewAttrs,
    });
    const normB = normalizeHtmlForPageParity(rawB, {
      mediaMap: options.mediaMap,
      normalizeLikeCounts: options.normalizeLikeCounts,
      stripLivePreviewAttrs: options.stripLivePreviewAttrs,
    });

    const htmlDiff = findFirstHtmlDiff(normA, normB);
    routes.push({
      route: normalizedRoute,
      statusA: resA.status,
      statusB: resB.status,
      ok: htmlDiff === undefined,
      ...(htmlDiff && {
        reason: `Normalized HTML differed at char ${htmlDiff.index}`,
        htmlDiff,
      }),
    });
  }

  const screenshots = await runPlaywrightScreenshots(
    baseUrlA,
    baseUrlB,
    options.screenshotRoutes ?? [],
    options.screenshotDiffThreshold ?? 0.005,
    options.headersA,
    options.headersB,
    options.screenshotCapture,
  );

  const passedRoutes = routes.filter((r) => r.ok).length;
  const failedRoutes = routes.length - passedRoutes;
  const screenshotsOk = screenshots.every((s) => s.ok);

  return {
    baseUrlA,
    baseUrlB,
    startedAt,
    completedAt: new Date().toISOString(),
    totalRoutes: routes.length,
    passedRoutes,
    failedRoutes,
    ok: failedRoutes === 0 && screenshotsOk,
    routes,
    screenshots,
  };
}

export function formatPageParityReportMarkdown(
  report: PageParityReport,
): string {
  const lines: string[] = [
    "# Page Parity Report",
    "",
    `- **Status:** ${report.ok ? "PASS (0 diffs)" : "FAIL"}`,
    `- **Base A:** \`${report.baseUrlA}\``,
    `- **Base B:** \`${report.baseUrlB}\``,
    `- **Routes:** ${report.passedRoutes}/${report.totalRoutes} passed`,
    `- **Screenshots:** ${report.screenshots.filter((s) => s.ok).length}/${report.screenshots.length} passed`,
    "",
  ];

  const failedRoutes = report.routes.filter((r) => !r.ok);
  if (failedRoutes.length > 0) {
    lines.push("## Route Differences", "");
    for (const r of failedRoutes) {
      lines.push(`- **\`${r.route}\`**: ${r.reason ?? "Diff detected"}`);
      if (r.htmlDiff) {
        lines.push(
          `  - A: \`${r.htmlDiff.snippetA}\``,
          `  - B: \`${r.htmlDiff.snippetB}\``,
        );
      }
    }
    lines.push("");
  }

  const failedShots = report.screenshots.filter((s) => !s.ok);
  if (failedShots.length > 0) {
    lines.push("## Screenshot Differences", "");
    for (const s of failedShots) {
      lines.push(
        `- **\`${s.route}\`**: ${s.reason ?? `diffRatio=${s.diffRatio}`}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
