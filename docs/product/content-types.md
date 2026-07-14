# IDC Redentor — Content Types

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** Define the real Contentful content types behind the site — their purpose, key fields, the getter that reads each, and the route/component that renders it. This is the shared vocabulary for tickets, content edits, and the structured-data roadmap.
> **Last reviewed:** 2026-07-14

---

## How content flows

All content lives in **Contentful** and is read through a **hand-written GraphQL layer** (not the Contentful SDK or codegen). The shape is the same for every type:

```
lib/contentful/fetch.ts (fetchGraphQL)  →  lib/contentful/get*.ts (one getter per type)  →  RSC page / component
```

- Each getter builds a GraphQL query string with an inline `locale:` argument and a `preview:` flag, and POSTs it to the Contentful GraphQL endpoint.
- Every request is tagged for caching with `next: { tags: ["site-content"] }`; the `/api/revalidate` webhook calls `revalidateTag("site-content")` when an editor publishes.
- **Draft/preview**: getters take an `isDraftMode` flag (from `shouldUseDraftMode()` — true in dev, on Vercel preview, or when Next draft mode is enabled), which switches the query to `preview: true` and uses the preview token.
- `lib/contentful/codegen.ts` is **unused/aspirational** — ignore it; the getters above are the real schema source of truth.

### Localization model (read this once)

- **es-AR is the primary locale and source of truth; en-US is the secondary translation.** Contentful entries are authored **per-locale** — each localized field holds an es-AR value and an en-US value.
- **Every getter passes a `locale:` argument** (e.g. `locale: "es-AR"`) on every query, so the site renders the requested locale's fields. There is no separate "translation" content type — localization is field-level inside each entry.
- A field that is missing in en-US falls back per Contentful's locale fallback configuration. Keep both locales populated for anything user-facing (see [editorial-and-content-rules.md](./editorial-and-content-rules.md)).
- UI chrome strings (buttons, labels) are **not** in Contentful — they live in `public/locales/{es-AR,en-US}.json` and are served by next-intl.

---

## 1. Page — the page composition root

The container for most informational pages. A `Page` doesn't hold prose directly; it composes **sections** in three ordered slots.

- **Purpose:** assemble a route (home, who-is-jesus, community, come-meet-us) from reusable section components, plus its SEO metadata, without code changes.
- **Key fields:** `pageName`, `slug`, `machineName` (the lookup key), `seo` (inline: `title`, `description`, `keywords`, `image`), and three section collections:
  - `topSectionCollection` — hero/intro sections at the top.
  - `pageContent` — the main body (can also include `ContentCollection` and `EventBanner`).
  - `extraSectionCollection` — additional sections below.
- **Section components allowed in the slots** (each is its own content type, resolved at render):
  - **ComponentHeroBanner** — `headline`, `bodyText` (rich text), `ctaText`, `targetPage` (→ `Page.slug`), `image`, `additionalImagesCollection`.
  - **ComponentCta** — `headline`, `subline` (rich text), `ctaText`, `targetPage`, `urlParameters`.
  - **ComponentDuplex** — `headline`, `bodyText` (rich text), `ctaText`, `targetPage`, `image` (a text-beside-image block).
  - **ComponentTextBlock** — `headline`, `subtitle`, `body` (rich text).
- **Getter:** `lib/contentful/getPage.ts#getPage(name, locale, isDraftMode)` — looks up by `machineName`, returns `{ pageName, slug, seo, topSectionCollection, pageContent, extraSectionCollection }`.
- **Rendered by:** the `[locale]` route segments, with a section/component resolver that switches on `__typename` to render the right component.
- **Structured-data note:** the page's `Page.seo` drives `<head>` metadata. `Organization` JSON-LD already ships **site-wide** (`buildOrganizationJsonLd`, rendered in `[locale]/layout.tsx`), so every `Page` carries it. `WebPage` / `BreadcrumbList` are **not** emitted yet — see [ai-era-strategy.md](./ai-era-strategy.md).

## 2. ContentCollection — Creed/Credo + Values

The doctrinal heart of the community page: a titled collection whose items are **Creed/Credo** statements and **Value** items.

- **Purpose:** render the church's beliefs (the Creed/Credo) and its values as a list of cards, each with a heading, a description, a Bible verse, and an image.
- **Key fields:** `title`, `description` (rich text), `machineName` (lookup key), and `contentItemsCollection` whose items are one of:
  - **Credo** — `title`, `description` (rich text), `bibleVerse` (rich text), `image`.
  - **ValueItem** — `title`, `description` (rich text), `bibleVerse` (rich text), `image`.
  - _(Both share the same shape — see `ContentItem` in `lib/contentful/types.ts`.)_
