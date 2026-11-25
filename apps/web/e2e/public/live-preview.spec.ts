/**
 * ICR-205: e2e smoke coverage for Draft Mode security headers and signed preview boundary.
 *
 * Replaces the retired Contentful Live Preview assertions (iframe framing &
 * `data-contentful-*` inspector attributes). Asserts:
 *   - Public pages render on both locales
 *   - Preview/staging responses emit `X-Frame-Options: SAMEORIGIN` and NEVER emit
 *     `app.contentful.com` in `Content-Security-Policy` (`frame-ancestors 'self'`)
 *   - Legacy `data-contentful-*` inspector attributes are absent
 *   - Signed `/api/preview` rejects invalid signatures with 401 and no-store/noindex headers
 */

import { expect, test } from "@playwright/test";

test.describe("Preview & security headers — page availability", () => {
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

test.describe("Preview & security headers — clickjacking protection (ICR-205 AC8)", () => {
  test("preview deploy sends X-Frame-Options: SAMEORIGIN and drops app.contentful.com from CSP", async ({
    page,
  }) => {
    const res = await page.goto("/es-AR");
    const headers = res?.headers() ?? {};
    const csp = headers["content-security-policy"] ?? "";

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("app.contentful.com");
    expect(csp).not.toContain("app.eu.contentful.com");
  });

  test("home and community no longer emit legacy data-contentful-* inspector attributes", async ({
    page,
  }) => {
    for (const route of ["/es-AR", "/es-AR/community"]) {
      await page.goto(route);
      await expect(page.locator("[data-contentful-entry-id]")).toHaveCount(0);
      await expect(page.locator("[data-contentful-field-id]")).toHaveCount(0);
    }
  });
});

test.describe("Signed Draft Mode preview — /api/preview auth boundary", () => {
  test("rejects an invalid signature with 401 and no-store/noindex headers", async ({
    request,
  }) => {
    const futureExp = Math.floor(Date.now() / 1000) + 60;
    const res = await request.get(
      `/api/preview?path=/es-AR&exp=${futureExp}&sig=${"0".repeat(64)}`,
      { maxRedirects: 0 },
    );

    expect(res.status()).toBe(401);
    expect(res.headers()["cache-control"] ?? "").toContain("no-store");
    expect(res.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });
});
