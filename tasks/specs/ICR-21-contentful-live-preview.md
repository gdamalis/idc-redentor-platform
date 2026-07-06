# ICR-21 — Integrate Contentful Live Preview

> **Type:** Task (commit type `feat`) · **Priority:** Highest · **Component:** Website · **Epic:** ICR-2
> **QA Depth:** heavy · **QA Type:** ui · **Sensitive area:** `csp-headers`
> **Jira:** https://divinelab.atlassian.net/browse/ICR-21

## Summary

Wire `@contentful/live-preview` so that, when an editor views the site inside Contentful's Live
Preview pane on a **preview deployment**, field edits reflect in real time (no save/refresh) and an
inspector overlay links rendered content back to the field being edited. Additive and **preview-only**;
the production fetch path and revalidate webhook are untouched.

**First pass scope (locked with the user):** the high-churn **home** + **community/Creed** copy only.
Other content types are out of scope for this pass.

## 1. Dependencies Check

Everything below already exists on `origin/main` unless marked NEW.

| Dependency                                                                   | State       | Notes                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | ------------------------------------------------------------------------------------------------------------------ |
| `shouldUseDraftMode()` — `apps/web/lib/contentful/draftMode.ts:11`           | exists      | `Promise<boolean>`; true in dev, `VERCEL_ENV==='preview'`, or manual draft. The single gate. Called in `LocaleLayout` (`layout.tsx:86`) and every in-scope page.                                                          |
| `getSection()` — `apps/web/lib/contentful/getSection.ts`                     | exists      | Already selects `sys { id }` + `__typename`, returns the **raw** item. `getHeroBannerComponent` / `getCtaComponent` / `getTextBlockComponent` all just delegate to it → **already Live-Preview-ready, no getter change.** |
| `getContentCollection()` — `apps/web/lib/contentful/getContentCollection.ts` | exists      | Top-level has `sys{id}`+`__typename` but **reshapes** the response and the nested `BeliefItem` lacks `sys{id}`+`__typename`. The only getter that changes.                                                                |
| `config/headers.js` + `next.config.ts` (`headers: headersConfig`)            | exists      | CSP `frame-ancestors` already lists both Contentful app origins **on all envs**, and `X-Frame-Options: SAMEORIGIN` is set unconditionally (a contradiction). Must become env-aware.                                       |
| `@contentful/live-preview`                                                   | **NEW dep** | v4.10.10 (verified 2026-07-04). peer `react ^17                                                                                                                                                                           |     | ^18 |     | ^19`; dev-tested on 19.2.1. Project is `react ^19.2.1`, `next ^16.2.9`→ **install with no`--legacy-peer-deps`.\*\* |

**No Contentful content-model change.** `sys` + `__typename` are always-available system fields; no
content type / field / entry is created, changed, or remapped. The `/work` Contentful model-change
gate therefore does **not** trigger — this is read-side GraphQL only.

## 2. Requirements

