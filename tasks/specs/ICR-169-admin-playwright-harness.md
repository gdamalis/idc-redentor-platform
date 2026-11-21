# ICR-169 — Admin Playwright Harness (`apiAdmin` + `e2eAdmin`)

- **Linear:** [ICR-169](https://linear.app/divinelab/issue/ICR-169/wire-appsadmin-into-the-qa-harness-vercel-preview-registration-admin)
- **Branch:** `chore/ICR-169-admin-playwright-harness`
- **Scope (D10 / Triage 3A):** Provision `apps/admin/playwright.config.ts` (`apiAdmin` + `e2eAdmin`), add `"e2e": "playwright test"` and `"@playwright/test"` to `apps/admin/package.json`, add minimal anonymous smoke specs per project, and update `.claude/config.json` `playwrightProjectMap._adminNote`. (`ICR-211` already delivered `previewAdmin`/`stagingAdmin` routing; `ICR-222` already delivered standing QA auth; Vercel SSO preview protection is already lifted.)

## 1. Dependencies Check

- Root `package.json`: `"@playwright/test": "1.61.0"` (exact-pinned for CI browser cache key).
- `apps/web/package.json`: `"@playwright/test": "^1.61.0"`, `"e2e": "playwright test --pass-with-no-tests"`.
- `apps/admin/package.json`: `"dev": "next dev --turbopack"` (default Next.js port `3000`); no `@playwright/test` or `e2e` script yet.
- `turbo.json`: `"e2e": { "cache": false, "passThroughEnv": ["BASE_URL", "CI"] }` — already compatible across both `@idcr/web` and `@idcr/admin`.
- `apps/admin/vitest.config.ts`: `include: ["src/**/*.{test,spec}.{ts,tsx}"]` — isolates Vitest from `apps/admin/e2e/**/*.spec.ts`.
- `.gitignore`: already ignores `**/test-results/`, `**/playwright-report/`, `**/blob-report/`, `**/.playwright/`.

## 2. Requirements

1. **`apps/admin/playwright.config.ts`** mirrors `apps/web/playwright.config.ts`, declaring:
   - `e2eAdmin` (`testDir: "./e2e/admin"`, `testMatch: /.*\.spec\.ts/`, `use: { ...devices["Desktop Chrome"] }`)
   - `apiAdmin` (`testDir: "./e2e/api"`, `testMatch: /.*\.spec\.ts/`, `use: { ...devices["Desktop Chrome"] }`)
   - `BASE_URL` defaulting to `"http://localhost:3000"` (matching `apps/admin` `dev` port) and never defaulting to any production host.
2. **`apps/admin/package.json`** adds `"e2e": "playwright test"` and `"@playwright/test": "^1.61.0"`, with `pnpm-lock.yaml` regenerated via `pnpm install`.
3. **Minimal anonymous smoke specs** in both projects so `playwright test` passes cleanly against `previewAdmin` without touching the standing QA admin session:
   - `apps/admin/e2e/api/auth-redirect.smoke.spec.ts` (`apiAdmin`): `GET /es-AR` → `307 /es-AR/login?callbackUrl=%2Fes-AR`, `GET /en-US` → `307 /en-US/login?callbackUrl=%2Fen-US`, `POST /api/auth/session` `{}` → `400 { ok: false, reason: "invalid-body" }`, `GET /manifest.webmanifest` → `200`.
   - `apps/admin/e2e/admin/login.smoke.spec.ts` (`e2eAdmin`): unauthenticated `/es-AR` redirects to `/es-AR/login` and renders the Spanish login form; `/en-US/login` renders the English login form.
4. **`apps/admin/e2e/README.md`** documents `e2eAdmin` and `apiAdmin` project conventions and commands.
5. **`apps/admin/eslint.config.mjs`** ignores `playwright-report/**` and `test-results/**`.
6. **`.claude/config.json`** updates `playwrightProjectMap._adminNote` to reflect provisioned `apiAdmin` / `e2eAdmin` projects (`validate-config.mjs --strict` passes with 0 errors and 0 warnings).
7. **Invariants:** `apps/web/playwright.config.ts`, `apps/web/**`, `apps/admin/src/**`, and `turbo.json` remain untouched.

## 3. Data Model / API / i18n Changes

None.

## 4. New / Modified Files

| File                                             | Action | Purpose                                                            |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------ |
| `apps/admin/playwright.config.ts`                | Create | Admin Playwright config (`e2eAdmin`, `apiAdmin`)                   |
| `apps/admin/e2e/README.md`                       | Create | Admin Playwright usage and project map                             |
| `apps/admin/e2e/api/auth-redirect.smoke.spec.ts` | Create | Anonymous HTTP smoke specs (`apiAdmin`)                            |
| `apps/admin/e2e/admin/login.smoke.spec.ts`       | Create | Anonymous login render smoke specs (`e2eAdmin`)                    |
| `apps/admin/package.json`                        | Modify | Add `"e2e": "playwright test"` and `"@playwright/test": "^1.61.0"` |
| `apps/admin/eslint.config.mjs`                   | Modify | Ignore `playwright-report/**` and `test-results/**`                |
| `pnpm-lock.yaml`                                 | Modify | Regenerated via `pnpm install`                                     |
| `.claude/config.json`                            | Modify | Update `playwrightProjectMap._adminNote`                           |

## 5. Edge Cases

1. Redirect assertions use `maxRedirects: 0` and `new URL(location, res.url())` so relative and absolute `Location` headers both verify cleanly.
2. Smoke tests are strictly anonymous and never invoke `DELETE /api/auth/session`, avoiding revocation of the shared standing QA admin session (`ICR-222`).
3. `BASE_URL` never defaults to any production host.

## 6. Testing Strategy

- **Red/Green:** `pnpm --filter @idcr/admin exec playwright test --list` fails before implementation and lists all 6 tests across `apiAdmin` (4) and `e2eAdmin` (2) after.
- **Config validation:** `validate-config.mjs .claude/config.json --strict` passes with 0 errors and 0 warnings.
- **Workspace verification:** `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build` pass across both apps.
- **Live QA (`previewAdmin`):** `apiAdmin` and `e2eAdmin` pass against the PR's `Preview – idc-redentor-admin` deployment.

## 7. Implementation Checkpoints

1. **Checkpoint 1 (`chore(ICR-169): add admin Playwright config, smoke specs, and e2e script`):** Create admin Playwright config, README, and anonymous smoke specs; update `apps/admin/package.json`, `apps/admin/eslint.config.mjs`, `pnpm-lock.yaml`, and `.claude/config.json`; run full workspace verification.
