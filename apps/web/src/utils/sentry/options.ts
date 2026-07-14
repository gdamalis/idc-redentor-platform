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

/**
 * Reads an env var and treats a blank or whitespace-only value as unset. Plain
 * `??` does not do this — it only falls through on null/undefined, not "" — and
 * `.env.example` ships every Sentry var blank, so a developer who copies it to
 * `.env.local` reaches the empty-string case for real, not hypothetically.
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

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
  // NEXT_PUBLIC_VERCEL_ENV (not VERCEL_ENV) is deliberately in this chain: VERCEL_ENV
  // is a server-only var — the browser's process.env shim only ever contains
  // NEXT_PUBLIC_* keys, so a browser bundle reading process.env.VERCEL_ENV always gets
  // undefined and silently falls through to "development". NEXT_PUBLIC_VERCEL_ENV is
  // Vercel's browser-readable mirror of the same value, so client and server agree on
  // preview/production. NEXT_PUBLIC_SENTRY_ENVIRONMENT still wins first: it's the only
  // way to distinguish the staging deploy (a Vercel custom environment whose
  // NEXT_PUBLIC_VERCEL_ENV is "preview", same as any PR preview) from an actual PR
  // preview. VERCEL_ENV stays as a last, server-only fallback for robustness.
  return (
    readEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT") ??
    readEnv("NEXT_PUBLIC_VERCEL_ENV") ??
    readEnv("VERCEL_ENV") ??
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
  const dsn = readEnv("NEXT_PUBLIC_SENTRY_DSN");
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
