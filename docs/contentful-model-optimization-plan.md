# Contentful Model Optimization — Implementation Plan

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Status:** Approved design · **Epic:** ICR-76 · **Branch:** `refactor/ICR-76-contentful-model-optimization`
> **Companion to:** [`docs/contentful-model-audit.md`](./contentful-model-audit.md) — read the audit first; this doc turns its ranked tiers (T1–T12) and cross-cutting suggestions (S1–S4) into an executable, sequenced plan.
> **Space:** `vg9le24yw8hb` · **Authored:** 2026-06-23
>
> This plan ships as **one atomic epic PR + one Contentful cutover**. All model + entry changes are made in `master-1.0.0` via committed migration scripts, the whole site is tested locally (and on a sandbox-pointed preview), and at the end the `master` alias is re-pointed to `master-1.0.0` at the same moment the PR merges.

---

## 1. Locked decisions

| #   | Decision                            | Choice                                                                                                                                                                                      |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Cutover mechanism**               | **Re-point the `master` alias → `master-1.0.0`.** `master-0.0.1` stays as instant rollback. Model + migrated entries go live atomically.                                                    |
| D2  | **How changes are made & recorded** | **Committed migration scripts** (`contentful-migration`) under `scripts/contentful/`, run against `master-1.0.0` with the existing CMA token. Reviewable in the PR, idempotent, replayable. |
| D3  | **`churchInfoTopic` (T2)**          | **Build the privacy/terms route now** — `/[locale]/[topic]` + getter + footer link, rendering the existing entry.                                                                           |
| D4  | **Packaging**                       | **One epic branch, staged commits per ticket, one PR, one cutover.** Single rollback point.                                                                                                 |

### Ground truth established (research, 2026-06-23)

- `master` is an **alias → `master-0.0.1`** (production, created 2024-05-31). The work env **`master-1.0.0`** is provisioned in commit 0 by cloning `master-0.0.1` (the pre-scheme `agent-sandbox` clone of `master-0.0.1` was verified byte-for-byte identical on 2026-06-22 — same schema + entry IDs/versions — confirming a clone is faithful). This epic is a **major** model change; see `docs/contentful-environments.md`.
- The space has **~29 content types** (the list endpoint under-reports 24; `componentCta`/`componentDuplex`/`componentQuote`/`churchInfoTopic`/`bibleVerse` exist but are omitted from the listing). Verdicts unchanged.
- Entry counts (production): `componentQuote`=0, `churchInfoTopic`=1 (Privacy Policy), `credo`=7, `valueItem`=3, `componentDuplex`=1, `componentHeroBanner`=1, `componentCta`=1, `componentTextBlock`=2, `bibleVerse`=1, `page`=3, `seo`=5, `blogPostPage`=3.
- Phantoms `topicPerson` / `post` / `nt_mergetag` are 404 (validation-only dangling refs in both envs).
- The app already emits `Article` JSON-LD on blog posts (`lib/metadata.ts:125`) — S2 extends a proven pattern.

---

## 2. Dependencies check (must exist before starting)

- **CMA token** `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` available locally (already used by the Contentful MCP; never committed).
- **Contentful MCP** scoped to `master-1.0.0` with `PROTECTED_ENVIRONMENTS=master` (available; used for inspection + verification).
- **`master-1.0.0` work env** — provisioned in commit 0 by cloning current production (`master-0.0.1`). The free tier holds two envs, so the pre-scheme `agent-sandbox` clone is deleted to free the slot. If production content drifts during the work window, re-clone before cutover (migration scripts are idempotent → re-run cheaply). See `docs/contentful-environments.md`.
- **Vercel Preview env var:** the epic branch's preview must set `CONTENTFUL_ENVIRONMENT=master-1.0.0` (branch-scoped) so the preview renders the new model. See §3.
- New dev dependency to add in commit 0: **`contentful-migration`** (and `contentful-management` for entry transforms if needed).

