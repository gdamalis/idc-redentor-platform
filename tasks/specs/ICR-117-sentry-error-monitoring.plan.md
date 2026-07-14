# ICR-117 — Sentry Error & Performance Monitoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@sentry/nextjs` into `apps/web` across the server, edge, and client runtimes with per-environment tagging, PII minimization, and a same-origin tunnel — so live-site failures stop being invisible.

**Architecture:** One pure options factory (`src/utils/sentry/options.ts`) is the single source of truth for DSN gating, environment resolution, sampling, and the PII posture. Three thin runtime entry points (`instrumentation.ts` → server/edge configs, `instrumentation-client.ts`) all call it. `withSentryConfig` wraps `withNextIntl` outermost in `next.config.ts` and generates a same-origin `/monitoring` tunnel, so the CSP is never touched.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2, `@sentry/nextjs` ^10.65.0, pnpm + Turborepo, Vitest, Vercel.

**Spec:** `tasks/specs/ICR-117-sentry-error-monitoring.md`

## Global Constraints

- **Package manager is `pnpm`.** Never `npm`/`yarn`. Install into the app: `pnpm --filter @idcr/web add @sentry/nextjs`.
- **Functional-first.** No `class` declarations. Model outcomes as return values. (Repo rule, `CLAUDE.md`.)
- **Prefer `interface` over `type`**; avoid enums (use const maps); prefer `??` over `||`.
- **Named exports** for components — EXCEPT where a framework demands a default export (`global-error.tsx`, `page.tsx`, `route.ts` handlers).
- **PII posture is LOCKED:** `sendDefaultPii: false` + `dataCollection: { userInfo: false, httpBodies: [] }`. Never relax.
- **Session Replay is NOT installed.** Never import `replayIntegration()`.
- **Never commit a secret value.** `SENTRY_AUTH_TOKEN` and the DSN value live only in Vercel/`.env.local`. Docs reference variable **names** only.
- **Commit format:** `chore(ICR-117): <description>`, header ≤ 100 chars. Never use `--no-verify`.
- **Absent DSN must be a clean no-op**, never a crash.
- Sampling: production `0.1`, staging/preview `0.5`, development `1.0`; unknown env falls back to `0.1` (conservative — protects free-tier quota). Error `sampleRate` is `1.0` everywhere.

---

## Task 1: Dependency + the Sentry options factory (TDD)

**Files:**

- Modify: `apps/web/package.json` (via pnpm — do not hand-edit)
- Create: `apps/web/src/utils/sentry/options.ts`
- Test: `apps/web/src/utils/sentry/options.test.ts`

**Interfaces:**

- Consumes: nothing (first task).
- Produces — every later task imports from `@src/utils/sentry/options`:
  - `resolveSentryEnvironment(): string`
  - `resolveTracesSampleRate(environment?: string): number`
  - `baseSentryOptions(): BaseSentryOptions`
  - `interface BaseSentryOptions`

- [ ] **Step 1: Install the SDK**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-117
pnpm --filter @idcr/web add @sentry/nextjs
```

Expected: `@sentry/nextjs` lands in `apps/web/package.json` **`dependencies`** (NOT devDependencies — it runs at app runtime; Vercel prunes devDeps in prod builds, the ICR-114 trap). Verify:

```bash
node -p "require('./apps/web/package.json').dependencies['@sentry/nextjs']"
```

- [ ] **Step 2: VERIFY `dataCollection` exists in the INSTALLED types — do not trust the docs**

This is a hard gate. `dataCollection` is a new v10 option taken from the docs. Because we pass options as a **typed variable** (not an object literal), TypeScript's excess-property check will NOT catch a wrong option name — a typo would silently leave PII collection ON while our tests happily assert our own object's shape. So confirm the real SDK accepts it:

```bash
grep -rn "dataCollection" node_modules/.pnpm/@sentry+core*/node_modules/@sentry/core/build/types/ | head -5
```

Expected: at least one hit declaring `dataCollection` on the init options type.

**If there are ZERO hits: STOP and report.** Do not invent the option. The fallback posture (same privacy outcome, different mechanism) is:

```ts
sendDefaultPii: false,
beforeSend(event) {
  if (event.request) {
    delete event.request.data;      // drop HTTP bodies
    delete event.request.cookies;
    delete event.request.headers;
  }
  delete event.user;                // drop user identity
  return event;
},
```

Report which mechanism the installed SDK actually supports before writing Step 3.

- [ ] **Step 3: Write the failing tests**

Create `apps/web/src/utils/sentry/options.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  baseSentryOptions,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
} from "./options";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSentryEnvironment", () => {
  it("prefers the explicit NEXT_PUBLIC_SENTRY_ENVIRONMENT override", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(resolveSentryEnvironment()).toBe("staging");
  });

  it("falls back to VERCEL_ENV when no override is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(resolveSentryEnvironment()).toBe("preview");
  });

  it("falls back to development when nothing is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);

    expect(resolveSentryEnvironment()).toBe("development");
  });
});

