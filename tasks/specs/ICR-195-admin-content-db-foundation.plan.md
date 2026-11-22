# ICR-195 — Implementation Plan: Admin Content DB Foundation

**Spec:** `tasks/specs/ICR-195-admin-content-db-foundation.md`
**Branch:** `feat/ICR-195-admin-content-db-foundation`
**Checkpoints:** 6 (all ≤ 8) · **Ownership:** `apps/admin/**` only (zero edits to `packages/content/` or `apps/web/`)

## Decisions Locked

- **Q1 (Admin-only grant):** Option A — `grant:content-permissions` adds all 5 keys via `$addToSet` on `{ key: "admin" }` only, writing 1 `rbacAudit` `role.update` entry only when `modifiedCount > 0`.
- **Q2 (Protected-publish tick — Owner approved):** Option A — `content:publish-protected` permission alone gates v1; optional `meta.approvedConfirmed?: boolean` reserved on `content_audit`.
- **Q3 (Global publish-email switch — Owner approved):** Option A — server-only env var `CONTENT_PUBLISH_EMAILS` (default off; enabled only on exact `"true"`).
- **Q4 (Delete permission — PM approved):** Option A — `content:write` deletes unpublished non-protected drafts; `content:publish` deletes published library entries (`authors`, `bible_verses`); `content:publish-protected` required for protected topics; fixed entries and published posts/sermons/topics always refused.
- **Q5 (Production host guard — PM approved):** Option A — `process.env.VERCEL_TARGET_ENV === "production"`, refusing all 6 production website hosts whenever non-production.

## Checkpoints

1. **Checkpoint 1 — Content transaction + compact content audit (`bd2426f`)**
   - Files: `apps/admin/src/service/database.service.ts`, `database.service.test.ts`, `apps/admin/src/service/content-audit.service.ts`, `content-audit.service.test.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
2. **Checkpoint 2 — RBAC keys + bilingual messages + registry tests (`d9a48e9`)**
   - Files: `apps/admin/src/lib/rbac/permissions.ts`, `permissions.test.ts`, `apps/admin/messages/{es-AR,en-US}.json`, `apps/admin/src/i18n/messages.test.ts`, `apps/admin/src/service/role.service.test.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
3. **Checkpoint 3 — Idempotent Admin role grant script (`ac61c49`)**
   - Files: `apps/admin/src/lib/rbac/grant-content-permissions.ts`, `grant-content-permissions.test.ts`, `apps/admin/scripts/grant-content-permissions.ts`, `apps/admin/package.json`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
4. **Checkpoint 4 — Post-commit site refresh, env guard & email switch (`defb785`)**
   - Files: `apps/admin/src/lib/content/revalidate.ts`, `revalidate.test.ts`, `apps/admin/src/types/environment.d.ts`, `apps/admin/.env.example`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
5. **Checkpoint 5 — Transactional content service core, guards & indexes (`be812a9`)**
   - Files: `apps/admin/src/lib/content/{caller,errors,guards}.ts`, `guards.test.ts`, `apps/admin/src/service/content/{indexes,content-core.service}.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
6. **Checkpoint 6 — Per-collection typed facades, full AC test suite & validation hardening (`ad2b2b2`, `e6b2b39`)**
   - Files: `apps/admin/src/service/content/{collections,index}.ts`, `content-core.service.test.ts`, plus validator C1–C3 fixes (`diffSnapshotFields`, protected `discardChanges` guard, runtime `LOCALES` check on `topics`)
   - Verify: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
