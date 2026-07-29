# SEO & Metadata

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** How per-page metadata is built — `lib/metadata.ts`, the Contentful `Seo` content type, OpenGraph/Twitter cards, the default OG image, locale alternates (hreflang), and the JSON-LD structured-data story (current + roadmap). This matters as much for AI assistants as for classic search; see also `docs/product/ai-era-strategy.md`.
> **Last reviewed:** 2026-06-21

## Where metadata comes from

Two sources feed page metadata:

1. **A Contentful `Seo` entry** for content pages — fetched by `lib/contentful/getSeo.ts` and consumed by `buildPageMetadata`.
2. **The `BlogPost` fields** for articles — `seoTitle`, `seoDescription`, `keywords`, `featuredImage`, `author`, `publishedDate` — consumed by `buildArticleMetadata`.

Both produce a Next.js `Metadata` object that a page's `generateMetadata` returns, plus (for articles) a JSON-LD object.

## `lib/metadata.ts`

The module exports three functions:

### `buildPageMetadata({ machineName, locale, path })` — content pages

- Calls `shouldUseDraftMode()` then `getSeo(machineName, locale, isEnabled)` to fetch the `Seo` entry for the page's machine name.
- Reads the UI `site-name` via `getTranslations("Metadata")`.
- Computes `pageUrl = ${NEXT_PUBLIC_BASE_URL}/${locale}${path ? "/"+path : ""}`.
- Returns `Metadata` with: `title`, `description`, `keywords`; an `openGraph` block (`title`, `description`, `images`, `url`, `siteName`, `type: "website"`, `locale` as `es_AR`/`en_US`); a `twitter` block (`card: "summary_large_image"`, title/description/images); and `alternates` (`canonical: pageUrl`, `languages: buildLocaleAlternates(path)`).

### `buildArticleMetadata({ post, locale, path })` — blog posts

- Synchronous (the post is already fetched by the page).
- Uses `post.seoTitle` / `post.seoDescription` / `post.keywords` and the `featuredImage` as the OG/Twitter image.
- OpenGraph `type: "article"` with `publishedTime`, `modifiedTime` (`post.sys.publishedAt`), `authors: [post.author.name]`, and `tags`.
- Same `alternates` (canonical + hreflang via `buildLocaleAlternates`).

### `buildArticleJsonLd(post, locale)` — structured data for articles

- Returns a `schema.org` `Article` object: `headline`, `description`, `image`, `datePublished`, `dateModified`, `author` (`Person`), `publisher` (`Organization` = "Iglesia de Cristo Redentor", with the default OG image as logo), `mainEntityOfPage`, `keywords`, `inLanguage`. Render it in a `<script type="application/ld+json">` on the article page.

## The OG image

`lib/metadata.ts` defines a default:

```ts
export const DEFAULT_OG_IMAGE = {
  url: "/assets/img/og_default.jpeg",
  width: 1200,
  height: 630,
  alt: "Iglesia de Cristo Redentor",
};
```

The filename uses an underscore (`og_default.jpeg`) to match the asset on disk — `DEFAULT_OG_IMAGE` is the single source of truth for it, so reference the constant rather than hard-coding the path to avoid the recurring `og-default.jpeg` (hyphen) 404.

`buildOgImage(seoContent)` returns the `Seo` entry's `image` (with its width/height/title, defaulting to 1200×630) when present, otherwise the default. Blog posts always use their `featuredImage` at 1200×630. **1200×630 is the canonical OG size** — author images to that aspect ratio. Editorial guidance for this lives in `docs/product/editorial-and-content-rules.md`.

## The Contentful `Seo` content type

Fetched by `getSeo.ts`; typed as `SeoContent` in `src/types/Seo.ts`:

| Field         | Type                            | Use                                                                                                                    |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `title`       | string                          | `<title>` + OG/Twitter title                                                                                           |
| `description` | string                          | meta description + OG/Twitter description                                                                              |
| `keywords`    | string[]                        | `keywords` meta                                                                                                        |
| `image`       | `{ url, title, width, height }` | OG/Twitter image (falls back to default)                                                                               |
| `siteName`    | string                          | available on the entry (note: OG `siteName` currently comes from the `Metadata.site-name` translation, not this field) |
| `type`        | string                          | content-type hint on the entry                                                                                         |

