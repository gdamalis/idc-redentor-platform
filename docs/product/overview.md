# IDC Redentor — Product Overview

> **Purpose:** The canonical statement of what the IDC Redentor website is, who it's for, and what it stands for. If you read one product doc, read this one.
> **Last reviewed:** 2026-07-14
> **Status:** DRAFT — mission, values, and voice are sensible starting points for church leadership ([@gdamalis](https://github.com/gdamalis) + leadership) to confirm/refine. Doctrinal wording is **human-to-confirm**, not agent-invented.

---

## What the site is (in one paragraph)

The IDC Redentor website is the official, bilingual (es-AR primary, en-US secondary) home of **Iglesia de Cristo Redentor** on the web. It is a welcoming, informational site that explains who Jesus is, what the church believes (the Creed/Credo), what the community is about (its mission and values), when and where the church gathers, and how to get in touch — plus a blog for teaching and news, and a newsletter signup to stay connected. It is built on **Next.js + Contentful**, so non-technical editors can keep it current without code changes. It is **not** an application: there are no user accounts, no payments, and no public user-generated content. Its job is to be warm, trustworthy, fast, accessible, and easy for both people and AI assistants to discover and understand.

## Who it serves

- **Members of the congregation** — who need service times, location, news, the blog, and a way to point friends and family to the church.
- **Visitors and newcomers** — people considering attending for the first time, who want to know what the church is like, what it believes, and exactly when and where to show up.
- **Seekers** — people exploring faith, who may land on "¿Quién es Jesús?" or the blog from a search or a shared link, and should feel welcomed rather than processed.
- **AI assistants and search engines** — increasingly the first thing a person asks "is there a church near me / what does this church believe / when are the services." The site should give them accurate, structured answers that trace back here (see [ai-era-strategy.md](./ai-era-strategy.md)).

The center of gravity is **Argentina and the Spanish-speaking community**: es-AR is the primary language and source of truth; en-US is the secondary translation for reach and for non-Spanish-speaking visitors.

## Mission

> **DRAFT — for church leadership to confirm/refine. Do not treat as official doctrine until confirmed.**

A church-appropriate working statement, to be refined with leadership and aligned to the mission text the church already maintains in Contentful:

> **To proclaim Jesus Christ, gather and build a loving community of disciples, welcome the newcomer, and serve our neighborhood — in Buenos Aires and online.**

This is a placeholder that captures the recurring themes of a local church website (proclaim, gather, welcome, serve). The authoritative mission wording is **leadership-owned**; once confirmed, mirror it here and in the Contentful mission/community content.

## Values

> **DRAFT — for church leadership to confirm/refine.** These are common, non-controversial church values offered as a starting frame; the church's own **Creed/Credo and "ValueItem" entries in Contentful are the real, authoritative source.** Agents must not invent or alter doctrine — see [editorial-and-content-rules.md](./editorial-and-content-rules.md).

Candidate values to anchor copy and tone (confirm/replace with leadership):

1. **Christ at the center** — Jesus, the Scriptures, and the gospel are the reason the church exists.
2. **Welcome & hospitality** — the newcomer and the seeker are received warmly, without insider jargon or hoops.
3. **Community** — faith is lived together; the site helps people find and join real people, not just read pages.
4. **Service** — love expressed in action toward the neighborhood and the wider world.
5. **Clarity & trust** — say true things plainly; make it easy to know what the church believes and how to come.

The site already expresses values concretely through the **Creed/Credo** and **ValueItem** content (each with a title, description, a Bible verse, and an image). Treat those entries — not this list — as the doctrinal source; this list exists only to keep product copy and tone consistent.

## Brand voice

The voice is **warm, hospitable, reverent-but-accessible, and Spanish-first**:

- **Warm and welcoming.** Speak to a real person who might be nervous about visiting a church for the first time. Hospitality over formality.
- **Reverent but accessible.** Treat faith and Scripture with respect, but avoid insider shorthand, denominational jargon, or assumed knowledge on public pages. Explain, don't gatekeep.
- **Spanish-first (es-AR), plain language.** Argentine Spanish is the primary register; write it naturally, then translate to en-US. Short sentences, concrete words, second person ("vos/usted" per the church's preference — confirm with leadership).
- **Honest and unpushy.** Never salesy, never manipulative, never fear-based. Invite; don't pressure.
- **Quietly confident.** Clear about what the church believes (the Creed/Credo), without arguing or talking down to anyone.

**Trap to avoid:** leading with logistics or mechanism instead of welcome. Lead with the invitation and the person ("Te esperamos" / "You're welcome here"), then give the practical details (time, address, map).

## Audience surfaces (mapped to routes)

The site is a small set of well-defined surfaces. Each maps to a route and to Contentful content:

| Surface                             | Route (under `[locale]`)        | What it does                                                                                                                                          | Primary Contentful content                                                                |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Home**                            | `/`                             | Welcome + overview; routes people to who-is-Jesus, community, come-meet-us, blog                                                                      | `Page` (hero, CTA, duplex, text blocks) + an `EventBanner`                                |
| **¿Quién es Jesús? / Who is Jesus** | `/who-is-jesus`                 | Explains the gospel for seekers and newcomers                                                                                                         | `Page` + text/duplex sections                                                             |
| **Community**                       | `/community`                    | Mission, values, and the **Creed/Credo**                                                                                                              | `Page` + `ContentCollection` (Credo + ValueItem) + `EventBanner` (e.g. ladies conference) |
| **Come meet us**                    | `/come-meet-us`                 | Service day/time, address, neighborhood, and an embedded map                                                                                          | `Page` + `EventBanner` → `Event` + `LocationComponent`                                    |
| **Blog**                            | `/blog`, `/blog/[slug]`         | Teaching and news articles; anonymous "like"                                                                                                          | `BlogPostPage`                                                                            |
| **Sermons (Prédicas)**              | `/predicas`, `/predicas/[slug]` | Sermon archive: thesis, main points, scripture, rich-text body, downloadable PDF summary, and an inline self-hosted audio recording; anonymous "like" | `Sermon` → `Author` (preacher), `BibleVerse`                                              |
| **Newsletter signup**               | (component, e.g. footer/CTA)    | Email capture to Resend (per-locale audiences)                                                                                                        | UI + `/api/subscribe`                                                                     |
| **Contact**                         | (form, e.g. on a page/footer)   | Message capture (saved + emailed to the church)                                                                                                       | UI + `contactFormAction.ts` (a **Server Action** — there is no `/api` contact route)      |
| **Footer / nav (site chrome)**      | global                          | Logo, short description, social links, address; menu                                                                                                  | `Footer` → `SocialLink`, `NavigationMenu` → `MenuGroup`                                   |

See [content-types.md](./content-types.md) for the exact fields and getters behind each surface.

---

## The product doc set

This file is the entry point. The rest:

- **[scope-and-boundaries.md](./scope-and-boundaries.md)** — what's IN, what's deliberately OUT, and what's DEFERRED. _The hard filter._
- **[content-types.md](./content-types.md)** — the real Contentful content types and how they're read and rendered.
- **[editorial-and-content-rules.md](./editorial-and-content-rules.md)** — bilingual rule, voice, the doctrinal guardrail, images, SEO copy, publish/preview.
- **[ai-era-strategy.md](./ai-era-strategy.md)** — the discoverability thesis (structured data + clean metadata) and KPIs.
