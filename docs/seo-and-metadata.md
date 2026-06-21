# SEO & Metadata

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
const DEFAULT_OG_IMAGE = {
  url: "/assets/img/og-default.jpeg",
  width: 1200, height: 630,
  alt: "Iglesia de Cristo Redentor",
};
```

`buildOgImage(seoContent)` returns the `Seo` entry's `image` (with its width/height/title, defaulting to 1200×630) when present, otherwise the default. Blog posts always use their `featuredImage` at 1200×630. **1200×630 is the canonical OG size** — author images to that aspect ratio. Editorial guidance for this lives in `docs/product/editorial-and-content-rules.md`.

## The Contentful `Seo` content type

Fetched by `getSeo.ts`; typed as `SeoContent` in `src/types/Seo.ts`:

| Field | Type | Use |
|-------|------|-----|
| `title` | string | `<title>` + OG/Twitter title |
| `description` | string | meta description + OG/Twitter description |
| `keywords` | string[] | `keywords` meta |
| `image` | `{ url, title, width, height }` | OG/Twitter image (falls back to default) |
| `siteName` | string | available on the entry (note: OG `siteName` currently comes from the `Metadata.site-name` translation, not this field) |
| `type` | string | content-type hint on the entry |

`Seo` entries are matched by `machineName` and are **per-locale**, so each page gets locale-correct title/description. A page without an `Seo` entry will fail in `buildPageMetadata` (it dereferences `seoContent.title`) — every content page must have one.

## Locale alternates (hreflang)

`buildLocaleAlternates(path)` (in `src/i18n/config.ts`) builds `{ "es-AR": "<base>/es-AR/<path>", "en-US": "<base>/en-US/<path>" }`, attached as `alternates.languages`, with `alternates.canonical` set to the current locale's URL. This gives crawlers the correct es-AR ⇄ en-US relationship. The OG `locale` is the dash-to-underscore form (`es-AR` → `es_AR`). See [`i18n.md`](./i18n.md).

## Current state vs. roadmap

**Working today:**
- Per-page title/description/keywords from Contentful `Seo` (pages) or `BlogPost` fields (articles).
- OG + Twitter `summary_large_image` cards with a sensible default image.
- Canonical URLs and es-AR/en-US hreflang alternates on every page.
- `Article` JSON-LD available for blog posts via `buildArticleJsonLd`.

**Roadmap (see `docs/product/ai-era-strategy.md`, prioritized):**
1. **More structured data.** `Organization`/`Church` (name, address, geo from `LocationComponent`, service times from `Event`), `Event` for services and conferences, `BlogPosting`, and `BreadcrumbList`. The `Article` JSON-LD is the template to follow.
2. **`sitemap.xml` and `robots.txt`** with correct per-locale URLs. (`getAllBlogPostSlugs(locale)` in `getBlogPostPages.ts` already returns `{ slug, updatedAt }` pairs ready for a sitemap.)
3. **Real per-page OG images** instead of the single default, for richer link/AI cards.
4. **`llms.txt`** describing the church, beliefs, service info, and contact for AI assistants.
5. **Consistent NAP / local discovery** (name, address, phone) tied to a Google Business listing.

## Pitfalls

- **Don't hard-code URLs** — always derive from `NEXT_PUBLIC_BASE_URL` + locale + path so previews and production stay correct.
- **Keep `title` ≤ ~60 chars and `description` ≤ ~155 chars** when authoring `Seo` entries (editorial rule).
- **Every page needs an `Seo` entry**; a missing one throws in `buildPageMetadata`.
- **JSON-LD must match the visible content** — stale or inflated structured data hurts trust and discovery.
