# ICR-214 — Implementation plan

Spec: `tasks/specs/ICR-214-mongodb-driver-7.md` (approved 2026-11-19). Worktree
`.claude/worktrees/ICR-214`, branch `chore/ICR-214-mongodb-driver-7`.

## Checkpoint 1 — driver contract tests on 6.21.0

- [ ] `apps/web/src/service/database.driver-contract.test.ts`: real `mongodb` (no mock). Build a
      `MongoClient` from a host-only URI (no path) → `client.db().databaseName === "test"` and
      `getWebsiteDb(client)` throws; `/website-staging` path → accepted. No `connect()`.
- [ ] `apps/admin/src/service/database.driver-contract.test.ts`: real driver; stub `MONGODB_URI` /
      `WEBSITE_MONGODB_URI`; no-path URIs → `getAdminDb()` / `getContentDb()` throw; valid paths
      resolve. ObjectId: hex round-trip, `JSON.stringify` gives the hex string, `isValid("nope")` false.
- [ ] `pnpm test` green on 6.21.0.
- Commit: `test(ICR-214): pin driver default-database and ObjectId contracts`

## Checkpoint 2 — bump

- [ ] `apps/web/package.json`, `apps/admin/package.json`: `mongodb` `^7.9.0`; `pnpm install`.
- [ ] Lockfile: only `mongodb@7.9.x`, `bson@7.x`; `pnpm why -r mongodb`.
- [ ] `pnpm type-check && pnpm lint && pnpm test && pnpm build` (link main `.env.local` files for build).
- Commit: `chore(ICR-214): upgrade mongodb driver to 7.9 in web and admin`

## Checkpoint 3 — refs, docs, changeset

- [ ] Comment line refs → 7.9.0 in `apps/admin/src/service/database.service.ts`,
      `database.service.test.ts`, `users/actions.ts`, `roles/actions.ts`.
- [ ] Docs: `admin-database.md`, `likes-and-mongodb.md`, `admin-rbac.md`, `admin-bootstrap.md`.
- [ ] `.changeset/icr-214-mongodb-driver-7.md` (patch, both apps).
- [ ] Re-run verify stack.
- Commit: `docs(ICR-214): point driver facts at mongodb 7.9.0`
