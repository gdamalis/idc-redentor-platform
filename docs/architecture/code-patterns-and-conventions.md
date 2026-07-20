# Code Patterns & Conventions (observed)

> **Monorepo note:** the site now lives under **`apps/web/`**. All source paths in this doc
> (`src/…`, `lib/contentful/…`) are under `apps/web/` unless stated otherwise. In the monorepo
> migration `cn()`, the `LOGO` path constants, and the design tokens moved to the shared
> **`packages/ui`** package (`@idcr/ui`); `src/utils/cn.ts` no longer exists. See
> `docs/architecture/monorepo-packages.md`.

> **Purpose:** A code-reviewer's read of _how this codebase is actually written_ — the strategy, the recurring patterns, the naming/styling idioms, and the places where the code disagrees with itself. This is an **observed** analysis (read from the source, not from the style guide), produced as input for deciding **which patterns to promote into harness memory / `CLAUDE.md`** and which to clean up first. It complements `architecture.md` (the _what_ and _where_) and `contributing.md` (the _rules_); this doc is the _how_.
> **Last reviewed:** 2026-06-22 (original analysis) · **Validated:** 2026-07-20 (see next section)
> **Scope read:** every file under `src/app/**`, `src/components/**`, `src/service/**`, `src/utils/**`, `src/types/**`, `src/templates/**`, `src/i18n/**`, and all of `lib/contentful/**`.