- **Getter:** `lib/contentful/getContentCollection.ts#getContentCollection(name, locale, isDraftMode)` — looks up by `machineName`, returns `{ title, description, creedItems, image }` (note: the items array is returned as `creedItems` regardless of whether items are Credo or ValueItem).
- **Rendered by:** the community page (and any `Page` that includes a `ContentCollection` in `pageContent`).
- **Editorial note:** this is **doctrinal, leadership-owned content** — agents and editors may fix typos/formatting/translation but must not alter doctrinal meaning. See [editorial-and-content-rules.md](./editorial-and-content-rules.md).

## 3. EventBanner — services, conferences, announcements

A banner that pairs an **Event** with a **Location**, used for the worship service and special events (e.g. the ladies conference).

- **Purpose:** show when and where something happens — service times on come-meet-us, and time-bound events/announcements on the relevant pages.
- **Key fields:**
  - `eventInfo` → **Event**: `name`, `dayOfWeek`, `date`, `time`, `note`.
  - `location` → **LocationComponent**: `addressLine1`, `neighborhood`, `city`, `country`, `mapEmbedUrl`, `googleMapsUrl`, and `location { lat, lon }` (geo coordinates).
  - `image`.
  - `machineName` (lookup key).
- **Getter:** `lib/contentful/getEventBanner.ts#getEventBanner(name, locale, isDraftMode)` — looks up by `machineName`. _(Note: the standalone getter requests `name`, `dayOfWeek`, `date`, `time`, `note` and the full location incl. `googleMapsUrl`; the inline EventBanner fragment inside `getPage` requests a subset — `date`, `time`, `note`, and location without `googleMapsUrl`.)_
- **Rendered by:** come-meet-us (worship service) and any `Page` that embeds an `EventBanner` in `pageContent`.
- **Structured-data note:** **already shipped** — `lib/metadata.ts#buildEventJsonLd` emits `Event` (with `Place`/geo from `LocationComponent`) and is rendered on `come-meet-us` (`page.tsx`). This is what feeds local discovery and "service times near me" answers. Do not file it as new work. See [ai-era-strategy.md](./ai-era-strategy.md).

## 4. Blog post (BlogPostPage) — teaching and news

The one content-rich, frequently-updated type, carrying the anonymous **like** (shared with sermons via the slug-keyed `/api/likes`).

- **Purpose:** publish teaching, devotionals, and church news; surface related posts; let readers leave an anonymous "like."
- **Key fields:** `title`, `subtitle`, `category`, `slug`, `featuredImage`, `content` (rich text with embedded `links.assets` and `links.entries`, including links to other `BlogPostPage`), `author` (→ **Author**: `name`, `avatar`, `email`), `publishedDate`, SEO fields (`seoTitle`, `seoDescription`, `keywords`), `relatedBlogPostsCollection`, and `sys.publishedAt`. _(Full shape: `src/types/BlogPost.ts`.)_ _(**Author** is also reused by the `Sermon` type for `preacher` and `additionalPreachersCollection` — see §8.)_
- **Getters (`lib/contentful/getBlogPostPages.ts`):**
  - `getLatestBlogPostPages(locale, { slug?, isDraftMode? })` — latest 3 (optionally excluding one slug, for "related/more").
  - `getAllBlogPostSlugs(locale)` — slugs + `publishedAt` for `generateStaticParams` / sitemap.
  - `getBlogPostPage(slug, locale, isDraftMode)` — a single post by slug.
- **Rendered by:** `/blog` (list) and `/blog/[slug]` (detail). The anonymous **like** is the only _kind_ of stateful reader feature — and it is **not blog-only**: `/api/likes` is a generic, **slug-keyed** endpoint, so **blog posts and sermons** share it (see §8). It is the one thing in this whole content set that writes to MongoDB (`likes` collection), not Contentful.
- **Structured-data note:** **already shipped** — `lib/metadata.ts#buildArticleJsonLd` emits `@type: "BlogPosting"` and is rendered on `/blog/[slug]`. Not a roadmap item. See [ai-era-strategy.md](./ai-era-strategy.md).

## 5. Footer — site chrome

