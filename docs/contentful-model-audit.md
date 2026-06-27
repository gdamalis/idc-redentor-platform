# Contentful Content-Model Audit & Optimization Plan

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** A full audit of the Contentful content model (space `vg9le24yw8hb`) against the codebase and the `docs/` engineering + product docs, with a ranked, sequenced plan to simplify it. This is the source-of-truth reference for the model-cleanup backlog (the "Contentful model optimization" Trello epic). Read this before touching any content type, getter, or migration.
>
> **Method:** content types pulled live via the Contentful MCP from `master`; entry counts queried per type; code wiring mapped from `lib/contentful/get*.ts`, the section resolver, and the `[locale]` routes. Read-only — no model or code was changed to produce this.
>
> **Audited:** 2026-06-23 · **Space:** `vg9le24yw8hb` · **Env:** `master` · **Types:** 24 · **Entries:** ~48 total

---

## 1. Headline finding — two competing architectures

The space carries **two architectures, and one is ~80% dead weight.**

1. **A generic "page builder"** — a `page` type with three section slots (`topSection` / `pageContent` / `extraSection`), composed from `componentHeroBanner / componentCta / componentDuplex / componentTextBlock / componentQuote`, resolved at render by a `__typename` switch. This is **inherited from a Contentful marketing/composable starter template**, not something the team designed. Fingerprints:
   - rich-text fields validate against `nt_mergetag` (the **Ninetailed** personalization app) — a feature this site doesn't use;
   - `componentQuote` has a `colorPalette` enum of hex values (`1. White (#FFFFFF)` …) — a starter-template tell;
   - validations link to **types that don't exist** in the space: `topicPerson` (from `componentQuote`) and `post` (from `componentDuplex`).

2. **What the team actually built** — fixed React routes (`who-is-jesus`, `community`, `come-meet-us`, `blog`, home) that fetch **specific named blocks by `machineName`** and render them in hardcoded layouts.

**The page-builder is barely alive.** Only the blog index calls `getPage`, uses only its `extraSection`, and the resolver only knows how to render **one** typename:

- `src/components/features/component-resolver/component-resolver.tsx:15-18` — handles `ComponentCta`.
- `…:19-22` — every other `__typename` hits `console.warn("…is not implemented") → return null`.
- Only consumer: `src/app/[locale]/blog/page.tsx:45`, fed `landingPage.extraSectionCollection`.

So `getPage` over-fetches a large `pageContent` fragment for `ContentCollection`/`EventBanner` (`getPage.ts:160-201`) and Hero/Duplex/TextBlock sections (`getPage.ts:203-276`) that **nothing can render**. The blog page discards `topSection`, `pageContent`, `seo`, `pageName`, `slug` and uses only `extraSection` (`blog/page.tsx:31,45`).

**Conclusion:** for a 6-route informational site maintained by non-technical editors, the page-builder is over-engineering that never shipped. The single highest-leverage optimization is to **pick one philosophy and delete the other** — recommended: **drop the page-builder, formalize the "named blocks" pattern already in use.** The data volume (~48 entries total) makes every migration below low-risk.

---

## 2. Full inventory (24 content types)

Entry counts from `master`. **Read?** = a `lib/contentful/get*.ts` getter queries it. **Rendered?** = it reaches the DOM. Verdict legend: ✅ keep · ⚠️ change · ❌ remove.