1. **R1 — SDK install.** Add `@contentful/live-preview` to `apps/web` (`pnpm --filter @idcr/web add @contentful/live-preview`). No peer-dep flags.
2. **R2 — Draft-gated provider.** A new `'use client'` `ContentfulPreviewProvider` wrapping the SDK's `ContentfulLivePreviewProvider` with `locale`, `enableInspectorMode`, `enableLiveUpdates`. Mounted in `LocaleLayout` **only when `await shouldUseDraftMode()` is true** (conditional mount, not just disabled flags) so the SDK is entirely absent for production visitors (AC #4). Import the SDK's inspector stylesheet in this client boundary — **verify the exact export path** (`@contentful/live-preview/style.css`) against the installed package's `exports` map before adding.
3. **R3 — CSP env-gating (sensitive).** Rewrite `config/headers.js` so headers differ by deploy env, decided from `process.env.VERCEL_ENV` / `NODE_ENV`:
   - **Production** (`VERCEL_ENV==='production'` or anything not preview-like): keep `X-Frame-Options: SAMEORIGIN`; `frame-ancestors 'self'` **only** (remove both Contentful origins → restores strict clickjacking, fixes today's contradiction).
   - **Preview / dev** (`VERCEL_ENV==='preview'` OR `NODE_ENV==='development'`): **omit** `X-Frame-Options` entirely; `frame-ancestors 'self' https://app.contentful.com https://app.eu.contentful.com`.
   - All other CSP directives (`script-src`, `connect-src`, `img-src`, `media-src`) unchanged across envs.
   - Extract a **pure** `buildSecurityHeaders({ previewLike }): Header[]` (or `buildCsp`) so both branches are unit-testable.
4. **R4 — Nested entry ids.** In `getContentCollection`, add `sys { id }` + `__typename` inside the `... on BeliefItem` block so each Creed item is individually inspectable/live.
5. **R5 — Raw-data flow.** Live updates require the **untransformed** GraphQL node. `getContentCollection` stops reshaping and returns the raw entry; a pure `mapContentCollection(raw)` util reproduces today's `{ title, description, creedItems, image }` shape (preserve current behavior exactly, including the pre-existing always-`undefined` `image` — do **not** fix that here). Section-based getters already return raw, so no change there.
6. **R6 — Shared `useLivePreview` hook.** A `'use client'` hook `useLivePreview(raw, locale)` → `{ data, inspectorProps }` wrapping `useContentfulLiveUpdates(raw, { locale })` + `useContentfulInspectorMode({ entryId: data?.sys?.id })`. Pass the **raw** node in; callers transform the returned `data`. (Passing the optional `{ query }` document is deliberately omitted — our queries are dynamically interpolated and alias-free; if manual smoke shows live updates don't apply without it, see Edge Case E6.)
7. **R7 — Home components live + inspector.** For `OurMissionCta` (Hero/Section), `ComponentCta` (Cta/Section), `OurMissionSection` (ContentCollection): each presentational **view** gains an optional `inspectorProps` accessor spread onto its editable elements (keyed by Contentful field API id); a thin `'use client'` `*Live` sibling runs `useLivePreview`, maps, and renders the view. `page.tsx` branches `isEnabled ? <XLive .../> : <XView content={…}/>`.
8. **R8 — Community components live + inspector.** Same treatment for `InfoCommunity` (TextBlock/Section) and `CreedSection` (ContentCollection). `ComponentCta` + `OurMissionSection` Live wrappers from R7 are reused.
9. **R9 — Production stays server-only.** Non-draft render paths keep zero live-preview client JS: the `*Live` client wrappers are rendered **only** in the `isEnabled` branch.
10. **R10 — Existing production paths untouched.** `fetchGraphQL`, the preview-token selection, `/api/draft/{enable,disable}`, `/api/revalidate`, and `revalidateTag("site-content")` are not modified (AC #3).
11. **R11 — Docs + editor setup.** Document the Live Preview architecture and the editor **Content Preview URL** setup in `docs/architecture/contentful-data-layer.md` (§ Draft / preview). The ticket's `docs/contentful-data-layer.md` path is stale post scribe-tree migration.
12. **R12 — Deferred human action → Jira.** Configuring the Content Preview URL in Contentful (Settings → Content preview) is manual editor config no agent can perform. Create a linked Jira follow-up Task for it at PR time (standing rule: deferred production action → Jira).

## 3. Data Model Changes

- **DB / MongoDB:** none.
- **Contentful content model:** **none** (read-side `sys`/`__typename` only — see §1).
- **TypeScript interfaces (NEW / illustrative):**

  ```ts
  // apps/web/src/components/shared/contentful-preview/ContentfulPreviewProvider.tsx
  interface ContentfulPreviewProviderProps {
    readonly locale: string;
  }

  // apps/web/src/components/shared/contentful-preview/useLivePreview.ts
  type InspectorProps = (args: {
    fieldId: string;
    locale?: string;
  }) => Record<string, string>;
  interface UseLivePreviewResult<T> {
    readonly data: T;
    readonly inspectorProps: InspectorProps;
  }
  function useLivePreview<T extends { sys?: { id?: string } }>(
    raw: T,
    locale: string,
  ): UseLivePreviewResult<T>;

  // Views gain an optional accessor (undefined ⇒ production, no inspector attributes):
  // inspectorProps?: InspectorProps
  ```

- **`mapContentCollection(raw)`** returns the existing `ContentCollection` shape (`lib/contentful/types.ts`); no type change to consumers.

## 4. API Changes

None. No new routes, no Zod schemas. `/api/draft/enable` (secret-validated → `draftMode().enable()` →
redirect) is unchanged.

## 5. New / Modified Files

**New**

| File                                                                              | Purpose                                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/components/shared/contentful-preview/ContentfulPreviewProvider.tsx` | `'use client'` provider wrapper; imports SDK style; mounted draft-gated.            |
| `apps/web/src/components/shared/contentful-preview/useLivePreview.ts`             | Shared `'use client'` hook: raw → `{ data, inspectorProps }`.                       |
| `apps/web/src/components/shared/contentful-preview/useLivePreview.test.ts`        | jsdom unit: returns raw when data absent, spreads inspector attrs, wires entryId.   |
| `apps/web/lib/contentful/mapContentCollection.ts`                                 | Pure reshape moved out of `getContentCollection`.                                   |
| `apps/web/lib/contentful/mapContentCollection.test.ts`                            | Shape-mapper test (adapted from `getContentCollection.test.ts`).                    |
| `apps/web/config/securityHeaders.js` (or inline export)                           | Pure `buildSecurityHeaders({previewLike})` for testability.                         |
| `apps/web/config/securityHeaders.test.ts`                                         | Asserts prod vs preview header/CSP branches.                                        |
| `apps/web/src/components/features/*/[Component]Live.tsx` (×5, some shared)        | Thin `'use client'` Live wrappers for the in-scope views.                           |
| `apps/web/e2e/live-preview.spec.ts` (project `e2ePublic`)                         | Heavy e2e: CSP headers by env, provider-gating, home+community render both locales. |

**Modified**

| File                                                                                                                                    | Change                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`                                                                                                                 | + `@contentful/live-preview`.                                                                     |
| `apps/web/src/app/[locale]/layout.tsx`                                                                                                  | Draft-gated `ContentfulPreviewProvider` mount around the content subtree.                         |
| `apps/web/config/headers.js`                                                                                                            | Env-aware; delegates to `buildSecurityHeaders`.                                                   |
| `apps/web/lib/contentful/getContentCollection.ts`                                                                                       | Nested `BeliefItem` `sys{id}`+`__typename`; return raw (mapping moves to `mapContentCollection`). |
| `apps/web/src/app/[locale]/page.tsx`                                                                                                    | `isEnabled ? <…Live/> : <…View content={map(...)}/>` for Hero/Cta/ContentCollection.              |
| `apps/web/src/app/[locale]/community/page.tsx`                                                                                          | Same branching for TextBlock/Cta/ContentCollection(×2).                                           |
| `apps/web/src/components/features/our-mission-cta/…`, `component-cta/…`, `info-community/…`, `our-mission-section/…`, `creed-section/…` | Views accept optional `inspectorProps`, spread per field id.                                      |
| `apps/web/lib/contentful/getContentCollection.test.ts`                                                                                  | Adapt to `mapContentCollection` (or delete if fully moved).                                       |
| `docs/architecture/contentful-data-layer.md`                                                                                            | Add Live Preview + editor preview-URL section.                                                    |

## 6. Component Hierarchy

```
[locale]/layout.tsx (RSC)
└─ isEnabled ? ContentfulPreviewProvider('use client', locale) : (passthrough)
   └─ ThemeProvider → NextIntlClientProvider
      └─ {children = page}

Home page.tsx (RSC)   — isEnabled branch per block:
├─ isEnabled ? OurMissionCtaLive(raw, locale)      : OurMissionCta(content=raw)
│    └─ 'use client' → useLivePreview → OurMissionCta(content=live, inspectorProps)
├─ isEnabled ? OurMissionSectionLive(raw, locale)  : OurMissionSection(content=mapContentCollection(raw))
├─ BlogSection (out of scope — unchanged)
└─ isEnabled ? ComponentCtaLive(raw, locale)       : ComponentCta(content=raw)

Community page.tsx (RSC):
├─ Header / PhotoGrid (i18n / assets — unchanged)
├─ isEnabled ? InfoCommunityLive(raw, locale)      : InfoCommunity(content=raw)
├─ isEnabled ? CreedSectionLive(raw, locale)       : CreedSection(content=mapContentCollection(raw))
├─ isEnabled ? OurMissionSectionLive(raw, locale)  : OurMissionSection(content=mapContentCollection(raw))
└─ isEnabled ? ComponentCtaLive(raw, locale)       : ComponentCta(content=raw)
```

Views are responsive-unchanged; the `inspectorProps` spread adds only `data-contentful-*` attributes.

## 7. Edge Cases

1. **E1 — Production framing.** After R3, production returns `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`; Contentful **cannot** frame prod (intended). Live Preview is therefore only usable on preview deploys.
2. **E2 — Draft cookie in iframe (moot for supported flow).** On a preview deploy `shouldUseDraftMode()` is true via `VERCEL_ENV==='preview'` — no draft cookie needed inside the iframe, so the third-party `SameSite=None; Secure` cookie gotcha does not apply to the primary editor flow. The `/api/draft/enable` prod opt-in path is not exercised in the iframe (prod isn't framable, E1).
3. **E3 — Headers evaluated at build time.** `next.config.ts` `headers()` runs at build; `VERCEL_ENV` is set per-deployment at Vercel build, so each deploy bakes the correct branch. Locally, `pnpm build` (no `VERCEL_ENV`) resolves to the **strict/prod** branch — safe. QA asserts the header on the actual preview deploy.
4. **E4 — Non-draft visitors.** No provider, no `*Live` wrapper, no `data-contentful-*` attributes, no SDK JS. Asserted by e2e.
5. **E5 — Nested vs link nodes.** `BeliefItem` (rendered fields) gets ids; `getSection`'s `targetPage` (only `slug`, a link target, not rendered fields) is intentionally left without inspector wiring.
6. **E6 — Live updates without `{ query }`.** If manual smoke shows field edits don't propagate for GraphQL data without the `query` option, add `graphql-tag`, export each getter's query string, and pass `{ query: gql(queryString), locale }`. Implementer verifies against the installed SDK's README/types (bind to installed types, per lessons) before adding the dep. Inspector mode is unaffected either way.
7. **E7 — Both locales.** Provider `locale` is the active `es-AR` / `en-US`; verify live edit + inspector on both (AC #1 explicitly bilingual).

## 8. i18n

No new UI strings (no `public/locales/*.json` change). The feature is locale-parameterized: the
provider and hooks receive the active locale; QA exercises **es-AR + en-US** for AC #1/#2.

## 9. Testing Strategy (heavy)

- **Vitest (unit):**
  - `useLivePreview.test.ts` — returns `data` (raw passthrough in jsdom where no SDK host), `inspectorProps({fieldId})` yields the `data-contentful-*` attribute set with the entry id.
  - `securityHeaders.test.ts` — prod branch: `X-Frame-Options` present + `frame-ancestors 'self'` with **no** Contentful origins; preview branch: no `X-Frame-Options` + both Contentful origins present; other CSP directives identical.
  - `mapContentCollection.test.ts` — reshape parity with the prior getter output.
- **Playwright (authored, `e2ePublic`, run against the Vercel preview in QA — not local):** `apps/web/e2e/live-preview.spec.ts`
  - CSP: preview response has **no** `X-Frame-Options` and `frame-ancestors` includes `app.contentful.com`.
  - Provider-gating: a normal (non-draft) page render exposes **no** `data-contentful-*` attributes and no live-preview manager script.
  - Home + community pages render on `es-AR` and `en-US`.
- **Manual smoke (the only true check for live editing — inside Contentful):** on the PR's preview deploy, open the site in Contentful's Live Preview pane and confirm (a) editing the home Hero headline updates live without saving; (b) editing a Creed `BeliefItem` field updates live; (c) the inspector overlay click-through jumps to the right field — all on **es-AR + en-US**.
- **Playwright suites mapped** (`config.playwrightProjectMap`): `[locale]/page.tsx` → `e2ePublic`; `community` → `e2ePublic`; `config/headers.js` → `e2ePublic`; `layout`/`components`/`lib/contentful` → `e2ePublic`.

## 10. Implementation Checkpoints

1. **CP1 — SDK + draft-gated provider.** Install `@contentful/live-preview`; add `ContentfulPreviewProvider` (client, verify style import path); mount draft-gated in `layout.tsx`. Verify: `type-check`, `lint`, `build`; confirm provider absent when `!isEnabled`. Commit: `feat(ICR-21): add draft-gated Contentful Live Preview provider`.
2. **CP2 — CSP env-gating.** Extract `buildSecurityHeaders({previewLike})`; rewrite `config/headers.js` env-aware; add `securityHeaders.test.ts`. Verify: `type-check`, `lint`, `test`, `build`. Commit: `feat(ICR-21): env-gate frame-ancestors and X-Frame-Options for Live Preview`.
3. **CP3 — Raw-data flow + hook.** `getContentCollection`: nested `BeliefItem` ids + return raw; new `mapContentCollection` (+ test); new `useLivePreview` (+ test); update the 3 `getContentCollection` call sites to `mapContentCollection(...)` (non-draft path) so the tree stays green. Verify: full stack. Commit: `feat(ICR-21): raw-data flow, useLivePreview hook, BeliefItem sys ids`.
4. **CP4 — Home live + inspector.** `inspectorProps` on `OurMissionCta`/`ComponentCta`/`OurMissionSection` views; `*Live` wrappers; branch `page.tsx`. Verify: full stack. Commit: `feat(ICR-21): live updates and inspector on home components`.
5. **CP5 — Community live + inspector.** `inspectorProps` on `InfoCommunity`/`CreedSection` views; `*Live` wrappers (reuse Cta/Section); branch `community/page.tsx`. Verify: full stack. Commit: `feat(ICR-21): live updates and inspector on community components`.
6. **CP6 — e2e + docs.** Author `e2e/live-preview.spec.ts`; update `docs/architecture/contentful-data-layer.md`. Verify: `type-check`, `lint`, `test`, `build` (e2e runs in QA vs preview). Commit: `feat(ICR-21): e2e coverage and docs for Live Preview`.

## 11. Open Questions

1. **OQ1 — `{ query }` option:** default omits it (E6); confirmed only by manual smoke against Contentful. If it's required, CP3/CP4 gain `graphql-tag` + query export. **Resolution deferred to manual smoke; fallback specified.**
2. **OQ2 — Section field API ids:** the `inspectorProps({fieldId})` values must equal the Contentful field API ids (from the `getSection` query: `headline`, `subHeadline`, `body`, `ctaText`, `image`, …; BeliefItem: `title`, `description`, `bibleVerse`, `image`, `kind`). Implementer confirms each rendered element ↔ field id.
3. **OQ3 — Contentful preview-URL:** the exact Content Preview URL form (which page/slug template, `/api/draft/enable?secret=…&locale=…`) is documented in R11 and handed to the human via the R12 follow-up ticket; not code.

---

_Sensitive area `csp-headers` is exercised by R3/E1/E3 and the CP2 tests + CP6 e2e header assertions;
the security-reviewer should scrutinize the prod-strict / preview-relaxed split._
