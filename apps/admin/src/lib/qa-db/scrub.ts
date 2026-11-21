/**
 * ICR-223 — output scrubber for the QA read-only command.
 *
 * Every document is walked before it is printed: denylisted fields are replaced by
 * "[masked]", and every string — values AND keys — gets a pattern pass for emails,
 * connection strings and tokens. The same pass runs over diagnostics.
 */

export const MASK = "[masked]";

const PII_KEY =
  /(e-?mail|password|passwd|token|secret|api-?key|cookie|phone|telefono|tel$|address|direccion|first-?name|last-?name|full-?name|display-?name|nombre|apellido|birth|dob$|^notes?$|uid$|^ip|ip-?address)/i;

/** `name` is masked on identity data and after any $lookup, except test identities ("QA "). */
export const NAME_SAFE_COLLECTIONS: ReadonlySet<string> = new Set([
  "roles",
  "rbacAudit",
  "topics",
  "event_banners",
  "sections",
  "belief_collections",
  "seo_entries",
  "globals",
  "media",
  "content_audit",
  "pdf_jobs",
  "bible_verses",
  "posts",
  "sermons",
  "broadcast_log",
  "likes",
  "contact",
]);

const PATTERNS: readonly RegExp[] = [
  /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
  /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
];

export function scrubString(input: string): string {
  let out = input;
  for (const pattern of PATTERNS) out = out.replace(pattern, MASK);
  return out;
}

export interface ScrubContext {
  collection: string;
  hasLookup: boolean;
}

export interface ScrubResult {
  docs: unknown[];
  masked: string[];
}

const SKIP_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function normalise(value: unknown): unknown {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof value === "object") {
    const maybe = value as { toHexString?: unknown; _bsontype?: unknown };
    if (typeof maybe.toHexString === "function")
      return (maybe.toHexString as () => string)();
    if (typeof maybe._bsontype === "string") return MASK; // Binary, Decimal128, etc.
  }
  return value;
}

export function scrubDocuments(
  docs: readonly unknown[],
  context: ScrubContext,
): ScrubResult {
  const masked = new Set<string>();
  const nameMasked =
    context.hasLookup || !NAME_SAFE_COLLECTIONS.has(context.collection);

  const walk = (raw: unknown, depth: number): unknown => {
    const value = normalise(raw);
    if (typeof value === "string") return scrubString(value);
    if (value === null || typeof value !== "object") return value;
    if (depth > 12) return MASK;
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SKIP_KEYS.has(key)) continue;
      const safeKey = scrubString(key);
      const isQaName =
        key === "name" && typeof child === "string" && child.startsWith("QA ");
      const hide =
        PII_KEY.test(key) || (key === "name" && nameMasked && !isQaName);
      if (hide) {
        masked.add(safeKey);
        out[safeKey] = MASK;
      } else {
        out[safeKey] = walk(child, depth + 1);
      }
    }
    return out;
  };

  return { docs: docs.map((doc) => walk(doc, 0)), masked: [...masked].sort() };
}