> **⚠️ Snapshot + validation layer — read this first.** The body (§1–§11 + Appendix) is the
> **original 2026-06-22 code-review**, preserved verbatim because its section numbering is cited by
> Jira **Epic ICR-9** ("Code quality, reliability & DX") and its children **ICR-30 → ICR-38**. This
> doc is the _origin analysis_ of that whole ticket cluster; it was authored into a session but
> **never committed to `docs/` until now**. The **[Validation status](#validation-status--ticket-map-2026-07-20)**
> section below (2026-07-20) records what changed since — **several 🔴 findings are already resolved
> and must not be re-fixed.** Where a section's conclusion changed, an inline
> `> **Status 2026-07-20:**` note flags it.

---

## Validation status & ticket map (2026-07-20)

Re-verified against `main` after the **monorepo migration** (site moved to `apps/web/`) and a wave of
remediation work. This doc is the source of **Epic ICR-9** and its children **ICR-30 → ICR-38** (spun
out during the 2026-06-28 Trello→Jira migration), so the findings below already have tickets — no new
remediation ticket is needed. Roughly a third of the original 🔴 findings are **done**, a third **still
hold**, and a few **changed shape**.

### ✅ Resolved since 2026-06-22 — do NOT re-fix

| Original finding                                                       | Current reality                                                                                                                                                                      | Landed by           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| §6.4 "no structured logger / Sentry"                                   | `@sentry/nextjs` fully wired — `instrumentation.ts`, `instrumentation-client.ts`, `sentry.{server,edge}.config.ts`, `captureException` in `global-error.tsx` + `database.service.ts` | ICR-117             |
| §5.5 "no `error.tsx`", "`notFound()` used in exactly one place"        | `app/global-error.tsx` + `app/[locale]/error.tsx` exist; `notFound()` now guards 4 sites (`[locale]/layout.tsx`, `[locale]/page.tsx` render + metadata, `[locale]/[topic]/page.tsx`) | ICR-111 / ICR-117   |
| §2.3 `component-resolver` `switch(__typename)` + eslint-disabled `any` | **Deleted entirely** — `ComponentCta` is now rendered directly by pages; the resolver indirection is gone (superseded pending the Landing Page model, ICR-96 / ICR-20)               | removed             |
| §7 / §5.4 "Zod installed but used in zero files"                       | Zod `safeParse` schemas now guard `/api/subscribe` and `/api/predica/regenerate-pdf`, plus `service/broadcast/types.ts`                                                              | (subscribe/predica) |
| §8.3 "`satisfies` appears in zero files"                               | Now in 7 files (`as const satisfies Record<…>`), mostly in `/predica` + i18n message-key modules                                                                                     | (new code)          |
| §6.3 `connect()` pings `admin` on every call                           | Per-call `admin` ping removed; relies on the driver's connect de-dup (+ `Sentry.captureException` on failure)                                                                        | ICR-113             |
| §11.9 `next/router` import + dead `FormatDate.tsx`                     | Both removed — no `next/router` import anywhere; only the `formatDate.ts` util remains                                                                                               | removed             |
| §7 / §11.9 `SubscribeForm` dead code (two near-duplicate forms)        | `SubscribeForm` removed; newsletter UI consolidated to a single `SubscribeBanner`                                                                                                    | ICR-106 / ICR-112   |
| §6.1 `getPage` unguarded `items[0]`                                    | `getPage` getter removed; `getContentCollection` hardened to `items?.[0]`                                                                                                            | removed / hardened  |

### 🔴 Still open — each already has a ticket

| Finding (doc §)                                                                                                                                                                                            | Current reality                                                                   | Ticket                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| Dead `classNames.ts`; commented-out `KeywordTags` render; `Content.tsx` `${className}` → literal `"undefined"` (§3.1, §11.9)                                                                               | All still present                                                                 | **ICR-30**                       |
| `blog/[slug]` **and** `predicas/[slug]` soft-fail a missing entry with `<div>…not found</div>` at **HTTP 200** instead of `notFound()`; still no `loading.tsx`/Suspense (§5.5, §11.4)                      | Holds (worse — the anti-pattern was copied to sermons)                            | **ICR-32**                       |
| `fetchGraphQL` untyped, no `response.ok`/GraphQL-`errors` check; error contracts **diverged further** — `like.service` returns a result-union, `contact.service` still throws (§6.2, §6.4, §11.5)          | Holds; contract count went up, not down                                           | **ICR-34**                       |
| Route handlers inconsistent (now **7** routes: `NextRequest` vs `Request`, `NextResponse.json` vs raw `Response`, uneven try/catch) (§5.4, §11.6)                                                          | Holds & broader                                                                   | **ICR-35** (+ ICR-152)           |
| Locale list duplicated (`i18n/routing.ts` + `i18n/config.ts`); magic strings uncentralized (`constants.ts` holds only `revalidateDuration`); DB name `"website"` hardcoded across services (§11.8, §11.10) | Holds                                                                             | **ICR-36** (+ **ICR-153**, High) |
| Zod not at **all** boundaries (contact action + `/api/likes` still hand-roll); email template `{{placeholder}}` still **unescaped** (HTML-injection surface) (§7, §11.2)                                   | Partial — Zod adopted at 2 of the 3 boundaries; escaping untouched                | **ICR-33**                       |
| shadcn ↔ hand-rolled **seam** unconverged; two color systems; three variant strategies; `buildOgImage` still uses logical-or instead of `??` (§3, §9, §11.1)                                               | Holds                                                                             | **ICR-37** / ICR-23              |
| Pages/layout still fetch Contentful **sequentially** (home = 4, layout = 3 serial round-trips) (§5.6, §11.3)                                                                                               | Holds — `Promise.all` exists in the predica pipeline only, never in a page/layout | **ICR-31** (+ ICR-42)            |

### 🆕 New findings (not in the original body)

1. **Animation drift (§3.5).** The framer-motion stagger delay is no longer uniform `index * 0.1` — `BlogPostCard` uses `0.1`, `IconCard` `0.15`, `OurMissionSection` `0.2`. Separately, the `animate-in` / `slide-in-from-*` utilities in markup have **no backing plugin** (no `tailwindcss-animate` under Tailwind v4) and are likely **inert** — worth confirming those transitions still render.
2. **Inline-metadata regression (§5.2).** `[locale]/[topic]/page.tsx` and `predicas/page.tsx` build `Metadata` **inline** again instead of delegating to `lib/metadata.ts`; a parallel `lib/sermonMetadata.ts` was added. The "pages contain zero inline metadata objects" claim no longer holds.
3. **Contentful Live Preview architecture.** A family of `*Live` client siblings (`ComponentCtaLive`, `CreedSectionLive`, `InfoCommunityLive`, `OurMissionCtaLive`, `OurMissionSectionLive`) + `inspectorProps` threaded from `shared/contentful-preview/useLivePreview` now exists. This reframes the §2.1 note that `CreedSection`'s `'use client'` is behavior-free — it now carries inspector props.
4. **`who-is-jesus/page.tsx` is a non-async placeholder** (a bare `<div>`, no `params`/`setRequestLocale`) — an exception to the §5.1 page signature.
5. **`like.service` migrated to a discriminated-union `LikesOutcome`** (no longer throws) — a _good_ evolution that matches the repo's "functional-first, model failures as return values" rule; but `contact.service` still throws, which is exactly the §6.4 contract-divergence to unify under ICR-34.

### Finding → Jira ticket map

| Doc reference                                         | Ticket(s)                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| §10 "Candidates to standardize" (encode the baseline) | **ICR-38** (parent Epic **ICR-9**)                                                                               |
| §9 / §11.1 — converge the shadcn ↔ hand-rolled seam   | ICR-37, ICR-23                                                                                                   |
| §11.2 — Zod at boundaries + escape email HTML         | ICR-33                                                                                                           |
| §11.3 — parallelize getters with `Promise.all`        | ICR-31 (+ ICR-42 request-cache)                                                                                  |
| §11.4 — real 404s + error/loading boundaries          | ICR-32                                                                                                           |
| §11.5 — harden `fetchGraphQL` + unify error handling  | ICR-34                                                                                                           |
| §11.6 — standardize route-handler skeleton            | ICR-35 (+ ICR-152)                                                                                               |
| §11.7 — typed component-resolver                      | ICR-36 (resolver itself removed; see ICR-20 for the future Landing Page resolver)                                |
| §11.8 — single locale source of truth                 | ICR-36                                                                                                           |
| §11.9 — dead code + class-composition bugs            | ICR-30                                                                                                           |
| §11.10 — centralize magic strings                     | ICR-36 (+ ICR-153 for the DB name)                                                                               |
| Related surface findings                              | ICR-102 (relocate blog action comps, §2.1), ICR-99 (hydration mismatch, §4), ICR-157 (Mongo `maxPoolSize`, §6.3) |

---

## How to read this

Patterns are tagged so you can triage them at a glance:

- ✅ **Strong & consistent** — applied the same way across the codebase. Good candidate to standardize/encode in harness memory.
- 🟡 **Dominant but leaky** — there's a clear majority convention plus exceptions. Standardize the majority _and_ note the exception as "don't do this".
- 🔴 **Inconsistent / debt** — two or more competing styles, dead code, or a latent bug. Resolve _before_ encoding, otherwise the harness will cargo-cult the wrong half.

---

## 1. The mental model (the strategy)

The whole codebase is organized around one idea: **content lives in Contentful, the page is the only place that fetches it, and everything below the page is a pure presentational sink.** State and interactivity are pushed to the smallest possible leaf.

```
Contentful ──(GraphQL)──> lib/contentful/get*.ts ──> RSC page ──(typed props)──> presentational component
                                                          │
                                                          └─ a few "use client" leaves (LikeButton, ShareButton, forms, menus)

MongoDB ──> src/service/*.service.ts ──> API route handler / Server Action   (the only writes: likes + contact)
```

Five load-bearing conventions fall out of this and recur everywhere:

1. ✅ **Fetch-in-page, render-in-component.** Components never fetch. An `async` page (or the locale layout, for chrome) calls `get*` getters and threads the result down as a single `content={...}` (or `posts={...}`) prop. The _only_ exception is a client-side **write** (`LikeButton` POSTs to `/api/likes`), and even there the _initial_ state arrives as server props.
2. ✅ **RSC-by-default; `'use client'` only to buy a hook or a browser API.** No directive unless the file needs `useState`/`useActionState`/`useTranslations`/`framer-motion`/`navigator.*`.
3. ✅ **Two data paths stay separate** (Contentful read vs. Mongo write) and only meet on one route (`blog/[slug]`).
4. ✅ **On-demand revalidation, not time-based.** Every Contentful fetch is tagged `next: { tags: ["site-content"] }`; a Contentful publish webhook hits `/api/revalidate` → `revalidateTag("site-content")`.
5. ✅ **Folder-per-thing + barrel.** Each component/feature is a lowercase-dash folder with `PascalCase.tsx` + an `index.ts` re-export; each Contentful type has its own `get*.ts`.

> **The single most important meta-observation:** the component/UI layer is **two systems wearing one coat** — a _shadcn/ui-derived_ primitive layer and a _hand-rolled bespoke_ layer. Almost every inconsistency in this document is the seam between them (see §9). Knowing which half a file belongs to predicts its variant strategy, its file layout, its color system, and its `type`-vs-`interface` choice. Decide which half is canonical before standardizing anything in the UI layer.

---

## 2. Component patterns

### 2.1 The server/client split — "client islands at the leaves"

🟡 The intended pattern is an RSC parent orchestrating tiny client leaves. `blog-post-details/` is the textbook execution:

```
BlogPostDetails (RSC)            ← receives all data as props, distributes it
├─ BlogPostHeader   (client: i18n only)
├─ BlogPostContent  (RSC: rich-text → React)
├─ FeaturedImage    (RSC)
├─ PostActions      (RSC shell)  ← exists only to hand `initial*` server data to:
│  ├─ LikeButton    (client: optimistic toggle)
│  └─ ShareButton   (client: native share / modal)
└─ RelatedArticles  (RSC)
   └─ RelatedArticleLink (client: analytics-on-click wrapper)
```

`PostActions` and `RelatedArticleLink` exist _purely to keep the `'use client'` boundary at the leaf_ — that's the granularity philosophy: **split a file wherever you cross an interactivity boundary or hit something independently reusable/testable.**

🔴 The boundary is sometimes drawn too high: `CreedSection` is marked `'use client'` but has _no_ client behavior; `BlogPostHeader`/`AuthorInfo` are client only to read `useTranslations`/`useLocale`, which an RSC could do with `getTranslations`. Standardize "client only when you need a hook/browser API; i18n alone is not a reason on the server side."

> **Status 2026-07-20:** blog split HOLDS. `CreedSection` is still `'use client'`, but it now carries Contentful Live-Preview `inspectorProps` (and has a `CreedSectionLive` sibling), so the "no client behavior" observation is now nuanced rather than a dead directive. `AuthorInfo` is still client only for `useLocale`. Relocating `ShareButton`/`LikeButton`/`PostActions` out of `blog-post-details/` is tracked in **ICR-102**.

### 2.2 The server-wrapper / variant-selector

🟡 `NavbarWrapper → Navbar` reads `usePathname()` and picks a `variant` (`"overlay"` on home, `"solid"` elsewhere), then delegates. Note both are `'use client'`, so it's a _variant selector_, not a true server-wrapper-over-island. Still a clean separation worth naming.

### 2.3 CMS-driven rendering — the component resolver

🔴 `features/component-resolver/component-resolver.tsx` is the codebase's "Contentful sections array → React" engine. It's a `switch` on `__typename`:

```tsx
switch (component.__typename) {
  case "ComponentCta":
    return <ComponentCta content={component as any} />; // ← eslint-disabled `any`
  default:
    console.warn(`Component type '${component.__typename}' is not implemented`);
    return null; // ← silently drops unknown content
}
```

It currently maps exactly **one** type and is consumed by exactly one page (`blog/page.tsx`'s `extraSectionCollection`). Every other page composes components **by hand**. This is a half-built engine. The idiom is sound (a `__typename` dispatcher is the canonical Contentful pattern), but to standardize it should become a typed `Record<__typename, Component>` const-map (matches the project's own "const map over enum" rule and the existing `CREED_ICON_MAP`/`socialIcons` examples) and fail louder than `console.warn` + drop.

> **Status 2026-07-20: STALE — the `component-resolver` was deleted.** There is no `features/component-resolver/` directory, no `__typename` switch, and no eslint-disabled `any` cast anywhere in components. `ComponentCta` is now imported and rendered **directly** by the pages that use it. The "promote to a typed const-map" recommendation is therefore moot for the deleted code; the general **Landing Page** resolver is future work under **ICR-20 / ICR-96** (and the constants/locale parts of the old §11.7 live on in **ICR-36**).

### 2.4 Prop shape

🟡 CMS-backed components take a single `content` object; list components take a named array (`posts`, `images`, `links`, `menuItems`). The _type_ of `content` lives in three different homes depending on the file: inline in the component, in a local `types.ts`, or imported from `lib/contentful/types`. Pick one home (recommend: local `types.ts` per feature, or `lib/contentful/types` for shared CMS shapes).

> **Status 2026-07-20:** HOLDS; **inline** is now the dominant of the three homes.

---

## 3. Styling & design-system patterns

### 3.1 Class composition

✅ `cn()` = `twMerge(clsx(...))` (`src/utils/cn.ts`) is the standard. The convention is **base classes first, caller `className` last**, so consumers override via tailwind-merge last-wins:

```tsx
className={cn("flex h-9 w-full rounded-md border …", className)}   // input.tsx
```

🔴 But `cn()` adoption is **partial**. Several components interpolate with raw template literals instead — which means a caller's `className` is _appended but cannot override_, and an undefined `className` can render a literal `"undefined"` class:

```tsx
// content/Content.tsx — BUG: renders `… sm:py-24 undefined` when className is omitted
className={`py-16 text-center sm:py-24 ${className}`}
// Header.tsx, MainMenuDesktop.tsx — conditional classes via template literal, not cn()
```

🔴 **Dead code:** `src/utils/classNames.ts` (`filter(Boolean).join(' ')`) is a pre-`cn()` helper with zero real callers — delete it before someone copies it. Standardize: **always `cn()`, never template-literal class interpolation.**

> **Status 2026-07-20:** `cn()` moved to `packages/ui/src/cn.ts` (import via `@idcr/ui`); `src/utils/cn.ts` no longer exists. Everything else HOLDS — `Content.tsx` still has the `${className}` → `"undefined"` bug, `Header.tsx` + `MainMenuDesktop.tsx` still template-interpolate, and `src/utils/classNames.ts` is still dead code. Tracked in **ICR-30**.

### 3.2 Variants — three competing strategies

🔴 There is no single variant strategy:

| Strategy                         | Where             | Example                                                                                  |
| -------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `class-variance-authority` (cva) | shadcn layer      | `Button`, `Toast`, `Label` (`buttonVariants = cva(base, { variants, defaultVariants })`) |
| `keyof typeof` const-map         | hand-rolled layer | `Container` (`sizeMap`), `Typography` (`baseStyles`)                                     |
| inline ternary on a union prop   | hand-rolled layer | `Divider`                                                                                |

No `compoundVariants` anywhere. `label.tsx` calls `cva` with a base string and **no variants** (pointless boilerplate). The const-map approach is actually closer to the project's stated "const map over enum" preference; the cva approach is more powerful for multi-axis variants. **Decision needed before standardizing.**

> **Status 2026-07-20:** HOLDS (paths moved to `apps/web/`). Convergence tracked in **ICR-37**.

### 3.3 Color / design tokens

🔴 Two color systems coexist:

- ✅ **Semantic CSS-variable tokens** in the shadcn layer + most feature components: `bg-card`, `text-muted-foreground`, `bg-primary`, `border-input`, `focus-visible:ring-ring`. Theme-able, dark-mode-automatic. **This is the right system.**
- 🔴 **Raw Tailwind palette, hand-paired for dark mode** in the hand-rolled layer: `text-gray-900 dark:text-gray-100`, `border-gray-200 dark:border-gray-700`, `Footer`'s `bg-slate-900`. Ignores the token system and must be manually dark-mode-paired everywhere.

Standardize on the semantic tokens; treat raw `gray-*`/`slate-*` as a smell.

> **Status 2026-07-20:** HOLDS. Tokens now ship from `@idcr/ui` (`tokens.css`). Convergence tracked in **ICR-37**.

### 3.4 Typography

🟡 `Typography` centralizes text styles via a smart **`component` (semantic element) vs `variant` (visual style)** split — you can render an `h2`-styled `<p>`. Good idea. Two caveats to resolve before promoting it:

- 🔴 **Three competing type ramps.** `SectionHeader` and `IconCard` hand-roll `font-serif text-4xl font-bold` headings _outside_ `Typography`, and `Typography`'s scale has **no `font-serif`** at all — so the serif display style is unreachable through the central component. There are effectively three places that decide what an `<h2>` looks like.
- 🔴 `Typography`'s `h2` bakes in **margins** (`mt-7 mb-4 …`), coupling vertical rhythm to the text primitive.

> **Status 2026-07-20:** HOLDS. (Minor precision: `IconCard` hand-rolls `font-serif text-2xl font-bold`, not `text-4xl` — the claim lumped the two headers together.)

### 3.5 Animation

✅ Two clean, consistent systems: `tailwindcss-animate`-style utilities (`animate-in slide-in-from-top-5`) for simple entrances, and **framer-motion** for scroll-reveal — always `initial`/`whileInView`/`viewport={{ once: true }}` with a `delay: index * 0.1` stagger (`BlogPostCard`, `OurMissionSection`). Consistent enough to standardize verbatim.

> **Status 2026-07-20: CHANGED — two caveats (new finding).** (1) The framer-motion stagger is **not** uniformly `index * 0.1`: `BlogPostCard` = `0.1`, `IconCard` = `0.15`, `OurMissionSection` = `0.2`. (2) The `animate-in` / `slide-in-from-*` utilities have **no backing plugin** installed (no `tailwindcss-animate` under Tailwind v4) and are likely **inert** — confirm those entrance transitions still render before standardizing this pattern.

### 3.6 Accessibility

✅ Good discipline in the interactive layer: token-based `focus-visible:ring-ring` on every interactive primitive, `aria-hidden` on decorative icons, `sr-only` text wired to i18n, and `form.tsx` correctly threads `aria-describedby`/`aria-invalid`/`useId()`. 🟡 Thinner in presentational components (`IconCard` hard-codes `<h3>`, `SectionHeader` hard-codes `<h2>` — heading order is the caller's responsibility with no guardrails).

> **Status 2026-07-20:** HOLDS.

---

## 4. Interactivity idioms

✅ **`useSyncExternalStore` is the house idiom** for "read a browser-only value without a hydration flash." Used identically in `ShareButton` (`navigator.share` feature-detect, server snapshot `false`) and `ConsentBanner` (`localStorage` consent, server snapshot `"pending"`). Strong, repeatable pattern — good standardization candidate.

🟡 **Optimistic updates are hand-rolled, not `useOptimistic`.** `LikeButton` snapshots `previousState`, applies optimistically, reconciles on resolve / rolls back on catch, and guards double-fire with a `pendingRef`. Works, but worth deciding whether React 19's `useOptimistic` should be the standard going forward. (One known caveat: `like.service` returns a count computed from the _pre-update_ doc, so concurrent likes can return a stale count — see §6.)

✅ `Portal` = mounted-gate + `createPortal` to `#portal` (falls back to `document.body`).

> **Status 2026-07-20:** all §4 idioms HOLD (`useSyncExternalStore` ×2, hand-rolled `LikeButton` optimistic, `Portal`); `useOptimistic` is still not adopted anywhere. Separately, the ShareButton `useSyncExternalStore` hydration mismatch (React #418) is tracked in **ICR-99**.

---

## 5. App Router patterns

### 5.1 Page signature

✅ Every data page is `async` with promise params, awaited, then `setRequestLocale`:

```tsx
export default async function CommunityPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isEnabled = await shouldUseDraftMode();
  // … getters …
}
```

🟡 `params` is `Readonly<…>`-wrapped consistently, but the `{ locale: string }` shape is **re-declared in every file** — a tidy DRY opportunity (one shared `LocalePageProps`). `searchParams` is never used anywhere, so there's no precedent for it yet.

> **Status 2026-07-20:** HOLDS with two wrinkles: dynamic pages (`blog/[slug]`, `[topic]`, `predicas/[slug]`) now use **named local prop types** (`PostDetailsPageProps`, etc.) rather than the inline shape — still no shared `LocalePageProps`. Exception: `who-is-jesus/page.tsx` is a **non-async placeholder** (no `params`/`setRequestLocale`). `searchParams` still unused.

### 5.2 Metadata / SEO

✅ Every page exports `async generateMetadata` that awaits params and delegates **entirely** to `lib/metadata.ts` (`buildPageMetadata` / `buildArticleMetadata` / `buildArticleJsonLd`). Pages contain zero inline metadata objects. hreflang alternates come from one helper (`buildLocaleAlternates`). The locale layout owns the title _template_ (`"%s | Iglesia de Cristo Redentor"`) + `metadataBase`. This is one of the cleanest, most consistent subsystems — standardize as-is. (Minor: `buildOgImage` uses `||` instead of the house `??`.)

> **Status 2026-07-20: CHANGED (regression).** `[locale]/[topic]/page.tsx` and `predicas/page.tsx` now build `Metadata` **inline** instead of delegating; `lib/sermonMetadata.ts` was added alongside `lib/metadata.ts`. The "zero inline metadata objects" claim no longer holds. Layout title-template + `metadataBase` still HOLD; `buildOgImage` still uses `||` (`metadata.ts` ~L64-65).

### 5.3 Layout composition

✅ **Root layout is deliberately empty** (`return children`); the **locale layout owns `<html>`/`<body>`**, fonts (`next/font`), providers (`ThemeProvider` wrapping `NextIntlClientProvider`), GTM/consent/analytics, and all chrome (`Navbar → children → SubscribeBanner → Footer → ConsentBanner → Toaster`). Chrome content (nav/footer/subscribe) is fetched **once in the layout**, never re-fetched by pages. Clean ownership.

> **Status 2026-07-20:** HOLDS.

### 5.4 Route handlers

🔴 The five `api/*` handlers are the **least consistent** subsystem:

| Axis           | Variants seen                                                       |
| -------------- | ------------------------------------------------------------------- |
| Request type   | `NextRequest` (likes) vs `Request` (subscribe, revalidate, draft)   |
| Response       | `NextResponse.json` vs raw `new Response(...)`                      |
| Error handling | `try/catch` in 2 of 5; none in revalidate/draft                     |
| Validation     | **all manual** (`if (!email)`, `typeof slug !== "string"`) — no Zod |

The `revalidate` handler also passes a non-standard second arg: `revalidateTag("site-content", "max")` — verify against the installed Next 16 API. Pick one handler skeleton (recommend `NextRequest` + `NextResponse.json` + `try/catch` + Zod) and standardize it.

> **Status 2026-07-20: CHANGED — two sub-claims now false.** There are now **7** route files (the predica pipeline added `regenerate-pdf` + its `cron`). The inconsistency HOLDS and is broader. But: (a) `/api/subscribe` (and the predica route) now validate with **Zod `safeParse`** — the blanket "no Zod / all manual" is false (`/api/likes` + the contact action still hand-roll). (b) `revalidateTag("site-content", "max")` is now a **required** Next.js 16 profile arg (documented in-code), not a non-standard accident. Standardizing the skeleton is still open: **ICR-35** (+ ICR-152 to type the subscribe response).

### 5.5 Error / not-found

🔴 `notFound()` is used in exactly one place (locale guard in the layout). `blog/[slug]` **soft-fails** a missing post with `<div>Post not found</div>` at HTTP 200 instead of calling `notFound()` — a real anti-pattern. There is **no `error.tsx`** and **no `loading.tsx`/`<Suspense>`** anywhere. `not-found.tsx` is a full-document page (renders its own `<html>`/`<body>`) because the root layout is bare.

> **Status 2026-07-20: CHANGED.** `error.tsx` now exists (`app/[locale]/error.tsx` + `app/global-error.tsx` with `Sentry.captureException`), and `notFound()` now guards **4** sites (layout + home render/metadata + `[topic]`). Still open: `blog/[slug]` **and** `predicas/[slug]` still soft-fail at **HTTP 200** with `<div>…not found</div>`, and there is still **no `loading.tsx`/Suspense**. Tracked in **ICR-32**.

### 5.6 Parallelization

🔴 **No `Promise.all` anywhere.** Every page and the locale layout fetch Contentful **sequentially** (home = 4 serial round-trips; layout = 3 before any page renders). The getters are independent — this is the highest-impact perf finding and a clear anti-pattern to flag in harness memory ("parallelize independent getters with `Promise.all`").

> **Status 2026-07-20: substance HOLDS.** `Promise.all` now exists in the repo, but **only** inside the `/predica` pipeline (`regenerate-pdf` route + `renderSermonPdf`) — **never** in a page or the locale layout. Home still runs 4 serial getters; the layout still runs 3. Tracked in **ICR-31** (with **ICR-42** for a request-cached loader).

---

## 6. Data layer patterns

### 6.1 The Contentful getter convention

✅ The dominant, highly repeatable pattern (13 getters, near-identical). Skeleton:

```ts
const GRAPHQL_FIELDS = `…field selection… sys { id } __typename`; // SCREAMING_SNAKE module const

export async function getCtaComponent(name, locale, isDraftMode = false) {
  const data = await fetchGraphQL(
    `query { componentCtaCollection(
        locale: "${locale}", where:{ machineName: "${name}" }, limit: 1,
        preview: ${isDraftMode ? "true" : "false"}
      ) { items { ${GRAPHQL_FIELDS} } } }`,
    isDraftMode,
  );
  return data?.data?.componentCtaCollection?.items[0]; // raw items[0], or a hand-mapped domain object
}
```

Conventions: `machineName` (or `internalName`) as the entry selector, `limit: 1` for singletons, every selection ends `sys { id } __typename`, rich text selected as `{ json }`. Signature is always `(name, locale, isDraftMode = false)`.

🔴 **Nullish handling is fragile and inconsistent.** The "hand-mapped" getters optional-chain the _collection_ but then dot-access `items[0].field` **unguarded**:

```ts
pageName: data?.data?.pageCollection?.items[0].pageName,   // throws if items === []
```

The `?.` on the parent is theater once `items[0]` is `undefined`. This bug shape repeats in `getPage`, `getFooter`, `getContactForm`, `getContentCollection`. The well-guarded counter-example is `getBlogPostPages` (`?.map(...) ?? []`). Standardize the guarded form.

> **Status 2026-07-20:** convention HOLDS (there are now more getters than the original 13 — `getSermons`, `getSection`, `getEventBanner`, `getHeroBannerComponent`, `getTextBlockComponent`, `getSingleEmailForm`, `getChurchInfoTopic`). The unguarded `items[0].field` throw-bug is **narrowed**: `getPage` was removed and `getContentCollection` was hardened to `items?.[0]`, so it now survives only in **`getFooter`** and **`getContactForm`**. Fold into **ICR-34**.

### 6.2 `fetchGraphQL`, draft mode, rich text

- 🔴 `fetchGraphQL(query, preview = false)` returns **untyped `any`** and has **no error handling** — no `response.ok` check, no GraphQL-`errors` check. Failures degrade silently into `undefined` deep inside a mapper. Preview state is passed **twice** (token selection _and_ query text) — easy to desync.
- ✅ `shouldUseDraftMode()` is clean: early-return on `draftMode().isEnabled || NODE_ENV==='development' || VERCEL_ENV==='preview'`.
- 🔴 Rich-text rendering is **split**: shared paragraph-styling options live in `lib/contentful/rich-text-options.tsx`, but the heavyweight embedded-asset/entry renderer is inlined in `BlogPostContent.tsx`. No single rich-text module.
- ⚷ **Security note:** getters string-interpolate `locale`/`name` straight into the GraphQL query (injection-shaped surface). Fed only trusted/static values today — flag if any getter ever takes user input.

> **Status 2026-07-20:** HOLDS. The rich-text split widened — sermons added a parallel `sermon-details/sermonRichTextOptions.tsx`. `fetchGraphQL` hardening is **ICR-34**.

### 6.3 Services & the adapter pattern

✅ **Mailing** is the cleanest service: a factory + adapter, memoized via a module singleton, env-selected by `MAIL_PROVIDER`:

```ts
let emailAdapter: EmailAdapter | null = null;
function getEmailAdapter(): EmailAdapter {
  if (emailAdapter) return emailAdapter;
  switch (process.env.MAIL_PROVIDER) {
    case "sendgrid":
      emailAdapter = createSendGridAdapter();
      break;
    case "resend":
      emailAdapter = createResendAdapter();
      break;
    default:
      throw new Error(`Invalid MAIL_PROVIDER: …`);
  }
  return emailAdapter;
}
```

`EmailAdapter { sendEmail(content): Promise<boolean> }` (`interface`), adapters are `create*Adapter()` factories returning an object literal, send errors swallowed → `false`. Idiomatic — good standardization candidate.

✅ **`like.service.ts`** is the best-engineered file: typed docs, atomic Mongo operators (`$addToSet`+`$inc`+`$setOnInsert`, `$pull`+`$inc`), `upsert: true`, visitor de-dup. 🟡 Caveat: returned `count` is computed from the _pre-update_ doc, so concurrent likes can read stale (the _write_ is still atomic).

🔴 **Mongo client** (`database.service.ts`): correct dev-only HMR-survival global singleton, but `connect()` pings `admin` on **every** call (per-request overhead) and **swallows errors → returns `undefined`**, forcing a duplicated `if (!client) throw …` guard in 4 call sites. DB name `"website"` + collection names are hardcoded string literals everywhere (no central constants).

🔴 `subscribe.ts` is a **client-side fetch wrapper misfiled** under `service/` (every other `*.service.ts` is server-side).

> **Status 2026-07-20:** Mailing HOLDS. `like.service` now returns a discriminated-union `LikesOutcome` instead of throwing (a good move — the stale pre-update `count` caveat remains, now `Math.max(..., 0)`). `database.service` **changed**: the per-call `admin` ping was removed (**ICR-113**) and it now `Sentry.captureException`s on failure; the `if (!client)` guard has spread to ~8 call sites; DB name `"website"` + collection literals are **still hardcoded** (**ICR-153**, High — a data-isolation hazard). `subscribe.ts` is still a client fetch wrapper under `service/`. `constants.ts` exists but centralizes only `revalidateDuration`. See also **ICR-157** (cap Mongo `maxPoolSize`).

### 6.4 Error-handling contracts

🔴 Five different contracts coexist — worth unifying before encoding:

| Layer                               | Contract                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Contentful getters / `fetchGraphQL` | no try/catch; rely on `?.`, let mappers throw                              |
| Mongo services                      | try/catch → `console.error` → **re-throw**                                 |
| `connect()`                         | try/catch → `console.error` → **return `undefined`**                       |
| Mail adapters                       | try/catch → `console.error` → **return `false`**                           |
| API routes / Server Action          | try/catch → `console.error` → typed `NextResponse.json({error}, {status})` |

Logging is uniformly `console.*` (no structured logger / Sentry, unlike sibling projects).

> **Status 2026-07-20: CHANGED.** The "no Sentry" line is **false** — `@sentry/nextjs` is fully wired (instrumentation + edge/server configs + `captureException` in `global-error.tsx` and `database.service.ts`) via **ICR-117**. The contracts _diverged further_ rather than converging: the Mongo layer now splits — `like.service` returns a **result-union** (no throw) while `contact.service` still re-throws — a new sixth shape. Unifying them is **ICR-34**.

---

## 7. Forms & validation

🟡 **Two form architectures**, both correctly using **`useActionState`** (not the deprecated `useFormState`) + `isPending` → `<LoadingSpinner>`:

- **`ContactForm`** — config-driven Server Action. Contentful supplies `formFields[]`; the component switches on `field.type` to call factory helpers in `formFields.tsx`; `requiredFields` is derived from the same config and passed into the action. Clean, data-driven.
- **`SubscribeForm` / `SubscribeBanner`** — inline-closure actions calling the `subscribe()` service + analytics. 🔴 The two are near-duplicates with copy-pasted action bodies — hoist the shared action.

🔴 **Validation is the biggest gap vs. the stated rules.** `zod` + `@hookform/resolvers` are installed but **used in zero files**. Every boundary hand-rolls validation: the contact action uses a manual required-loop + email regex; `/api/subscribe` does `if (!email)`; `/api/likes` does `typeof slug !== "string"`. The project rule "validate external input with Zod at boundaries" is currently aspirational. ⚷ The email template (`template-engine.ts`) also does **raw `{{placeholder}}` replacement with no HTML escaping** — user-supplied contact fields are injected unescaped into the notification email (HTML-injection surface).

> **Status 2026-07-20: CHANGED.** `SubscribeForm` was removed — the newsletter UI is a single `SubscribeBanner`, so the "two copy-pasted near-duplicates" is obsolete. `zod` is now **used** (`/api/subscribe`, `/api/predica/regenerate-pdf`, `service/broadcast/types.ts`), so validation is now **mixed** — but the contact action + `/api/likes` still hand-roll, and `@hookform/resolvers` remains genuinely unused. The **unescaped `{{placeholder}}`** template engine still stands (still an HTML-injection surface). Both remaining gaps are **ICR-33**.

---

## 8. TypeScript & naming conventions

### 8.1 Naming — ✅ strong and consistent

- **PascalCase** components; **lowercase-dash** directories (`icon-card`, `our-mission-cta`, `come-meet-us`).
- **`handle*`** event handlers (`handleClick`, `handleCopyLink`, `handleContactFormSubmission`); **`on*`** callback props.
- **Auxiliary-verb booleans** (`isLoading`, `isPending`, `hasLiked`, `isNewVisitor`, `isEnabled`, `canNativeShare`).
- **File suffixes** are meaningful and consistent: `get*.ts` (Contentful readers), `*.service.ts`, `*.adapter.ts`, `*.template.ts`; cva fns are `*Variants`; module consts are `SCREAMING_SNAKE` (`GRAPHQL_FIELDS`, `MONGODB_OPTIONS`, `TEMPLATES`).
- **`Readonly<>`** consistently wraps page/metadata prop shapes.

> **Status 2026-07-20:** HOLDS.

### 8.2 `interface` vs `type` — 🔴 contradicts the stated rule

`CLAUDE.md` says "prefer `interface` over `type`." Actual adherence is ~60%. The shadcn layer + `lib/contentful/types` + service docs use `interface`; the hand-rolled component layer and `ContactDetails`/`MenuItem`/`BlogPost` use `type`. Predictable by which half of the seam a file is in.

> **Status 2026-07-20:** HOLDS. Folds into the seam-convergence work (**ICR-37**) and the encode-the-baseline task (**ICR-38**).

### 8.3 `satisfies` — 🔴 never used

The convention recommends `satisfies` for type validation; it appears in **zero** files. Const objects use `as const` instead.

> **Status 2026-07-20: STALE.** `satisfies` is now used in ~7 files, typically `as const satisfies Record<…>` (mostly the `/predica` + i18n message-key modules).

### 8.4 Exports — 🟡 named-by-default with a handful of defaults

"Named exports for components" is the majority rule, broken by a few default exports (`BlogPostDetails`, `InfoCommunity`, `BibleVerse`, `SocialLinks`, `LanguageSwitcher`, `LoadingSpinner`). `LoadingSpinner` breaks two rules at once (default export _and_ flat PascalCase file).

> **Status 2026-07-20:** HOLDS — all six still use default exports.

### 8.5 `??` vs `||` — ✅ mostly honored

Nullish coalescing is the norm where a value can be missing; the only stray `||` found is in `buildOgImage`.

> **Status 2026-07-20: CHANGED.** `buildOgImage` still uses `||` (unfixed), but it is **no longer the only** value-defaulting `||` — the newer sermon/blog surface added a handful (`BlogPostCard`, `sermonRichTextOptions`, `SermonAudioPlayer`, plus `Portal`'s `|| document.body`). Worth a sweep as part of **ICR-30**.

### 8.6 Ambient env typing

🟡 `environment.d.ts` augments `NodeJS.ProcessEnv` with literal unions for constrained vars (`VERCEL_ENV?: 'production'|'preview'|'development'`, `MAIL_PROVIDER: 'sendgrid'|'resend'`). Great DX, but it types most vars as required `string` though they're `undefined` at runtime — which is why services still hand-check `if (!process.env.X) throw`. The type "lies" about runtime presence.

> **Status 2026-07-20:** HOLDS. The file grew (Sentry/predica/broadcast vars) but the typed-augmentation pattern is unchanged.

---

## 9. The two-layer seam (read this before standardizing the UI)

Almost every 🔴 in this doc is the same fault line. The UI was **scaffolded with shadcn/ui and then selectively hand-curated**, and the two halves never fully reconciled:

| Dimension    | shadcn-derived layer                                  | hand-rolled layer                            |
| ------------ | ----------------------------------------------------- | -------------------------------------------- |
| File layout  | flat `name.tsx` (`card.tsx`, `input.tsx`, `form.tsx`) | folder + `Component.tsx` + `index.ts` barrel |
| Variants     | `cva` + `VariantProps`                                | `keyof typeof` const-map / ternary           |
| Polymorphism | `forwardRef` + `displayName` + Radix `Slot`/`asChild` | plain function, no ref forwarding            |
| Color        | semantic tokens (`bg-card`, `text-muted-foreground`)  | raw palette (`text-gray-900 dark:…`)         |
| Props type   | `interface` extending native attrs                    | `type` alias                                 |
| Class merge  | `cn()`                                                | sometimes template-literal interpolation     |

The tell: `button/Button.tsx` is byte-for-byte shadcn code (cva/Slot/forwardRef) but was **relocated** into the folder+barrel convention — so someone _started_ normalizing the shadcn primitives into the local convention and stopped. **Pick the canonical half (recommend: folder+barrel layout, semantic tokens, `cn()` everywhere, `interface` for props, cva for multi-axis variants and const-maps for single-axis) and converge, then encode that in harness memory.**

> **Status 2026-07-20:** HOLDS (paths under `apps/web/`, `cn()` now from `@idcr/ui`). The `button/Button.tsx` tell is confirmed. Convergence tracked in **ICR-37** / ICR-23; encoding the chosen canon is **ICR-38**.

---

## 10. Candidates to standardize (encode in harness memory)

> **Status 2026-07-20:** these ten are still consistent and worth enforcing — this list is the payload for **ICR-38** ("encode the convention baseline in `CLAUDE.md` / harness memory"). One evolution to fold in: #6's failure model is now best expressed as a **discriminated-union return** (see `like.service`'s `LikesOutcome`), matching the repo's functional-first rule in `AGENTS.md`.

Promote these — they're already consistent and worth enforcing on new code:

1. ✅ Fetch-in-page, render-in-component; components receive `content`/`posts` props and never fetch.
2. ✅ RSC-by-default; `'use client'` only for a hook/browser API; push the boundary to the leaf.
3. ✅ Contentful getter skeleton: `GRAPHQL_FIELDS` const + `get*(name, locale, isDraftMode=false)` + `fetchGraphQL` + `next:{tags:["site-content"]}` + guarded `?.… ?? []` mapping.
4. ✅ SEO via `lib/metadata.ts` builders; no inline metadata in pages; hreflang via `buildLocaleAlternates`. _(Watch the §5.2 inline-metadata regression.)_
5. ✅ Locale layout owns `<html>`/`<body>`/providers/chrome; root layout stays bare; chrome fetched once in the layout.
6. ✅ Mailing-style factory+adapter+`interface`+env-switch for any pluggable integration.
7. ✅ `useSyncExternalStore` for SSR-safe browser-value reads (no hydration flash).
8. ✅ `cn()` for _all_ class composition; framer-motion scroll-reveal with `viewport={{ once: true }}` + `delay: index*0.1`. _(Reconcile the §3.5 delay drift + verify `animate-in` renders under Tailwind v4.)_
9. ✅ Naming: PascalCase components, dash dirs, `handle*`/`on*`, `is/has` booleans, `get*`/`*.service`/`*.adapter`/`*Variants` suffixes, `Readonly<>` page props.
10. ✅ `useActionState` (never `useFormState`) + `isPending` spinner for forms.

## 11. Resolve before standardizing (don't let the harness copy these)

> **Status 2026-07-20:** per-item status + owning ticket appended in **bold** below. ⚪ = the code the item referred to was removed.

1. 🔴 Pick **one** half of the shadcn/hand-rolled seam (§9) and converge file layout, variants, color tokens, `type`-vs-`interface`. — **🔴 OPEN · ICR-37 / ICR-23**
2. 🔴 Make Zod real at the three boundaries (contact action, `/api/subscribe`, `/api/likes`); HTML-escape email template inputs. — **🟡 PARTIAL · ICR-33** (Zod at `/api/subscribe` done; contact action + `/api/likes` + email escaping open)
3. 🔴 Add `Promise.all` to the parallelizable page/layout getters. — **🔴 OPEN · ICR-31** (+ ICR-42) — pages/layout still sequential
4. 🔴 `notFound()` for missing blog posts; add `error.tsx` + `loading.tsx`/`<Suspense>`. — **🟡 PARTIAL · ICR-32** (`error.tsx`/`global-error.tsx` + `notFound()` guards done; `blog/[slug]` + `predicas/[slug]` soft-fail + `loading.tsx` open)
5. 🔴 Unify the five error-handling contracts (§6.4); give `fetchGraphQL` a real failure path. — **🔴 OPEN · ICR-34** (contracts diverged further)
6. 🔴 Standardize the route-handler skeleton (`NextRequest` + `NextResponse.json` + `try/catch` + Zod). — **🔴 OPEN · ICR-35** (+ ICR-152)
7. 🔴 Promote `component-resolver` to a typed const-map; handle unknown `__typename` loudly. — **⚪ MOOT · ICR-20 / ICR-96** (resolver deleted; future Landing Page resolver)
8. 🔴 Single source of truth for locales (`routing.ts` vs `i18n/config.ts` duplicate the list). — **🔴 OPEN · ICR-36** (still duplicated)
9. 🔴 Delete dead code: `src/utils/classNames.ts`; the Pages-Router `next/router` import in `format-date/FormatDate.tsx`; the commented-out `KeywordTags` render; fix `Content.tsx`'s unguarded `${className}`. — **🟡 PARTIAL · ICR-30** (`next/router`/`FormatDate` + `SubscribeForm` removed; `classNames.ts` + `KeywordTags` comment + `Content.tsx` bug open)
10. 🔴 Centralize magic strings (Contentful machine-names, cache tag `"site-content"`, DB/collection names) into constants. — **🔴 OPEN · ICR-36** (+ **ICR-153** for the DB name)

---

## Appendix — quick reference

| Concern               | Convention                                        | Where it lives                              |
| --------------------- | ------------------------------------------------- | ------------------------------------------- |
| Class merge           | `cn(base, className)`                             | `@idcr/ui` (`packages/ui/src/cn.ts`)        |
| Data fetch            | `get*(name, locale, isDraftMode)` in pages        | `lib/contentful/get*.ts`                    |
| Cache                 | tag `"site-content"`, on-demand `revalidateTag`   | `lib/contentful/fetch.ts`, `api/revalidate` |
| Draft mode            | `shouldUseDraftMode()`                            | `lib/contentful/draftMode.ts`               |
| SEO                   | `buildPageMetadata` / `buildArticleMetadata`      | `lib/metadata.ts`                           |
| i18n locale           | `setRequestLocale(locale)` per page; `routing.ts` | `src/i18n/*`                                |
| Forms                 | `useActionState` + Server Action                  | `features/contact-form/*`                   |
| Pluggable integration | factory + adapter + `interface` + env switch      | `service/mailing/*`                         |
| SSR-safe browser read | `useSyncExternalStore`                            | `ShareButton`, `ConsentBanner`              |
| Component layout      | `feature-name/Component.tsx` + `index.ts`         | `src/components/**`                         |

> _This is an observed snapshot (2026-06-22), validated 2026-07-20, not a ratified standard. Use §10/§11 to decide what graduates into `CLAUDE.md` / harness memory — and the [Validation status](#validation-status--ticket-map-2026-07-20) section to see what's already been done. All paths are under `apps/web/` post-migration._
