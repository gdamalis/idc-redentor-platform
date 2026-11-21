import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Ministry Admin Panel (`apps/admin`).
 *
 * Tests run against a Vercel PREVIEW (`previewAdmin`) or staging (`stagingAdmin`)
 * deployment via the BASE_URL env var — never production (see `qa.env.previewAdmin`
 * and `qa.env.stagingAdmin` in `.claude/config.json`).
 *
 * Project names mirror `.claude/config.json` -> `playwrightProjectMap`:
 *   e2eAdmin · apiAdmin
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "es-AR",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Project-scoped testDir isolates projects regardless of parent path segments
    // (Playwright matches testMatch globs/regexes against the full absolute path,
    // so `/admin\/.*\.spec\.ts/` or `"admin/**/*.spec.ts"` would match `apps/admin/e2e/api/...`).
    {
      name: "e2eAdmin",
      testDir: "./e2e/admin",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "apiAdmin",
      testDir: "./e2e/api",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
