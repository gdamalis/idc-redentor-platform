# ICR-124 — Scaffold `apps/admin` (spec)

> Story · commit type `feat` · Component: Ministry Admin Panel · Parent Epic ICR-13 · QA Depth: standard
> Design gate: **required** (sensitive areas: `env-secrets`, `likes-mongo`, PII, `i18n-messages`). Approved 2026-07-16.

## 1. Context & dependencies check

CP1 of the Ministry Admin Panel — the **second app** (`apps/admin`, package `@idcr/admin`) in the pnpm + Turborepo workspace, alongside `apps/web`. Unlike the public site (no auth), `apps/admin` is an authenticated app that will hold **congregant PII**. That drives a **locked data-layer decision** (verified 2026-07-14): one Atlas M0 cluster, four DBs split by sensitivity — `website` / `website-staging` / `ministry-admin` / `ministry-admin-staging` — with the DB name carried in the `MONGODB_URI` **path** (not an env var), `authSource=admin` and `maxPoolSize` explicit. The once-proposed separate DB-name env var is **cancelled** — no such variable exists.

**Dependencies:**

- **ICR-140** (harness gates) — **satisfied**: `.claude/config.json` already carries the `apps/admin` sensitivePaths, the `ministry-admin` DB allowlist, and the `apiAdmin`/`e2eAdmin` Playwright map (merged #100).
- **ICR-141** (Atlas users, DBs, 2nd Vercel project, env values) — deploy-only. The scaffold **builds & verifies secret-free** (AC8), so it does not block this work; it cannot be deployed until ICR-141 completes.
- **No Contentful model change** (Contentful gate N/A).

**Existing packages consumed:** `@idcr/config` (tsconfig/eslint/postcss/prettier bases), `@idcr/ui` (`cn()`, `LOGO` path constants, `tokens.css`).

## 2. Confirmed design decisions (this session)

- **Hand-written shadcn-style primitives** on Radix + `class-variance-authority` + `cn()` — matches `apps/web`; **no** shadcn CLI / `components.json` (tokens already shadcn-shaped in `@idcr/ui/tokens.css`).
- **next-themes** (0.4.6) for the theme toggle (`attribute="class"`, `suppressHydrationWarning`, `disableTransitionOnChange`).
- **New deps** (verified compatible with Node 22 / React 19 / Next 16): `firebase@12.16.0`, `firebase-admin@14.1.0` (Node ≥22), `next-themes@0.4.6`, `server-only`. Install latest; bind to the **installed** `.d.ts`.
- **No Sentry** in the admin scaffold (out of scope) — the mirrored `connect()` uses `console.error` only.

## 3. Requirements

1. **Workspace member `@idcr/admin`** — `package.json` (scripts `dev`/`build`/`start`/`lint`/`type-check`/`test`), `tsconfig.json` (`extends @idcr/config/tsconfig.base.json` + its **own** `paths` `@src/*`, `@public/*` + `plugins:[{name:"next"}]`), `next.config.ts` (`createNextIntlPlugin()` + `transpilePackages:["@idcr/ui"]`, no Sentry), `eslint.config.mjs` (`...eslintBase` + ignores), `postcss.config.mjs` (re-export `@idcr/config/postcss.base.mjs`), `vitest.config.ts` + `vitest.setup.ts`, `vercel.json`. `pnpm-workspace.yaml` needs no edit (`apps/*` glob auto-registers).
2. **App Router skeleton, RSC-first**, route groups `(auth)` / `(app)` stubbed (spec §8) — pages empty. `'use client'` only for toggles.
3. **`@idcr/ui` tokens wired + hand-written shadcn primitives**; light + **dark** mode via next-themes.
4. **next-intl bilingual** — default `es-AR`, secondary `en-US`; messages at `apps/admin/messages/{es-AR,en-US}.json` (every string in both). `getRequestConfig` imports `../../messages/${locale}.json`.
5. **AppShell** — Sidebar (`--sidebar` tokens, static nav placeholders) + Topbar (user-menu placeholder, LocaleSwitcher, ThemeToggle) + `<main>`.
6. **Cached Mongo client + fail-closed `getAdminDb()`** (+ unit tests). See §4.
7. **Firebase client + Admin config** — env-driven, **lazy, build-safe** (no init at import); Zod at the env boundary; `server-only` on the admin module.
8. **`apps/admin/.env.example`** — variable names only, no separate DB-name env var, with the required `MONGODB_URI` query-param shape documented.
9. **Spec correction** to `tasks/specs/admin-mvp.md` (§2, §3, §4, §5, §11, §13 + any other stale separate-DB-name-env-var / `admin` DB / `admin-test` / `middleware.ts` reference).

## 4. Data layer — the fail-closed accessor (load-bearing)

Mirror `apps/web/src/service/database.service.ts` (lazy singleton; `globalThis._adminMongoClient` cache in **dev only** to survive HMR; `MONGODB_OPTIONS = { serverApi: { version: v1, strict: true, deprecationErrors: true } }`; `throw new Error("MONGODB_URI is not defined")`) with two differences: **set `maxPoolSize: 10`**, and **never expose a bare `client.db()`**.

```ts
export function assertAdminDbName(name: string | undefined | null): void; // throws plain Error naming the offending DB
export function getAdminDb(): Db; // sync: client.db() (DB from the URI) after asserting its name
export async function connect(): Promise<MongoClient | undefined>; // console.error on failure (no Sentry)
```

- **Denylist** — `assertAdminDbName` throws when the name is empty/whitespace, **or** exactly `test` / `admin` / `local` / `config` (Mongo reserved/system DBs), **or** matches `/^website/` (wrong sensitivity tier — catches `website`, `website-staging`, `website-*`). `ministry-admin` passes.
- **mongodb-6.21 semantics:** `client.db()` with no arg resolves the URI-path DB; a URI **with no path DB defaults to `test`** → caught by the `test` case → **fails closed naming `test`**. `client.db()` is synchronous and needs no live connection to read `.databaseName`, so `getAdminDb()` is **synchronous** and separate from `connect()`.
- **Assertion runs every call** (O(1) string compares + one regex) — **no** module-level memo flag (immune to the dev HMR client swap).
- **Failure = plain `Error`** — the one documented exception to the repo functional-first "no `Error` subclasses / outcomes as return values" rule. A misconfigured DB name is a **deployment defect**, not a branchable outcome; a returnable refusal a caller can `??` past reintroduces the silent-`test`-DB failure that dropping the separate DB-name env var (in favor of the URI-carried name + denylist) exists to prevent. Precedent: `database.service.ts:18`.
- **`assertAdminDbName` is exported standalone** so ICR-155's plain Node/tsx seed script can reuse the guard without a Next runtime.
- **AC2 enforced** by an ESLint `no-restricted-syntax` rule banning the bare `client.db()` (empty args) everywhere in `apps/admin` **except** `src/service/database.service.ts` (the one sanctioned occurrence). Reviewer grep: `grep -rEn '\.db\(\s*\)' apps/admin/src` → exactly one hit.

## 5. Env vars (names only)

`MONGODB_URI` — the admin DB name rides in the URI **path** (`…/ministry-admin?authSource=admin&retryWrites=true&w=majority&maxPoolSize=10`); document the path+query shape only, **never** a literal `scheme://credentials@host` form (the husky secret-scan regex `mongodb(\+srv)?://…@` rejects it, and `apps/web/.env.example` sets `MONGODB_URI=` empty for the same reason). Plus `NEXT_PUBLIC_FIREBASE_API_KEY … NEXT_PUBLIC_FIREBASE_APP_ID` (client), `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_ADMIN_BASE_URL`, plus `RESEND_API_KEY` / `FROM_EMAIL` (marked CP2-auth-forthcoming). **No separate DB-name env var.** Mirror the convention in `apps/admin/src/types/environment.d.ts`. **Names only in every artifact** (env-secrets gate).

## 6. Acceptance criteria (verbatim from the ticket)

1. `getAdminDb()` fails closed (message names the offending DB) for empty/`test`/`admin`/`local`/`config`/`^website`; unit tests each refusal + happy path (`ministry-admin` → `Db`).
2. No bare `client.db()` in `apps/admin` (except inside `getAdminDb`); cross-DB reads use explicit `client.db("website")`. Greppable + review-enforced.
3. `maxPoolSize` set on the admin `MongoClient` (10).
4. `authSource=admin` explicit in the `.env.example` `MONGODB_URI` shape.
5. A repo-wide, case-insensitive search for the literal name of the cancelled separate DB-name env var → nothing (code, `.env.example`, `environment.d.ts`, `admin-mvp.md`).
6. Shell renders `/es-AR` + `/en-US` with no missing-message warnings; theme toggle flips; `@idcr/ui` tokens apply.
7. `pnpm --filter @idcr/admin` type-check/lint/test/build green + `dev` boots.
8. `pnpm --filter @idcr/admin build` succeeds with **no** Firebase/Mongo env (lazy config).
9. `admin-mvp.md` corrected in §2/§3/§4/§5/§11/§13 (`ministry-admin`, URI-carried DB, two asymmetric Atlas users).

## 7. Edge cases

1. **AC8 secret-free build** — Firebase/Mongo lazy; **guard/omit `metadataBase`** (`new URL(undefined)` throws at build). Worktree has no `apps/admin/.env.local` → admin build is naturally secret-free.
2. **i18n parity (AC6)** — every key in both locale files; enforced by the ported parity test; watch es-AR accents (voseo).
3. **Font vars** — load Outfit + Playfair via `next/font` in `[locale]/layout.tsx` and put the two `.variable` classes on `<body>` (tokens reference `--font-outfit`/`--font-playfair`; silent fallback otherwise).
4. **Tokens contract** — copy the 6 logo PNGs + `community_redentor_camp.jpeg` into `apps/admin/public/assets/img/` (one-time copy, not a build hook).
5. **Turbo strict-env** — add `NEXT_PUBLIC_FIREBASE_*` + `NEXT_PUBLIC_ADMIN_BASE_URL` to `turbo.json` `build.env` (root allowlist; keep `MONGODB_URI` out — runtime-only).
6. **Lockfile** — adding deps mutates `pnpm-lock.yaml` (load-bearing under `--frozen-lockfile`); regenerate + commit with the `package.json` change.
7. **Root `not-found.tsx`** — root layout is pass-through, so the not-found must supply its own `<html><body>` + font vars.

## 8. Sensitive areas (review as security surface)

- **env-secrets** — `MONGODB_URI` shape + Firebase Admin service-account vars. Names only everywhere.
- **likes-mongo (data layer)** — second consumer of the shared cluster; the pool budget (`maxPoolSize`) + the DB-name guard are the point.
- **PII (forthcoming)** — the sensitivity split, asymmetric Atlas users, `^website` denylist keep tiers apart.
- **i18n-messages** — both locale files, every key.

## 9. Testing strategy

- **Unit (vitest):** the `getAdminDb`/`assertAdminDbName` denylist matrix + happy path (mock the `MongoClient`); a message-parity test (ported `flattenKeys` identical-key-set over both locales); a Firebase-config no-env import test (asserts no throw).
- **Manual smoke (local — no admin Vercel preview until ICR-141):** `pnpm --filter @idcr/admin dev`, open `/es-AR` + `/en-US`, toggle theme, confirm no missing-message warnings + tokens apply; `pnpm --filter @idcr/admin build` with no env (AC8).
- **Playwright:** `apiAdmin`/`e2eAdmin` are forward-declared but this ticket provisions the projects only inasmuch as the app exists; no e2e specs at standard depth.

## 10. Checkpoints

See `ICR-124-admin-app-scaffold.plan.md`.
