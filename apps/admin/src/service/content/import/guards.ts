import type { Locale, RichTextDoc } from "@idcr/content";
import type { BrokenLinkFinding } from "./types";

/**
 * Positive allowlist matching `apps/admin/src/service/database.service.ts` and
 * `apps/web/src/service/database.service.ts`.
 * Bare `website` is production; suffixed forms are staging/test/qa/e2e.
 */
const WEBSITE_DB_NAME_PATTERN = /^website(-(staging|test|qa|e2e))?$/;
const TEST_WEBSITE_DB_PATTERN = /^website-(test|qa|e2e)$/;

export function isAllowedWebsiteDbName(name: string | null | undefined): boolean {
  if (typeof name !== "string") return false;
  return WEBSITE_DB_NAME_PATTERN.test(name.trim());
}

export interface TargetDbGuardOptions {
  readonly allowProd?: boolean;
  readonly allowTestDb?: boolean;
}

export type TargetDbGuardResult =
  | { readonly ok: true; readonly dbName: string; readonly isProd: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * Fail-closed database target guard (`ICR-203` AC1):
 * 1. Refuses empty/whitespace names and anything outside `^website(-(staging|test|qa|e2e))?$`.
 * 2. Refuses bare production `"website"` unless `allowProd: true` (`--prod`).
 * 3. Allows `"website-staging"` by default; refuses `website-{test,qa,e2e}` unless
 *    `allowTestDb: true` or `allowProd: true`.
 */
export function validateImportTargetDb(
  rawName: string | null | undefined,
  options: TargetDbGuardOptions = {},
): TargetDbGuardResult {
  const dbName = (rawName ?? "").trim();
  if (!dbName) {
    return {
      ok: false,
      reason:
        "Refusing import: WEBSITE_MONGODB_URI resolved no database name (empty or whitespace).",
    };
  }

  if (!WEBSITE_DB_NAME_PATTERN.test(dbName)) {
    return {
      ok: false,
      reason: `Refusing import against database "${dbName}": must match positive website allowlist ${WEBSITE_DB_NAME_PATTERN}.`,
    };
  }

  if (dbName === "website") {
    if (!options.allowProd) {
      return {
        ok: false,
        reason:
          'Refusing import against production database "website" without explicit --prod flag.',
      };
    }
    return { ok: true, dbName, isProd: true };
  }

  if (TEST_WEBSITE_DB_PATTERN.test(dbName)) {
    if (!options.allowTestDb && !options.allowProd) {
      return {
        ok: false,
        reason: `Refusing import against non-staging database "${dbName}": default target is "website-staging" (pass --allow-test-db for QA/test databases).`,
      };
    }
    return { ok: true, dbName, isProd: false };
  }

  return { ok: true, dbName, isProd: false };
}

/**
 * Normalizes Contentful protocol-relative URLs (`//images.ctfassets.net/...`)
 * returned by CMA to `https://...` while leaving absolute URLs untouched.
 */
export function normalizeContentfulAssetUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

/**
 * Checks whether an `href` found inside imported rich text is a known broken link
 * (e.g. `https://idcredentor.com/.../privacy-policy` in `contactForm.agreementNote`,
 * where both the `.com` domain and `/privacy-policy` slug are wrong).
 * Content is preserved verbatim (content freeze); findings are listed in the report.
 */
export function diagnoseBrokenHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return "Empty href";

  if (trimmed.toLowerCase().startsWith("mailto:")) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    if (/\/privacy-policy(?:$|[/?#])/i.test(trimmed)) {
      return 'Points to non-existent "/privacy-policy" route (real slugs are "/privacidad" and "/privacy")';
    }
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const reasons: string[] = [];

    if (host === "idcredentor.com" || host === "www.idcredentor.com") {
      reasons.push(
        `Uses wrong domain "${host}" instead of "idcredentor.org"`,
      );
    }
    if (/\/privacy-policy(?:$|[/?#])/i.test(parsed.pathname)) {
      reasons.push(
        'Points to non-existent "/privacy-policy" route (real slugs are "/privacidad" and "/privacy")',
      );
    }

    return reasons.length > 0 ? reasons.join("; ") : null;
  } catch {
    return "Malformed URL";
  }
}

/**
 * Iteratively walks a converted TipTap `RichTextDoc` and flags any broken links
 * (without modifying the document).
 */
export function scanBrokenLinksInTipTap(
  doc: RichTextDoc | undefined,
  meta: {
    readonly sourceContentfulId: string;
    readonly contentType: string;
    readonly field: string;
    readonly locale: Locale;
  },
): BrokenLinkFinding[] {
  if (!doc || !Array.isArray(doc.content)) return [];
  const findings: BrokenLinkFinding[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [...doc.content];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;

    if (record.type === "text" && Array.isArray(record.marks)) {
      for (const mark of record.marks) {
        if (!mark || typeof mark !== "object") continue;
        const m = mark as { type?: unknown; attrs?: { href?: unknown } };
        if (m.type === "link" && typeof m.attrs?.href === "string") {
          const href = m.attrs.href;
          const reason = diagnoseBrokenHref(href);
          if (reason) {
            const key = `${href}|${reason}`;
            if (!seen.has(key)) {
              seen.add(key);
              findings.push({
                ...meta,
                href,
                reason,
              });
            }
          }
        }
      }
    }

    if (Array.isArray(record.content)) {
      for (const child of record.content) stack.push(child);
    }
  }

  return findings;
}
