# IDC Redentor — Scope & Boundaries

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The hard filter for what the IDC Redentor website is and is not. Every new idea or Jira issue is checked against this. When in doubt, this document wins.
> **Last reviewed:** 2026-07-14
> **Status:** DRAFT — sensible defaults for the maintainer ([@gdamalis](https://github.com/gdamalis)) and church leadership to confirm/refine.

---

## Two products in this repo

This repo is a monorepo with **two distinct products**, and **this document governs the public
website only** (`apps/web`):

- **Public website — `apps/web`** (this doc): public, read-only, content-managed, informational.
  **No auth, no RBAC, no user accounts, minimal PII** — the boundaries below are permanent and
  intentional for this surface.
- **Ministry Admin Panel — `apps/admin`** (a separate, **planned** product —
  **`apps/admin/` has not been created yet**; the pnpm workspace glob is ready and
  [`tasks/specs/admin-platform-brief.md`](../../tasks/specs/admin-platform-brief.md) is a **DRAFT**
  brief): an internal, **authenticated, access-controlled** tool for the leadership team —
  deliberately the inverse of the public site (write-heavy, RBAC, congregant PII + later finances).
  It will be governed by that brief, **not** by this document. It is designed to share brand/UI with
  the website via `packages/` (which today only `apps/web` consumes), but the two products'
  boundaries are separate.

So "no login / no RBAC / no PII at scale" below means **not in the public website** — those
capabilities are exactly what the separate `apps/admin` product exists to provide, safely and
privately.

---

## IN scope — the core that must work

- **Informational pages, content-managed in Contentful** — home, "¿Quién es Jesús?" / who-is-jesus, community (mission, values, the Creed/Credo), and the worship-service "come meet us" page (service day/time + address + embedded map). Editable by non-technical editors without code changes, per locale.
- **Bilingual UI (es-AR primary, en-US secondary)** via next-intl. Content is authored per-locale in Contentful; UI strings live in `public/locales/{es-AR,en-US}.json`.
- **Blog** — articles with rich text, featured image, author, category, and published date; a lightweight, anonymous **"like"** (slug-keyed via `/api/likes` — the same like also serves sermons). Related-posts surfacing.
- **Sermon archive (`/predicas`)** — sermons as Contentful content (title, thesis, main points, scripture references, rich-text body, a downloadable **PDF summary**, and a **self-hosted audio** recording played inline on the sermon's own page), plus the **`/predica` pipeline** that produces them. Carries the same anonymous **"like"** as blog posts. _Shipped today: the recording is authored at the **default locale** (es-AR) only — `sermonEntry.ts` writes `audio` with `atDefault(…)` — and the en-US page surfaces that same file with an "audio is in Spanish" note. **Per-locale audio is IN scope but NOT yet built: it is [ICR-146](https://divinelab.atlassian.net/browse/ICR-146).** Read this bullet as the scope boundary, not as a description of what already works._
- **Events / announcements** — event banners and event info (day of week, date, time, note, location), e.g. the **ladies conference** and recurring **worship services**, surfaced on the relevant pages.
- **Newsletter signup** — email capture to **Resend** (per-locale audiences: `/api/subscribe` → `subscribe.service.ts` → `resendAudience.ts`).
- **Contact form** — message capture (saved to MongoDB + emailed to the church), with spam/PII discipline.
- **SEO & shareability foundations** — per-page metadata, OpenGraph/Twitter cards, sitemap/robots, hreflang locale alternates, and structured data (JSON-LD) where it helps discovery.
- **Accessibility & performance** — a public church site must be fast, mobile-first, and accessible to everyone.

## OUT of scope — deliberately closed

These are intentional boundaries, not "not yet." An idea that reintroduces one should be **rejected or reframed**, not ticketed as-is.

- **Online donations / tithing / payments / e-commerce.** No payment processing, no store, no paid registration. _(If giving is ever needed, the answer is a link out to a dedicated, PCI-compliant provider — never card handling in this app. See DEFERRED.)_
- **User accounts / login / member portals / authentication.** The site is fully public and read-only to visitors; there is no auth, no RBAC, no gated content. This project has **no** authentication today, and adding it is a product decision, not an implementation detail. _This boundary governs the **public website (`apps/web`)**; authenticated leadership tooling lives in the separate `apps/admin` Ministry Admin Panel (see `tasks/specs/admin-platform-brief.md`), never in the public site._
- **Public user-generated content** — no public comments, reviews, ratings, forums, prayer-wall posting, or public event submission. The anonymous **"like"** — slug-keyed via `/api/likes`, serving **blog posts and sermons** alike — is the only write path open to anonymous visitors, and it stores no PII beyond an anonymous visitor id. The contact form and newsletter signup are constrained, server-validated forms — not open content surfaces.
- **AI chatbot / LLM features in-product.** No on-site AI assistant, no generated answers, no chat widget. (AI is a _tooling/discoverability_ concern — see [ai-era-strategy.md](./ai-era-strategy.md) — not a product surface.)
- **Self-service event registration / ticketing / RSVP** with capacity, seat selection, or calendars-as-a-service. Events are informational; "register" means a link or a contact, not a booking system.
- **Streaming / media-hosting platform, podcast backend, media app.** No transcoding service, no channels / subscriptions / RSS or podcast feeds, no video hosting, no live streaming. A sermon's **self-hosted audio** — at most one recording per locale, played inline on the sermon's own page — is the **ceiling** (an upper bound on what may be built, not a claim about what ships today; see the sermon-archive entry under IN scope). Third-party video **embeds** (YouTube, Vimeo, etc.) on a page remain fine; **self-hosted video is not**.
- **Storing congregant personal data at scale** — membership databases, pastoral records, directories, attendance tracking. The only PII this app touches is contact-form submissions and newsletter emails; minimize, protect, and don't expand that surface casually. _(Congregant data at scale is the domain of the separate, access-controlled `apps/admin` product — kept out of `apps/web` by design.)_

### How to reframe a tempting idea

Most out-of-scope ideas have an in-scope reframe that keeps the _intent_ (welcome people, serve, stay connected, be findable) without opening a login, a payment surface, or a public write path.

| Tempting (out of scope)                  | In-scope reframe                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accept donations on-site                 | Add a clearly-labeled outbound link/button to an external, PCI-compliant giving provider                                                                                                                                                               |
| Member login / portal / gated content    | Informational pages + a contact form; gate nothing                                                                                                                                                                                                     |
| Public prayer wall / comments            | Editor-curated testimonies/announcements in Contentful; contact form for private prayer requests                                                                                                                                                       |
| Event RSVP / ticketing                   | Event info page + "contact us to attend" or an outbound form link                                                                                                                                                                                      |
| On-site AI chat assistant                | Better SEO + structured data so assistants answer _about_ the church accurately (see [ai-era-strategy.md](./ai-era-strategy.md))                                                                                                                       |
| Sermon streaming platform / podcast feed | Sermon archive: Contentful `sermon` entries with one self-hosted audio asset + a PDF summary on the sermon's own page (shipped — `/predicas`). Feeds, channels, transcoding, and live streaming stay out; a third-party video embed on a page is fine. |
| Member directory                         | Keep people's data out of the product; a contact form routes inquiries to leadership                                                                                                                                                                   |

## DEFERRED — plausible, on the roadmap, not now

Ticketable but tagged roadmap; revisit deliberately. Tie each to the discoverability thesis where relevant.

- **`BreadcrumbList` JSON-LD** on nested routes. ⚠️ **The rest of the JSON-LD roadmap already SHIPPED** — `Organization` (site-wide), `Event` (come-meet-us), `BlogPosting` (blog detail), and `Article` + `AudioObject` (sermon detail) all render today via `lib/metadata.ts` / `lib/sermonMetadata.ts`, so **only `BreadcrumbList` remains** deferred. Check the code before filing a structured-data card (see [ai-era-strategy.md](./ai-era-strategy.md)).
- **Multi-campus / multiple service locations** if the church grows. (The `LocationComponent` model already supports a single location; multi-location would be a deliberate extension.)
- **`llms.txt` + richer OG cards** for AI-era discoverability.
- **Online giving via an external, embedded, PCI-compliant provider** — only if leadership decides, and only as an integration/outbound link, never as in-app card handling.

---

## Using this document

The `product-manager` agent loads this file on every run and applies it as a filter:

- An idea inside **IN scope** → draft a Jira issue.
- An idea in **OUT of scope** → reject it or offer the reframe above, citing the specific boundary.
- An idea in **DEFERRED** → create an issue, tag it roadmap/deferred, and tie it to the discoverability/structured-data thesis.