- **Purpose:** the global footer: a short description, the logo, social links, and the church's address.
- **Key fields:** `shortDescription`, `logo`, `socialLinksCollection` → **SocialLink** (`url`, `platform`), and `location` → **LocationComponent** (`addressLine1`, `neighborhood`, `city`, `country`, `googleMapsUrl`).
- **Getter:** `lib/contentful/getFooter.ts#getFooter(locale, isDraftMode)` — returns `{ logo, shortDescription, socialLinks, location }`.
- **Rendered by:** the global footer component (every page).
- **Structured-data note:** the footer's `location` + `socialLinks` already feed the **shipped** `Organization` JSON-LD (`lib/metadata.ts#buildOrganizationJsonLd`, rendered site-wide from `[locale]/layout.tsx`) — its `address` and `sameAs`.

## 6. NavigationMenu — the menu

- **Purpose:** the primary navigation menu, configured in Contentful.
- **Key fields:** `internalName` (lookup key) and `menuItemsCollection` → **MenuGroup** (`groupName`, `groupLink { slug }`).
- **Getter:** `lib/contentful/getNavigationMenu.ts#getNavigationMenu(name, locale, isDraftMode)` — looks up by `internalName`, returns the `menuItems` array.
- **Rendered by:** the global header/nav component (every page).

## 7. Seo — standalone SEO entries

Most pages carry SEO inline via `Page.seo`, but there is also a standalone `Seo` content type for reusable/shared metadata.

- **Purpose:** reusable SEO metadata for routes that look one up by name (e.g. the blog index, or any page that references a shared Seo entry).
- **Key fields:** `title`, `description`, `keywords`, `image` (`url`, `title`, `width`, `height`), `siteName`, `type`, and `machineName` (lookup key). _(Type: `src/types/Seo.ts`.)_
- **Getter:** `lib/contentful/getSeo.ts#getSeo(name, locale, isDraftMode)` — looks up by `machineName`.
- **Rendered by:** metadata builders (`lib/metadata.ts`) that emit `<title>`, meta description, keywords, and OG/Twitter tags. See [ai-era-strategy.md](./ai-era-strategy.md) and `docs/architecture/seo-and-metadata.md`.

## 8. Sermon — the prédicas archive

The sermon archive at `/predicas`: each sermon is a full Contentful entry with a rich-text body, a
downloadable PDF summary, structured scripture references, and a **self-hosted audio recording**
played inline on its own page. Entries are produced by the local **`/predica` pipeline**
(recording → transcript → bilingual entry → branded PDFs → a Contentful _draft_), which never
auto-publishes — a human reviews and publishes every sermon.

- **Purpose:** publish the church's teaching as durable, readable, listenable content — findable by
  people and by AI assistants — without building a media platform. (One audio asset on its own page
  is the deliberate **ceiling**; see [scope-and-boundaries.md](./scope-and-boundaries.md).)
- **Key fields:** `title`, `slug`, `sermonDate`, `thesis`, `mainPoints`, `excerpt`,
  `durationSeconds`, `content` (rich text), `featuredImage`,
  `audio { url, title, contentType, fileName, size }` (the **self-hosted** recording — a Contentful
  asset, **not** a YouTube/Vimeo embed), `pdfSummary` (the downloadable summary asset),
  `preacher` (→ **Author**), `additionalPreachersCollection` (→ **Author**[]),
  `scriptureReferencesCollection` (→ **BibleVerse**[], see §9), SEO fields (`seoTitle`,
  `seoDescription`, `keywords`), `relatedSermonsCollection`, and `sys`.
- **Getters (`lib/contentful/getSermons.ts`):**
  - `getSermon(slug, locale, isDraftMode)` — a single sermon by slug.
  - `getSermonById(id, locale, isDraftMode)` — by entry id (used by the `/predica` pipeline).
  - `getLatestSermons(locale, …)` — the most recent sermons, for surfacing.
  - `getAllSermons(locale, …)` / `fetchAllSermonItems(…)` — the paginated archive listing.
  - `getAllSermonSlugs(locale)` — for `generateStaticParams` / sitemap.
- **Rendered by:** `/predicas` (archive list — `SermonSection`, `SermonCard`) and `/predicas/[slug]`
  (detail — `SermonDetails`, composing `SermonHeader`, **`SermonAudioPlayer`** (a native `<audio>`
  element against the Contentful `audio.url`), `SermonContent`, `PdfDownloadButton`,
  `ScriptureReferences`, and `RelatedSermons`).
