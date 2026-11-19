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
 * The only hosts each QA env may sign in to. Previews are the admin project's
 * per-deployment URLs (`idc-redentor-admin-<hash>-divine-lab.vercel.app`);
 * staging is one fixed host. Note: a production deployment's own unique URL
 * has the same shape as a preview's — the harness's `requirePreviewEnvironment`
 * gate rejects those, and production holds no invite or user for the QA
 * account, so it answers `403 no-invite` even if one slipped through.
 */
const ENV_HOST_RULES: Readonly<Record<string, (host: string) => boolean>> = {
  stagingAdmin: (host) => host === "staging.ministerio.idcredentor.org",
  previewAdmin: (host) => /^idc-redentor-admin-[a-z0-9]+-divine-lab\.vercel\.app$/.test(host),
};

export type QaHostRefusal = "bad-url" | "not-https" | "production-host" | "unknown-env" | "host-not-allowed";

export type QaHostResult = { ok: true; origin: string } | { ok: false; reason: QaHostRefusal; message: string };

export function checkQaHost(baseUrl: string | undefined, envName: string | undefined): QaHostResult {
  let url: URL;
  try {
    url = new URL(baseUrl ?? "");
  } catch {
    return { ok: false, reason: "bad-url", message: "The base URL is missing or not a URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "not-https", message: "The base URL must use https." };
  }
  if (url.port !== "" || url.username !== "" || url.password !== "") {
    return { ok: false, reason: "bad-url", message: "The base URL must not carry a port or credentials." };
  }

  const host = url.hostname;
  if (PRODUCTION_HOST_DENY.includes(host)) {
    return { ok: false, reason: "production-host", message: `Refusing a production host: ${host}.` };
  }

  const rule = envName ? ENV_HOST_RULES[envName] : undefined;
  if (!rule) {
    return { ok: false, reason: "unknown-env", message: `No QA sign-in is allowed for env "${envName ?? ""}".` };
  }
  if (!rule(host)) {
    return { ok: false, reason: "host-not-allowed", message: `Host ${host} is not allowed for env ${envName}.` };
  }

  return { ok: true, origin: url.origin };
}
