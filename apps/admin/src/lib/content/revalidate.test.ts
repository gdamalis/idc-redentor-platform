import { describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_WEBSITE_HOSTS,
  isPublishEmailsEnabled,
  revalidateWebsite,
  shouldNotifySubscribers,
  validateRevalidateConfig,
} from "./revalidate";

describe("validateRevalidateConfig (AC8)", () => {
  it("fails closed when WEBSITE_REVALIDATE_URL or WEBSITE_REVALIDATE_SECRET is unset (never falls back to NEXT_PUBLIC_WEBSITE_URL)", () => {
    expect(
      validateRevalidateConfig({
        NEXT_PUBLIC_WEBSITE_URL: "https://staging.idcredentor.org",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
      } as NodeJS.ProcessEnv),
    ).toEqual({ ok: false, reason: "not-configured" });

    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "https://staging.idcredentor.org",
      } as NodeJS.ProcessEnv),
    ).toEqual({ ok: false, reason: "not-configured" });
  });

  it.each(PRODUCTION_WEBSITE_HOSTS)(
    "refuses production host %s whenever VERCEL_TARGET_ENV !== 'production'",
    (host) => {
      for (const targetEnv of [undefined, "preview", "staging", "development"]) {
        const res = validateRevalidateConfig({
          WEBSITE_REVALIDATE_URL: `https://${host}`,
          WEBSITE_REVALIDATE_SECRET: "secret-val",
          VERCEL_ENV: "production", // Even if VERCEL_ENV is spoofed, VERCEL_TARGET_ENV governs
          VERCEL_TARGET_ENV: targetEnv,
        });
        expect(res).toEqual({ ok: false, reason: "production-host-blocked" });
      }
    },
  );

  it("blocks uppercase and trailing-dot production host bypass attempts in non-prod", () => {
    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "https://WWW.IDCREDENTOR.ORG.",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
        VERCEL_TARGET_ENV: "staging",
      } as NodeJS.ProcessEnv),
    ).toEqual({ ok: false, reason: "production-host-blocked" });
  });

  it("allows production hosts when VERCEL_TARGET_ENV === 'production'", () => {
    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "https://www.idcredentor.org",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
        VERCEL_TARGET_ENV: "production",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      ok: true,
      endpoint: "https://www.idcredentor.org/api/revalidate",
      secret: "secret-val",
    });
  });

  it("allows staging URL on non-production deployments and localhost http only in non-prod", () => {
    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "https://staging.idcredentor.org/",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
        VERCEL_TARGET_ENV: "staging",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      ok: true,
      endpoint: "https://staging.idcredentor.org/api/revalidate",
      secret: "secret-val",
    });

    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "http://localhost:3000",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      ok: true,
      endpoint: "http://localhost:3000/api/revalidate",
      secret: "secret-val",
    });

    expect(
      validateRevalidateConfig({
        WEBSITE_REVALIDATE_URL: "http://staging.idcredentor.org",
        WEBSITE_REVALIDATE_SECRET: "secret-val",
      } as NodeJS.ProcessEnv),
    ).toEqual({ ok: false, reason: "misconfigured-url" });
  });
});

describe("revalidateWebsite (AC7, AC8)", () => {
  it("POSTs { type, id, notify } with x-vercel-reval-key header on valid config", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const res = await revalidateWebsite(
      { type: "post", id: "abc", notify: false },
      {
        env: {
          WEBSITE_REVALIDATE_URL: "https://staging.idcredentor.org",
          WEBSITE_REVALIDATE_SECRET: "reval-key-123",
          VERCEL_TARGET_ENV: "staging",
        } as NodeJS.ProcessEnv,
        fetchFn: fetchFn as unknown as typeof fetch,
      },
    );

    expect(res).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://staging.idcredentor.org/api/revalidate");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-vercel-reval-key": "reval-key-123",
    });
    expect(JSON.parse(init.body)).toEqual({
      type: "post",
      id: "abc",
      notify: false,
    });
  });

  it("never calls fetch when blocked by production host guard or missing config", async () => {
    const fetchFn = vi.fn();

    const blocked = await revalidateWebsite(
      { type: "sermon", id: "s1", notify: false },
      {
        env: {
          WEBSITE_REVALIDATE_URL: "https://www.idcredentor.org",
          WEBSITE_REVALIDATE_SECRET: "reval-key-123",
          VERCEL_TARGET_ENV: "staging",
        } as NodeJS.ProcessEnv,
        fetchFn: fetchFn as unknown as typeof fetch,
      },
    );
    expect(blocked).toEqual({ ok: false, reason: "production-host-blocked" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns structured failure without throwing on non-2xx or network error", async () => {
    const env = {
      WEBSITE_REVALIDATE_URL: "https://staging.idcredentor.org",
      WEBSITE_REVALIDATE_SECRET: "reval-key-123",
      VERCEL_TARGET_ENV: "staging",
    } as NodeJS.ProcessEnv;

    const httpFail = await revalidateWebsite(
      { type: "post", id: "p1", notify: false },
      {
        env,
        fetchFn: vi
          .fn()
          .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch,
      },
    );
    expect(httpFail).toEqual({ ok: false, reason: "http-error", status: 503 });

    const netFail = await revalidateWebsite(
      { type: "post", id: "p1", notify: false },
      {
        env,
        fetchFn: vi
          .fn()
          .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch,
      },
    );
    expect(netFail).toEqual({ ok: false, reason: "network-error" });
  });
});

describe("isPublishEmailsEnabled & shouldNotifySubscribers (AC9)", () => {
  it("defaults off and enables ONLY on exact 'true'", () => {
    expect(isPublishEmailsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isPublishEmailsEnabled({
        CONTENT_PUBLISH_EMAILS: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isPublishEmailsEnabled({
        CONTENT_PUBLISH_EMAILS: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isPublishEmailsEnabled({
        CONTENT_PUBLISH_EMAILS: "TRUE",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isPublishEmailsEnabled({
        CONTENT_PUBLISH_EMAILS: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("returns true ONLY when switch is on + caller opted in + first publish + post or sermon", () => {
    expect(
      shouldNotifySubscribers({
        collection: "posts",
        isFirstPublish: true,
        callerNotify: true,
        isEmailSwitchEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldNotifySubscribers({
        collection: "sermons",
        isFirstPublish: true,
        callerNotify: true,
        isEmailSwitchEnabled: true,
      }),
    ).toBe(true);
    // Switch off
    expect(
      shouldNotifySubscribers({
        collection: "posts",
        isFirstPublish: true,
        callerNotify: true,
        isEmailSwitchEnabled: false,
      }),
    ).toBe(false);
    // Re-publish (not first publish)
    expect(
      shouldNotifySubscribers({
        collection: "sermons",
        isFirstPublish: false,
        callerNotify: true,
        isEmailSwitchEnabled: true,
      }),
    ).toBe(false);
    // Caller did not opt in
    expect(
      shouldNotifySubscribers({
        collection: "posts",
        isFirstPublish: true,
        callerNotify: false,
        isEmailSwitchEnabled: true,
      }),
    ).toBe(false);
    // Non-notifiable collection (topic, section, etc.)
    expect(
      shouldNotifySubscribers({
        collection: "topics",
        isFirstPublish: true,
        callerNotify: true,
        isEmailSwitchEnabled: true,
      }),
    ).toBe(false);
  });
});
