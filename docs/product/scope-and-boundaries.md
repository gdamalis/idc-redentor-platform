# IDC Redentor — Scope & Boundaries

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** The hard filter for what the IDC Redentor website is and is not. Every new idea or Trello card is checked against this. When in doubt, this document wins.
> **Last reviewed:** 2026-06-21
> **Status:** DRAFT — sensible defaults for the maintainer ([@gdamalis](https://github.com/gdamalis)) and church leadership to confirm/refine.

---

## IN scope — the core that must work

- **Informational pages, content-managed in Contentful** — home, "¿Quién es Jesús?" / who-is-jesus, community (mission, values, the Creed/Credo), and the worship-service "come meet us" page (service day/time + address + embedded map). Editable by non-technical editors without code changes, per locale.
- **Bilingual UI (es-AR primary, en-US secondary)** via next-intl. Content is authored per-locale in Contentful; UI strings live in `public/locales/{es-AR,en-US}.json`.
- **Blog** — articles with rich text, featured image, author, category, and published date; a lightweight, anonymous **"like"** (the only interactive/stateful reader feature). Related-posts surfacing.
- **Events / announcements** — event banners and event info (day of week, date, time, note, location), e.g. the **ladies conference** and recurring **worship services**, surfaced on the relevant pages.
- **Newsletter signup** — email capture to **Mailchimp**.
- **Contact form** — message capture (saved to MongoDB + emailed to the church), with spam/PII discipline.
- **SEO & shareability foundations** — per-page metadata, OpenGraph/Twitter cards, sitemap/robots, hreflang locale alternates, and structured data (JSON-LD) where it helps discovery.
- **Accessibility & performance** — a public church site must be fast, mobile-first, and accessible to everyone.

## OUT of scope — deliberately closed

These are intentional boundaries, not "not yet." An idea that reintroduces one should be **rejected or reframed**, not ticketed as-is.

- **Online donations / tithing / payments / e-commerce.** No payment processing, no store, no paid registration. _(If giving is ever needed, the answer is a link out to a dedicated, PCI-compliant provider — never card handling in this app. See DEFERRED.)_
- **User accounts / login / member portals / authentication.** The site is fully public and read-only to visitors; there is no auth, no RBAC, no gated content. This project has **no** authentication today, and adding it is a product decision, not an implementation detail.
- **Public user-generated content** — no public comments, reviews, ratings, forums, prayer-wall posting, or public event submission. The blog "like" is the only write path open to anonymous visitors, and it stores no PII beyond an anonymous visitor id. The contact form and newsletter signup are constrained, server-validated forms — not open content surfaces.
- **AI chatbot / LLM features in-product.** No on-site AI assistant, no generated answers, no chat widget. (AI is a _tooling/discoverability_ concern — see [ai-era-strategy.md](./ai-era-strategy.md) — not a product surface.)
- **Self-service event registration / ticketing / RSVP** with capacity, seat selection, or calendars-as-a-service. Events are informational; "register" means a link or a contact, not a booking system.
- **Streaming / media-hosting platform, sermon archive app, podcast backend.** Embeds of third-party media (YouTube, Vimeo, etc.) are fine; building a media platform is not.
- **Storing congregant personal data at scale** — membership databases, pastoral records, directories, attendance tracking. The only PII this app touches is contact-form submissions and newsletter emails; minimize, protect, and don't expand that surface casually.

### How to reframe a tempting idea

Most out-of-scope ideas have an in-scope reframe that keeps the _intent_ (welcome people, serve, stay connected, be findable) without opening a login, a payment surface, or a public write path.

| Tempting (out of scope)               | In-scope reframe                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Accept donations on-site              | Add a clearly-labeled outbound link/button to an external, PCI-compliant giving provider                                         |
| Member login / portal / gated content | Informational pages + a contact form; gate nothing                                                                               |
| Public prayer wall / comments         | Editor-curated testimonies/announcements in Contentful; contact form for private prayer requests                                 |
| Event RSVP / ticketing                | Event info page + "contact us to attend" or an outbound form link                                                                |
| On-site AI chat assistant             | Better SEO + structured data so assistants answer _about_ the church accurately (see [ai-era-strategy.md](./ai-era-strategy.md)) |
| Sermon streaming platform             | Embed YouTube/Vimeo on a page                                                                                                    |
| Member directory                      | Keep people's data out of the product; a contact form routes inquiries to leadership                                             |

## DEFERRED — plausible, on the roadmap, not now

Ticketable but tagged roadmap; revisit deliberately. Tie each to the discoverability thesis where relevant.

- **Structured data / JSON-LD** for `Church` / `Organization` (name, address, geo, service times), `Event` (services, conferences), `BlogPosting`, and `BreadcrumbList` — high-leverage for discovery (see [ai-era-strategy.md](./ai-era-strategy.md)). **Strong candidate for "do soon."**
- **Sermon / teaching archive** as Contentful content (text + embedded media), if leadership wants it.
- **Multi-campus / multiple service locations** if the church grows. (The `LocationComponent` model already supports a single location; multi-location would be a deliberate extension.)
- **`llms.txt` + richer OG cards** for AI-era discoverability.
- **Online giving via an external, embedded, PCI-compliant provider** — only if leadership decides, and only as an integration/outbound link, never as in-app card handling.

---

## Using this document

The `product-manager` agent loads this file on every run and applies it as a filter:

- An idea inside **IN scope** → draft a Trello card.
- An idea in **OUT of scope** → reject it or offer the reframe above, citing the specific boundary.
- An idea in **DEFERRED** → card it, tag it roadmap/deferred, and tie it to the discoverability/structured-data thesis.
