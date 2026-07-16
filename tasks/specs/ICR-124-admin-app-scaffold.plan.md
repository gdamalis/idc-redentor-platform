# ICR-124 — Implementation plan (`apps/admin` scaffold)

5 checkpoints. Each verifies green: `pnpm --filter @idcr/admin type-check + lint + test` (+ `build` where noted). Package name **`@idcr/admin`**. Mirror-don't-edit references: `apps/web/src/service/database.service.ts`, `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/i18n/*`, `apps/web/next.config.ts`, `packages/ui/src/tokens.css`, `docs/architecture/monorepo-packages.md`.

## CP1 — Runnable bilingual shell (incl. theme)

Commit: `feat(ICR-124): scaffold runnable bilingual apps/admin shell`
The minimum coherent green _build_ unit (a next-intl-plugin app with no `request.ts` won't build).

**Files (new, `apps/admin/`):**

- `package.json` (`@idcr/admin`, private; scripts dev/build/start/lint/type-check/test; deps: `next`, `react`, `react-dom`, `next-intl`, `mongodb`, `zod`, `@idcr/ui` `workspace:*`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`, `@radix-ui/react-slot` (+ others as needed by primitives in CP4), `firebase`, `firebase-admin`, `next-themes`, `server-only`; devDeps: `@idcr/config` `workspace:*`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `eslint`, `eslint-config-next`, `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/{react,jest-dom,user-event}`, `@types/{node,react,react-dom}`). Match `apps/web` version ranges.
- `tsconfig.json` (`extends "@idcr/config/tsconfig.base.json"`; `plugins:[{name:"next"}]`; own `paths` `@src/*→./src/*`, `@public/*→./public/*`; include next-env + ts/tsx + `.next/types`; exclude node_modules).
- `next.config.ts` (`createNextIntlPlugin()` wrapping `{ transpilePackages:["@idcr/ui"] }`; no Sentry, no web-specific serverExternalPackages).
- `eslint.config.mjs` (`import { eslintBase } from "@idcr/config/eslint.base.mjs"`; `[...eslintBase, { ignores:[".next/**","node_modules/**"] }]`).
- `postcss.config.mjs` (`export { default } from "@idcr/config/postcss.base.mjs";`).
- `vitest.config.ts` (react + tsconfigPaths plugins; jsdom; globals; setup `./vitest.setup.ts`; include `src/**/*.{test,spec}.{ts,tsx}`) + `vitest.setup.ts` (`import "@testing-library/jest-dom/vitest";`).
- `vercel.json` (`framework:"nextjs"`, `installCommand:"pnpm install --frozen-lockfile"`, `buildCommand:"next build"`, `outputDirectory:".next"`).
- `src/types/environment.d.ts` (`NodeJS.ProcessEnv`: `MONGODB_URI`, `NEXT_PUBLIC_ADMIN_BASE_URL`, Firebase client+admin vars — **no `ADMIN_DB_NAME`**).
- `src/i18n/routing.ts` (`defineRouting({locales:["es-AR","en-US"],defaultLocale:"es-AR"})` + `createNavigation`), `src/i18n/request.ts` (`getRequestConfig`, import `../../messages/${locale}.json`), `src/i18n/config.ts` (locales const, `isValidLocale`), `src/i18n/messages.test.ts` (parity: identical flattened key sets).
- `src/proxy.ts` (`export const proxy = createMiddleware(routing)` + `config.matcher = ["/((?!_next|_vercel|api|trpc).*)"]`).
- `messages/es-AR.json` + `messages/en-US.json` (minimal keys for the shell/not-found; both identical key sets).
- `src/app/globals.css` (`@import "tailwindcss";` + `@import "@idcr/ui/tokens.css";` + `@layer base` mirroring web).
- `src/app/layout.tsx` (pass-through `return children`).
- `src/app/not-found.tsx` (own `<html><body>` + font vars — mirror web).
- `src/app/[locale]/layout.tsx` (`next/font` Outfit+Playfair → `.variable` on `<body>`; `<html lang={locale} suppressHydrationWarning>`; `ThemeProvider`; `NextIntlClientProvider`; `setRequestLocale`; `generateStaticParams`; `hasLocale→notFound`; **guarded/omitted `metadataBase`**).
- `src/app/[locale]/page.tsx` (minimal placeholder — moves to `(app)/page.tsx` in CP4).
- `src/components/theme/theme-provider.tsx` (`"use client"`; wraps `next-themes` `ThemeProvider`), `src/components/theme/theme-toggle.tsx` (`"use client"`; `useTheme()`; minimal button).
- Copy assets: `apps/web/public/assets/img/{redentor_logo*.png, community_redentor_camp.jpeg}` → `apps/admin/public/assets/img/`.

**Verify:** type-check + lint + test + **build** green; `dev` boots; `/es-AR` + `/en-US` render, tokens apply, theme flips. Regenerate + commit `pnpm-lock.yaml`.

## CP2 — Fail-closed `getAdminDb()` (pure)

Commit: `feat(ICR-124): add fail-closed getAdminDb accessor + cached admin Mongo client`

- `src/service/database.service.ts` — mirror web (lazy singleton, `globalThis._adminMongoClient` dev cache, ServerApi v1 strict) + `maxPoolSize: 10`; `connect()` (console.error, no Sentry); exported `assertAdminDbName(name)` + sync `getAdminDb(): Db`.
- `src/service/database.service.test.ts` — denylist matrix (empty, whitespace, `test`, `admin`, `local`, `config`, `website`, `website-staging`) + no-path-URI→`test` + happy path (`ministry-admin` → `Db`). Mock `MongoClient`/`client.db()`.
- `eslint.config.mjs` — add `no-restricted-syntax` rule blocking `CallExpression[callee.property.name='db'][arguments.length=0]`, in a block whose `ignores:["src/service/database.service.ts"]`.
- `.env.example` — DB section only. Mirror `apps/web/.env.example`: set `MONGODB_URI=` **empty** with a prose comment documenting the path+query shape (`…/ministry-admin?authSource=admin&retryWrites=true&w=majority&maxPoolSize=10`). Do **not** write a full connection string with embedded `user:pass@host` credentials — the husky pre-commit secret-scan rejects any Mongo URI carrying credentials. No `ADMIN_DB_NAME`.

**Verify:** type-check + lint + test green; lint rule fails on a planted bare `.db()` (revert the plant).

## CP3 — Firebase config (lazy, build-safe)

Commit: `feat(ICR-124): add lazy build-safe Firebase client + admin config, admin .env.example`

- `src/lib/firebase/client.ts` — `getApps().length ? getApp() : initializeApp(cfg)`; `cfg` from `NEXT_PUBLIC_FIREBASE_*` via Zod; lazy getter; no top-level init.
- `src/lib/firebase/admin.ts` — `import "server-only";` first; `getApps().length ? getApp() : initializeApp({ credential: cert({ projectId, clientEmail, privateKey: raw.replace(/\\n/g,"\n") }) })`; Zod at boundary; lazy getter.
- `src/lib/firebase/*.test.ts` — importing both modules with **no env set** asserts no throw (AC8).
- Finish `apps/admin/.env.example` — Firebase client+admin names, `NEXT_PUBLIC_ADMIN_BASE_URL`, `RESEND_API_KEY`/`FROM_EMAIL` (CP2-auth-forthcoming). Names only.
- `turbo.json` (root) — add `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_ADMIN_BASE_URL` to `tasks.build.env`. Keep `MONGODB_URI` out. _(sensitive-path file — call out in PR.)_

**Verify:** type-check + lint + test **+ `build` with no Firebase/Mongo env** green (AC8).

## CP4 — UI chrome (AppShell + primitives + route-group stubs)

Commit: `feat(ICR-124): add AppShell, shadcn primitives, locale switcher, route-group stubs`

- `src/components/ui/*` — hand-written primitives on Radix + cva + `cn` (Button + the minimal set the shell needs; add matching `@radix-ui/*` deps as used).
- `src/components/shell/{app-shell,sidebar,topbar,locale-switcher}.tsx` — Sidebar (`--sidebar` tokens; static nav placeholders); Topbar (user-menu placeholder + `LocaleSwitcher` via next-intl `useRouter`/`usePathname` + `ThemeToggle`); `<main>`.
- Route groups (spec §8, **pages empty**): `src/app/[locale]/(app)/layout.tsx` (= AppShell) + `(app)/{page.tsx,people,families,activities,calendar,users,roles,settings}/page.tsx`; `(auth)/{login,reset-password}/page.tsx`; `no-access/page.tsx`. Move CP1's `[locale]/page.tsx` → `(app)/page.tsx`.
- Add AppShell/nav/common i18n keys to **both** locale files (parity test must stay green).

**Verify:** green; shell chrome renders both locales + both themes; sidebar links resolve (no 404).

## CP5 — Spec correction

Commit: `docs(ICR-124): correct admin-mvp.md data-layer model (ministry-admin, URI-carried DB, two Atlas users)`

- `tasks/specs/admin-mvp.md`: §2 (L37 single-user → two asymmetric Atlas users, `ministry-admin`), §3 (L51 `ADMIN_DB_NAME (e.g. admin)` → DB-in-URI + `authSource=admin` + `maxPoolSize`), §4 (L78 "pointed at `ADMIN_DB_NAME`" → `getAdminDb()` + fail-closed denylist), §5 (L86 "the `admin` database" → `ministry-admin`), §11 (L290 `admin-test` → `ministry-admin-test`), §13 (drop `ADMIN_DB_NAME` row; document DB-in-URI + `authSource` + `maxPoolSize`). Also scrub **any other** `ADMIN_DB_NAME` / stale "`admin` database" / `admin-test` occurrence (Plan agent flagged §12/§14) and stale `middleware.ts`→`proxy.ts` naming.

**Verify:** `grep -rin admin_db_name .` (repo-wide) → **zero** (AC5); type-check + lint + test unaffected.

## Verify-loop discipline

Max 3 implementer↔verifier attempts per checkpoint. `.env.local` already copied into `apps/web/` (for web's build during any full turbo run). Draft PR opens after CP1 verify-green.
