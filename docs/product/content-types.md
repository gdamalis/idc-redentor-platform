# IDC Redentor — Content Types

> **Monorepo note:** the public website lives under **`apps/web/`**, the Ministry Admin Panel under **`apps/admin/`**, and shared content schemas & collection names live under **`packages/content/`** (`@idcr/content`). Unqualified app paths (`src/…`, `lib/…`, `public/…`, `config/…`) resolve under `apps/web/`; `.claude/`, `docs/`, and `tasks/` stay at the repo root.
>
> **Full platform architecture documentation** lives in Linear project documents going forward.

> **Purpose:** Define the MongoDB content collections behind the site — their purpose, key fields, the `@lib/content/*` getter that reads each, and the route/component that renders it. This is the shared vocabulary for tickets, content edits, and the structured-data roadmap.
> **Last reviewed:** 2026-11-25

---

## How content flows

All site content lives in **MongoDB** (`website*` database), validated by Zod schemas in **`packages/content/` (`@idcr/content`)**, authored through the **Ministry Admin Panel (`apps/admin`)**, with public images, audio, and PDFs stored in **Vercel Blob** (`*.public.blob.vercel-storage.com`; `BLOB_READ_WRITE_TOKEN` is held exclusively by `apps/admin`). Rich text is stored as **TipTap JSON** (`@idcr/content/tiptap`, `@idcr/content/rich-text`) and rendered on the website via **`apps/web/lib/content/rich-text/`**.

```
apps/admin (authoring + Vercel Blob uploads)
   │  writes draft/published envelopes to MongoDB website*
   ▼
apps/web/lib/content/get*.ts  (requireContentDb + createCachedReader)
   │  published: React.cache + unstable_cache(tags: ["site-content"])
   │  draft:     React.cache only (bypasses unstable_cache)
   ▼
src/app/[locale]/**  (RSC pages / components + lib/content/rich-text/)
```

- **Revalidation:** when an editor publishes in `apps/admin`, admin calls `POST /api/revalidate` (authenticated with `WEBSITE_REVALIDATE_SECRET`), which calls `revalidateSiteContent()` (`revalidateTag("site-content", { expire: 0 })`) so the very next read returns the updated content.
- **Signed Draft Mode preview:** getters take an `isDraftMode` flag (from `lib/content/draft-mode.ts#shouldUseDraftMode()` — true when signed Draft Mode is enabled via `GET /api/preview` with `CONTENT_PREVIEW_SECRET`, or in always-draft environments like dev, Vercel PR preview, or staging).

### Localization model (read this once)

- **es-AR is the primary locale and source of truth; en-US is the secondary translation.** Localized fields are stored inline on each document as `{ "es-AR": …, "en-US": … }` inside the `draft` / `published` envelope.
- **Every getter accepts `locale`** (e.g. `"es-AR"` or `"en-US"`) and resolves localized fields via `resolveLocalized()` (falling back to `es-AR` when an `en-US` value is absent). Keep both locales populated for anything user-facing (see [editorial-and-content-rules.md](./editorial-and-content-rules.md)).
- UI chrome strings (buttons, labels) are **not** in MongoDB — they live in `public/locales/{es-AR,en-US}.json` and are served by next-intl.

---

## 1. Sections (`sections` collection)

Reusable page building blocks — hero banners, CTAs, duplex blocks, and text blocks — composed by route pages.

- **Purpose:** assemble informational routes (home, who-is-jesus, community, come-meet-us, blog CTA) without code changes.
- **Key fields:** `machineName` (lookup key), `layout` (hero, cta, duplex, text-block, etc.), `headline`, `subHeadline`, `body` (TipTap rich text), `ctaText`, `targetPage`, `urlParameters`, `image` / `images` (references into `media`).
- **Getters:** `lib/content/getSection.ts#getSection(name, locale, isDraftMode)` (plus typed wrappers `getHeroBannerComponent`, `getCtaComponent`, `getTextBlockComponent`).
- **Rendered by:** `[locale]` route segments (`page.tsx`, `community/page.tsx`, `come-meet-us/page.tsx`, `blog/page.tsx`, etc.).
- **Structured-data note:** `Organization` JSON-LD ships **site-wide** (`buildOrganizationJsonLd`, rendered in `[locale]/layout.tsx`). `BreadcrumbList` is the remaining roadmap item — see [ai-era-strategy.md](./ai-era-strategy.md).

