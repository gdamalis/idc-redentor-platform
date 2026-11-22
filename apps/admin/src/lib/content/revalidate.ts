import type { CollectionName, ContentType } from "@idcr/content";

/**
 * Production website hostnames that MUST NEVER be targeted for revalidation
 * from any non-production deployment (`ICR-195` AC8, `H-reference-editor-lessons` #5).
 */
export const PRODUCTION_WEBSITE_HOSTS: readonly string[] = [
  "idcredentor.org",
  "www.idcredentor.org",
  "idcredentor.com",
  "www.idcredentor.com",
  "idc-redentor-web.vercel.app",
  "idc-redentor-website.vercel.app",
];

const LOCAL_DEV_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

export type RevalidateFailureReason =
  | "not-configured"
  | "misconfigured-url"
  | "production-host-blocked"
  | "http-error"
  | "network-error";

export type RevalidateConfigResult =
  | {
      readonly ok: true;
      readonly endpoint: string;
      readonly secret: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "not-configured"
        | "misconfigured-url"
        | "production-host-blocked";
    };

export type RevalidateWebsiteResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: RevalidateFailureReason;
      readonly status?: number;
    };

export interface RevalidatePayload {
  readonly type: ContentType;
  readonly id: string;
  readonly notify: boolean;
}

export type RevalidateEnv = Readonly<Record<string, string | undefined>>;

export interface RevalidateDeps {
  readonly env?: RevalidateEnv;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Global publish-email switch (isolated for Q3 modularity).
 *
 * Fails closed: OFF unless `CONTENT_PUBLISH_EMAILS` is explicitly `"true"`.
 */
export function isPublishEmailsEnabled(
  env: RevalidateEnv = process.env,
): boolean {
  return env.CONTENT_PUBLISH_EMAILS === "true";
}

/**
 * Computes whether a publish event may ask the public site to email
 * subscribers (`ICR-195` AC9):
 *   1. Global switch is ON
 *   2. Caller explicitly opted in (`notify: true`)
 *   3. Collection is `posts` or `sermons`
 *   4. This is the entry's FIRST publish (`firstPublishedAt === undefined`)
 */
export function shouldNotifySubscribers(input: {
  readonly collection: CollectionName;
  readonly isFirstPublish: boolean;
  readonly callerNotify: boolean;
  readonly isEmailSwitchEnabled: boolean;
}): boolean {
  return (
    input.isEmailSwitchEnabled &&
    input.callerNotify &&
    input.isFirstPublish &&
    (input.collection === "posts" || input.collection === "sermons")
  );
}

/**
 * True ONLY when running on Vercel's production target (`H` lesson 5: Vercel
 * staging reports `VERCEL_ENV="preview"` and `VERCEL_TARGET_ENV="staging"`).
 * Fails closed to `false` when unset.
 */
export function isProductionDeployment(
  env: RevalidateEnv = process.env,
): boolean {
  return env.VERCEL_TARGET_ENV === "production";
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

/**
 * Validates `WEBSITE_REVALIDATE_URL` + `WEBSITE_REVALIDATE_SECRET` with ZERO
 * fallback (never reads `NEXT_PUBLIC_WEBSITE_URL`). Refuses every production
 * website host whenever `VERCEL_TARGET_ENV !== "production"`.
 */
export function validateRevalidateConfig(
  env: RevalidateEnv = process.env,
): RevalidateConfigResult {
  const rawUrl = env.WEBSITE_REVALIDATE_URL?.trim();
  const secret = env.WEBSITE_REVALIDATE_SECRET?.trim();

  if (!rawUrl || !secret) {
    return { ok: false, reason: "not-configured" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "misconfigured-url" };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, reason: "misconfigured-url" };
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) {
    return { ok: false, reason: "misconfigured-url" };
  }

  const isProd = isProductionDeployment(env);

  if (parsed.protocol === "http:") {
    if (isProd || !LOCAL_DEV_HOSTS.includes(host)) {
      return { ok: false, reason: "misconfigured-url" };
    }
  } else if (parsed.protocol !== "https:") {
    return { ok: false, reason: "misconfigured-url" };
  }

  if (!isProd && PRODUCTION_WEBSITE_HOSTS.includes(host)) {
    return { ok: false, reason: "production-host-blocked" };
  }

  return {
    ok: true,
    endpoint: `${parsed.origin}/api/revalidate`,
    secret,
  };
}

/**
 * Triggers post-commit cache revalidation (and optional subscriber email
 * broadcast) on the public website.
 *
 * MUST be called strictly AFTER `withContentTransaction` commits — never inside
 * the transaction callback. Never throws and never logs the secret.
 */
export async function revalidateWebsite(
  payload: RevalidatePayload,
  deps: RevalidateDeps = {},
): Promise<RevalidateWebsiteResult> {
  const env = deps.env ?? process.env;
  const config = validateRevalidateConfig(env);
  if (!config.ok) {
    return config;
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  try {
    const response = await fetchFn(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-reval-key": config.secret,
      },
      body: JSON.stringify({
        type: payload.type,
        id: payload.id,
        notify: payload.notify,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { ok: false, reason: "http-error", status: response.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network-error" };
  }
}