---

## 3. Environment & cutover workflow (S1)

> This epic uses the **heavy variant** of the repo's Contentful model-change workflow (the two lanes are documented in [`docs/contentful-environments.md`](./contentful-environments.md); machine-readable wiring in `.claude/config.json` → `contentful`). Because it is a **major breaking** change (type deletions, field renames, merges), it warrants the heavy variant's **atomic cutover + instant flip-back rollback**: clone production into a versioned env and re-point the `master` alias at cutover. The work env is **`master-1.0.0`**, cloned from `master-0.0.1`. (The _standing_ workflow for everyday model changes is the permanent `staging` lane; this epic is the exception.) The rest of this section is the epic-specific application.

### 3.1 The coupling that drives everything

The epic **renames Contentful fields** (`bodyText`/`subline`/`body` → one `body`) and **deletes content types**. Therefore:

- **New code only works against the new (sandbox) model.** Old code only works against the old (master) model.
- Any environment running epic code **must** point at `master-1.0.0`, or it renders the old model against new code and breaks.
- `main`/production keeps reading `master` (old model) until cutover.

### 3.2 Local → sandbox (enabler, commit 0)

`lib/contentful/fetch.ts:5` currently builds the GraphQL URL with **no** `/environments/<env>/` segment, so it implicitly hits the `master` alias. Change:

```ts
export async function fetchGraphQL(query: string, preview = false) {
  const environment = process.env.CONTENTFUL_ENVIRONMENT ?? "master";
  return fetch(
    `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${environment}`,
    // headers / body / next.tags unchanged
  ).then((response) => response.json());
}
```