## 2. Belief Collections (`belief_collections` collection) — Creed/Credo + Values

The doctrinal heart of the community page: a titled collection whose items are **Creed/Credo** statements and **Value** items.

- **Purpose:** render the church's beliefs (the Creed/Credo) and its values as a list of cards, each with a heading, a description, a Bible verse, and an image.
- **Key fields:** `machineName` (lookup key), `title`, `description` (TipTap rich text), `image`, and `items` (each with `title`, `description`, `bibleVerse`, `image` / icon metadata).
- **Getter:** `lib/content/getContentCollection.ts#getContentCollection(name, locale, isDraftMode)` (mapped by `mapContentCollection.ts`).
- **Rendered by:** the community page (`/community`).
- **Editorial note:** this is **doctrinal, leadership-owned content** — agents and editors may fix typos/formatting/translation but must not alter doctrinal meaning. See [editorial-and-content-rules.md](./editorial-and-content-rules.md).

## 3. Event Banners (`event_banners` collection) — services, conferences, announcements

A banner pairing event timing with location metadata, used for the recurring worship service and special events (e.g. the ladies conference).

- **Purpose:** show when and where something happens — service times on come-meet-us, and time-bound events/announcements on relevant pages.
- **Key fields:** `machineName` (lookup key), event details (`name`, `dayOfWeek`, `date`, `time`, `note`), location (`addressLine1`, `neighborhood`, `city`, `country`, `mapEmbedUrl`, `googleMapsUrl`, geo `{ lat, lon }`), and `image`.
- **Getter:** `lib/content/getEventBanner.ts#getEventBanner(name, locale, isDraftMode)`.
- **Rendered by:** come-meet-us (worship service) and pages embedding an event banner.
- **Structured-data note:** **already shipped** — `lib/metadata.ts#buildEventJsonLd` emits `Event` (with `Place`/geo) on `come-meet-us`. Do not file it as new work. See [ai-era-strategy.md](./ai-era-strategy.md).

## 4. Blog Posts (`posts` collection) — teaching and news

Content-rich, frequently updated articles carrying the anonymous **like** (shared with sermons via the slug-keyed `/api/likes`).

- **Purpose:** publish teaching, devotionals, and church news; surface related posts; let readers leave an anonymous "like."
- **Key fields:** `title`, `subtitle`, `category`, `slug`, `featuredImageId` (→ `media`), `content` (TipTap rich text with embedded media references), `authorId` (→ `authors`: `name`, `avatar`, `email`), `publishedDate`, SEO fields (`seoTitle`, `seoDescription`, `keywords`), `relatedPostIds`, and envelope timestamps (`publishedAt`, `updatedAt`).
- **Getters (`lib/content/getBlogPostPages.ts`):**
  - `getLatestBlogPostPages(locale, { slug?, isDraftMode? })` — latest 3 (optionally excluding one slug).
  - `getAllBlogPostSlugs(locale)` — slugs + `updatedAt` for `sitemap.ts` (throws on DB error).
  - `getBlogPostPage(slug, locale, isDraftMode)` — a single post by slug.
  - `getBlogPostPageById(id, locale, isDraftMode)` — a single post by ObjectId (used by publish notifications).
- **Rendered by:** `/blog` (list) and `/blog/[slug]` (detail). Anonymous likes write to MongoDB `likes` via `/api/likes`.
- **Structured-data note:** **already shipped** — `lib/metadata.ts#buildArticleJsonLd` emits `@type: "BlogPosting"` on `/blog/[slug]`.

## 5. Globals (`globals` collection) — Footer, NavigationMenu, Forms

Singleton site-chrome and form configuration documents stored in `website*.globals`.

