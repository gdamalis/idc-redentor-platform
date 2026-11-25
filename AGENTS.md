# AGENTS.md — idc-redentor-platform

> This file is the authoritative agent guide for this repository and **supersedes `.cursorrules`**. The conventions below are the distilled, current version of those rules. Where `.cursorrules` and this file disagree, this file wins. (`.cursorrules` remains for editor tooling that reads it, but do not treat it as the source of truth.)

## Project Overview

IDC Redentor is the official bilingual (es-AR / en-US) website of Iglesia de Cristo Redentor: a content-managed informational church site with a blog, community/Creed content, a worship-service location page, a newsletter signup, and a contact form. It is the church's first custom website.

- Stack: **Next.js 16** (App Router) + **React 19** + **MongoDB** + **Vercel Blob** + **Ministry Admin (`apps/admin`)** + **Tailwind CSS 4** + **next-intl**
- Versioning: **independent per-app via Changesets** — read each app's version from its own `package.json` (`@idcr/web` = `apps/web`, `@idcr/admin` = `apps/admin`); the root version is frozen. Never hardcode a version. See `docs/architecture/versioning.md`.
- Node: 22.14.0 (`.nvmrc`) · Package manager: **pnpm** · Host: **Vercel** (production + per-PR preview deploys)

> **Monorepo layout:** this repo is a **pnpm + Turborepo** workspace. The website lives under **`apps/web/`** and the Ministry Admin Panel under **`apps/admin/`** — every unqualified app path in this guide (`src/`, `lib/`, `public/`, `config/`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, …) resolves **under `apps/web/`** unless stated otherwise. The repo root holds the workspace files (`pnpm-workspace.yaml`, `turbo.json`, root `package.json` (version frozen; per-app versions live in each app) + Turbo-proxy scripts), the `.claude/` harness, `docs/`, and `tasks/`. Shared workspace packages include **`packages/config`** (`@idcr/config`: base tsconfig/eslint/postcss/prettier), **`packages/ui`** (`@idcr/ui`: `cn()`, `LOGO` path constants, `tokens.css`), and **`packages/content`** (`@idcr/content`: MongoDB collection names, Zod schemas, TipTap rich-text spec/validation, natural keys, and signed preview helpers) — see `docs/architecture/monorepo-packages.md`. Bare `pnpm <task>` at root proxies through Turbo across the workspace; scope with `pnpm --filter @idcr/web <task>` / `pnpm --filter @idcr/admin <task>`. Vercel builds with **Root Directory = `apps/web`** (website) and **Root Directory = `apps/admin`** (admin).

## No Auth / No AI / No Payments — public website (`apps/web`)

**The public website (`apps/web`) has no authentication, no RBAC, no payments/e-commerce, and no AI/LLM features.** Do not add any of them to `apps/web` without an explicit product decision — see `docs/product/scope-and-boundaries.md`. The only write path open to a visitor is the anonymous **"like"** (slug-keyed via `/api/likes` — **blog posts and sermons**) and the contact form; both are deliberately minimal.

> **Admin exception (`apps/admin`).** The separate internal **Ministry Admin Panel** (`apps/admin`) _is_ a deliberate, **authenticated** product — Firebase Auth (Google + email/password) + RBAC + congregant data — and it is **in scope**; that product decision is already made. It is governed by `tasks/specs/admin-platform-brief.md` and the "Two products in this repo" section of `docs/product/scope-and-boundaries.md`, not by the boundary above. Do not reject `apps/admin` auth/RBAC work on the basis of this section.

## Commands

> Use **pnpm**. `type-check` is hyphenated — call `pnpm type-check`, not `pnpm typecheck`.

| Command                             | Purpose                                          |
| ----------------------------------- | ------------------------------------------------ |
| `pnpm dev`                          | Dev server (Turbopack)                           |
| `pnpm build`                        | Production build                                 |
| `pnpm start`                        | Serve production build                           |
| `pnpm lint`                         | ESLint (`eslint .`)                              |
| `pnpm type-check`                   | TypeScript check (`tsc --noEmit`)                |
| `pnpm test`                         | Vitest single run (`vitest run`)                 |
| `pnpm test:watch`                   | Vitest watch                                     |
| `pnpm e2e`                          | Playwright (config present; no specs in Phase 1) |
| `pnpm format` / `pnpm format:check` | Prettier write / check                           |

