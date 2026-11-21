/**
 * ICR-169: Anonymous browser smoke checks for the `e2eAdmin` Playwright project.
 *
 * Verifies unauthenticated routing to the login screen and bilingual sign-in
 * form render without signing in or mutating any session or database state.
 */

import { expect, test } from "@playwright/test";

test.describe("admin login page smoke", () => {
  test("unauthenticated /es-AR redirects to /es-AR/login and renders Spanish sign-in form", async ({
    page,
  }) => {
    const res = await page.goto("/es-AR");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/es-AR\/login(?:\?|$)/);

    await expect(page.getByRole("heading", { level: 1, name: "Iniciá sesión" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("/en-US/login renders English sign-in form", async ({ page }) => {
    const res = await page.goto("/en-US/login");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/en-US\/login(?:\?|$)/);

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