describe("resolveTracesSampleRate", () => {
  it("samples production conservatively", () => {
    expect(resolveTracesSampleRate("production")).toBe(0.1);
  });

  it("samples staging and preview at half", () => {
    expect(resolveTracesSampleRate("staging")).toBe(0.5);
    expect(resolveTracesSampleRate("preview")).toBe(0.5);
  });

  it("samples everything in development", () => {
    expect(resolveTracesSampleRate("development")).toBe(1);
  });

  it("falls back to the conservative rate for an unknown environment", () => {
    expect(resolveTracesSampleRate("qa-sandbox")).toBe(0.1);
  });
});

describe("baseSentryOptions", () => {
  it("is disabled when no DSN is configured, so an unset DSN is a no-op", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);

    const options = baseSentryOptions();

    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it("is enabled when a DSN is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1");

    const options = baseSentryOptions();

    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://abc@o1.ingest.sentry.io/1");
  });

  it("carries the environment and its matching trace sample rate", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "production");

    const options = baseSentryOptions();

    expect(options.environment).toBe("production");
    expect(options.tracesSampleRate).toBe(0.1);
  });

  it("reports every error", () => {
    expect(baseSentryOptions().sampleRate).toBe(1);
  });

  // SECURITY-CRITICAL: the contact form carries congregant name/email/message.
  // These assertions must fail loudly if anyone relaxes the PII posture.
  it("never sends default PII", () => {
    expect(baseSentryOptions().sendDefaultPii).toBe(false);
  });

  it("never collects user identity or HTTP request bodies", () => {
    const { dataCollection } = baseSentryOptions();

    expect(dataCollection.userInfo).toBe(false);
    expect(dataCollection.httpBodies).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests and verify they FAIL**

```bash
pnpm --filter @idcr/web test -- src/utils/sentry/options.test.ts
```

Expected: FAIL — `Failed to resolve import "./options"` (the module does not exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `apps/web/src/utils/sentry/options.ts`:

```ts
/**
 * Single source of truth for Sentry initialization across the server, edge, and
 * client runtimes. See docs/architecture/observability-sentry.md.
 */

const CONSERVATIVE_TRACES_SAMPLE_RATE = 0.1;

// Const map rather than an enum (repo convention).
const TRACES_SAMPLE_RATE_BY_ENVIRONMENT: Record<string, number> = {
  production: 0.1,
  staging: 0.5,
  preview: 0.5,
  development: 1,
};

export interface BaseSentryOptions {
  dsn: string | undefined;
  environment: string;
  /** False when no DSN is configured, which makes Sentry.init an inert no-op. */
  enabled: boolean;
  sendDefaultPii: false;
  dataCollection: { userInfo: false; httpBodies: [] };
  tracesSampleRate: number;
  sampleRate: number;
}

export function resolveSentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    "development"
  );
}

export function resolveTracesSampleRate(
  environment: string = resolveSentryEnvironment(),
): number {
  return (
    TRACES_SAMPLE_RATE_BY_ENVIRONMENT[environment] ??
    CONSERVATIVE_TRACES_SAMPLE_RATE
  );
}

export function baseSentryOptions(): BaseSentryOptions {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const environment = resolveSentryEnvironment();

  return {
    dsn,
    environment,
    enabled: Boolean(dsn),
    // The contact form carries congregant PII. Never ship request bodies or
    // user identity to a third-party processor as incidental error context.
    sendDefaultPii: false,
    dataCollection: { userInfo: false, httpBodies: [] },
    tracesSampleRate: resolveTracesSampleRate(environment),
    sampleRate: 1,
  };
}
```

- [ ] **Step 6: Run the tests and verify they PASS**

```bash
pnpm --filter @idcr/web test -- src/utils/sentry/options.test.ts
```

Expected: PASS, **and the filename `src/utils/sentry/options.test.ts` must appear in vitest's output**. If it says "No test files found", the include glob is not matching — do not proceed (the ICR-21 silently-skipped-test-dir trap).

- [ ] **Step 7: Full check + commit**

```bash
pnpm type-check && pnpm lint && pnpm test
git add apps/web/package.json apps/web/src/utils/sentry/ pnpm-lock.yaml
git commit -m "chore(ICR-117): add @sentry/nextjs and the shared Sentry options factory"
```

---

## Task 2: Runtime wiring (server, edge, client, error boundary, tunnel)

**Files:**

- Create: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/instrumentation-client.ts`
- Create: `apps/web/src/sentry.server.config.ts`
- Create: `apps/web/src/sentry.edge.config.ts`
- Create: `apps/web/src/app/global-error.tsx`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/src/proxy.ts:45-49`

**Interfaces:**

- Consumes: `baseSentryOptions()` from `@src/utils/sentry/options` (Task 1).
- Produces: a `/monitoring` tunnel route (generated by `withSentryConfig`) that Task 5's QA asserts is reachable and NOT locale-redirected.

- [ ] **Step 1: Create the server runtime config**

Create `apps/web/src/sentry.server.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@src/utils/sentry/options";

Sentry.init(baseSentryOptions());
```

- [ ] **Step 2: Create the edge runtime config**

Create `apps/web/src/sentry.edge.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@src/utils/sentry/options";

Sentry.init(baseSentryOptions());
```

- [ ] **Step 3: Create the instrumentation entry point**

Create `apps/web/src/instrumentation.ts`. The runtime-gated dynamic import is required — a static import would pull the Node SDK into the edge bundle.

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown by Server Components, route handlers, and the proxy.
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 4: Create the client instrumentation entry point**

Create `apps/web/src/instrumentation-client.ts`. This is the modern client entry — do NOT create the deprecated `sentry.client.config.ts`. Note there is **no `replayIntegration()`**: Session Replay is deliberately not installed.

```ts
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@src/utils/sentry/options";

Sentry.init(baseSentryOptions());

// Instruments client-side router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 5: Create the root error boundary**

Create `apps/web/src/app/global-error.tsx`. A default export is required by Next.js here (the repo's named-export rule yields to the framework contract). It is intentionally not internationalized — it only fires when the root layout itself has failed, i.e. when the i18n provider is unavailable.

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError's type requires a statusCode; the App Router does not expose
            one for root errors, so 0 renders the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Wrap next.config.ts**

Modify `apps/web/next.config.ts`. `withSentryConfig` must be **outermost**, wrapping the existing `withNextIntl(nextConfig)`. Keep `nextConfig` itself untouched.

Add the import at the top:

```ts
import { withSentryConfig } from "@sentry/nextjs";
```

Replace the final line `export default withNextIntl(nextConfig);` with:

```ts
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only log source-map upload noise in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Same-origin tunnel: browser events POST to /monitoring and the server
  // forwards them. Keeps the CSP untouched and dodges ad-blockers.
  // NOTE: /monitoring MUST stay excluded from the src/proxy.ts matcher.
  tunnelRoute: "/monitoring",
});
```

**Do NOT add `disableLogger` or `automaticVercelMonitors`** — both are deprecated as top-level options in the current SDK (moved under `webpack.*`, which likely no-ops under Turbopack anyway).

- [ ] **Step 7: Exclude the tunnel from the i18n proxy matcher**

Modify `apps/web/src/proxy.ts`. Without this, next-intl rewrites `/monitoring` to `/es-AR/monitoring` and **every browser event silently 404s**.

Replace the `config` export:

```ts
export const config = {
  matcher: [
    // `monitoring` is the Sentry tunnelRoute (next.config.ts) — it must never be
    // locale-rewritten, or all browser-side error reporting silently 404s.
    "/((?!_next|_vercel|api|trpc|monitoring).*)",
  ],
};
```

- [ ] **Step 8: Verify the build**

```bash
pnpm type-check && pnpm lint && pnpm build
```

Expected: **build SUCCEEDS.** Since no `SENTRY_AUTH_TOKEN` is set locally, expect a benign warning like `No auth token provided. Will not upload source maps.` — that is correct behavior, **not** a failure. If the build FAILS, do not paper over it; report the error.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/instrumentation.ts apps/web/src/instrumentation-client.ts \
        apps/web/src/sentry.server.config.ts apps/web/src/sentry.edge.config.ts \
        apps/web/src/app/global-error.tsx apps/web/next.config.ts apps/web/src/proxy.ts
git commit -m "chore(ICR-117): initialize Sentry on server, edge, and client runtimes"
```

---

## Task 3: Env plumbing + docs

**Files:**

- Modify: `apps/web/src/types/environment.d.ts`
- Modify: `apps/web/.env.example`
- Modify: `turbo.json:6-20`
- Create: `docs/architecture/observability-sentry.md`

**Interfaces:**

- Consumes: the env var names read by Task 1's `options.ts` and Task 2's `next.config.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Type the new env vars**

Modify `apps/web/src/types/environment.d.ts` — append inside the `ProcessEnv` interface, before the closing brace, matching the file's existing comment-grouped style. **All five are optional**: an absent DSN is a supported no-op, and the build-time vars are absent in CI.

```ts
    // Sentry (observability) — see docs/architecture/observability-sentry.md
    NEXT_PUBLIC_SENTRY_DSN?: string;
    NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
    SENTRY_ORG?: string;
    SENTRY_PROJECT?: string;
    SENTRY_AUTH_TOKEN?: string;
```

- [ ] **Step 2: Document the vars in .env.example**

Append to `apps/web/.env.example`. **Names and explanations only — never a real value.**

```bash
# --- Sentry (error & performance monitoring) ---
# Public ingest endpoint. Safe to expose (it is NEXT_PUBLIC_*). When UNSET, Sentry
# is completely inert — the app runs normally and sends nothing.
NEXT_PUBLIC_SENTRY_DSN=

# Overrides the Sentry environment tag. Resolution order:
#   NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "development"
# Set this to `staging` on the staging deploy only — staging is not a native
# Vercel environment, so VERCEL_ENV cannot distinguish it.
NEXT_PUBLIC_SENTRY_ENVIRONMENT=

# Build-time source-map upload only. Never read at runtime.
SENTRY_ORG=
SENTRY_PROJECT=

# SECRET. Build-time source-map upload only. Set in Vercel/CI, never committed.
# If absent the build still SUCCEEDS — it just skips the source-map upload.
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 3: Declare the vars in turbo.json**

Modify `turbo.json` — add to the `build.env` array. The root `pnpm build` runs `turbo run build`; undeclared vars can be filtered out of the task environment, which would silently no-op source-map upload. The Sentry SDK ships a dedicated Turborepo warning for exactly this case.

Add these entries to `tasks.build.env`:

```json
        "NEXT_PUBLIC_SENTRY_DSN",
        "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
        "SENTRY_ORG",
        "SENTRY_PROJECT",
        "SENTRY_AUTH_TOKEN",
        "CI"
```

Validate the JSON parses:

```bash
node -e "console.log(JSON.stringify(require('./turbo.json').tasks.build.env, null, 1))"
```

- [ ] **Step 4: Write the architecture doc**

Create `docs/architecture/observability-sentry.md` covering, in prose:

- **What Sentry is wired to**: server + edge + client runtimes in `apps/web`, one Sentry project split by environment tag.
- **The options factory** (`src/utils/sentry/options.ts`) as the single source of truth; the three runtime entry points are deliberately thin.
- **Environment resolution**: `NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "development"`, and **why** staging needs the explicit override (staging is not a native Vercel env — it is a separate deploy at `staging.idcredentor.org`).
- **Sampling**: prod 0.1 / staging+preview 0.5 / dev 1.0, unknown → 0.1; rationale is free-tier quota.
- **The PII posture** (`sendDefaultPii: false` + `dataCollection`), and **why**: the contact form carries congregant name/email/message; Sentry is a third-party processor. Cross-reference `docs/architecture/forms-and-email.md`.
- **The tunnel**: `tunnelRoute: "/monitoring"` is same-origin, so the CSP in `config/securityHeaders.js` needs **no** Sentry entry. **Explicitly warn** that `/monitoring` must stay excluded from the `src/proxy.ts` matcher, and that dropping the tunnel would require adding `*.sentry.io` to `connect-src`.
- **Session Replay is intentionally absent** (bundle size + privacy); enabling it later would require `worker-src 'self' blob:` in the CSP.
- **Source maps**: uploaded via `SENTRY_AUTH_TOKEN` at build; **absent token warns and skips, never fails the build** — which is why CI stays green.
- **Env var table** (names only) and which Vercel tier each is set on.

Add a pointer comment in `src/utils/sentry/options.ts` (already included in Task 1's code: `See docs/architecture/observability-sentry.md`).

- [ ] **Step 5: Confirm no secret leaked, then verify + commit**

```bash
# Must return NO real values — names/placeholders only.
grep -rnE "SENTRY_(AUTH_TOKEN|DSN)\s*=\s*\S+" apps/web/.env.example docs/ || echo "clean: no secret values committed"
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add apps/web/src/types/environment.d.ts apps/web/.env.example turbo.json docs/architecture/observability-sentry.md
git commit -m "chore(ICR-117): document and type the Sentry env vars"
```

---

## Task 4: Temporary verification surface (for preview QA only)

> **This code is DELETED in Task 5.** It exists solely so preview QA can prove AC2 (a real server error and a real client error land in Sentry, tagged `environment=preview`). Nothing here ships to production.

**Files:**

- Create: `apps/web/src/app/api/sentry-check/route.ts` (temporary)
- Create: `apps/web/src/app/[locale]/sentry-example/page.tsx` (temporary)

**Interfaces:**

- Consumes: the Sentry runtime from Task 2.
- Produces: two URLs QA drives — `/api/sentry-check` and `/{locale}/sentry-example`.

- [ ] **Step 1: Create the server-error route**

Create `apps/web/src/app/api/sentry-check/route.ts`:

```ts
// TEMPORARY (ICR-117): proves a server-side error reaches Sentry from the Vercel
// preview. Removed before merge — see the plan's Task 5.
export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error("ICR-117 Sentry verification: deliberate server error");
}
```

- [ ] **Step 2: Create the client-error page**

Create `apps/web/src/app/[locale]/sentry-example/page.tsx`:

```tsx
"use client";

// TEMPORARY (ICR-117): proves a browser-side error reaches Sentry through the
// /monitoring tunnel. Removed before merge — see the plan's Task 5.
export default function SentryExamplePage() {
  return (
    <main style={{ padding: "4rem", display: "grid", gap: "1rem" }}>
      <h1>ICR-117 Sentry verification</h1>
      <button
        type="button"
        onClick={() => {
          throw new Error(
            "ICR-117 Sentry verification: deliberate client error",
          );
        }}
      >
        Throw client error
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git add apps/web/src/app/api/sentry-check/route.ts apps/web/src/app/[locale]/sentry-example/page.tsx
git commit -m "chore(ICR-117): add temporary Sentry verification surface for preview QA"
```

---

## Task 5: Post-QA cleanup — remove the temporary surface

> **ORDERING (deliberate):** this task runs **after** the QA step has captured its evidence and **before** the PR is marked ready. QA needs the Task 4 surface alive to prove AC2; the merged PR must not ship it.
>
> **Do not run this task early.** If QA has not yet produced its evidence bundle, stop.

**Files:**

- Delete: `apps/web/src/app/api/sentry-check/route.ts`
- Delete: `apps/web/src/app/[locale]/sentry-example/page.tsx`

- [ ] **Step 1: Delete both files**

```bash
git rm apps/web/src/app/api/sentry-check/route.ts
git rm apps/web/src/app/\[locale\]/sentry-example/page.tsx
```

- [ ] **Step 2: Confirm nothing still references them**

```bash
grep -rn "sentry-check\|sentry-example" apps/web/src docs/ || echo "clean: no dangling references"
```

Expected: `clean: no dangling references`.

- [ ] **Step 3: Full verify + commit**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
git commit -m "chore(ICR-117): remove temporary Sentry verification surface"
```

- [ ] **Step 4: After the preview redeploys, confirm both routes are gone**

`/api/sentry-check` and `/{locale}/sentry-example` must both return **404** on the redeployed preview.

---

## Coverage check (plan ↔ spec)

| Spec requirement                                | Task                                        |
| ----------------------------------------------- | ------------------------------------------- |
| 1. Install `@sentry/nextjs` as a dependency     | 1                                           |
| 2. Init on server + edge + client               | 2                                           |
| 3. Dynamic environment resolution               | 1                                           |
| 4. Per-environment sampling                     | 1                                           |
| 5. Absent DSN is a clean no-op                  | 1                                           |
| 6. PII minimization                             | 1 (+ hard verification gate, Task 1 Step 2) |
| 7. No Session Replay                            | 2 (never imported)                          |
| 8. `/monitoring` tunnel, CSP untouched          | 2                                           |
| 9. Proxy matcher excludes the tunnel            | 2                                           |
| 10. `withSentryConfig` wraps outermost          | 2                                           |
| 11. Source maps; CI green without a token       | 2 (verify) + 3 (document)                   |
| 12. Env vars typed + documented + in turbo.json | 3                                           |
| 13. `docs/architecture/observability-sentry.md` | 3                                           |
| 14. Temporary QA surface, deleted before merge  | 4 + 5                                       |