- **Footer** (`lib/content/getFooter.ts#getFooter(locale, isDraftMode)`): logo, `shortDescription`, `socialLinks` (`url`, `platform`), and `location` (`addressLine1`, `neighborhood`, `city`, `country`, `googleMapsUrl`). Feeds the global footer and the site-wide `Organization` JSON-LD (`buildOrganizationJsonLd`).
- **NavigationMenu** (`lib/content/getNavigationMenu.ts#getNavigationMenu(name, locale, isDraftMode)`): primary navigation menu items (`groupName`, `groupLink { slug }`) rendered by the global header.
- **ContactForm** (`lib/content/getContactForm.ts#getContactForm(name, locale, isDraftMode)`): form field definitions (`name`, `type`, `required`, `validation`, `placeholder`) rendered by `ContactForm`.
- **SingleEmailForm** (`lib/content/getSingleEmailForm.ts#getSingleEmailForm(name, locale, isDraftMode)`): newsletter banner copy and `successMessage` rendered by `SubscribeBanner`.

## 6. Topics (`topics` collection) — Church Info pages

Standalone long-form informational pages (such as `/es-AR/privacidad` and `/en-US/privacy`).

- **Purpose:** host evergreen church-info pages routed dynamically under `[locale]/[topic]`.
- **Key fields:** `slug` (per-locale), `title`, `content` (TipTap rich text), SEO metadata.
- **Getter:** `lib/content/getChurchInfoTopic.ts#getChurchInfoTopic(slug, locale, isDraftMode)`.
- **Rendered by:** `src/app/[locale]/[topic]/page.tsx`.

## 7. SEO Entries (`seo_entries` collection)

Standalone reusable per-page SEO metadata entries.

- **Purpose:** metadata for routes that look one up by `machineName` (home, community, come-meet-us, blog index, etc.).
- **Key fields:** `machineName` (lookup key), `title`, `description`, `keywords`, `imageId` (→ `media`), `siteName`, `type`.
- **Getter:** `lib/content/getSeo.ts#getSeo(name, locale, isDraftMode)`.
- **Rendered by:** metadata builders (`lib/metadata.ts`) that emit `<title>`, meta description, keywords, and OG/Twitter tags. See [ai-era-strategy.md](./ai-era-strategy.md) and `docs/architecture/seo-and-metadata.md`.

## 8. Sermons (`sermons` collection) — the prédicas archive

The sermon archive at `/predicas`: each sermon is a full MongoDB document with TipTap rich-text body, downloadable PDF summaries (in Vercel Blob, rebuilt by `apps/admin/src/app/api/content/pdf-worker/`), structured scripture references, and a **self-hosted audio recording** (in Vercel Blob) played inline on its own page. Drafts are produced by the local **`/predica` pipeline** (recording → transcript → bilingual `sermon.json` → branded PDFs + featured image → `"Para revisar"` draft sent to `apps/admin` via `/api/predica/*`), which never auto-publishes — a human reviews and publishes every sermon in Admin.

- **Purpose:** publish the church's teaching as durable, readable, listenable content — findable by people and by AI assistants — without building a media platform. (One audio asset on its own page is the deliberate **ceiling**; see [scope-and-boundaries.md](./scope-and-boundaries.md).)
- **Key fields:** `title`, `slug`, `sermonDate`, `thesis`, `mainPoints`, `excerpt`, `durationSeconds`, `content` (TipTap rich text), `featuredImageId` (→ `media`), `audioMediaId` (→ `media` in Vercel Blob, **not** a YouTube/Vimeo embed), `pdfSummaryMediaId` (per-locale → `media`), `preacherId` / `additionalPreacherIds` / `interpreterId` (→ `authors`), `scriptureRefIds` (→ `bible_verses`, see §9), SEO fields (`seoTitle`, `seoDescription`, `keywords`), `relatedSermonIds`, and envelope timestamps.
- **Getters (`lib/content/getSermons.ts`):**
  - `getSermon(slug, locale, isDraftMode)` — a single sermon by slug.
  - `getSermonById(id, locale, isDraftMode)` — by ObjectId (used by publish notifications).
  - `getLatestSermons(locale, …)` — the most recent sermons, for surfacing.
  - `getAllSermons(locale, …)` — the paginated archive listing.
  - `getAllSermonSlugs(locale)` — slugs + `updatedAt` for `sitemap.ts` (throws on DB error).
