# ICR-117 — Set up Sentry error & performance monitoring (staging + production)

**Jira:** https://divinelab.atlassian.net/browse/ICR-117
**Epic:** ICR-118 (Live-site hardening: monitoring + reliability fixes)
**Type:** Task · **Commit type:** `chore` · **Priority:** Highest · **QA depth:** heavy
**Sensitive areas:** `csp-headers`, `env-secrets`, **`form-pii-spam`** (added during design — see §3)

---

## 1. Dependencies Check

Everything below was verified against the live SDK/docs, not memory (standing rule: verify before integrating).

| Fact                                       | Verified value                                                                                    | Source                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| SDK version                                | `@sentry/nextjs@10.65.0`                                                                          | npm registry API                                            |
| Next.js 16 support                         | `peerDependencies.next` includes `^16.0.0-0`; added in SDK **10.20.0**                            | package peer deps + sentry-javascript CHANGELOG             |
| Installed Next                             | `next@^16.2.9`, React 19.2.1 — **Turbopack is the default builder**                               | `apps/web/package.json`                                     |
| Missing `SENTRY_AUTH_TOKEN` at build       | **Warns and skips upload; does NOT fail the build** (`logger.warn(...); return false`)            | `packages/bundler-plugins/src/core/build-plugin-manager.ts` |
| `experimental.instrumentationHook`         | **Not needed** — SDK source: "Next.js 16+ never requires the hook"                                | `packages/nextjs/src/config/util.ts`                        |
| `disableLogger`, `automaticVercelMonitors` | **DEPRECATED** as top-level options (moved under `webpack.*`, which likely no-op under Turbopack) | `packages/nextjs/src/config/types.ts`                       |

**Codebase preconditions (all confirmed):**

- **Clean slate.** A case-insensitive grep for `sentry` across the repo returns **zero hits** — no existing `instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.ts`, `global-error.tsx`, or any `error.tsx`. Nothing to collide with or overwrite.
- `apps/web/src/app/layout.tsx` exists at the app root → `global-error.tsx` belongs beside it.
- `vitest.config.ts` `include` already globs `src/**/*.{test,spec}.{ts,tsx}` → a new test under `src/utils/sentry/` **will actually execute**. (Guards the ICR-21 "silently skipped test dir" trap.)
- CSP lives in `apps/web/config/securityHeaders.js` as `buildSecurityHeaders({ previewLike })`, with `securityHeaders.test.ts` asserting prod-vs-preview parity per directive.

---

## 2. Requirements

1. Install `@sentry/nextjs` (^10.65.0) as a **dependency** (not devDependency — it runs at app runtime).
2. Initialize Sentry on all three App Router runtimes: **server (nodejs)**, **edge**, and **client**.
3. Resolve the Sentry `environment` dynamically: `NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "development"`. One Sentry project, split by environment tag.
4. Trace sampling by environment: `production` → **0.1**, `staging`/`preview` → **0.5**, `development` → **1.0**. Error `sampleRate` → **1.0** everywhere.
5. **An absent DSN must be a clean no-op**, never a crash: `enabled: Boolean(dsn)`. Local dev and any env without a DSN run normally with Sentry inert.
6. **PII minimization (LOCKED — see §3):** `sendDefaultPii: false` **and** `dataCollection: { userInfo: false, httpBodies: [] }`.
7. **Session Replay is NOT installed** — `replayIntegration()` is never imported. No replay bundle ships and no `worker-src` CSP directive is needed.
8. Browser events reach Sentry via a **same-origin tunnel at `/monitoring`** (`tunnelRoute`). The CSP is **not modified**.
9. `src/proxy.ts`'s matcher must **exclude** `/monitoring`, or next-intl locale-redirects the tunnel and it breaks.
10. `next.config.ts` is wrapped by `withSentryConfig(...)` **outermost**, around the existing `withNextIntl(...)`.
11. Source maps upload at build via `SENTRY_AUTH_TOKEN`; the token is **never committed** and CI stays green without it.
12. New env vars documented in `.env.example` + typed in `src/types/environment.d.ts`, and declared in `turbo.json`'s build `env`.
13. Ship `docs/architecture/observability-sentry.md`.
14. A **temporary** test surface proves AC2 during preview QA, then is **deleted before merge**.

