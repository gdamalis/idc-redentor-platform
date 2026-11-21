# ICR-169 — Implementation Plan: Admin Playwright Harness

Spec: `tasks/specs/ICR-169-admin-playwright-harness.md`

## Checkpoint 1 — Provision admin Playwright harness & smoke specs

- **Commit:** `chore(ICR-169): add admin Playwright config, smoke specs, and e2e script`
- **Files:**
  - Create `apps/admin/playwright.config.ts`
  - Create `apps/admin/e2e/README.md`
  - Create `apps/admin/e2e/api/auth-redirect.smoke.spec.ts`
  - Create `apps/admin/e2e/admin/login.smoke.spec.ts`
  - Edit `apps/admin/package.json` (`scripts.e2e`, `devDependencies["@playwright/test"]`)
  - Edit `apps/admin/eslint.config.mjs` (ignore `playwright-report/**`, `test-results/**`)
  - Regenerate `pnpm-lock.yaml` via `pnpm install`
  - Edit `.claude/config.json` (`playwrightProjectMap._adminNote`)
- **Verification:**
  1. `pnpm install` (regenerates `pnpm-lock.yaml` cleanly)
  2. `pnpm --filter @idcr/admin exec playwright test --list` (lists `apiAdmin` + `e2eAdmin` tests)
  3. `node "/home/gabriel/.gemini/config/plugins/yoke/bin/validate-config.mjs" .claude/config.json --strict` (0 errors, 0 warnings)
  4. `pnpm type-check && pnpm lint && pnpm test && pnpm build`
  5. Draft PR + CI + live `previewAdmin` execution (`apiAdmin` then `e2eAdmin` after browser QA slot)