- **Rendered by:** `/predicas` (archive list — `SermonSection`, `SermonCard`) and `/predicas/[slug]` (detail — `SermonDetails`, composing `SermonHeader`, **`SermonAudioPlayer`** playing the Vercel Blob audio URL, `SermonContent`, `PdfDownloadButton`, `ScriptureReferences`, and `RelatedSermons`).
- **Reader interaction:** the sermon detail page renders the **same** `PostActions` component the blog uses, with `likeKey` = `` `predicas/${slug}` `` — so sermons carry the anonymous **like** through the same slug-keyed `/api/likes` route.
- **Structured-data note:** **already shipped** — `lib/sermonMetadata.ts#buildSermonJsonLd` emits an `Article` with a nested **`AudioObject`** (contentUrl + duration) on `/predicas/[slug]`. **Only `BreadcrumbList` remains** on the JSON-LD roadmap — see [ai-era-strategy.md](./ai-era-strategy.md).
- **Editorial note:** sermon content is **preaching — leadership-owned**. The `/predica` pipeline writes a **draft** only; a human reviews both locales and publishes in `apps/admin`. Agents must not alter doctrinal meaning. See [editorial-and-content-rules.md](./editorial-and-content-rules.md).

## 9. Bible Verses (`bible_verses` collection), Authors (`authors`), and Media (`media`)

- **`bible_verses`** — structured scripture citations reused across sermons (deduped server-side by `@idcr/content`'s version-scoped natural key `book|chapter|from|to|version` — see `docs/architecture/predica-bibleverse-reuse.md`). Key fields: `book`, `chapter`, `fromVerse`, `toVerse`, `verseContent`, `bibleVersion` (NVI for es-AR, NIV for en-US). Hydrated inline by `lib/content/getSermons.ts` via `loadBibleVerseMap()` and rendered by `ScriptureReferences`. _(Distinct from the rich-text `bibleVerse` prose field on Credo/ValueItem cards in §2.)_
- **`authors`** — reusable author / preacher / interpreter records (`name`, `avatarMediaId`, `email`), referenced by `posts` and `sermons` and hydrated via `lib/content/references.ts#loadAuthorMap()`.
- **`media`** — Media Library metadata documents pointing to **Vercel Blob** public URLs (`*.public.blob.vercel-storage.com`), carrying localized `alt`/`title`, dimensions, MIME type, size, and SHA-256 hash (used for deduplication and reference-usage tracking in `apps/admin`). Hydrated on `apps/web` via `lib/content/media.ts#loadMediaMap()`.

---

## Quick reference

| Collection (`@idcr/content`) | Getter (`apps/web/lib/content/…`)                                                    | Lookup key      | Rendered on                           |
| ---------------------------- | ------------------------------------------------------------------------------------ | --------------- | ------------------------------------- |
| `sections`                   | `getSection.ts` (+ wrappers)                                                         | `machineName`   | `[locale]` informational routes       |
| `belief_collections`         | `getContentCollection.ts`                                                            | `machineName`   | `/community` (Creed/Credo + values)   |
| `event_banners`              | `getEventBanner.ts`                                                                  | `machineName`   | `/come-meet-us`, event sections       |
| `posts`                      | `getBlogPostPages.ts`                                                                | `slug` / `_id`  | `/blog`, `/blog/[slug]`               |
| `sermons`                    | `getSermons.ts`                                                                      | `slug` / `_id`  | `/predicas`, `/predicas/[slug]`       |
| `bible_verses`               | `getSermons.ts` (`references.ts`)                                                    | `_id` (linked)  | sermon detail (`ScriptureReferences`) |
| `authors`                    | `references.ts` (inline)                                                             | `_id` (linked)  | blog posts & sermons                  |
| `topics`                     | `getChurchInfoTopic.ts`                                                              | `slug`          | `/[locale]/[topic]`                   |
| `seo_entries`                | `getSeo.ts`                                                                          | `machineName`   | metadata / `<head>`                   |
| `globals`                    | `getFooter.ts`, `getNavigationMenu.ts`, `getContactForm.ts`, `getSingleEmailForm.ts` | singleton / key | global footer, nav, forms             |
| `media`                      | `media.ts` (inline)                                                                  | `_id` (linked)  | images, audio, PDFs (Vercel Blob)     |

> **Reminder:** every getter takes `locale` and resolves localized fields from MongoDB. es-AR is the source of truth; keep en-US in sync. Sensitive (doctrinal) content lives in **`belief_collections`** (Credo/ValueItem) and the who-is-jesus/community **`sections`** — edit those with the guardrails in [editorial-and-content-rules.md](./editorial-and-content-rules.md).
