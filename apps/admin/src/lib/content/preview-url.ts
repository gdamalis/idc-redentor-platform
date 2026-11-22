import {
  SITE_PAGES,
  findFixedEntry,
  isValidSlug,
  type FixedEntryType,
  type Locale,
} from "@idcr/content";
import {
  PREVIEW_LINK_TTL_SECONDS,
  isValidPreviewPath,
  signPreviewLink,
} from "@idcr/content/preview";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { COLLECTION_META, isFixedCollection } from "@src/lib/content/guards";
import {
  PRODUCTION_WEBSITE_HOSTS,
  isProductionDeployment,
  type RevalidateEnv,
} from "@src/lib/content/revalidate";
import { collectionSupportsPreview } from "@src/lib/content/routes";

const LOCAL_DEV_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];

export type PreviewConfigFailureReason =
  | "not-configured"
  | "misconfigured-url"
  | "production-host-blocked";

export type PreviewConfigResult =
  | { readonly ok: true; readonly origin: string; readonly secret: string }
  | { readonly ok: false; readonly reason: PreviewConfigFailureReason };

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

/**
 * Validates server-only preview configuration (`ICR-197` AC7 & Q2):
 * - Reads `CONTENT_PREVIEW_SECRET` and `WEBSITE_PREVIEW_URL || WEBSITE_REVALIDATE_URL`.
 * - NEVER reads `NEXT_PUBLIC_WEBSITE_URL`.
 * - Blocks all 6 `PRODUCTION_WEBSITE_HOSTS` whenever `VERCEL_TARGET_ENV !== "production"`.
 */
export function validatePreviewConfig(
  env: RevalidateEnv = process.env,
): PreviewConfigResult {
  const secret = env.CONTENT_PREVIEW_SECRET?.trim();
  const rawUrl =
    env.WEBSITE_PREVIEW_URL?.trim() || env.WEBSITE_REVALIDATE_URL?.trim();

  if (!secret || !rawUrl) {
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

  return { ok: true, origin: parsed.origin, secret };
}

export type ResolvePreviewPathResult =
  | { readonly ok: true; readonly path: string }
  | {
      readonly ok: false;
      readonly reason:
        | "unsupported-collection"
        | "unregistered-fixed-entry"
        | "missing-slug"
        | "invalid-path";
    };

/**
 * Resolves the exact public-site route path for an entry & locale (`F` §2.11).
 */
export function resolveEntryPreviewPath(
  collection: ContentCollectionName,
  snapshot: Record<string, unknown>,
  locale: Locale,
): ResolvePreviewPathResult {
  if (!collectionSupportsPreview(collection)) {
    return { ok: false, reason: "unsupported-collection" };
  }

  let candidate: string | null = null;

  if (isFixedCollection(collection)) {
    const machineName = snapshot.machineName;
    if (typeof machineName !== "string") {
      return { ok: false, reason: "unregistered-fixed-entry" };
    }
    const fixedMeta = findFixedEntry(
      COLLECTION_META[collection].contentType as FixedEntryType,
      machineName,
    );
    if (!fixedMeta) {
      return { ok: false, reason: "unregistered-fixed-entry" };
    }
    const pagePath = SITE_PAGES[fixedMeta.previewPage].path;
    candidate = `/${locale}${pagePath}`;
  } else if (collection === "posts") {
    const slug = snapshot.slug;
    if (typeof slug !== "string" || !isValidSlug(slug)) {
      return { ok: false, reason: "missing-slug" };
    }
    candidate = `/${locale}/blog/${slug}`;
  } else if (collection === "sermons") {
    const slug = snapshot.slug;
    if (typeof slug !== "string" || !isValidSlug(slug)) {
      return { ok: false, reason: "missing-slug" };
    }
    candidate = `/${locale}/predicas/${slug}`;
  } else if (collection === "topics") {
    const slugMap = snapshot.slug as Record<string, unknown> | undefined;
    const localizedSlug = slugMap?.[locale];
    if (typeof localizedSlug !== "string" || !isValidSlug(localizedSlug)) {
      return { ok: false, reason: "missing-slug" };
    }
    candidate = `/${locale}/${localizedSlug}`;
  }

  if (!candidate || !isValidPreviewPath(candidate)) {
    return { ok: false, reason: "invalid-path" };
  }

  return { ok: true, path: candidate };
}

/**
 * Mints a 60-second HMAC-SHA256 signed URL targeting `<origin>/api/preview`
 * using `@idcr/content/preview` (`ICR-201`). Never embeds the secret in the URL.
 */
export function buildSignedPreviewRedirectUrl(input: {
  readonly origin: string;
  readonly path: string;
  readonly secret: string;
  readonly nowSeconds?: number;
}): string {
  const signed = signPreviewLink({
    path: input.path,
    secret: input.secret,
    nowSeconds: input.nowSeconds,
    ttlSeconds: PREVIEW_LINK_TTL_SECONDS,
  });

  const url = new URL("/api/preview", input.origin);
  url.searchParams.set("path", signed.path);
  url.searchParams.set("exp", signed.exp);
  url.searchParams.set("sig", signed.sig);
  return url.toString();
}
