# End-to-end tests (Playwright — Ministry Admin Panel)

Specs run against a Vercel **admin preview** (`previewAdmin`) or **admin staging**
(`stagingAdmin`) deployment via the `BASE_URL` env var — never production.

Project names (see `.claude/config.json` → `playwrightProjectMap`):

- `e2eAdmin` — `e2e/admin/*.spec.ts` (browser UI flows and auth-gate render checks)
- `apiAdmin` — `e2e/api/*.spec.ts` (HTTP-only redirect, asset bypass, and API contract checks)

Run: `pnpm --filter @idcr/admin e2e` (all) or
`pnpm --filter @idcr/admin exec playwright test --project=apiAdmin`.