| #   | Content type          | Entries | Read by code                   | Rendered on                    | Verdict                        |
| --- | --------------------- | ------: | ------------------------------ | ------------------------------ | ------------------------------ |
| 1   | `page`                |       3 | `getPage`                      | blog index `extraSection` only | ⚠️ Slim to route/SEO registry  |
| 2   | `componentHeroBanner` |       1 | `getHeroBanner`                | home (`OurMissionCta`)         | ⚠️ Merge → `section`           |
| 3   | `componentCta`        |       1 | `getCta`                       | home, community, blog post     | ⚠️ Merge → `section`           |
| 4   | `componentDuplex`     |       1 | `getDuplex` **(never called)** | **nowhere**                    | ⚠️ Merge → `section` / retire  |
| 5   | `componentTextBlock`  |       2 | `getTextBlock`                 | community, come-meet-us        | ⚠️ Merge → `section`           |
| 6   | `componentQuote`      |   **0** | none — named `[UNUSED]`        | nowhere                        | ❌ **Delete**                  |
| 7   | `contentCollection`   |       2 | `getContentCollection`         | home, community                | ✅ Keep                        |
| 8   | `credo`               |       7 | inline fragment                | community (`CreedSection`)     | ⚠️ Merge with `valueItem`      |
| 9   | `valueItem`           |       3 | inline fragment                | home / community               | ⚠️ **Duplicate of `credo`**    |
| 10  | `eventBanner`         |       1 | `getEventBanner`               | come-meet-us                   | ✅ Keep                        |
| 11  | `event`               |       1 | inline (via eventBanner)       | come-meet-us                   | ✅ Keep (JSON-LD value)        |
| 12  | `locationComponent`   |       1 | inline (eventBanner + footer)  | come-meet-us, footer           | ✅ Keep (reused)               |
| 13  | `blogPostPage`        |       3 | `getBlogPostPages`             | blog                           | ✅ Keep                        |
| 14  | `author`              |       2 | inline                         | blog                           | ✅ Keep                        |
| 15  | `footer`              |       1 | `getFooter`                    | layout                         | ✅ Keep (singleton)            |
| 16  | `socialLink`          |       2 | inline (via footer)            | footer                         | ✅ Keep                        |
| 17  | `navigationMenu`      |       1 | `getNavigationMenu`            | layout                         | ✅ Keep (singleton)            |
| 18  | `menuGroup`           |       3 | inline (via nav)               | navbar                         | ✅ Keep (1 dead field)         |
| 19  | `seo`                 |       5 | `getSeo`                       | metadata                       | ✅ Keep                        |
| 20  | `contactForm`         |       1 | `getContactForm`               | come-meet-us                   | ✅ Keep (singleton)            |
| 21  | `formField`           |       4 | inline (via contactForm)       | come-meet-us                   | ✅ Keep                        |
| 22  | `singleEmailForm`     |       1 | `getSingleEmailForm`           | layout (`SubscribeBanner`)     | ✅ Keep (singleton)            |
| 23  | `bibleVerse`          |       1 | inline (contactForm only)      | come-meet-us                   | ⚠️ Modeled twice — standardize |
| 24  | `churchInfoTopic`     |       1 | none                           | **nowhere**                    | ❌ Build it or delete          |

**Phantom types** — referenced in validations but **not present** in the space (template residue, all safe to strip): `topicPerson` (← `componentQuote`), `post` (← `componentDuplex.targetPage` + bodyText), `nt_mergetag` (← Hero/Cta/Duplex/Quote rich text; Ninetailed app not in use).

---

## 3. Recommendations, ranked

Each tier is independently shippable and verifiable on a Vercel preview. Tier order = recommended execution order (cheapest/safest first).

### Tier 1 — Pure deletions (no migration, no render change)

- **T1 · Delete `componentQuote`** — 0 entries, literally named `[UNUSED]`, zero code references, links to the nonexistent `topicPerson`. Nothing to migrate.
- **T2 · Resolve `churchInfoTopic`** — created for "evergreen content like Privacy Policy," but has no getter and renders nowhere (1 orphan entry). The site collects PII (contact form) and runs a newsletter, so a privacy/terms page is genuinely warranted. **Decide:** either build a `/[locale]/[topic]` route that consumes it, or delete the type. Do not leave it as a 1-entry orphan.
- **T3 · Strip phantom references** — remove `post` from `componentDuplex` validations and `topicPerson` / `nt_mergetag` from the rich-text validations of the surviving components. Invisible landmines that confuse editors and future codegen.

### Tier 2 — Retire the dead architecture (highest leverage)

- **T4 · Retire the page-builder rendering path.** Render the blog index's appended CTA by `machineName` (the pattern every other page already uses), then delete the section resolver, the `getPage` section fragments, and the `topSection` / `pageContent` / `extraSection` array fields on `page`. Output renders identically.
- **T5 · Slim `page` into a route/SEO registry.** Keep `internalName`, `pageName`, `slug`, `seo` — because `componentCta.targetPage`, `componentHeroBanner.targetPage`, and `menuGroup.groupLink` link to `page.slug` to stay in sync with real routes. Telling detail: **6 routes, but only 3 `page` entries and 5 `seo` entries** — `page` was never a true 1:1 page model; it's a link target.
- **T6 · Retire `componentDuplex`** — 1 entry, dead getter (`getDuplexComponent.ts` is never imported), never resolved. Fold into the merged `section` type (T8) or remove.

