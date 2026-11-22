# ICR-201 — Web Read Layer: `lib/content` Getters with Getter-Shape Parity (Dormant)

> **Status:** Approved (PM gate resolved; sole Wave 1 write owner of `packages/content/`).
> **Branch:** `feat/ICR-201-web-content-read-layer` · **QA Depth:** `standard`
> **Sensitive Areas:** `likes-mongo` (read path), `auth` (HMAC-SHA256 preview gate + open-redirect guard), `env-secrets` (`CONTENT_PREVIEW_SECRET` by name only), `i18n-messages` (`preview.{banner,exit,staging}`).

## Summary

Implement a dormant MongoDB read layer in `apps/web/lib/content/` providing deep-equal getter-shape parity with every Contentful reader in `apps/web/lib/contentful/` (with TipTap `RichTextView` for rich-text fields), plus shared `@idcr/content` view/preview contracts, site-side HMAC preview enable/exit handlers, draft `no-store`/`noindex` headers, and a dormant `PreviewBanner` component.

## Key Requirements

1. **19 readers + `mapContentCollection` + `revalidateSiteContent`** in `apps/web/lib/content/` with explicit exported `*View` return types (zero inferred `any`).
2. **Shared contracts in `@idcr/content`**: `MediaView` + `RichTextView` in `@idcr/content`; pure Node-crypto HMAC preview link signing/verifying + route classification in Node-only subpath `@idcr/content/preview`.
3. **Two-tier caching & instant invalidation (Next.js 16.2.11)**: `React.cache` per-request dedupe + `unstable_cache` (tagged `"site-content"`, JSON-safe `{ found }` slot) for published reads ONLY; pre-cache `isDraftMode` branch so draft reads never read from or write to `unstable_cache`; `revalidateSiteContent()` calls `revalidateTag("site-content", { expire: 0 })`.
4. **Locale fallback & strict topic lookup**: `en-US → es-AR` per field via `isEmptyValue`; `getChurchInfoTopic` queries strictly `${snap}.slug.${locale}` (never cross-locale slug fallback).
5. **Ordering & pagination**: Blog listings (`getLatestBlogPostPages`, `getAllBlogPostSlugs`) sorted by `{ [`${snap}.publishedDate`]: -1, _id: 1 }` (aligning with `ICR-195` index; draft fallback `updatedAt DESC`; `SlugEntryView.updatedAt = (publishedAt ?? updatedAt).toISOString()`). Sermon listings sorted by `{ [`${snap}.sermonDate`]: -1, _id: 1 }`. No 100-item cap on `getAllBlogPostSlugs`, `getAllSermons`, `getAllSermonSlugs`. Related posts/sermons preserve stored ID order (limit 3).
6. **Input guards & failure rules**: Malformed slug, locale, or non-24-hex ObjectId returns `undefined` with zero DB calls. `getAllBlogPostSlugs` / `getAllSermonSlugs` throw on DB failure (`ICR-123`). `getFooter` / `getContactForm` throw when missing. `getAllSermons` catches outside `unstable_cache` and returns `[]` (`ICR-111`).
7. **Site-side Preview**: `GET /api/preview` (HMAC-SHA256 + `timingSafeEqual`, ≤60s TTL, strict relative path grammar, `307`, `CONTENT_PREVIEW_SECRET` fail-closed `401`); `POST /api/preview/exit` (`303 See Other`, static-before-topic classification, published check fallback to `/${locale}`); `proxy.ts` sets `Cache-Control: no-store` & `X-Robots-Tag: noindex, nofollow` on draft/preview/staging (`VERCEL_TARGET_ENV`, `VERCEL_ENV`, `__prerender_bypass`, dev); dormant `PreviewBanner` + `preview.{banner,exit,staging}` i18n keys. Legacy `/api/draft/{enable,disable}` and `/api/revalidate` remain untouched.
8. **Automated dormancy check**: `apps/web/lib/content/__tests__/dormancy.test.ts` fails CI if any live page, layout, metadata, sitemap, `proxy.ts`, or existing API/notification module imports `lib/content` or `PreviewBanner`.
