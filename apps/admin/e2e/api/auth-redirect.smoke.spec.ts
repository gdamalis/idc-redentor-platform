/**
 * ICR-169: Anonymous HTTP smoke checks for the `apiAdmin` Playwright project.
 *
 * Purely anonymous — never signs in, never calls `DELETE /api/auth/session`
 * (which revokes refresh tokens for the standing QA admin account), and never
 * mutates database state. Safe to run against any `previewAdmin` or
 * `stagingAdmin` deployment via `BASE_URL`.
 */

import { expect, test } from "@playwright/test";

test.describe("admin proxy anonymous redirect controls", () => {
  test("GET /es-AR redirects 307 to /es-AR/login with callbackUrl", async ({ request }) => {
    const res = await request.get("/es-AR", { maxRedirects: 0 });
    expect(res.status()).toBe(307);

    const location = res.headers()["location"];
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location, res.url());
    expect(redirectUrl.pathname).toBe("/es-AR/login");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/es-AR");
  });

  test("GET /en-US redirects 307 to /en-US/login with callbackUrl", async ({ request }) => {
    const res = await request.get("/en-US", { maxRedirects: 0 });
    expect(res.status()).toBe(307);

    const location = res.headers()["location"];
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location, res.url());
    expect(redirectUrl.pathname).toBe("/en-US/login");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/en-US");
  });

  test("GET /manifest.webmanifest bypasses auth redirect and returns 200", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });
});

test.describe("/api/auth/session anonymous validation boundary", () => {
  test("POST /api/auth/session with empty body returns 400 invalid-body", async ({ request }) => {
    const res = await request.post("/api/auth/session", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, reason: "invalid-body" });
  });
});