### Tier 3 — Merge the overlaps

- **T7 · Merge `credo` + `valueItem` into one type.** They are **field-for-field identical** (`title`, `description` RT, `bibleVerse`, `image`, `machineName`/`internalName`). `valueItem` was added 2025-11-30 as a duplicate; the getter already returns both as `creedItems` interchangeably. Merge to a single `beliefItem` with an optional `kind` enum (`Creed` | `Value`) if filtering is ever needed. **Doctrinal content is untouched — the _type_ merges, the words don't.** 10 entries to remap. ⚠️ Sensitive (doctrinal) — leadership-owned per `docs/product/editorial-and-content-rules.md`.
- **T8 · Merge the promo blocks (`Hero` / `Cta` / `TextBlock`; `Duplex` is deleted in T6) into one `section` type with a `layout` enum.** They share a **common core** — `headline`, a rich-text body, `internalName`, `machineName` — but **not** the rest. "Layout is a _field_, not a _type_," **but the layout-specific fields are real and must survive the migration as optionals** — do **not** treat these as "differ only by layout" or the merge will drop content / mark the wrong fields required. Per-layout optional fields:
  - **hero** → `subHeadline`, `image`, `additionalImages` (gallery), `ctaText`, `targetPage`
  - **cta** → `subline` (rich text), `ctaText`, `targetPage`, `urlParameters` _(no image)_
  - **textBlock** → `subtitle`, `body` (rich text), **`images`** (gallery, max 5) _(no ctaText/targetPage/image)_

  ⚠️ **`componentTextBlock.images` feeds the community `PhotoGrid`** — `getTextBlockComponent.ts` requests `imagesCollection`, rendered via `InfoCommunity` + `PhotoGrid` on the community page. The merge **must preserve it** or the community page loses its image grid. Also reconcile the **differing rich-text field names** across blocks (`bodyText` on hero, `subline` on cta, `body` on textBlock) into the one shared body field. Net: the `section` type = core + a union of the optional fields above, **none made required** beyond `layout`/`internalName`/`machineName`. Only **~5 entries** to remap, but it's the **only item with real code churn** (unifies the React components + getters), so it lands last / on its own.

### Tier 4 — Consistency & field hygiene

- **T9 · Standardize `bibleVerse` as the structured type everywhere.** Today it's modeled **two ways**: a clean structured type (`book`/`chapter`/`fromVerse`/`toVerse`/`verseContent`/`bibleVersion`, 1 entry, linked only from `contactForm`) **and** as freeform rich text inside `credo`/`valueItem`. Standardizing on the structured type unlocks features (verse-of-the-day, Bible-API/Logos linking, consistent formatting) and is strong structured data for a scripture-centric site.
- **T10 · Remove dead fields inside live types:**
  - `menuGroup.featuredPages` (max 4) — never queried; a mega-menu that was never built.
  - `componentHeroBanner.additionalImages` — fetched but the component has it commented out.
  - `formField.validation` — requested at `getContactForm.ts:30` but never read by the renderer (only `required` is used).
- **T11 · Localize `blogPostPage.category`** — a non-localized English enum (`Community` / `Events` / `Spiritual Growth`) shown to an es-AR-first audience. Localize it or store a localized display label.
- **T12 · Standardize the naming convention.** Most types use `internalName` (display) + `machineName` (unique lookup), but `menuGroup` uses `internalTitle`, `seo`'s display field is `name`, and `navigationMenu` is looked up by `internalName` with no `machineName`. Standardize on `internalName` + `machineName` everywhere so the getters and editor UI are uniform.

### Keep as-is — correctly modeled (do not "optimize")

- **`event` + `eventBanner` + `locationComponent`** look over-normalized for one weekly service, but this is the _right_ place to normalize: it maps cleanly to schema.org `Event` + `Place`, `locationComponent` is reused by the footer, and it directly serves the "service times near me" / AI-era goals in `docs/product/ai-era-strategy.md`. (`eventBanner` is a thin wrapper you _could_ flatten, but the payoff is marginal — leave it.)
- **`contactForm` + `formField`**, **`footer` + `socialLink`**, **`navigationMenu` + `menuGroup`**, **`singleEmailForm`** — appropriately modeled singletons/records. Keep.