---

## 3. The PII decision (why this is a sensitive area)

Sentry's v10 SDK collects user identity and HTTP request bodies by default. This site's **contact form is a Server Action carrying a congregant's name, email, and free-text message**. Without minimization, an unrelated 500 during a submit could ship that payload into Sentry — a third-party processor — as incidental error context.

**Locked posture:** `sendDefaultPii: false` and an explicit `dataCollection: { userInfo: false, httpBodies: [] }`. We keep stack traces (which is what diagnoses the ICR-111-class Mongo failures that motivated this ticket) and give up request-body context. This is consistent with the repo's existing spam/PII discipline (`docs/architecture/forms-and-email.md`) and the public-site no-auth posture.

---

## 4. Data Model Changes

**None.** No MongoDB collections, no Contentful content-model changes. This ticket adds no persistence.

---

## 5. API Changes

No product API changes. Two route surfaces appear:

| Route                                   | Origin                                                                                       | Lifetime                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `/monitoring`                           | Generated by `withSentryConfig`'s `tunnelRoute` — proxies browser envelopes to Sentry ingest | **Permanent**                    |
| `/api/sentry-check` + `/sentry-example` | Temporary QA surface (throws on demand)                                                      | **Deleted in CP5, before merge** |

No Zod schemas are needed (no user input is parsed).

---

## 6. New / Modified Files

### New

| File                                        | Purpose                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/sentry/options.ts`      | Pure options factory: `resolveSentryEnvironment()`, `resolveTracesSampleRate()`, `baseSentryOptions()`. The only unit with logic. |
| `apps/web/src/utils/sentry/options.test.ts` | Unit tests for the above.                                                                                                         |
| `apps/web/src/instrumentation.ts`           | `register()` (runtime-dispatched dynamic import) + `onRequestError`.                                                              |
| `apps/web/src/instrumentation-client.ts`    | Client `Sentry.init` + `onRouterTransitionStart`.                                                                                 |
| `apps/web/src/sentry.server.config.ts`      | `Sentry.init(baseSentryOptions())` for the nodejs runtime.                                                                        |
| `apps/web/src/sentry.edge.config.ts`        | `Sentry.init(baseSentryOptions())` for the edge runtime.                                                                          |
| `apps/web/src/app/global-error.tsx`         | Root error boundary → `Sentry.captureException`.                                                                                  |
| `docs/architecture/observability-sentry.md` | The architecture doc.                                                                                                             |

### Modified

| File                                  | Change                                                         |
| ------------------------------------- | -------------------------------------------------------------- |
| `apps/web/next.config.ts`             | Wrap with `withSentryConfig(withNextIntl(nextConfig), {...})`. |
| `apps/web/src/proxy.ts`               | Matcher excludes `monitoring`.                                 |
| `apps/web/src/types/environment.d.ts` | + 5 keys in a `// Sentry` group.                               |
| `apps/web/.env.example`               | + documented Sentry block.                                     |
| `turbo.json`                          | + `SENTRY_*` / `NEXT_PUBLIC_SENTRY_*` to `build.env`.          |
| `apps/web/package.json`               | + `@sentry/nextjs` dependency.                                 |

### Temporary (created CP4, deleted CP5)

| File                                                | Purpose                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/src/app/api/sentry-check/route.ts`        | Throws → proves a **server** error reaches Sentry.             |
| `apps/web/src/app/[locale]/sentry-example/page.tsx` | Button that throws → proves a **client** error reaches Sentry. |

---

## 7. Env Vars

| Variable                         | Public?       | Purpose                                                             | Where set                            |
| -------------------------------- | ------------- | ------------------------------------------------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN`         | ✅ public     | Ingest endpoint. Absent → Sentry inert.                             | Vercel: prod + staging + **preview** |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | ✅ public     | Overrides the env tag. Set to `staging` on the staging deploy only. | Vercel: staging                      |
| `SENTRY_ORG`                     | ❌            | Build-time source-map upload.                                       | Vercel + CI                          |
| `SENTRY_PROJECT`                 | ❌            | Build-time source-map upload.                                       | Vercel + CI                          |
| `SENTRY_AUTH_TOKEN`              | 🔒 **secret** | Build-time source-map upload **only**. Never committed.             | Vercel only                          |

