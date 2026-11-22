import type { Locale } from "@idcr/content";
import { assertSafeParityBaseUrl } from "./host-guard";
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

async function runPlaywrightScreenshots(
  baseUrlA: string,
  baseUrlB: string,
  routes: readonly string[],
  threshold: number,
): Promise<ScreenshotParityResult[]> {
  if (routes.length === 0) return [];

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const results: ScreenshotParityResult[] = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });

    const capture = async (url: string): Promise<Buffer> => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        // Dismiss consent banner if present so screenshots stay deterministic
        const consentBtn = page
          .locator(
            'button:has-text("Aceptar"), button:has-text("Accept"), button:has-text("Entendido")',
          )
          .first();
        if (await consentBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await consentBtn.click().catch(() => {});
        }
        const masks = [
          page.locator('iframe[src*="google.com/maps"]'),
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
          capture(`${baseUrlA}${route}`),
          capture(`${baseUrlB}${route}`),
        ]);
        const byteEqual = bufA.equals(bufB);
        if (byteEqual) {
          results.push({ route, ok: true, byteEqual: true, diffRatio: 0 });
          continue;
        }
        // Compute byte-level divergence ratio as conservative upper bound when PNGs differ
        const maxLen = Math.max(bufA.length, bufB.length, 1);
        const minLen = Math.min(bufA.length, bufB.length);
        let differingBytes = Math.abs(bufA.length - bufB.length);
        for (let i = 0; i < minLen; i += 1) {
          if (bufA[i] !== bufB[i]) differingBytes += 1;
        }
        const diffRatio = differingBytes / maxLen;
        results.push({
          route,
          ok: diffRatio <= threshold,
          byteEqual: false,
          diffRatio,
          ...(diffRatio > threshold && {
            reason: `Screenshot diff ratio ${(diffRatio * 100).toFixed(2)}% exceeded threshold ${(threshold * 100).toFixed(2)}%`,
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

    await context.close();
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

  const routes: RouteParityResult[] = [];

  for (const route of options.routes) {
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    const [resA, resB] = await Promise.all([
      fetchImpl(`${baseUrlA}${normalizedRoute}`, {
        method: "GET",
        headers: options.headersA,
      }),
      fetchImpl(`${baseUrlB}${normalizedRoute}`, {
        method: "GET",
        headers: options.headersB,
      }),
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
