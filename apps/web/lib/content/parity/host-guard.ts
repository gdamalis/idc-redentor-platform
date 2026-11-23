/**
 * Production host deny list matching `.claude/config.json` `qa.env.*.productionHostDeny`.
 * The parity harness MUST NEVER request any page from a production host (`ICR-203` AC7/AC8).
 */
export const PRODUCTION_HOST_DENY_LIST: readonly string[] = [
  "idcredentor.com",
  "www.idcredentor.com",
  "idcredentor.org",
  "www.idcredentor.org",
  "idc-redentor-website.vercel.app",
  "idc-redentor-web.vercel.app",
  "idc-redentor-admin.vercel.app",
  "ministerio.idcredentor.org",
];

const DENIED_HOST_SET = new Set(
  PRODUCTION_HOST_DENY_LIST.map((h) => h.toLowerCase()),
);

export type HostGuardResult =
  | { readonly ok: true; readonly normalizedBaseUrl: string; readonly host: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Validates a parity target base URL and hard-denies every production host.
 * Rejects non-HTTP(S) schemes, embedded credentials, and any hostname on the
 * production deny list (case-insensitive, stripping trailing dots).
 */
export function validateParityBaseUrl(rawUrl: string): HostGuardResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, reason: "Base URL must not be empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: `Invalid URL: "${trimmed}"` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: `Refusing non-HTTP(S) protocol "${parsed.protocol}" on "${trimmed}"`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "Refusing base URL with embedded credentials",
    };
  }

  const normalizedHost = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (DENIED_HOST_SET.has(normalizedHost)) {
    return {
      ok: false,
      reason: `Refusing production host "${normalizedHost}": parity harness is forbidden from requesting production hosts by repo QA policy.`,
    };
  }

  const normalizedBaseUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  return {
    ok: true,
    normalizedBaseUrl,
    host: normalizedHost,
  };
}

export function assertSafeParityBaseUrl(rawUrl: string): string {
  const res = validateParityBaseUrl(rawUrl);
  if (!res.ok) {
    throw new Error(res.reason);
  }
  return res.normalizedBaseUrl;
}