**Turbo note:** the root `pnpm build` runs `turbo run build`, whose `env` allowlist gates what the task sees. `SENTRY_*` must be declared there or source-map upload silently no-ops on root builds — the Sentry SDK even ships a dedicated Turborepo `passThroughEnv` warning for exactly this case. (Vercel builds with Root Directory = `apps/web` and therefore bypass Turbo, but we declare it anyway for correctness of local/CI builds and cache hashing.)

---

## 8. Component Hierarchy

```
apps/web/
├── next.config.ts ............... withSentryConfig( withNextIntl( nextConfig ) )
├── src/
│   ├── instrumentation.ts ....... register() ──┬─ NEXT_RUNTIME=nodejs → ./sentry.server.config
│   │                                           └─ NEXT_RUNTIME=edge   → ./sentry.edge.config
│   │                              onRequestError = Sentry.captureRequestError
│   ├── instrumentation-client.ts  Sentry.init(baseSentryOptions())
│   │                              onRouterTransitionStart = captureRouterTransitionStart
│   ├── sentry.server.config.ts .. Sentry.init(baseSentryOptions())
│   ├── sentry.edge.config.ts .... Sentry.init(baseSentryOptions())
│   ├── proxy.ts ................. matcher excludes /monitoring
│   ├── utils/sentry/options.ts .. ← single source of truth, imported by all three inits
│   └── app/
│       ├── layout.tsx ........... (existing)
│       └── global-error.tsx ..... "use client" → captureException → <NextError/>
```

All three runtime entries are thin; **all shared behavior lives in `options.ts`**, so the PII posture and sampling policy are defined exactly once and are unit-testable in isolation.

---

## 9. Edge Cases

1. **DSN unset** (local dev, a fork PR, an env not yet wired) → `enabled: false`; `Sentry.init` is inert, the app runs normally, no network calls. **Never throws.**
2. **`SENTRY_AUTH_TOKEN` unset at build** (CI, fork PR) → plugin warns, skips source-map upload, **build succeeds**. Verified in SDK source. CI must stay green.
3. **Tunnel vs. i18n middleware** → `/monitoring` is excluded from the proxy matcher. If this regresses, next-intl rewrites it to `/es-AR/monitoring` and every browser event 404s **silently**. QA must assert `/monitoring` is not locale-redirected.
4. **Tunnel vs. CSP** → tunnel traffic is same-origin, already covered by the existing `connect-src 'self'`. **No CSP edit.** If we ever drop the tunnel, `*.sentry.io` must be added to `connect-src`.
5. **Turbopack vs. `webpack.*` options** → deprecated `disableLogger` / `automaticVercelMonitors` are **not used**; Next 16 builds with Turbopack where they'd likely no-op anyway.
6. **`global-error.tsx` is not internationalized** — it renders Next's generic English error page. It is a last-resort boundary that only fires when the root layout itself fails (i.e. when the i18n provider is unavailable), so localizing it is out of scope. Noted in §13.
7. **Client bundle growth** — the Sentry browser SDK adds weight to every page. Mitigated by omitting Replay (the single largest optional chunk).
8. **Tunnel is a public unauthenticated endpoint** — inherent to `tunnelRoute`. It forwards only to our own DSN's ingest, so the blast radius of abuse is Sentry-quota consumption, not data exposure. Accepted; revisit if quota alarms fire.

---

## 10. i18n

**No new user-facing strings.** No keys added to `public/locales/{es-AR,en-US}.json`. The temporary `/sentry-example` page is developer-facing and is deleted before merge. `global-error.tsx` intentionally uses Next's built-in generic error page (see Edge Case 6).

---

## 11. Testing Strategy

**Unit (Vitest)** — `src/utils/sentry/options.test.ts`, covering the only real logic:

