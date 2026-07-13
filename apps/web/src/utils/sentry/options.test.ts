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