- **Reader interaction:** the sermon detail page renders the **same** `PostActions` component the
  blog uses, with `likeKey` = `` `predicas/${slug}` `` — so sermons carry the anonymous
  **like** through the same slug-keyed `/api/likes` route. Likes are **not** blog-only.
- **Structured-data note:** **already shipped** — `lib/sermonMetadata.ts#buildSermonJsonLd` emits an
  `Article` with a nested **`AudioObject`** (contentUrl + duration), rendered as an
  `application/ld+json` script on `/predicas/[slug]`. Do not file it as new work. **Every JSON-LD
  type this site needs already ships** — `Organization` (site-wide), `Event` (come-meet-us),
  `BlogPosting` (blog detail), and this one; **only `BreadcrumbList` remains**. See
  [ai-era-strategy.md](./ai-era-strategy.md).
- **Editorial note:** sermon content is **preaching — leadership-owned**. The `/predica` pipeline
  writes a **draft** only; a human reviews both locales and publishes. Agents must not alter
  doctrinal meaning. See [editorial-and-content-rules.md](./editorial-and-content-rules.md).

## 9. BibleVerse — structured scripture references

A standalone content type for a scripture citation, reused across sermons (and deduped by the
`/predica` pipeline, which upserts by a derived version-scoped key — see
`docs/architecture/predica-bibleverse-reuse.md`).

> **⚠️ Do not confuse this with the `bibleVerse` _field_ in §2.** `Credo` and `ValueItem` each carry
> a free-text **rich-text `bibleVerse` field** — prose on a card. **`BibleVerse` (this section) is a
> different thing: a structured _content type_** with real coordinates (`book`, `chapter`,
> `fromVerse`, `toVerse`), the verse text, and the translation used. Only the sermon type links to it.

- **Purpose:** cite scripture with machine-readable coordinates, so a verse can be rendered
  consistently, reused across sermons, and (later) marked up for structured data.
- **Key fields:** `book`, `chapter`, `fromVerse`, `toVerse`, `verseContent` (the verse text), and
  `bibleVersion` (the translation — e.g. NVI for es-AR, NIV for en-US).
- **Getter:** no standalone getter — it is queried **inline** by `lib/contentful/getSermons.ts`, via
  `scriptureReferencesCollection` on the sermon
  (`... on BibleVerse { book chapter fromVerse toVerse verseContent bibleVersion }`).
- **Rendered by:** the `ScriptureReferences` component on the sermon detail page.
- **Structured-data note:** the cleanest path to citation markup, since the coordinates are already
  structured rather than buried in prose.

---

## Quick reference

| Content type                                  | Getter (`lib/contentful/…`) | Lookup key     | Rendered on                           |
| --------------------------------------------- | --------------------------- | -------------- | ------------------------------------- |
| **Page** (+ Hero/Cta/Duplex/TextBlock)        | `getPage.ts`                | `machineName`  | `[locale]` informational routes       |
| **ContentCollection** (Credo + ValueItem)     | `getContentCollection.ts`   | `machineName`  | community (Creed/Credo + values)      |
| **EventBanner** (→ Event + LocationComponent) | `getEventBanner.ts`         | `machineName`  | come-meet-us, event pages             |
| **Blog post** (BlogPostPage → Author)         | `getBlogPostPages.ts`       | `slug`         | `/blog`, `/blog/[slug]`               |
| **Sermon** (→ Author, BibleVerse)             | `getSermons.ts`             | `slug`         | `/predicas`, `/predicas/[slug]`       |
| **BibleVerse** (scripture reference)          | `getSermons.ts` (inline)    | (linked)       | sermon detail (`ScriptureReferences`) |
| **Footer** (→ SocialLink, LocationComponent)  | `getFooter.ts`              | (singleton)    | global footer                         |
| **NavigationMenu** (→ MenuGroup)              | `getNavigationMenu.ts`      | `internalName` | global nav                            |
| **Seo**                                       | `getSeo.ts`                 | `machineName`  | metadata/`<head>`                     |

> **Reminder:** every getter takes `locale` and passes it to the query. es-AR is the source of truth; keep en-US in sync. Sensitive (doctrinal) content lives in **ContentCollection** (Credo/ValueItem) and the who-is-jesus/community `Page` sections — edit those with the guardrails in [editorial-and-content-rules.md](./editorial-and-content-rules.md).
