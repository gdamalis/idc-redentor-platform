/**
 * ICR-21: e2e smoke coverage for Contentful Live Preview wiring.
 *
 * IMPORTANT — preview-only assertions:
 * `shouldUseDraftMode()` (lib/contentful/draftMode.ts) returns `true` whenever
 * `VERCEL_ENV === "preview"`. These specs run against a Vercel PREVIEW deployment
 * (BASE_URL — see playwright.config.ts), so EVERY request in this file has draft mode
 * auto-enabled: the `ContentfulPreviewProvider` is mounted in `[locale]/layout.tsx` and
 * every in-scope home/community component renders its `*Live` variant with
 * `data-contentful-*` inspector attributes. That is expected, and is exactly what this
 * suite asserts POSITIVELY.
 *
 * Do NOT add a "no data-contentful attributes on a normal render" assertion here — it
 * would FAIL on preview (draft is always on there). That negative case — the provider and
 * its attributes are absent when `shouldUseDraftMode()` is false — is covered by the
 * `useLivePreview` unit test (src/components/shared/contentful-preview/useLivePreview.test.ts)
 * and only holds in production, which this suite never targets (see `qa.env` in
 * .claude/config.json — preview vs. staging, production is hard-denied everywhere).
 *
 * The real live-editing check (a field edit reflecting without a save, inspector
 * click-through jumping to the right field) is manual, inside Contentful's Live Preview
 * pane — see docs/architecture/contentful-data-layer.md § Live Preview.
 */

import { expect, test } from "@playwright/test";

test.describe("Live Preview — page availability", () => {
  test("home renders on es-AR and en-US", async ({ page }) => {
    for (const locale of ["es-AR", "en-US"] as const) {
      const res = await page.goto(`/${locale}`);
      expect(res?.status()).toBeLessThan(400);
    }
  });

  test("community renders on es-AR and en-US", async ({ page }) => {
    for (const locale of ["es-AR", "en-US"] as const) {
      const res = await page.goto(`/${locale}/community`);
      expect(res?.status()).toBeLessThan(400);
    }
  });
});

test.describe("Live Preview — CSP env-gating", () => {
  test("preview deploy allows Contentful framing and omits X-Frame-Options", async ({
    page,
  }) => {
    const res = await page.goto("/es-AR");
    const headers = res?.headers() ?? {};
    expect(headers["content-security-policy"] ?? "").toContain(
      "app.contentful.com",
    );
    // X-Frame-Options is intentionally OMITTED on preview/dev — it would block the
    // Contentful iframe even with a correct CSP frame-ancestors directive. See
    // apps/web/config/securityHeaders.js.
    expect(headers["x-frame-options"]).toBeUndefined();
  });
});

test.describe("Live Preview — inspector wiring active on preview", () => {
  test("home exposes data-contentful-* inspector attributes", async ({
    page,
  }) => {
    await page.goto("/es-AR");
    await expect(
      page.locator("[data-contentful-entry-id]").first(),
    ).toBeAttached();
    await expect(
      page.locator("[data-contentful-field-id]").first(),
    ).toBeAttached();
  });

  test("community exposes data-contentful-* inspector attributes", async ({
    page,
  }) => {
    await page.goto("/es-AR/community");
    await expect(
      page.locator("[data-contentful-entry-id]").first(),
    ).toBeAttached();
    await expect(
      page.locator("[data-contentful-field-id]").first(),
    ).toBeAttached();
  });
});
