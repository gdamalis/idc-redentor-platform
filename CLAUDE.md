# CLAUDE.md — idc-redentor-website

## Project Overview

**Iglesia de Cristo Redentor (IDC Redentor)** is the official bilingual (es-AR / en-US) website of the church: informational pages, a blog, community/values content (the Creed/Credo), a worship-service "come meet us" page with map + service times, a newsletter signup, and a contact form. It is the **first custom website** for the community — modern, fast, easy for non-technical editors to maintain, and welcoming to members and visitors.

The **public website** (`apps/web`) is a **content-managed informational site**, not an app: it has **no authentication, no RBAC, no payments, and no in-product AI**. Almost all content is rendered from **Contentful** via hand-written GraphQL in React Server Components. The only stateful reader feature is an anonymous blog "like".

> **Admin exception:** the separate internal **Ministry Admin Panel** (`apps/admin`) _is_ an authenticated app — Firebase Auth + RBAC + congregant data — and is deliberately **in scope**. The no-auth boundary above governs `apps/web` only. See `tasks/specs/admin-platform-brief.md` and `docs/product/scope-and-boundaries.md` § "Two products in this repo".

**Version**: 1.10.0 (read from `package.json`) | **Node**: 22.14.0 (`.nvmrc`) | **Package Manager**: pnpm | **Host**: Vercel (production + per-PR preview deploys)

> **Monorepo layout (since the admin-platform migration):** this repo is a **pnpm + Turborepo workspace**. The public website now lives entirely under **`apps/web/`** — every app path in this doc (`src/`, `lib/`, `public/`, `config/`, `next.config.ts`, `tsconfig.json`, …) is **under `apps/web/`** unless stated otherwise. The repo root holds the workspace files (`pnpm-workspace.yaml`, `turbo.json`, root `package.json` with Turbo-proxy scripts + the released version + `pnpm.overrides`), the `.claude/` harness, `docs/`, and `tasks/`. Run commands at root (they proxy through Turbo across the workspace) or scope to the site with `pnpm --filter @idcr/web <task>`. Vercel builds the site with **Root Directory = `apps/web`**. The future admin app will be `apps/admin/`.

## Commands

