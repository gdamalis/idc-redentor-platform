import { createHmac, timingSafeEqual } from "node:crypto";
import { LOCALES, type Locale } from "../model/localized";
import { isValidSlug } from "../natural-keys";
import { SITE_PAGE_SLUGS } from "../registries/pages";

/** Maximum lifetime (seconds) for signed Draft Mode preview links (`ICR-201`, `ICR-197`). */
export const PREVIEW_LINK_TTL_SECONDS = 60;

const MAX_PREVIEW_PATH_LENGTH = 512;
const STATIC_SUBPAGE_SLUGS: ReadonlySet<string> = new Set(
  SITE_PAGE_SLUGS.filter((slug) => slug !== "home"),
);
const VALID_LOCALE_SET: ReadonlySet<string> = new Set(LOCALES);
const EXP_PATTERN = /^\d{1,12}$/;

export type PreviewRouteMatch =
  | { readonly kind: "static"; readonly locale: Locale; readonly path: string }
  | {
      readonly kind: "blog";
      readonly locale: Locale;
      readonly slug: string;
      readonly path: string;
    }
  | {
      readonly kind: "sermon";
      readonly locale: Locale;
      readonly slug: string;
      readonly path: string;
    }
  | {
      readonly kind: "topic";
      readonly locale: Locale;
      readonly slug: string;
      readonly path: string;
    };

export interface SignedPreviewParams {
  readonly path: string;
  readonly exp: string;
  readonly sig: string;
}

export type VerifyPreviewFailureReason =
  | "secret-not-configured"
  | "missing-params"
  | "invalid-path"
  | "invalid-exp"
  | "invalid-signature"
  | "expired"
  | "exp-too-far";

export type VerifyPreviewResult =
  | {
      readonly ok: true;
      readonly path: string;
      readonly locale: Locale;
      readonly exp: number;
      readonly route: PreviewRouteMatch;
    }
  | { readonly ok: false; readonly reason: VerifyPreviewFailureReason };

/**
 * Classifies a candidate preview/exit redirect path against the public site's exact route
 * patterns, returning `null` for anything off-site, malformed, or outside the site's routes.
 *
 * Static sub-pages (`/blog`, `/predicas`, `/community`, `/come-meet-us`, `/who-is-jesus`) are
 * matched BEFORE the single-segment `[topic]` pattern so index routes are never misclassified.
 */
export function classifyPreviewPath(path: string): PreviewRouteMatch | null {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > MAX_PREVIEW_PATH_LENGTH
  ) {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    /[\s\x00-\x1f\x7f]/.test(path)
  ) {
    return null;
  }

  const segments = path.slice(1).split("/");
  const [localeSegment, ...rest] = segments;
  if (!localeSegment || !VALID_LOCALE_SET.has(localeSegment)) return null;
  const locale = localeSegment as Locale;

  if (rest.length === 0) {
    return { kind: "static", locale, path };
  }

  if (rest.length === 1) {
    const seg = rest[0]!;
    if (seg === "" || seg === "home") return null;
    if (STATIC_SUBPAGE_SLUGS.has(seg)) {
      return { kind: "static", locale, path };
    }
    if (isValidSlug(seg)) {
      return { kind: "topic", locale, slug: seg, path };
    }
    return null;
  }

  if (rest.length === 2) {
    const [section, slug] = rest as [string, string];
    if (!isValidSlug(slug)) return null;
    if (section === "blog") {
      return { kind: "blog", locale, slug, path };
    }
    if (section === "predicas") {
      return { kind: "sermon", locale, slug, path };
    }
    return null;
  }

  return null;
}

export function isValidPreviewPath(path: string): boolean {
  return classifyPreviewPath(path) !== null;
}

export function extractLocaleFromPreviewPath(path: string): Locale | null {
  return classifyPreviewPath(path)?.locale ?? null;
}

function computeSignature(path: string, exp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${path}\n${exp}`, "utf8")
    .digest("base64url");
}

/**
 * Mints short-lived HMAC-SHA256 query parameters for `GET /api/preview` (used by admin `ICR-197`).
 */
export function signPreviewLink(input: {
  readonly path: string;
  readonly secret: string;
  readonly nowSeconds?: number;
  readonly ttlSeconds?: number;
}): SignedPreviewParams {
  const { path, secret } = input;
  if (!secret || secret.trim().length === 0) {
    throw new Error("signPreviewLink: secret is required");
  }
  if (!isValidPreviewPath(path)) {
    throw new Error(`signPreviewLink: invalid preview path "${path}"`);
  }
  const ttl = input.ttlSeconds ?? PREVIEW_LINK_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > PREVIEW_LINK_TTL_SECONDS) {
    throw new RangeError(
      `signPreviewLink: ttlSeconds must be an integer between 1 and ${PREVIEW_LINK_TTL_SECONDS}`,
    );
  }
  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  const exp = String(now + ttl);
  const sig = computeSignature(path, exp, secret);
  return { path, exp, sig };
}

/**
 * Verifies a signed preview link (used by web `GET /api/preview` in `ICR-201`).
 * Fails closed when `secret` is unset/blank, uses `timingSafeEqual`, requires `exp` strictly in
 * the future and within `maxTtlSeconds` (default 60s), and validates `path` against site routes.
 */
export function verifyPreviewLink(input: {
  readonly path: string | null | undefined;
  readonly exp: string | null | undefined;
  readonly sig: string | null | undefined;
  readonly secret: string | undefined;
  readonly nowSeconds?: number;
  readonly maxTtlSeconds?: number;
}): VerifyPreviewResult {
  const { path, exp, sig, secret } = input;
  if (!secret || secret.trim().length === 0) {
    return { ok: false, reason: "secret-not-configured" };
  }
  if (!path || !exp || !sig) {
    return { ok: false, reason: "missing-params" };
  }

  const route = classifyPreviewPath(path);
  if (!route) {
    return { ok: false, reason: "invalid-path" };
  }

  if (!EXP_PATTERN.test(exp)) {
    return { ok: false, reason: "invalid-exp" };
  }
  const expNum = Number(exp);
  if (!Number.isSafeInteger(expNum)) {
    return { ok: false, reason: "invalid-exp" };
  }

  const expected = computeSignature(path, exp, secret);
  const candidateBytes = Buffer.from(sig, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    candidateBytes.length !== expectedBytes.length ||
    !timingSafeEqual(candidateBytes, expectedBytes)
  ) {
    return { ok: false, reason: "invalid-signature" };
  }

  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  const maxTtl = input.maxTtlSeconds ?? PREVIEW_LINK_TTL_SECONDS;
  if (expNum <= now) {
    return { ok: false, reason: "expired" };
  }
  if (expNum > now + maxTtl) {
    return { ok: false, reason: "exp-too-far" };
  }

  return { ok: true, path: route.path, locale: route.locale, exp: expNum, route };
}
