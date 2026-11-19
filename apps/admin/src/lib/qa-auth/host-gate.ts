/**
 * ICR-222 — the host gate for the QA sign-in command.
 *
 * The harness already host-gates a base URL before it calls any auth verb
 * (`.claude/config.json` → `qa.env.<env>.baseUrlHostAllow` / `productionHostDeny`).
 * This is the command's own, independent copy of that rule, so a caller that
 * skipped the harness gate still cannot sign the QA account in to production.
 *
 * Exact per-env allowlist, default deny. Runs before any network call.
 * See docs/architecture/admin-qa-account.md.
 */

/**
 * Every production host the QA config denies, in any env. A unit test asserts
 * this list is a superset of every `qa.env.*.productionHostDeny` entry.
 */
export const PRODUCTION_HOST_DENY: readonly string[] = [
  "idcredentor.com",
  "www.idcredentor.com",
  "idcredentor.org",
  "www.idcredentor.org",
  "idc-redentor-website.vercel.app",
  "idc-redentor-web.vercel.app",
  "idc-redentor-admin.vercel.app",
  "ministerio.idcredentor.org",
];

/**
 * The admin project's per-deployment preview URL:
 * `<project>-<hash>-<team>.vercel.app`, where the hash is exactly 9 lowercase
 * base-36 characters (verified 2026-11-19 against the 30 most recent
 * `Preview – idc-redentor-admin` GitHub deployments). Deliberately NOT allowed:
 * branch aliases (`idc-redentor-admin-git-<branch>-divine-lab.vercel.app`),
 * which move with the branch — the harness resolves a unique deployment URL,
 * so it never needs one.
 */
const PREVIEW_HOST = /^idc-redentor-admin-[a-z0-9]{9}-divine-lab\.vercel\.app$/;

/**
 * The only hosts each QA env may sign in to. This gate is the SECOND layer:
 * the harness first proves the target is a preview of this repo
 * (`requirePreviewEnvironment`, from a GitHub Deployment), and a host pattern
 * is not proof of ownership on its own. Note: a production deployment's own
 * unique URL has the same shape as a preview's — the harness gate rejects
 * those, and production's separate Firebase project has no QA account, so it
 * refuses the sign-in even if one slipped through.
 * See docs/architecture/admin-qa-account.md § "The sign-in command".
 */
const ENV_HOST_RULES: Readonly<Record<string, (host: string) => boolean>> = {
  stagingAdmin: (host) => host === "staging.ministerio.idcredentor.org",
  previewAdmin: (host) => PREVIEW_HOST.test(host),
};

/**
 * The authority exactly as the caller wrote it. Compared with the parsed host
 * so that nothing the URL parser normalises away can pass: uppercase, a
 * trailing dot, percent-encoding, backslashes, userinfo or a port.
 */
function rawAuthority(baseUrl: string): string | null {
  return /^https:\/\/([^/?#]*)/.exec(baseUrl)?.[1] ?? null;
}

export type QaHostRefusal =
  | "bad-url"
  | "not-https"
  | "production-host"
  | "unknown-env"
  | "host-not-allowed";

export type QaHostResult =
  | { ok: true; origin: string }
  | { ok: false; reason: QaHostRefusal; message: string };

export function checkQaHost(
  baseUrl: string | undefined,
  envName: string | undefined,
): QaHostResult {
  let url: URL;
  try {
    url = new URL(baseUrl ?? "");
  } catch {
    return {
      ok: false,
      reason: "bad-url",
      message: "The base URL is missing or not a URL.",
    };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "not-https",
      message: "The base URL must use https.",
    };
  }
  if (url.port !== "" || url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reason: "bad-url",
      message: "The base URL must not carry a port or credentials.",
    };
  }

  const host = url.hostname;
  if (rawAuthority(baseUrl ?? "") !== host) {
    return {
      ok: false,
      reason: "bad-url",
      message:
        "The base URL's host must be written exactly as a plain lowercase hostname.",
    };
  }
  if (PRODUCTION_HOST_DENY.includes(host)) {
    return {
      ok: false,
      reason: "production-host",
      message: `Refusing a production host: ${host}.`,
    };
  }

  const rule = envName ? ENV_HOST_RULES[envName] : undefined;
  if (!rule) {
    return {
      ok: false,
      reason: "unknown-env",
      message: `No QA sign-in is allowed for env "${envName ?? ""}".`,
    };
  }
  if (!rule(host)) {
    return {
      ok: false,
      reason: "host-not-allowed",
      message: `Host ${host} is not allowed for env ${envName}.`,
    };
  }

  return { ok: true, origin: url.origin };
}