> Run everything with **pnpm**. Note `type-check` is **hyphenated** (unlike some sibling projects' `typecheck`). The verifier and QA agents call `pnpm type-check`.

| Command             | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | Dev server (Turbopack)                                               |
| `pnpm build`        | Production build                                                     |
| `pnpm start`        | Serve the production build                                           |
| `pnpm lint`         | ESLint (`eslint .`)                                                  |
| `pnpm type-check`   | TypeScript check (`tsc --noEmit`)                                    |
| `pnpm test`         | Vitest, single run (`vitest run`)                                    |
| `pnpm test:watch`   | Vitest in watch mode                                                 |
| `pnpm e2e`          | Playwright (`playwright test`) — config present, no specs in Phase 1 |
| `pnpm format`       | Prettier write                                                       |
| `pnpm format:check` | Prettier check                                                       |
| `pnpm prepare`      | Husky install (runs automatically on `pnpm install`)                 |

## graphify (query the graph before you read)

This repo is indexed into a **knowledge graph** at `graphify-out/graph.json` (built by the
[`graphify`](https://github.com/sponsors/safishamsi) CLI; ~1.7k nodes covering `src/`, `lib/`,
`docs/`, and the harness). Querying it answers "how does X work / what calls Y / trace Z" from a
pre-built index — **far cheaper and faster than scanning the tree with Read/Grep/Glob.**

**The rule — every session, not just `/work`:** before you Read/Grep/Glob to answer a _codebase_
question, if `graphify-out/graph.json` exists, **query the graph first**, then fall back to
Read/Grep only for what the graph didn't cover. Say which findings came from graphify vs grep.

```bash
graphify query "trace the /api/contact request flow"      # BFS context for a question (default)
graphify explain "getPage()"                              # one symbol + its neighbours WITH direction
                                                          #   (`<-- page.tsx [imports]` = its dependents)
graphify path "fetchGraphQL()" "ContactForm()"           # shortest dependency path between two nodes
```

Match code symbols by their node label **including `()`** (e.g. `getPage()`). `graphify affected "X"`
(blast-radius) needs a **directed** graph; this repo's graph is currently undirected, so use `explain`
for "what depends on this". To enable `affected`, rebuild once with `/graphify --directed`.

- **Confirm negatives.** A "not found" from the graph may mean stale, not absent — Grep to confirm
  before acting on it (e.g. before deleting a "no callers" symbol).
- **Freshness.** The git **post-commit hook** keeps the shared graph (in the main checkout,
  which the graph tracks) in sync on every commit — AST, no LLM, free, and resolved via the
  common git dir so it works from `/work` worktrees too. A worktree's feature code enters the
  graph when it merges to main. For uncommitted edits or _doc/content_ (semantic) changes, run
  `graphify update .` (also folds in `graphify-out/memory/` Q&A from `graphify save-result`).
- **Bootstrap.** `graphify-out/` is **gitignored** (per-machine). On a fresh clone it won't exist
  yet — run `/graphify` once (or `graphify extract .`) to build it; until then, agents fall back to
  Read/Grep automatically.
- This mirrors the `divinelab:explorer` agent's fallback rules so ad-hoc sessions and the `/divinelab:work`
  harness navigate the codebase the same way. See `docs/architecture/graphify.md` and `docs/architecture/agent-harness.md` (§ graphify).

## Architecture

See `docs/architecture/architecture.md` for the full picture. The short version:

### App Router locale groups

```
src/app/
├── [locale]/                 # es-AR | en-US locale segment
│   ├── page.tsx              # Home
│   ├── who-is-jesus/         # ¿Quién es Jesús?
│   ├── community/            # Mission, values, the Creed/Credo
│   ├── come-meet-us/         # Worship service time + address + map
│   └── blog/[slug]/          # Blog index + article pages
└── api/                      # Route handlers (no auth)
    ├── likes/                # GET/POST blog likes (MongoDB)
    ├── subscribe/            # POST → Mailchimp newsletter
    ├── revalidate/           # POST → revalidateTag("site-content")
    └── draft/{enable,disable}/  # Contentful preview/draft mode toggles
```

There are **no route groups** (`(public)` / `(admin)`) — every page is public and lives directly under `[locale]/`. The contact form is a **Server Action** (`src/components/features/contact-form/contactFormAction.ts`), not an API route.

### Two data paths (keep them separate)

```
Contentful → lib/contentful/fetch.ts (fetchGraphQL) → lib/contentful/get*.ts → RSC page/component
MongoDB    → src/service/database.service.ts (cached client) → like/contact services → API route / Server Action
```

- **Contentful (read-only content)** is the primary source. Each `lib/contentful/get*.ts` getter hand-writes a GraphQL query string with inline `locale:` + `preview:` arguments and POSTs it through `fetchGraphQL`. Every request is tagged `next: { tags: ["site-content"] }` for on-demand revalidation. **There is no GraphQL codegen or generated client — the data layer is entirely hand-written** (the unused `codegen.ts` + `@graphql-codegen/*` deps were removed). See `docs/architecture/contentful-data-layer.md`.
- **MongoDB (the only writes)** backs exactly two collections in a database literally named `website`: `likes` (blog post likes) and `contact` (saved contact messages). See `docs/architecture/likes-and-mongodb.md`.

### i18n (next-intl)

- Default locale **`es-AR`**, secondary **`en-US`** (`src/i18n/config.ts`, `routing.ts`, `request.ts`).
- UI strings live in `public/locales/{es-AR,en-US}.json` — every user-facing string must exist in **both** files.
- Middleware is in **`src/proxy.ts`** (it exports `proxy`, not `middleware`); the matcher excludes `_next` / `_vercel` / `api` / `trpc` and bypasses static asset extensions.
- `buildLocaleAlternates()` in `src/i18n/config.ts` produces the hreflang alternates used by `lib/metadata.ts`. See `docs/architecture/i18n.md`.

### Email & newsletter

- **Transactional email** uses an adapter pattern: `src/service/mailing.service.ts` selects `src/service/mailing/{sendgrid,resend}.adapter.ts` by the `MAIL_PROVIDER` env var. HTML bodies come from `src/templates/`.
- **Newsletter** is **Mailchimp** via `/api/subscribe` (client helper `src/service/subscribe.ts`).
- See `docs/architecture/forms-and-email.md` for the contact + subscribe flows and the spam/PII discipline.

### Revalidation & draft mode

- `POST /api/revalidate` requires header `x-vercel-reval-key` to equal `CONTENTFUL_REVALIDATE_SECRET`, then calls `revalidateTag("site-content")`. Wired to a Contentful publish webhook.
- Draft/preview is decided by `lib/contentful/draftMode.ts#shouldUseDraftMode()` — true when Next draft mode is enabled, **or** `NODE_ENV=development`, **or** `VERCEL_ENV=preview`. The preview token + `preview: true` are used when draft is on.

### Security / CSP

- `config/headers.js` sets HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`, `Referrer-Policy`, and a CSP that allowlists GTM/GA, Vercel scripts, and the Contentful image CDNs (`images.ctfassets.net`, `images.eu.ctfassets.net`) plus `images.unsplash.com`. `next.config.ts` mirrors the image hosts in `images.remotePatterns`. Treat `config/headers.js` and the CSP as a security-sensitive surface.

### Path aliases

`@src/*` → `src/*` · `@lib/*` → `lib/*` · `@public/*` → `public/*` · `@icons/*` → `public/assets/svg/*` (from `tsconfig.json`).

## Code Conventions

Distilled from `.cursorrules` (which `AGENTS.md` supersedes). Apply these by default:

- **TypeScript everywhere, strict mode.** Functional/declarative style, DRY, early returns. Structure files as: exports → subcomponents → helpers → types.
- **Functional-first — avoid classes.** Strongly prefer pure functions, plain objects, modules, and closures over classes. Model failures/outcomes as **return values** — a discriminated-union result (e.g. `{ ok: true; … } | { ok: false; reason: … }`) or `null`/`boolean` — never by throwing custom `Error` subclasses for control flow. Do **not** introduce `class` declarations unless a scenario genuinely requires it (e.g. instantiating an unavoidable third-party SDK such as `new Resend()`); isolate any such case and call it out in review. Repo-wide default for every session/agent.
- **Prefer `interface` over `type`** for object shapes. **Avoid enums — use const maps.** Use the **`satisfies`** operator for type validation.
- **Prefer nullish coalescing (`??`) over logical or (`||`)**.
- **RSC-first**: favor React Server Components, minimize `'use client'`. Use error boundaries and Suspense for async work.
- **Always `await`** Next.js runtime APIs: `cookies()`, `headers()`, `draftMode()`, `props.params`, `props.searchParams`.
- Forms use `useActionState` (not the deprecated `useFormState`) and the enhanced `useFormStatus`. Minimize client state.
- **Naming**: auxiliary-verb booleans (`isLoading`, `hasError`); `handle*` event handlers; **lowercase-dash directories**; **named exports** for components.
- **UI**: Headless UI + Heroicons / Lucide + Framer Motion; **Tailwind CSS v4**; compose classes with `cn()` (`src/utils/cn`). Validate external input with **Zod** at boundaries (`react-hook-form` + `@hookform/resolvers`).
- **Default site language is `es-AR`**, secondary `en-US`.
- **Commits**: Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `test`, `ci`), header ≤ 100 chars. `semantic-release` runs on `main`. See `docs/architecture/contributing.md`.

## Session naming (ticket-aware)

Sessions are named after the active Jira ticket automatically.

- **The naming is automatic; you don't (and can't) run `/rename` yourself.** The divinelab plugin's `session-namer` hook derives the ticket from the git branch (`<type>/ICR-N-<slug>`) or worktree dir (`.claude/worktrees/ICR-N`) and sets the session title via the `sessionTitle` hook field on `SessionStart` and each `UserPromptSubmit`. Title = `ICR-N-<first ~4 kebab words of the slug>`. The prefix (`ICR`, plus the `IDCR` alias) comes from `.claude/config.json` → `project.ticketPrefix`.
- The hook is idempotent and backs off once the live name carries the ticket, so a manual `/rename` is respected.
- On `main` or any branch without an `ICR-N`, the hook stays silent.
- **Do NOT emit "run `/rename …`" suggestions or apologise for being unable to rename** — the hook already handles it.

## Testing

- **Vitest** (`vitest.config.ts`, jsdom): unit smoke tests for pure utilities (`src/utils/*`, `src/i18n/config#buildLocaleAlternates`, getter shape-mappers). Run `pnpm test` (single pass) or `pnpm test:watch`. No coverage thresholds — coverage is report-only.
- **Playwright** (`playwright.config.ts`): configured with four projects (`e2ePublic`, `e2eBlog`, `apiForms`, `apiLikes`) but **no specs in Phase 1** — the `qa-runner` agent authors specs per-ticket. QA runs against **Vercel preview deployments** (`*.vercel.app`), never production and never a separate staging env (there is none).
- **No Storybook.**
- After any change, evaluate whether a meaningful test is warranted; do not add tests for trivial boilerplate.

## Environment Variables

> ⚠️ **`.env.example` is INCOMPLETE.** It lists only the Contentful + Mailchimp + base-URL vars; several variables that are **required at runtime** (per `src/types/environment.d.ts` and the services) are missing from it. When onboarding or debugging, copy from the **Required** table below, not just from `.env.example`. Fixing `.env.example` to match is a good first ticket.

### Required (must be set for the app to function)

| Variable                          | Purpose                                                           | In `.env.example`? |
| --------------------------------- | ----------------------------------------------------------------- | :----------------: |
| `NEXT_PUBLIC_BASE_URL`            | Canonical base URL for SEO/metadata. Set in Vercel, not committed |         ✅         |
| `CONTENTFUL_SPACE_ID`             | Contentful space                                                  |         ✅         |
| `CONTENTFUL_ACCESS_TOKEN`         | Content Delivery API token (published content)                    |         ✅         |
| `CONTENTFUL_PREVIEW_ACCESS_TOKEN` | Content Preview API token (drafts)                                |         ✅         |
| `CONTENTFUL_PREVIEW_SECRET`       | Secret for `/api/draft/enable`                                    |         ✅         |
| `CONTENTFUL_REVALIDATE_SECRET`    | `x-vercel-reval-key` for `/api/revalidate`                        |   ❌ **missing**   |
| `MONGODB_URI`                     | MongoDB connection (likes + contact)                              |   ❌ **missing**   |
| `MAIL_PROVIDER`                   | `sendgrid` or `resend` — selects the email adapter                |   ❌ **missing**   |
| `CONTACT_FORM_RECIPIENT_EMAIL`    | Where contact-form notifications are sent                         |   ❌ **missing**   |
| `FROM_EMAIL`                      | From address for transactional email                              |   ❌ **missing**   |
| `MAILCHIMP_API_KEY`               | Newsletter                                                        |         ✅         |
| `MAILCHIMP_API_SERVER`            | Newsletter datacenter (e.g. `us21`)                               |         ✅         |
| `MAILCHIMP_AUDIENCE_ID`           | Newsletter list                                                   |         ✅         |

### Conditionally required (by `MAIL_PROVIDER`)

| Variable           | Purpose                                | In `.env.example`? |
| ------------------ | -------------------------------------- | :----------------: |
| `SENDGRID_API_KEY` | Required when `MAIL_PROVIDER=sendgrid` |   ❌ **missing**   |
| `RESEND_API_KEY`   | Required when `MAIL_PROVIDER=resend`   |   ❌ **missing**   |

### Optional / injected

| Variable           | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `ENVIRONMENT_NAME` | Free-form environment label (e.g. `local`)                                         |
| `VERCEL_ENV`       | Injected by Vercel (`production` \| `preview` \| `development`); drives draft mode |

> **Secret hygiene:** never paste real secret values into docs, commits, or PRs — reference variable **names** only. `.env*` files are gitignored.

## Task Workflow

The dev harness ships as the **divinelab plugin** (Claude Code marketplace `DivineLab/divinelab-plugins`, enabled in `.claude/settings.json`) and runs an idea → merged → staging-verified pipeline against Jira. The generic commands, agents, and hooks (session-namer + graphify-hint) all live in the plugin; this repo carries only the **project facts** — `.claude/config.json` (canon-schema, validated by the plugin's `divinelab:canon` skill) — plus the **`/predica` domain command, its `predica-*` agents, and `.claude/scripts/predica/`** (the local sermon pipeline; stays project-local). `.claude/config.json` is the single source of truth; `docs/architecture/agent-harness.md` is the full description.

### Where work lives

1. **Jira** — project **IDC Redentor** (key `ICR`) on `divinelab.atlassian.net` (via the `atlassian-divinelab` MCP). Issues are native keys `ICR-N` (the `IDCR` alias also resolves); acceptance criteria live in the issue description.
2. **`tasks/specs/`** — local per-ticket artifacts written during a `/divinelab:work` run.

### Harness commands (divinelab plugin)

- `/divinelab:pm` — intake / refine / groom a Jira issue against `docs/product/` (human-gated; never past To Do).
- `/divinelab:work ICR-N` — the orchestrator: mandatory worktree + branch → explore → (conditional design gate) → plan → implement (TDD) ↔ verify → draft PR → preview QA → mark ready → detached post-PR review + CI loop. Owns exactly **two** Jira transitions: To Do→In Progress and In Progress→In Review.
- `/divinelab:qa ICR-N` — acceptance QA (staging by default; `--preview` targets the PR's Vercel preview). Report-only; posts a structured Jira comment.
- `/divinelab:verify` — `pnpm type-check` + `pnpm lint` + `pnpm test` (+ `pnpm build`) plus security checks.
- `/divinelab:merge ICR-N` — **human-triggered** squash-merge → In Review→In Testing → post-merge **staging** QA. Never deploys prod, never sets Done.

### Artifacts per ticket

- **Spec:** `tasks/specs/ICR-N-<slug>.md` — requirements and design.
- **Plan:** `tasks/specs/ICR-N-<slug>.plan.md` — file paths, checkpoints, dependencies (plus the per-run `.state.json` for `/divinelab:work` resume).

### The two human gates

1. A conditional **design gate** inside `/divinelab:work` (brainstorm + spec for non-trivial or sensitive work — the six sensitive areas `email-services`, `form-pii-spam`, `likes-mongo`, `env-secrets`, `csp-headers`, `i18n-messages` always gate).
2. The **merge** trigger — you say "merge"; `/divinelab:merge` runs. Afterward **you** deploy prod and move the issue to **Done** (Done is human-only; no agent ever sets it).

### Contentful model-change gate (domain)

`ICR` is Contentful-backed, so `/divinelab:work` carries one extra project gate. **When a `/divinelab:work` plan changes the Contentful content model** — creates / updates / deletes a **content type or field**, or **remaps entries** (as opposed to only adding a read-side GraphQL fragment/getter in `lib/contentful/*`) — STOP after the plan and confirm the migration **lane** before implementing:

- **Default — permanent `staging` work env** (recommended): develop in the standing `staging` env, promote to prod at cutover via Contentful Merge and/or the committed `scripts/contentful/` migrations (rollback = reverse migration).
- **Heavy — alias-swap cutover** (for big breaking changes — type deletions, field renames, merges): build in `staging`, then a human performs the stable-name alias-swap at cutover.

The implementer writes to the `staging` work env only — **never** the `master` alias or `production`. **Cutover is HUMAN-ONLY and deferred**, like merge and Done: no agent or command re-points the alias or applies the prod migration. Facts + runbook: `.claude/config.json` → `contentful` and `docs/architecture/contentful-environments.md`.

### `/predica` (domain command — stays local)

`/predica` and its `predica-*` agents are the local sermon pipeline (recording → transcript → bilingual `sermon.json` → branded PDFs → a Contentful **draft** → a WhatsApp text), with two human gates (transcript correction; promote/publish). It is draft-only + send-only and is **not** part of the divinelab plugin. See `tasks/specs/sermon-pipeline.md` and the `docs/predica-*` docs.

A human always merges the PR and closes the issue (transitions it to **Done**). Scratchpads live in `tasks/{todo.md,lessons.md}` (gitignored); specs in `tasks/specs/`.

## Documentation

- **Product brain (the "church definition")** — [`docs/product/`](docs/product/README.md): the one-paragraph definition, mission/values/voice (draft), `scope-and-boundaries.md` (the hard IN/OUT/DEFERRED filter — no logins, no payments, no public UGC, no in-product AI), `content-types.md`, `editorial-and-content-rules.md`, and `ai-era-strategy.md`. The `product-manager` agent loads this folder on every run. Read it before shaping product work.
- **Engineering docs** — in `docs/architecture/`:
  - `architecture.md` — App Router groups, the Contentful↔MongoDB split, request lifecycle, path aliases, security posture.
  - `contentful-data-layer.md` — `fetchGraphQL`, the getter convention, the `site-content` cache tag, draft/preview, the revalidate webhook, why codegen is unused.
  - `contentful-environments.md` — the canonical content/model workflow (3 scenarios, heavy alias-swap cutover runbook, entry-sync tool, drift detector); the single source of truth on the `master → production` + `staging` topology.
  - `contentful-mcp.md` — the official Contentful MCP server for agents (registered inline in local `~/.claude.json`; local/token, `ENVIRONMENT_ID=staging` default, `PROTECTED_ENVIRONMENTS=master,production`); the agent-only write path, separate from the app's read path.
  - `i18n.md` — next-intl setup, locales, message files, the `src/proxy.ts` middleware, locale alternates/hreflang.
  - `forms-and-email.md` — contact + subscribe flows, the SendGrid/Resend adapter, templates, spam/PII handling.
  - `likes-and-mongodb.md` — the cached Mongo client, the `likes`/`contact` collections, visitor de-dup, write safety.
  - `seo-and-metadata.md` — `lib/metadata.ts`, the Contentful `Seo` type, OG/Twitter cards, JSON-LD, locale alternates.
  - `agent-harness.md` — how to use the agents and commands; the human-gated Jira automation.
  - `predica-bibleverse-reuse.md` — how `/predica` dedups scripture: the derived, version-scoped `bibleVerse` `internalName` (`"Joel 2:13 (NVI)"`) + the `--upsert-by-internal-name` CMA flag; cross-sermon reuse + sermon re-run safety.
  - `predica-rerun-idempotency.md` — re-running `/predica` safely: pre-flight transcript reuse by audio hash, **Gate 0** existing-sermon detection, regenerate by **update-in-place** (`--id`) instead of duplicating, and the guarded `delete-contentful.mjs` cleanup of superseded assets + orphaned legacy verses.
  - `predica-voice-profiles.md` — the per-preacher voice-coach learning loop: `predica-voice-coach` (step 2.5) learns the preacher's style from the **corrected transcript only** and maintains a local-only (gitignored), human-curatable two-zone profile (`tasks/predicas/_voices/<preacher-slug>.md`: Zone A human-curated + Zone B append-only log) that the writer reads to compound voice quality. Idempotent, non-blocking, style-only.
  - `contributing.md` — branch/commit/PR conventions, semantic-release, husky/CI gates, the worktree flow.
  - `gtm-ga4-setup.md` — _(existing)_ GTM/GA4 analytics + consent setup.
