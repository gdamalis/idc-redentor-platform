# IDC Redentor — AI-Era Strategy (Discoverability)

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The opinionated thesis for how the IDC Redentor website should be found and understood in the AI era — by people, search engines, and AI assistants. This is the lens the `product-manager` agent uses to rank discovery/SEO ideas.
> **Last reviewed:** 2026-07-14

---

## The thesis (for a church, not a corpus play)

When someone — or their AI assistant — searches for a church in the area, asks _"¿qué cree la Iglesia de Cristo Redentor?"_, or looks up _"a qué hora son los cultos"_ / _"church service times near me,"_ the answer should be **accurate and trace back to this site.**

The leverage is **structured data + clean metadata**, not an on-site bot. We are explicitly **not** building an AI chatbot (see [scope-and-boundaries.md](./scope-and-boundaries.md)). Instead, we make the church's beliefs, service times, and location so legible to crawlers and assistants that, when asked, they get the church right — its name, what it believes, when it gathers, and how to find it.

In other words: the AI-era job of a church website isn't to _talk_ to visitors with AI; it's to be the **trustworthy, machine-readable source** that the AI tools people already use will read and repeat correctly.

## What we already have to work with

The content needed for great structured data already exists in Contentful (see [content-types.md](./content-types.md)):

- **Beliefs** — the Creed/Credo and values (`ContentCollection`: Credo + ValueItem).
- **Service times & events** — `EventBanner` → `Event` (`name`, `dayOfWeek`, `date`, `time`, `note`).
- **Location & geo** — `LocationComponent` (`addressLine1`, `neighborhood`, `city`, `country`, `mapEmbedUrl`, `googleMapsUrl`, `location { lat, lon }`).
- **Identity & socials** — `Footer` (logo, short description, social links).
- **Articles** — `BlogPostPage` (title, author, dates, body).
- **Sermons** — `Sermon` (title, `sermonDate`, thesis, main points, rich-text body, `durationSeconds`, a self-hosted `audio` asset, a `pdfSummary`, `preacher` → `Author`) with **structured** `BibleVerse` scripture references (`book`, `chapter`, `fromVerse`, `toVerse`, `bibleVersion`). _Already serialized — **the one JSON-LD type that ships today**: `lib/sermonMetadata.ts#buildSermonJsonLd` emits an `Article` with a nested `AudioObject` (contentUrl + duration) on `/predicas/[slug]`. Treat sermons as **done** for structured data; the gap is the types below._
- **Per-page metadata** — inline `Page.seo` and the `Seo` content type.

The gap is mostly **serialization**: turning this structured content into JSON-LD and complete metadata. That makes the early wins cheap and high-leverage.

## Priorities, in order

1. **JSON-LD on the key pages.** This is the biggest, cheapest win — the content is already structured.
   - `Church` / `Organization` on home/come-meet-us — name, `address` (from `LocationComponent`), `geo` (lat/lon), service times, `sameAs` (social links from `Footer`).
   - `Event` for the worship services and special events (e.g. the ladies conference) — fed by `EventBanner` → `Event`.
   - `BlogPosting` per blog article — fed by `BlogPostPage`.
   - `BreadcrumbList` on nested routes.
     _(These are the DEFERRED "do soon" items in [scope-and-boundaries.md](./scope-and-boundaries.md). Tie the implementation cards to this section.)_
2. **OG / Twitter cards on every page.** Extend `lib/metadata.ts` so every route emits complete OpenGraph + Twitter tags with a real per-page image (default 1200×630). Shared links should look right in WhatsApp, Instagram, and search previews — the channels a church actually uses.
3. **Crawlability.** A correct `sitemap.xml` (blog slugs come from `getAllBlogPostSlugs`), a sensible `robots.txt`, stable **canonical** URLs, and correct **hreflang** alternates for es-AR / en-US so the right language surfaces for the right person.
4. **`llms.txt`.** Publish a plain-language `llms.txt` describing the church — who it is, what it believes (summary + link to the Creed/Credo), service day/time and address, and how to make contact — so assistants have a clean, authoritative summary to read.
5. **Local discovery (consistent NAP).** Keep **N**ame, **A**ddress, **P**hone consistent everywhere — the site, Google Business Profile, and social profiles. Inconsistent NAP is the most common reason local/"near me" answers go wrong. Link the Google Business Profile and keep service times in sync with the site.

## Why this order

- **Structured data first** because the content is already there — it's the highest ratio of discovery value to effort, and it directly answers the three questions people/assistants ask (beliefs, service times, location).
- **OG/metadata second** because shared links are how a church grows online, and the fix is contained to `lib/metadata.ts`.
- **Crawlability + `llms.txt` + NAP** make sure the structured data is actually reached, read, and corroborated across the web.

## KPIs

- **Accurate AI answers** about the church — when an assistant is asked who IDC Redentor is, what it believes, and when/where it gathers, the answer is correct and points here. _(Spot-check periodically across assistants.)_
- **Local / "near me" and branded search presence** — the church appears for relevant local and name searches, with correct service times and address.
- **Organic discovery** — new visitors arriving from search, and growth in shared-link reach (OG previews) on the channels the church uses.
- **Structured-data coverage** — share of key pages emitting valid JSON-LD (services, location, beliefs, blog posts) with no validation errors.

---

## How the `product-manager` agent uses this

Rank discovery ideas against these priorities. A "let's add an AI chatbot" idea is **out of scope** — reframe it as "make our structured data and metadata so good that the assistants people already use answer _about_ us accurately." Tie structured-data and OG-card cards back to the DEFERRED list in [scope-and-boundaries.md](./scope-and-boundaries.md).
