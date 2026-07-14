import { afterEach, describe, expect, it, vi } from "vitest";

import {
  baseSentryOptions,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
} from "./options";

// NOTE: `vi.stubEnv` mutates the real `process.env` at runtime, which is enough to
// exercise the blank/whitespace-normalization behavior below, but it CANNOT catch
// the PR #87 regression (a computed `process.env[name]` lookup silently failing to
// be inlined into the client bundle). That failure mode only exists in a bundled
// browser build — Next.js's client env-inlining is a static text-substitution pass
// at build time, invisible to a Node test runner reading the real process.env at
// runtime. The static-property-read requirement is a bundler constraint, guarded
// by the doc comment on `normalizeEnv` in options.ts, not by a test here.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSentryEnvironment", () => {
  it("prefers the explicit NEXT_PUBLIC_SENTRY_ENVIRONMENT override over NEXT_PUBLIC_VERCEL_ENV (staging beats preview)", () => {
    // This is the staging deploy's case: staging's NEXT_PUBLIC_VERCEL_ENV is "preview"
    // (it's a Vercel custom environment), so the explicit override is the ONLY thing
    // that can distinguish it from an actual PR preview. This must keep winning.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(resolveSentryEnvironment()).toBe("staging");
  });

  it("falls back to NEXT_PUBLIC_VERCEL_ENV when no override is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_ENV", undefined);

    expect(resolveSentryEnvironment()).toBe("preview");
  });

  it("prefers NEXT_PUBLIC_VERCEL_ENV over the server-only VERCEL_ENV, because the browser cannot read VERCEL_ENV", () => {
    // Distinct values so the assertion is unambiguous about which one won.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(resolveSentryEnvironment()).toBe("production");
  });

  it("falls back to the server-only VERCEL_ENV when both NEXT_PUBLIC_* vars are unset (server-side path)", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(resolveSentryEnvironment()).toBe("preview");
  });

  it("falls back to development when nothing is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);

    expect(resolveSentryEnvironment()).toBe("development");
  });

  // .env.example ships NEXT_PUBLIC_SENTRY_ENVIRONMENT= blank, so a developer who
  // copies it to .env.local reaches this exact case. `??` alone does not treat ""
  // as unset, so without normalization this would return "" instead of falling
  // through the chain.
  it("ignores a blank NEXT_PUBLIC_SENTRY_ENVIRONMENT override and falls through to NEXT_PUBLIC_VERCEL_ENV", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_ENV", undefined);

    expect(resolveSentryEnvironment()).toBe("preview");
  });

  it("ignores a whitespace-only NEXT_PUBLIC_SENTRY_ENVIRONMENT override and falls through", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "   ");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_ENV", undefined);

    expect(resolveSentryEnvironment()).toBe("preview");
  });

  // This is the actual user-visible harm: a blank override must not silently
  // degrade local dev's trace sampling from 1.0 to the conservative 0.1 fallback.
  it("with every relevant var blank or unset (the .env.example-copied-locally scenario), resolves to development at full trace sampling", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("VERCEL_ENV", undefined);

    const environment = resolveSentryEnvironment();

    expect(environment).toBe("development");
    expect(resolveTracesSampleRate(environment)).toBe(1);
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

  // .env.example ships NEXT_PUBLIC_SENTRY_DSN= blank. Boolean("") happens to be
  // false, so `enabled` is accidentally correct today, but passing dsn: "" into
  // Sentry.init is sloppy and depends on that accident — lock down that a blank
  // DSN normalizes to undefined, not "".
  it("normalizes a blank NEXT_PUBLIC_SENTRY_DSN to undefined and stays disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    const options = baseSentryOptions();

    expect(options.dsn).toBeUndefined();
    expect(options.enabled).toBe(false);
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