`.../environments/master` is the canonical form and returns identical results to the path-less URL, so default behavior is **byte-for-byte preserved**. Companion edits: add `CONTENTFUL_ENVIRONMENT?: string` to `src/types/environment.d.ts`; document a commented `# CONTENTFUL_ENVIRONMENT=master` in `.env.example`. (Optional: align dead `codegen.ts`'s `CONTENTFUL_SPACE_ENVIRONMENT` to the same name, or leave it.)

**To test locally against the sandbox:** set `CONTENTFUL_ENVIRONMENT=master-1.0.0` in `.env.local`.

**Gotcha — draft mode + preview token.** `lib/contentful/draftMode.ts:19` auto-enables draft mode when `NODE_ENV==="development"`, so `pnpm dev` reads the sandbox via the **preview** token (`CONTENTFUL_PREVIEW_ACCESS_TOKEN`). Preview tokens are space-scoped and work across environments, so this is fine — but the token must be valid. **Clear `.next` when switching `CONTENTFUL_ENVIRONMENT`** (the static `site-content` cache tag is env-agnostic and can otherwise serve stale cross-env data).

### 3.3 The cutover runbook (you perform this)

Pre-flight: code + sandbox fully verified (full local pass against `master-1.0.0`, plus the sandbox-pointed Vercel preview), `pnpm type-check && pnpm lint && pnpm test && pnpm build` green, content edits frozen (or re-sync done).

**Recommended — planned low-traffic window (simple; ~1–2 min blip acceptable for this site):**

1. Pick a low-traffic minute.
2. Re-point the `master` alias → `master-1.0.0` in Contentful (Settings → Environments → Environment Aliases).
3. Immediately merge the epic PR → Vercel builds & deploys the new code to production.
4. Once the production deploy is live, trigger `POST /api/revalidate` (or wait for the Contentful publish webhook) to flush the `site-content` cache.
5. Smoke-test production (home, community, come-meet-us, blog index + a post, contact form, new privacy page).

Between steps 2 and 3 there is a brief window where production runs **old code against the new model**. Cached/ISR HTML keeps serving during the build, which softens it; for a small church site a planned window is the pragmatic choice.

**Alternative — zero-downtime (only if you want no blip):** make the new readers defensively tolerant of both old and new field shapes, deploy the code first (works against the old model), then re-point the alias. More code; not recommended here.

**Rollback:** re-point the `master` alias back to `master-0.0.1` and revert/redeploy the PR. Because `master-0.0.1` is untouched, rollback is instant on the content side.

**Post-cutover housekeeping:** the alias now points at `master-1.0.0`, so that env **is** production. For the next change cycle, delete the stale `master-0.0.1` and clone `master-1.0.0` → the next versioned work env (`master-1.0.1` for a fix, `master-1.1.0` for new/additive, `master-2.0.0` for the next breaking change), then re-point the MCP `ENVIRONMENT_ID` + `.env.local` + branch Preview at it. Full cycle: `docs/contentful-environments.md`.

---

## 4. Migration tooling conventions (D2)

- **Add** `contentful-migration` (devDep). Add `contentful-management` only if an entry transform needs the raw CMA.
- **Layout:** `scripts/contentful/migrations/NN-<slug>.cjs` (one per tier), an idempotent `scripts/contentful/run.mjs` runner, and `pnpm -C apps/web contentful:migrate` wired in `package.json`.
- **Target env:** runner reads `CONTENTFUL_ENVIRONMENT` (default `master-1.0.0`) + `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` + `CONTENTFUL_SPACE_ID`. **Never targets `master`.**
- **Idempotency:** each script guards against re-application (check field/type existence before create/delete) so re-running on a re-cloned sandbox is safe.
- **Reviewability:** every schema + entry change is a diffable script in the PR. The MCP is used for inspection and spot edits, not as the source of truth.
- **Order:** scripts are numbered to match the commit sequence (§6). Entry-data migrations (T7, T8, T9) use `transformEntries`/derive (or `contentful-management` for the complex remaps).

---

## 5. Target schemas

### 5.1 `section` (merges `componentHeroBanner` + `componentCta` + `componentTextBlock`; T8)

| Field           | Type                                   | Required | From                                             | Notes                                                                     |
| --------------- | -------------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `internalName`  | Symbol                                 | ✅       | all                                              | display                                                                   |
| `machineName`   | Symbol (unique)                        | ✅       | all                                              | getter lookup key (`where:{machineName}`)                                 |
| `layout`        | Symbol enum `hero`\|`cta`\|`textBlock` | ✅       | new                                              | discriminator                                                             |
| `headline`      | Symbol                                 | —        | all                                              | shared core                                                               |
| `subHeadline`   | Symbol/Text                            | —        | hero `subHeadline`, textBlock `subtitle`         | unify the two plain-text subheads                                         |
| `body`          | RichText                               | —        | hero `bodyText`, cta `subline`, textBlock `body` | **unify rich-text field** (chosen name `body` minimizes renderer edits)   |
| `ctaText`       | Symbol                                 | —        | hero, cta                                        |                                                                           |
| `targetPage`    | Link→`page`                            | —        | hero, cta                                        | unify on `... on Page { slug }` form                                      |
| `urlParameters` | Symbol                                 | —        | cta                                              | consumed in `ComponentCta.tsx:16`                                         |
| `image`         | Link→Asset                             | —        | hero                                             |                                                                           |
| `images`        | Array<Link→Asset> (max 5)              | —        | textBlock                                        | **CRITICAL — feeds community PhotoGrid; must survive (see §6, commit 5)** |

Only `layout` + `internalName` + `machineName` are required. **`additionalImages` is intentionally dropped** (hero's `additionalImagesCollection` is fetched but only referenced in commented-out code in `OurMissionCta.tsx` — this absorbs that part of T10).

### 5.2 `beliefItem` (merges `credo` + `valueItem`; T7)

| Field          | Type                         | Required | Notes                                                   |
| -------------- | ---------------------------- | -------- | ------------------------------------------------------- |
| `internalName` | Symbol                       | ✅       |                                                         |
| `machineName`  | Symbol                       | ✅       |                                                         |
| `title`        | Symbol                       | —        |                                                         |
| `description`  | RichText                     | —        |                                                         |
| `bibleVerse`   | Link→`bibleVerse`            | —        | **structured** after T9 (today freeform — see commit 4) |
| `image`        | Link→Asset                   | —        |                                                         |
| `kind`         | Symbol enum `Creed`\|`Value` | —        | optional, only if filtering is ever needed              |

`credo`(7) + `valueItem`(3) = **10 entries** remap. `getContentCollection.ts:15-31` already returns both interchangeably as `creedItems`, so the consumer barely changes. **Doctrinal content is not edited — the type merges, the words don't.**

---

## 6. Commit sequence (one epic branch)

Cheapest/safest first; T8 (invasive) late; T9 after T7. Each commit = model migration script (if any) + code change + verification, and is independently buildable. Commit messages follow Conventional Commits (≤100 char header).

> **Legend — visual change:** ⬜ none · 🟡 minor (keep identical / edge case) · 🟦 intended · 🟢 addition.

### Commit 0 — Enabler · S1 · ICR-72 · ⬜

- **Code:** `fetch.ts` env-var support (§3.2); `environment.d.ts` + `.env.example`; add `contentful-migration` devDep; scaffold `scripts/contentful/` + `pnpm -C apps/web contentful:migrate`.
- **Verify:** `CONTENTFUL_ENVIRONMENT` unset → identical prod behavior; set to `master-1.0.0` → site renders from sandbox locally; runner connects to sandbox.
- **Commit:** `chore(ICR-72): support CONTENTFUL_ENVIRONMENT override + migration tooling scaffold`

### Commit 1 — Pure deletions · T1 + T3 · ICR-66 · ⬜

- **Model (script 01):** delete `componentQuote` (0 entries); strip phantom validation refs — `post` from `componentDuplex`, `topicPerson` from `componentQuote` (gone with the type), `nt_mergetag` from rich-text validations of surviving `componentHeroBanner` / `componentCta` (and `componentDuplex` until commit 2).
- **Code:** none.
- **Verify:** build green; no getter referenced `componentQuote`; editor UI clean.
- **Commit:** `refactor(ICR-66): delete unused componentQuote and strip phantom validation refs`

### Commit 2 — Retire dead architecture · T4 + T5 + T6 (+ S4 moot) · ICR-73 · ⬜

- **Code:**
  - `src/app/[locale]/blog/page.tsx`: drop `getPage`(:3) + `resolveComponents`(:6); add `getCtaComponent` + `ComponentCta`; replace `getPage("blog",…)`(:31) with `getCtaComponent(<machineName>, locale, isEnabled)`; replace `resolveComponents(landingPage.extraSectionCollection)`(:45) with `<ComponentCta content={cta} />`. **Open item:** read the `page` "blog" entry's `extraSection` ref in Contentful to confirm the CTA's `machineName` (siblings use `"connect-with-us"`).
  - **Delete files:** `src/components/features/component-resolver/component-resolver.tsx` + its `index.ts`; `lib/contentful/getPage.ts` (removes the over-fetch fragments **and** the non-null-safe `items[0]` at `:307` → **S4 disappears**); `lib/contentful/getDuplexComponent.ts` (zero importers — confirmed).
- **Model (script 02):** delete `componentDuplex`; drop `topSection`/`pageContent`/`extraSection` array fields on `page` → slim to `internalName`/`pageName`/`slug`/`seo` (still a link target for `componentCta.targetPage`, `componentHeroBanner.targetPage`, `menuGroup.groupLink` → `page.slug`).
- **Verify:** blog index renders the appended CTA identically (only a redundant wrapper `<div>` removed); home/community/come-meet-us unaffected; build green.
- **Commit:** `refactor(ICR-73): retire page-builder render path, slim page, drop componentDuplex`

### Commit 3 — Merge Creed + Values · T7 · ICR-67 · ⬜

- **Model (script 03):** create `beliefItem` (§5.2); migrate 10 `credo`+`valueItem` entries (set `kind`); update the `contentCollection`/inline references; delete `credo` + `valueItem` once remapped.
- **Code:** `lib/contentful/getContentCollection.ts:15-31` (and the `CreedSection` consumer) to query `beliefItem`; output unchanged (already returns both as `creedItems`).
- **Verify:** home + community render the same Creed/Values; entry count reconciles (10 → 10 `beliefItem`).
- **Commit:** `refactor(ICR-67): merge credo + valueItem into beliefItem`
- ⚠ **Sensitive (doctrinal):** type-only; words untouched.

### Commit 4 — Structured Bible verse · T9 · ICR-68 · 🟡

- **Model (script 04):** for each belief item's freeform verse, create a structured `bibleVerse` entry (`book`/`chapter`/`fromVerse`/`toVerse`/`verseContent`/`bibleVersion`) and link `beliefItem.bibleVerse → bibleVerse`. **Confirm at implementation:** the current shape of the verse field on credo/valueItem (freeform RT field name) and the `CreedSection` renderer.
- **Code:** render the structured verse to **match current appearance exactly** (the 🟡 to watch).
- **Verify:** verses look identical pre/post on community + home.
- **Commit:** `refactor(ICR-68): standardize beliefItem bibleVerse on the structured type`

### Commit 5 — Merge promo blocks · T8 · ICR-75 · ⬜ (if maps preserved)

- **Model (script 05):** create `section` (§5.1); migrate the hero(1)/cta(1)/textBlock(2) entries setting `layout` + unified `body`/`subHeadline` + carrying `images` for textBlock; delete `componentHeroBanner`/`componentCta`/`componentTextBlock` once remapped.
- **Code (~9 files):** collapse `getHeroBannerComponent`/`getCtaComponent`/`getTextBlockComponent` into a shared `section` getter (or thin wrappers over one `SECTION_FIELDS`); update readers — `OurMissionCta.tsx` (`bodyText`→`body`), `ComponentCta.tsx` (no `subline` render today → low risk), `InfoCommunity.tsx` (`body`, unchanged), **`InfoConnect.tsx`** (come-meet-us textBlock — second consumer, easy to miss), `PhotoGrid.tsx` (unchanged if `images` shape preserved); update page call sites (home, community, come-meet-us, blog post).
- **CRITICAL:** `componentTextBlock.imagesCollection` is the **only** source for the community `PhotoGrid` (`community/page.tsx:66-70` guard → `PhotoGrid`). If `images` is dropped from `section`, the grid **silently disappears**. The `images` field (max 5; grid uses first 4) must survive.
- **Verify:** byte-for-byte parity on home hero, all CTAs, community text+PhotoGrid, come-meet-us text.
- **Commit:** `refactor(ICR-75): merge hero/cta/textBlock into section with a layout enum`

### Commit 6 — Remove dead fields · T10 · ICR-69 · ⬜

- **Model (script 06):** drop `menuGroup.featuredPages` (never queried) and `formField.validation` (requested at `getContactForm.ts:29` but never mapped/read — only `required` is used). `componentHeroBanner.additionalImages` already handled in commit 5.
- **Code:** remove `validation` from `getContactForm.ts` GraphQL query.
- **Verify:** nav, contact form unaffected; build green.
- **Commit:** `refactor(ICR-69): remove dead fields (menuGroup.featuredPages, formField.validation)`

### Commit 7 — Localize blog category · T11 · ICR-70 · 🟦

- **Model (script 07):** localize `blogPostPage.category` (or add a localized display label) so es-AR shows Spanish, en-US shows English.
- **Code:** category rendering reads the localized value.
- **Verify:** es-AR blog shows Spanish category; en-US shows English.
- **Commit:** `feat(ICR-70): localize blogPostPage.category for es-AR`
- 🟦 **Intended visible change** (Spanish label replaces English on es-AR).

### Commit 8 — Standardize naming · T12 · ICR-71 · ⬜

- **Model (script 08):** standardize on `internalName` + `machineName` everywhere — rename `menuGroup.internalTitle`→`internalName`; add/normalize `machineName` where missing (`seo` display `name`, `navigationMenu` lookup); keep getters working.
- **Code:** update getters that reference the old field names (e.g. `menuGroup`, `navigationMenu`, `seo` lookups).
- **Verify:** nav, footer, SEO metadata unchanged; build green.
- **Commit:** `refactor(ICR-71): standardize on internalName + machineName across content types`

### Commit 9 — Contact-form fixes · S3 · ICR-49 (+ un-ticketed verse bug) · 🟡

- **Code (`ContactForm.tsx`):**
  - Decouple the verse: move the `content.bibleVerse` block (`:112-116`) **out** of the `content.image &&` block (`:103-118`) into its own `content.bibleVerse &&` sibling, so a verse without an image still renders.
  - Move heading to i18n: add `import { useTranslations } from "next-intl"`, `const t = useTranslations("ContactForm")`, replace `"Send us a Message"` (`:129`) with `{t("send-message-heading")}`.
- **i18n:** add `"ContactForm": { "send-message-heading": … }` to **both** `public/locales/es-AR.json` (`"Envianos un Mensaje"`) and `en-US.json` (`"Send us a Message"`).
- **Verify:** heading localizes; a verse-without-image now appears; image+verse case unchanged.
- **Commit:** `fix(ICR-49): decouple contact-form verse from image and localize heading`
- 🟡 **Minor:** a verse configured without an image now appears (currently hidden).

### Commit 10 — JSON-LD structured data · S2 · ICR-27 · ⬜

- **Code (`lib/metadata.ts` + RSCs):**
  - `buildOrganizationJsonLd(...)` → `Church`/`Organization` rendered once site-wide in `src/app/[locale]/layout.tsx` (name, address from LocationComponent, logo; optional `geo` if `location { lat lon }` is added to the fragment — field exists in Contentful).
  - `buildEventJsonLd(eventBanner, locale)` → `Event` + `Place` on `come-meet-us/page.tsx` (reuses the already-fetched `getEventBanner` data).
  - Upgrade existing `buildArticleJsonLd` `@type` `Article`→`BlogPosting`.
  - Optional tiny `<JsonLd data={…} />` server component to DRY the `<script type="application/ld+json">` call sites.
- **Pre-work:** no getter for church phone/email/social (`sameAs`). Decide hard-code vs small getter before building `Organization` (recommend hard-code the known church NAP + socials initially).
- **Verify:** Rich Results / schema validator passes; **zero visual change** (script tags are non-rendering).
- **Commit:** `feat(ICR-27): add Organization/Church + Event/Place JSON-LD; Article→BlogPosting`

### Commit 11 — Privacy/terms page · T2 · ICR-74 / ICR-43 · 🟢

- **Code:** new `src/app/[locale]/[topic]/page.tsx` + `lib/contentful/getChurchInfoTopic.ts` (query by slug/machineName), rendering the existing `churchInfoTopic` entry (Privacy Policy); add a footer link; metadata via existing `seo` pattern.
- **Model:** keep `churchInfoTopic`; if T12 naming applies, normalize its lookup field.
- **Verify:** `/es-AR/privacidad` (and en-US) render the policy; footer link works; no collision with existing `[locale]` routes.
- **Commit:** `feat(ICR-74): add bilingual privacy/terms route consuming churchInfoTopic`
- 🟢 **New page added** (the only net-new surface; warranted by PII + newsletter).

---

## 7. Visible-change summary (per "the site should look the same")

| Change                                           | Commit       | Type                    |
| ------------------------------------------------ | ------------ | ----------------------- |
| New Privacy Policy page + footer link            | 11 (T2)      | 🟢 addition (approved)  |
| Blog category shows in Spanish on es-AR          | 7 (T11)      | 🟦 intended (approved)  |
| Contact-form verse appears even without an image | 9 (S3)       | 🟡 edge case (approved) |
| Bible-verse rendering on Creed/Values            | 4 (T9)       | 🟡 keep identical       |
| Everything else (deletions, renames, JSON-LD)    | 0–3,5,6,8,10 | ⬜ none                 |

---

## 8. Testing strategy

- **Per commit:** `pnpm type-check && pnpm lint && pnpm test && pnpm build` green; targeted manual smoke of the affected route(s) **locally against `master-1.0.0`**.
- **Unit (Vitest):** add/adjust shape-mapper tests for the new `section` and `beliefItem` getters (follow existing getter-test style). No tests for trivial boilerplate.
- **Full pre-cutover pass:** run the whole site against `master-1.0.0` locally **and** on the sandbox-pointed Vercel preview; walk home, who-is-jesus, community (Creed + PhotoGrid), come-meet-us (event/map/contact form/verse), blog index + a post, newsletter signup, the new privacy page. Confirm JSON-LD via a validator.
- **Playwright:** if the `qa-runner`/`qa-acceptance` agents are used, point them at the sandbox preview URL.

---

## 9. Risks & open questions

1. **Coupled cutover window (§3.3).** New code ⟷ new model. Mitigation: planned low-traffic window + tight runbook; rollback via alias flip. Validate the cache/revalidate timing during a dry run on the preview.
2. **Content drift during the work window.** If editors change production content, re-clone `master-1.0.0` and re-run the idempotent scripts before cutover.
3. **Blog CTA `machineName`** (commit 2) — confirm the actual ref from the `page` "blog" entry before finalizing.
4. **T9 verse field shape** (commit 4) — confirm the current freeform field + `CreedSection` renderer; keep output identical.
5. **JSON-LD church NAP/socials** (commit 10) — decide hard-code vs getter before building `Organization`.
6. **`section` field-name choices** (commit 5) — `body`/`subHeadline` chosen to minimize renderer edits; confirm each reader (`OurMissionCta`, `InfoCommunity`, `InfoConnect`) during the commit.
7. **Post-cutover env rotation** — for the next cycle, delete stale `master-0.0.1`, clone `master-1.0.0` → the next versioned work env, and re-point the MCP `ENVIRONMENT_ID` + `.env.local` + branch Preview (`docs/contentful-environments.md`).

---

## 10. Trello mapping (epic ICR-76)

| Commit | Tier(s)        | Card                                                                      |
| ------ | -------------- | ------------------------------------------------------------------------- |
| 0      | S1             | ICR-72                                                                    |
| 1      | T1, T3         | ICR-66                                                                    |
| 2      | T4, T5, T6, S4 | ICR-73 (supersedes ICR-32, ICR-59; ICR-63 conflicts — archive candidates) |
| 3      | T7             | ICR-67 (↔ ICR-45 redesign)                                                |
| 4      | T9             | ICR-68 (↔ ICR-26 verse retrieval)                                         |
| 5      | T8             | ICR-75                                                                    |
| 6      | T10            | ICR-69                                                                    |
| 7      | T11            | ICR-70                                                                    |
| 8      | T12            | ICR-71                                                                    |
| 9      | S3             | ICR-49 (+ the un-ticketed verse-visibility bug — fold in or add a card)   |
| 10     | S2             | ICR-27 (+ ICR-64 extends)                                                 |
| 11     | T2             | ICR-74 (decision) + ICR-43 (privacy page)                                 |

> Implementation start should move the worked cards To Do → In Progress; the human gates the PR merge + Contentful cutover and moves cards to Done. ICR-32 / ICR-59 / ICR-63 are superseded by the retire-page-builder decision — archive them.