---

## 4. Cross-cutting suggestions (beyond the type list)

- **S1 · Environment hygiene workflow.** The space has `master`, a stale `master-0.0.1` snapshot, and a fresh `agent-sandbox`. Adopt: make model changes in `agent-sandbox` → verify against a preview → merge to `master`; delete the stale `master-0.0.1` once confirmed unused. This is what makes the cascading changes above safe to land. (`master` is protected via `PROTECTED_ENVIRONMENTS=master` for the MCP — see `docs/contentful-mcp.md`.)
- **S2 · JSON-LD structured data.** Once `bibleVerse`, `event`, and `location` are consistently structured, the site is one step from emitting `Event`, `Place`, `Church`/`Organization`, and `BlogPosting` JSON-LD — the highest-ROI discovery work for a small church site, already on the `ai-era-strategy.md` roadmap.
- **S3 · Contact-form coupling gotcha.** The Bible verse on the contact form is rendered **only inside the `content.image &&` block** (`ContactForm.tsx:103,112-116`), so a verse set without an image silently disappears. The form heading **"Send us a Message"** is also hardcoded (`ContactForm.tsx:129`) — not from Contentful, not i18n'd. Worth a small follow-up.
- **S4 · `getPage` null-safety.** `getPage.ts:307` indexes `items[0].pageName` directly; a missing `blog` page entry for a locale throws. If the page-builder is retired (T4), this risk disappears with it.

---

## 5. Target model

From **24 → ~14** content types.

- **Singletons:** `footer`, `navigationMenu`, `contactForm`, `singleEmailForm`
- **Composition:** `page` (slimmed → route/SEO registry), `section` (merged block + `layout` enum)
- **Domain:** `contentCollection`, `beliefItem` (merged credo/value), `blogPostPage`, `author`, `eventBanner`, `event`, `locationComponent`, `seo`, `bibleVerse`, `socialLink`, `formField`, `menuGroup`
- **Removed:** `componentQuote`, `componentHeroBanner`, `componentCta`, `componentDuplex`, `componentTextBlock` (→ `section`), `valueItem` (→ `beliefItem`), and `churchInfoTopic` (unless built)

_(Exact count depends on the `churchInfoTopic` and `section`-vs-keep-separate decisions; ~14 is the target if both consolidations land.)_

---

## 6. Sequencing & risk

| Step   | Cards  | Migration             | Code churn                 | Risk                        |
| ------ | ------ | --------------------- | -------------------------- | --------------------------- |
| Tier 1 | T1–T3  | none                  | minimal                    | very low                    |
| Tier 2 | T4–T6  | drop fields on `page` | resolver + `getPage`       | low (renders identically)   |
| Tier 3 | T7     | remap 10 entries      | one inline fragment        | low (⚠️ doctrinal)          |
| Tier 3 | T8     | remap 5 entries       | unify getters + components | medium (only invasive step) |
| Tier 4 | T9–T12 | per-item              | small                      | low                         |

**Why the risk is acceptable:** ~48 entries total across the whole space; every consolidation touches single-digit entry counts. The owner has explicitly accepted the cascade-of-edits risk in exchange for a clean model. Do model edits in `agent-sandbox`, diff a Vercel preview against `master`, then merge.

---

## Appendix — key code references

- Section resolver (only `ComponentCta`): `src/components/features/component-resolver/component-resolver.tsx:15-22`
- Page-builder consumer: `src/app/[locale]/blog/page.tsx:31,45`
- `getPage` over-fetch fragments: `lib/contentful/getPage.ts:160-201` (pageContent), `203-276` (extraSection), `307` (non-null-safe)
- Dead getter: `lib/contentful/getDuplexComponent.ts` (no importers)
- `who-is-jesus` stub: `src/app/[locale]/who-is-jesus/page.tsx:17-21`
- Contact form dynamic vs hardcoded: `src/components/features/contact-form/ContactForm.tsx:103,112-116,129`; `lib/contentful/getContactForm.ts:30`
- `credo` ≡ `valueItem` getter (interchangeable): `lib/contentful/getContentCollection.ts:15-31`
