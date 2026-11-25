# Architecture

> **Monorepo note:** the site lives under **`apps/web/`**, the Ministry Admin Panel under **`apps/admin/`**, and shared packages under **`packages/`** (`@idcr/config`, `@idcr/ui`, `@idcr/content`). Unqualified app paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `next.config.ts`, `tsconfig.json`, …) live under `apps/web/`; `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope with `pnpm --filter @idcr/web <task>` / `pnpm --filter @idcr/admin <task>`.
>
> **Full platform architecture documentation** lives in Linear project documents going forward.

> **Purpose:** The big picture of how the IDC Redentor website (`apps/web`) is put together — the App Router structure, the MongoDB + Vercel Blob + Ministry Admin content platform, the request lifecycle, where each concern lives, and the security posture. Read this first; the other engineering docs drill into one area each.
> **Last reviewed:** 2026-11-25

## What this is

A bilingual (es-AR / en-US) **content-managed informational site** for Iglesia de Cristo Redentor, built on **Next.js 16** (App Router) + **React 19**, backed by **MongoDB** (`website*` database), **Vercel Blob** public media, and the internal **Ministry Admin Panel** (`apps/admin`), with **Tailwind CSS 4** for styling and **next-intl** for localization. It is deployed on **Vercel** (production + staging + per-PR preview deployments). There is **no authentication, no RBAC, no payments, and no AI** on `apps/web` — almost every byte of the page is read from MongoDB via `@lib/content/*` and rendered in a Server Component. _(This describes the **public website** (`apps/web`). The separate internal Ministry Admin Panel (`apps/admin`) is an authenticated product — Firebase Auth + RBAC + congregant data + content/media authoring — governed by `tasks/specs/admin-platform-brief.md`.)_

The only visitor writes on `apps/web` are anonymous blog/sermon "likes" (`/api/likes`) and contact-form submissions (persisted in MongoDB `website*` and emailed via the mailing service), plus newsletter signups to Resend Audiences.

## Directory map

```
idc-redentor-platform/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── [locale]/                # locale-scoped pages (es-AR | en-US)
│   │   │   │   │   ├── page.tsx             # Home
│   │   │   │   │   ├── who-is-jesus/        # ¿Quién es Jesús?
│   │   │   │   │   ├── community/           # Mission, values, Creed/Credo
│   │   │   │   │   ├── come-meet-us/        # Service time + address + map
│   │   │   │   │   ├── blog/[slug]/         # Blog index + article pages
│   │   │   │   │   ├── predicas/[slug]/     # Sermon archive + detail pages
│   │   │   │   │   └── [topic]/             # Church info topic pages
│   │   │   │   └── api/                     # Route handlers (no auth)
│   │   │   │       ├── likes/               # GET/POST blog + sermon likes
│   │   │   │       ├── subscribe/           # POST → Resend (per-locale audience)
│   │   │   │       ├── revalidate/          # POST → revalidateTag + optional broadcast
│   │   │   │       └── preview/             # GET signed Draft Mode entry; POST /exit
│   │   │   ├── components/                  # UI + feature components
│   │   │   │   └── features/contact-form/   # contactFormAction.ts (Server Action)
│   │   │   ├── service/                     # MongoDB + email + broadcast services
│   │   │   │   ├── database.service.ts      # cached MongoClient + getWebsiteDb()
│   │   │   │   ├── like.service.ts          # likes collection
│   │   │   │   ├── contact.service.ts       # contact collection
│   │   │   │   ├── contact-form-email.service.ts
│   │   │   │   ├── mailing.service.ts       # adapter selector (MAIL_PROVIDER)
│   │   │   │   ├── mailing/{sendgrid,resend}.adapter.ts
│   │   │   │   ├── post-notification.service.ts
│   │   │   │   └── subscribe.ts             # client → /api/subscribe
│   │   │   ├── templates/                   # HTML email templates + engine
│   │   │   ├── i18n/{config,routing,request}.ts
│   │   │   ├── types/                       # shared TS types + environment.d.ts
│   │   │   ├── utils/                       # formatDate, sentry options, etc.
│   │   │   └── proxy.ts                     # next-intl middleware (exports `proxy`)
│   │   ├── lib/
│   │   │   ├── content/                     # MongoDB content readers (get*.ts) + TipTap rich-text/
│   │   │   ├── metadata.ts                  # buildPageMetadata / buildArticleMetadata / JSON-LD
│   │   │   └── sermonMetadata.ts            # buildSermonMetadata / buildSermonJsonLd
│   │   ├── config/{headers,securityHeaders}.js  # security headers + CSP
│   │   └── public/{locales,assets}/         # UI strings + static assets (@icons alias)
│   └── admin/                               # Ministry Admin Panel (authoring, Blob uploads, pdf-worker)
├── packages/
│   ├── config/                              # @idcr/config
│   ├── ui/                                  # @idcr/ui (cn, tokens.css, LOGO)
│   └── content/                             # @idcr/content (collections, Zod schemas, TipTap, preview)
└── docs/                                    # engineering + product docs
```

## Content & data paths

Both apps share the MongoDB **`website*`** database (`website` in production, `website-staging` on staging, etc.) via environment-scoped URIs (`MONGODB_URI` on `apps/web`, `WEBSITE_MONGODB_URI` on `apps/admin`).

### 1. Content authoring (`apps/admin`) → MongoDB + Vercel Blob

```
apps/admin (Ministry Admin Panel)
   ├── writes draft & published snapshots → MongoDB website* (11 content collections in @idcr/content)
   ├── uploads public media              → Vercel Blob (BLOB_READ_WRITE_TOKEN — admin ONLY)
   ├── rebuilds sermon PDFs              → GET apps/admin/src/app/api/content/pdf-worker (content_pdf_jobs)
   └── triggers site revalidation        → POST <web>/api/revalidate (WEBSITE_REVALIDATE_SECRET)
```

`apps/web` holds **zero** `BLOB_*` credentials and never writes to content collections. Media URLs point at Vercel Blob public stores (`*.public.blob.vercel-storage.com`).

### 2. Content reads (`apps/web/lib/content/`) → RSC

```
MongoDB website* (sections, belief_collections, event_banners, posts, sermons,
                  bible_verses, authors, topics, seo_entries, globals, media)
   │  requireContentDb() + @idcr/content schemas & collection constants
   ▼
apps/web/lib/content/get*.ts  →  createCachedReader()
   │  published: React.cache + unstable_cache(tags: ["site-content"])
   │  draft:     React.cache only (never reads/writes unstable_cache)
   ▼
apps/web/lib/content/rich-text/  →  TipTap JSON → React rendering
   ▼
src/app/[locale]/**              →  React Server Component renders the data
```

Every published content read rides on the single `"site-content"` cache tag.

### 3. Public writes (`apps/web`) → MongoDB

```
src/service/database.service.ts   →  cached MongoClient + getWebsiteDb()
   ├── like.service.ts            ← /api/likes (GET/POST)               collection: likes
   ├── contact.service.ts         ← contactFormAction (Server Action)   collection: contact
   └── broadcast/broadcastLog.ts  ← notifyOnPublish (on /api/revalidate) collection: broadcast_log
```

Detail in [`likes-and-mongodb.md`](./likes-and-mongodb.md).

## Request lifecycle (a page render)

1. A request for `/{locale}/{path}` hits the edge. **`src/proxy.ts`** (next-intl middleware) runs first: it short-circuits `OPTIONS`, bypasses static assets, and otherwise resolves/validates the locale. The matcher skips `_next`, `_vercel`, `api`, `trpc`, and `monitoring`.
2. The matching `src/app/[locale]/…/page.tsx` Server Component runs. It calls `shouldUseDraftMode()` and invokes one or more `@lib/content/get*.ts` getters with the resolved `locale` and draft flag.
3. `generateMetadata` (where present) calls `lib/metadata.ts#buildPageMetadata` (or `buildArticleMetadata` / `lib/sermonMetadata.ts`), reading the page's `seo_entries` doc or entry fields and emitting title/description/OG/Twitter/canonical/hreflang. See [`seo-and-metadata.md`](./seo-and-metadata.md).
4. The page renders server-side (including TipTap rich text via `apps/web/lib/content/rich-text/`). Interactive islands (`'use client'`) hydrate on the client — the like button, the contact form, the subscribe box, the sermon audio player.
5. `config/headers.js` attaches the security headers + CSP to the response.

API routes and the contact-form Server Action follow their own short lifecycles (validate input → call a service → return JSON / an action result).

## Signed Draft Mode preview vs. published

`apps/web/lib/content/draft-mode.ts#shouldUseDraftMode()` returns `true` when **either**:

1. Next.js Draft Mode is enabled via the signed preview opener (`GET /api/preview`), or
2. The app runs in an always-draft environment (`NODE_ENV === "development"`, `VERCEL_ENV === "preview"`, or staging).

In production (`VERCEL_ENV === "production"`), visitors see only `published` snapshots unless an editor opens a short-lived HMAC-SHA256 signed link minted by `apps/admin` (using the shared `CONTENT_PREVIEW_SECRET` and `@idcr/content/preview`). `GET /api/preview` verifies signature, 60-second expiry, and allowed relative site route, enables Next.js Draft Mode, and redirects (`Cache-Control: no-store`, `X-Robots-Tag: noindex`). `POST /api/preview/exit` disables Draft Mode and returns the editor to the published route (or locale home if unpublished).

## Revalidation

Published content is cached via `unstable_cache` (`SITE_CONTENT_CACHE_TAG = "site-content"`) and revalidated **on demand**, not on a timer. When an editor publishes in `apps/admin`, the admin calls `POST /api/revalidate` on `apps/web` with header `x-vercel-reval-key`. The route checks it against `WEBSITE_REVALIDATE_SECRET` and calls `revalidateSiteContent()` (`revalidateTag("site-content", { expire: 0 })`) so the very next request reads the updated content immediately. Revalidation runs first and unconditionally; when `CONTENT_PUBLISH_EMAILS === "true"` and the request body specifies `notify: true` for a `post` or `sermon`, the route then triggers an **isolated** per-locale subscriber broadcast (a notify failure never breaks revalidation). See [`forms-and-email.md`](./forms-and-email.md).

## Internationalization

next-intl drives both routing and message lookup. Default locale **`es-AR`**, secondary **`en-US`**. Content text is stored per-locale inside each MongoDB document (`{ "es-AR": …, "en-US": … }`, authored in `apps/admin`); chrome/UI strings come from `public/locales/{es-AR,en-US}.json`. Locale alternates (hreflang) are generated by `buildLocaleAlternates()` and attached in `lib/metadata.ts`. Full detail in [`i18n.md`](./i18n.md).

## Security posture

- **`config/headers.js`** (via the pure `config/securityHeaders.js#buildSecurityHeaders`) applies to every path: `Strict-Transport-Security` (2-year, preload), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`, `X-DNS-Prefetch-Control`, and a **Content-Security-Policy**.
- **The CSP is strict in every environment**: `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` unconditionally (preview uses signed Draft Mode on the website itself, never an external iframe). `script-src`/`connect-src` allowlist Google Tag Manager / Analytics and Vercel scripts; `img-src` allowlists Google Analytics/GTM, Vercel Blob public stores (`*.public.blob.vercel-storage.com`), and `images.unsplash.com`; `media-src` allowlists `'self'` and `*.public.blob.vercel-storage.com` (for inline sermon `<audio>`). `next.config.ts` mirrors the image hosts in `images.remotePatterns`.
- **Treat `config/headers.js`, `config/securityHeaders.js`, and the CSP as a security-sensitive surface.** Adding a third-party script/pixel means updating the CSP; the harness lists `config/**` among its sensitive paths.
- **No auth on `apps/web` means no session/cookie attack surface beyond the anonymous `_visitor_id` cookie** used by likes (httpOnly, SameSite=Lax, secure in production) and Next.js's signed Draft Mode cookie for editor previews. The only PII `apps/web` handles is contact-form submissions and newsletter emails — keep that surface small (see [`forms-and-email.md`](./forms-and-email.md)).

## Path aliases

From `apps/web/tsconfig.json`:

| Alias       | Resolves to           |
| ----------- | --------------------- |
| `@src/*`    | `src/*`               |
| `@lib/*`    | `lib/*`               |
| `@public/*` | `public/*`            |
| `@icons/*`  | `public/assets/svg/*` |

Use them instead of long relative paths. `vite-tsconfig-paths` makes them work under Vitest too.