`Seo` entries are matched by `machineName` and are **per-locale**, so each page gets locale-correct title/description. A page without an `Seo` entry will fail in `buildPageMetadata` (it dereferences `seoContent.title`) — every content page must have one.

## Locale alternates (hreflang)

`buildLocaleAlternates(path)` (in `src/i18n/config.ts`) builds `{ "es-AR": "<base>/es-AR/<path>", "en-US": "<base>/en-US/<path>" }`, attached as `alternates.languages`, with `alternates.canonical` set to the current locale's URL. This gives crawlers the correct es-AR ⇄ en-US relationship. The OG `locale` is the dash-to-underscore form (`es-AR` → `es_AR`). See [`i18n.md`](./i18n.md).

## Current state vs. roadmap

**Working today:**

- Per-page title/description/keywords from Contentful `Seo` (pages) or `BlogPost` fields (articles).
- OG + Twitter `summary_large_image` cards with a sensible default image.
- Canonical URLs and es-AR/en-US hreflang alternates on every page.
- `Article` JSON-LD available for blog posts via `buildArticleJsonLd`.
- `sitemap.xml` + `robots.txt` with per-locale URLs (`src/app/sitemap.ts`, `src/app/robots.ts`) — see below.

**Roadmap (see `docs/product/ai-era-strategy.md`, prioritized):**

1. **More structured data.** `Organization`/`Church` (name, address, geo from `LocationComponent`, service times from `Event`), `Event` for services and conferences, `BlogPosting`, and `BreadcrumbList`. The `Article` JSON-LD is the template to follow.
2. **Real per-page OG images** instead of the single default, for richer link/AI cards.
3. **`llms.txt`** describing the church, beliefs, service info, and contact for AI assistants.
4. **Consistent NAP / local discovery** (name, address, phone) tied to a Google Business listing.

## `sitemap.xml` — and why it carries an explicit `revalidate`

`src/app/sitemap.ts` emits the six static pages on the default locale (each with hreflang
alternates), every blog post on the default locale, and every sermon **once per locale**.

It also exports `revalidate = 3600`, and that line is load-bearing. Next.js treats `sitemap.ts` as
"a special Route Handler that is **cached by default** unless it uses a Request-time API or dynamic
config option". Every _page_ escapes that cache by accident — `shouldUseDraftMode()` awaits
`draftMode()`, a Request-time API — but the sitemap calls no such thing, so without an explicit
opt-out it is baked at build time and only changes on deploy.

That is not theoretical. On 2026-07-29 the production sitemap was still the 2026-07-17 build
(`x-vercel-cache: HIT`, `last-modified: Fri, 17 Jul 2026`) and omitted two sermons published on
2026-07-19, while the `/predicas` page listed them correctly. The failure is invisible from the
site itself — only crawlers see it.

Why an hour, rather than `dynamic = "force-dynamic"`:

- It does **not** depend on the publish webhook. That webhook does not currently fire in production
  (see `contentful-data-layer.md` § "KNOWN GAP"), so a purely tag-driven sitemap would be inert.
  The getters are still tagged `site-content`, so a repaired webhook purges this route immediately —
  the hour is a floor, not a ceiling.
- A cached copy still serves if Contentful is briefly unavailable, and crawlers never pay for a cold
  round-trip.

`apps/web/src/app/sitemap.test.ts` asserts the exported `revalidate` for exactly this reason: the
regression is silent at runtime and shows up only as slow SEO decay. To confirm it by hand, look for
`Revalidate 1h` next to `/sitemap.xml` in `pnpm build` output.

## Pitfalls

- **Don't hard-code URLs** — always derive from `NEXT_PUBLIC_BASE_URL` + locale + path so previews and production stay correct.
- **Keep `title` ≤ ~60 chars and `description` ≤ ~155 chars** when authoring `Seo` entries (editorial rule).
- **Every page needs an `Seo` entry**; a missing one throws in `buildPageMetadata`.
- **JSON-LD must match the visible content** — stale or inflated structured data hurts trust and discovery.