- `resolveSentryEnvironment()` honors `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, falls back to `VERCEL_ENV`, then to `"development"`.
- `resolveTracesSampleRate()` → 0.1 / 0.5 / 1.0 for production / staging+preview / development.
- `baseSentryOptions()` sets `enabled: false` when the DSN is absent, `true` when present.
- **PII invariants** (the security-critical assertions): `sendDefaultPii === false`, `dataCollection.userInfo === false`, `dataCollection.httpBodies` is empty. These must fail loudly if anyone relaxes the posture.

Use `vi.stubEnv` + `afterEach(vi.unstubAllEnvs)` for env manipulation (ICR-136 lesson — raw `process.env.X =` assignment leaks across files).

**Preview QA (heavy)** — against the PR's Vercel preview:

- Trigger the server error and the client error; confirm both appear in Sentry tagged `environment=preview`.
- Confirm **zero CSP console violations** on both `es-AR` and `en-US` pages.
- Confirm `/monitoring` returns a Sentry tunnel response (not a locale redirect / 404).
- Confirm the build log shows either a successful source-map upload or the benign "no auth token" warning.

**Deferred to post-merge (not provable pre-merge):** AC3 (staging vs production as distinct Sentry environments) requires those deploys to exist. It needs no deliberate error — with tracing on, ordinary production page loads emit transactions tagged `environment=production`.

---

## 12. Implementation Checkpoints

**CP1 — Dependency + options factory (TDD)**
Files: `apps/web/package.json`, `src/utils/sentry/options.ts`, `src/utils/sentry/options.test.ts`
Verify: `pnpm test` — new tests visibly execute (assert the file name appears in vitest output); `pnpm type-check`.
Commit: `chore(ICR-117): add @sentry/nextjs and the shared Sentry options factory`

**CP2 — Runtime wiring**
Files: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/app/global-error.tsx`, `next.config.ts`, `src/proxy.ts`
Verify: `pnpm build` succeeds (Turbopack) and warns-not-fails without an auth token; `pnpm lint`; `pnpm type-check`.
Commit: `chore(ICR-117): initialize Sentry on server, edge, and client runtimes`

**CP3 — Env plumbing + docs**
Files: `src/types/environment.d.ts`, `.env.example`, `turbo.json`, `docs/architecture/observability-sentry.md`
Verify: `pnpm type-check`; `pnpm build`; confirm **no secret value** is written anywhere (names only).
Commit: `chore(ICR-117): document and type the Sentry env vars`

**CP4 — Temporary QA surface**
Files: `src/app/api/sentry-check/route.ts`, `src/app/[locale]/sentry-example/page.tsx`
Verify: full stack green; preview deploy reachable.
Commit: `chore(ICR-117): add temporary Sentry verification surface for preview QA`

**CP5 — Post-QA cleanup (runs AFTER QA passes, BEFORE PR-ready)**
Delete both CP4 files. Verify full stack green + the temp routes 404 on the redeployed preview.
Commit: `chore(ICR-117): remove temporary Sentry verification surface`

> **Flow deviation, deliberate:** CP5 lands _after_ the QA step rather than before it, because QA needs the CP4 surface alive to prove AC2. The QA evidence is captured against the CP4 commit; the merged PR ships without the surface.

---

## 13. Open Questions

1. **Preview DSN.** Vercel env vars were set for staging + production. If `NEXT_PUBLIC_SENTRY_DSN` is **not** also set on **Preview**, AC2 returns **BLOCKED (env-limited)** on preview QA — an expected PARTIAL, not a code defect (ICR-44 lesson) — and live verification defers to post-merge staging.
2. **Deferred production action.** Creating the Sentry project and wiring Vercel env vars across all three tiers is human-only. Per the standing rule this needs a Jira ticket — **check ICR-133 (the existing `deferred-prod-action` runbook) before filing a duplicate** (ICR-136 lesson).
3. **`global-error.tsx` localization** — deliberately not internationalized (Edge Case 6). Revisit only if it proves to be a visible user surface.
4. **Sentry free-tier quota** — prod tracing at 0.1 is a guess at a safe rate. Watch quota after the first production week and tune.
