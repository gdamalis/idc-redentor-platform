/**
 * ICR-223 — policy for the QA read-only database command (`yoke/qa-db-read@1`).
 *
 * Everything here is pure: the database/env/collection guards, the URI-variable
 * choice and the database-path check. Nothing connects until all of it passes.
 * See docs/architecture/qa-db-read.md.
 */

export const QA_DB_CONTRACT = "yoke/qa-db-read@1";

/** Mirrors `.claude/config.json` → `qa.env.<env>.dbNameAllow` (a test keeps them equal). */
export const DB_NAME_ALLOW = {
  preview: /^(website|ministry-admin)-(test|qa|e2e)$/,
  previewAdmin: /^(website|ministry-admin)-(staging|test|qa|e2e)$/,
  staging: /^(website|ministry-admin)-(staging|test|qa|e2e)$/,
  stagingAdmin: /^(website|ministry-admin)-(staging|test|qa|e2e)$/,
} as const;

export type QaDbEnv = keyof typeof DB_NAME_ALLOW;

/** Default-deny collection allowlist: current admin + website data and the planned content collections. */
export const COLLECTION_ALLOW: ReadonlySet<string> = new Set([
  "sections",
  "belief_collections",
  "event_banners",
  "posts",
  "sermons",
  "bible_verses",
  "authors",
  "topics",
  "seo_entries",
  "globals",
  "media",
  "content_audit",
  "content_pdf_jobs",
  "pdf_jobs",
  "likes",
  "contact",
  "broadcast_log",
  "roles",
  "rbacAudit",
  "users",
  "invites",
]);

export type Refusal = { ok: false; reason: string };
export type Allowed<T> = { ok: true; value: T };

const refuse = (reason: string): Refusal => ({ ok: false, reason });

export function resolveEnv(raw: unknown): Allowed<QaDbEnv> | Refusal {
  if (typeof raw !== "string" || !Object.hasOwn(DB_NAME_ALLOW, raw)) {
    return refuse(
      "YOKE_QA_DB_ENV must be one of preview, previewAdmin, staging, stagingAdmin",
    );
  }
  return { ok: true, value: raw as QaDbEnv };
}

/** Exact, anchored check. Rejects non-strings, prototype keys, case/space variants. */
export function checkDbName(
  env: QaDbEnv,
  name: unknown,
): Allowed<string> | Refusal {
  if (typeof name !== "string" || name.length === 0 || name.length > 64) {
    return refuse("a database name is required (--db)");
  }
  if (!DB_NAME_ALLOW[env].test(name)) {
    return refuse("database name is not on the allowlist for this environment");
  }
  return { ok: true, value: name };
}

export function checkCollection(name: unknown): Allowed<string> | Refusal {
  if (typeof name !== "string" || !COLLECTION_ALLOW.has(name)) {
    return refuse("collection is not on the allowlist");
  }
  return { ok: true, value: name };
}

/** `website-*` reads WEBSITE_MONGODB_URI, `ministry-admin-*` reads MONGODB_URI. No fallback. */
export function uriVariableFor(
  dbName: string,
): "WEBSITE_MONGODB_URI" | "MONGODB_URI" {
  return dbName.startsWith("website-") ? "WEBSITE_MONGODB_URI" : "MONGODB_URI";
}

/** The database path of a connection string, without ever parsing credentials into output. */
export function uriDbPath(uri: string): string | null | undefined {
  const match =
    /^mongodb(?:\+srv)?:\/\/([^/?\s]+)(?:\/([^?\s]*))?(?:\?[^\s]*)?$/.exec(uri);
  if (!match) return undefined; // not a valid mongodb URI
  const path = match[2] ?? "";
  if (path === "") return null; // no database path
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
}

/** A URI path, when present, must equal `--db`; when absent the explicit `--db` stands. Never `test`. */
export function checkUriPath(
  uri: string,
  dbName: string,
): Allowed<true> | Refusal {
  const path = uriDbPath(uri);
  if (path === undefined)
    return refuse("the connection string variable is missing or malformed");
  if (path !== null && path !== dbName) {
    return refuse("the connection string database path does not match --db");
  }
  return { ok: true, value: true };
}