## Architecture

- **App Router**: pages under `src/app/[locale]/{page,who-is-jesus,community,come-meet-us,blog/[slug],predicas/[slug],[topic]}`; route handlers under `src/app/api/{likes,subscribe,revalidate,preview,preview/exit}`. No route groups; the contact form is a Server Action (`src/components/features/contact-form/contactFormAction.ts`).
- **Content platform (MongoDB + Vercel Blob + Ministry Admin)**: content lives in the MongoDB `website*` database (`@idcr/content` `COLLECTIONS`: `sections`, `belief_collections`, `event_banners`, `posts`, `sermons`, `bible_verses`, `authors`, `topics`, `seo_entries`, `globals`, `media`), authored in **`apps/admin`** (which also owns Vercel Blob media uploads via `BLOB_READ_WRITE_TOKEN` and the sermon PDF rebuild worker at `apps/admin/src/app/api/content/pdf-worker/`). `apps/web` reads content via **`apps/web/lib/content/*`** (`requireContentDb()` + `createCachedReader()` tagged `"site-content"` for published reads, `React.cache`-only for draft mode) and renders TipTap rich text via **`apps/web/lib/content/rich-text/`**. Full platform architecture documentation lives in Linear project documents.
- **Public writes (MongoDB)**: `src/service/database.service.ts` shares the cached MongoDB client against `website*` for `likes`, `contact`, and `broadcast_log`.
- **Email**: adapter pattern (`src/service/mailing.service.ts` selects `mailing/{sendgrid,resend}.adapter.ts` by `MAIL_PROVIDER`); templates in `src/templates/`. **Newsletter** = **Resend** contacts with **per-locale audiences** (`/api/subscribe` → `src/service/subscribe.service.ts` → `resendAudience.ts`).
- **i18n**: next-intl, default `es-AR`, secondary `en-US`. Middleware in **`src/proxy.ts`** (exports `proxy`). UI strings in `public/locales/{es-AR,en-US}.json`.
- **Revalidation & Preview**: `POST /api/revalidate` with header `x-vercel-reval-key === WEBSITE_REVALIDATE_SECRET` → `revalidateSiteContent()` (`revalidateTag("site-content", { expire: 0 })`) + optional isolated publish broadcast when `CONTENT_PUBLISH_EMAILS === "true"`. Signed Draft Mode preview: `apps/admin` mints an HMAC-SHA256 link (`CONTENT_PREVIEW_SECRET`) → `GET /api/preview` enables Draft Mode (`POST /api/preview/exit` disables it).
- **Security/CSP**: `config/headers.js` / `config/securityHeaders.js` (HSTS, `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, CSP allowlisting GTM/GA, Vercel scripts, `*.public.blob.vercel-storage.com` for images/audio, and `images.unsplash.com`).
- **Path aliases**: `@src/*`, `@lib/*`, `@public/*`, `@icons/*`.
- **Design system**: shared UI for `apps/web` + `apps/admin` — token contract, derived tokens, the primitives-shared/features-local boundary, and the shadcn→`@idcr/ui` migration table. See `docs/architecture/design-system.md`.

See `docs/architecture/architecture.md` and the domain docs in `docs/` for detail.

## Code Conventions

- TypeScript strict mode everywhere; functional/declarative; DRY; early returns.
- **Functional-first — avoid classes.** Prefer pure functions, plain objects, modules, and closures over classes. Model failures/outcomes as **return values** (a discriminated-union result like `{ ok: true } | { ok: false; reason }`, or `null`/`boolean`), never by throwing custom `Error` subclasses for control flow. No `class` declarations unless a scenario truly requires it (e.g. instantiating an unavoidable third-party SDK such as `new Resend()`); isolate and flag any such case in review. Repo-wide default for every session/agent.
- **Prefer `interface` over `type`**; **avoid enums (use const maps)**; use **`satisfies`** for validation.
- **Prefer `??` over `||`**.
- **RSC-first** — minimize `'use client'`; use Suspense + error boundaries for async.
- **Always `await`** Next.js runtime APIs: `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams`.
- Forms: `useActionState`, enhanced `useFormStatus`; minimize client state.
- Naming: auxiliary-verb booleans (`isLoading`, `hasError`); `handle*` event handlers; lowercase-dash directories; named exports for components.
- UI: Headless UI + Heroicons/Lucide + Framer Motion; Tailwind CSS v4; compose with `cn()`. Validate external input with **Zod** at boundaries.
- Default site language `es-AR`, secondary `en-US`.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom): unit smoke tests on pure utilities and getter shape-mappers. `pnpm test` for a single run.
- **Playwright** (`playwright.config.ts`): four projects configured, **no specs in Phase 1**; `qa-runner` authors them per-ticket.
- QA targets: pre-merge, the PR's **Vercel preview deployment** (`*.vercel.app`); post-merge, **staging** (`staging.idcredentor.org`). **Never** production.
- **QA database reads (ICR-223):** use `YOKE_QA_DB_ENV=<env> sh -c 'cd apps/admin && exec node --import tsx scripts/qa-db-read.ts <read|count|aggregate> --db <name> --collection <c>'` with the target env pulled from `--project idc-redentor-admin` and shredded after — never use locally registered write-capable Mongo MCP servers. See `docs/architecture/qa-db-read.md`.
- No Storybook.

## Environment

> **Source of truth: `apps/web/.env.example` + `src/types/environment.d.ts`.** `.env.example` is
> current — it carries every runtime variable, including the ones this guide used to flag as
> "missing". Do not re-duplicate the full list here; it only drifts. **Never put real secret values
> in docs/commits — reference variable names only.**

Required at runtime on `apps/web` (all present in `apps/web/.env.example`):

```text
NEXT_PUBLIC_BASE_URL
MONGODB_URI                      # website* DB (path required) — content, likes, contact, broadcasts
WEBSITE_REVALIDATE_SECRET        # x-vercel-reval-key for POST /api/revalidate
CONTENT_PREVIEW_SECRET           # HMAC-SHA256 secret for GET /api/preview (matches apps/admin)
MAIL_PROVIDER (sendgrid|resend)  # selects the transactional-email adapter
CONTACT_FORM_RECIPIENT_EMAIL
FROM_EMAIL
RESEND_API_KEY                   # newsletter (Resend contacts) AND the `resend` mail adapter
RESEND_AUDIENCE_ID_ES_AR         # newsletter audience, es-AR
RESEND_AUDIENCE_ID_EN_US         # newsletter audience, en-US
```

Content-platform authoring & worker vars live on **`apps/admin`** (`apps/admin/.env.example`, never on `apps/web`):

```text
WEBSITE_MONGODB_URI              # website* DB (admin content authoring)
BLOB_READ_WRITE_TOKEN            # Vercel Blob public media store (admin ONLY — absent on apps/web)
WEBSITE_REVALIDATE_URL           # target website origin for POST /api/revalidate
WEBSITE_REVALIDATE_SECRET        # shared with apps/web
CONTENT_PREVIEW_SECRET           # shared with apps/web
CRON_SECRET                      # Bearer secret for GET /api/content/pdf-worker
PREDICA_INGEST_TOKEN             # Bearer secret for /api/predica/* sermon draft ingest
```

> `RESEND_AUDIENCE_ID` (no locale suffix) is a legacy single-audience fallback, used only for the
> **default** locale when the per-locale var is unset (`src/service/resendAudience.ts`).

Conditionally required by `MAIL_PROVIDER`:

```text
SENDGRID_API_KEY        # when MAIL_PROVIDER=sendgrid
RESEND_API_KEY          # when MAIL_PROVIDER=resend (also required above, by the newsletter)
```

Optional / injected:

```text
BROADCAST_POSTAL_ADDRESS # CAN-SPAM postal address for newsletter broadcasts
CONTENT_PUBLISH_EMAILS   # set "true" to enable publish-triggered broadcasts
ENVIRONMENT_NAME
VERCEL_ENV               # injected by Vercel; drives draft mode
```

## Tracker (Linear)

- Team: **IdC Redentor** (key `ICR`) in the `divinelab` Linear workspace — https://linear.app/divinelab/team/ICR. Moved from Jira on 2026-11-14; issue numbers were kept. Every tracker write goes through the yoke plugin's tracker script; the plugin refuses writes through the Linear connector.
- **`ICR-N`** is the Linear issue key — `N` is the issue number, not a Trello idShort. Link: `https://linear.app/divinelab/issue/ICR-N`. The old Jira epics became Linear projects, so their keys (ICR-1…14, 96…98, 118…122, 142, 171, 193) have no issue.
- Branches: `<type>/ICR-N-<slug>` · PR titles: `<type>(ICR-N): description`.
- Workflow statuses: **Backlog** → **Todo** → **In Progress** → **In Review** → **In Testing** → **Done**. `/yoke:work` moves Todo → In Progress → In Review; `/yoke:merge` moves In Review → In Testing (after a user-triggered squash-merge). **No agent ever moves an issue to Done** (or Canceled / Duplicate) — a human does that after deploying to production. Status keys map to Linear status names in `.claude/config.json` → `tracker.statuses`.
- **Production deploys** (`docs/architecture/deployments.md`): merging to `main` deploys staging only. Production changes in batched releases, cut whenever the owner decides and separate from ticket status, each shipping **both** apps from one commit. These rules hold in **every** agent tool, including ones where yoke's commands and guard do not run (Antigravity / `agy` today):
  - Never deploy production, and never run `scripts/deploy-prod.sh` without `--preview`. Only the owner-approved release does that.
  - Never push to, delete or merge into the `production-hold` branch: a push there is a real production build that skips every gate.
  - Never write to Linear through a connector. Tracker writes go through the yoke tracker script only.

## Git & Release

- **Conventional Commits**; header ≤ 100 chars; commitlint enforced via husky.
- **PR titles** follow `<type>(ICR-N): description` and are validated in CI by `amannn/action-semantic-pull-request`.
- **Releases use [Changesets](https://github.com/changesets/changesets)** (independent per-app): the bump comes from a `.changeset/*.md` file, not the commit type. Mapping — `feat` → minor; `fix`, `perf` → patch; `docs`, `chore`, `refactor`, `test`, `ci` → no release. On push to `main`, `.github/workflows/release.yml` versions + tags + pushes atomically if changesets are present. See `docs/architecture/versioning.md`. These package versions are **not** production releases: a production release is a separate, batched deploy of both apps that usually spans several package versions — see `docs/architecture/deployments.md`.
- See `docs/architecture/contributing.md` for the branch/commit/PR + worktree flow.

## Cursor Cloud specific instructions

- **Setup is just `pnpm install`** at the repo root (Node 22.14.0 + pnpm 10.33.0 are already provisioned; `corepack` pins pnpm from root `package.json`). The `prepare` script runs husky automatically. This is the whole update script.
- **Per-app env files are not committed.** Before running either app, create them once: `cp apps/web/.env.example apps/web/.env.local` and `cp apps/admin/.env.example apps/admin/.env.local`. The examples ship with **blank** secret values.
- **Both apps default to port 3000.** Run them on separate ports when both are needed — the reliable way is `PORT=3001 pnpm dev` (the script hard-codes `next dev --turbopack`, so `pnpm dev -- -p 3001` is mis-parsed by Next as a project dir and fails). Scope commands with `pnpm --filter @idcr/web <task>` / `pnpm --filter @idcr/admin <task>`.
- **`apps/web` needs MongoDB credentials to render content pages.** All website content is stored in MongoDB (`website*`), so with a blank `MONGODB_URI` content routes fail to load data and `/api/likes` returns **HTTP 503**. This is expected without secrets — it is **not** a dev-env failure. The toolchain still fully works: middleware/locale redirect (`/` → `/es-AR`), RSC execution, and compilation all run; only the remote data is missing. To exercise content pages supply a real `MONGODB_URI` (plus `MAIL_PROVIDER`/`RESEND_API_KEY` or `SENDGRID_API_KEY` for contact/newsletter flows) in `apps/web/.env.local`.
- **`apps/admin`** is the authenticated Ministry Admin Panel (Firebase Auth + RBAC + congregant management + content/media authoring). Firebase + MongoDB are read **lazily** (never at import), so the app boots without credentials, while auth, content authoring, and media uploads require the `NEXT_PUBLIC_FIREBASE_*` / `FIREBASE_*`, `MONGODB_URI` / `WEBSITE_MONGODB_URI`, and `BLOB_READ_WRITE_TOKEN` values in `apps/admin/.env.local`.
- Standard lint/test/build/run commands live in the **Commands** table above (root proxies through Turbo). `pnpm lint`, `pnpm type-check`, and `pnpm test` (Vitest, 618 tests across the workspace) all pass offline with no secrets.
