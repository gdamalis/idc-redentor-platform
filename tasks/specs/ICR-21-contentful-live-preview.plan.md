# ICR-21 Contentful Live Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development + superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each Task = one `/work` checkpoint; commit at its end.

**Goal:** Add draft-mode-gated Contentful Live Preview (real-time field updates + inspector overlay) to the home + community pages, preview-only, without weakening production security.

**Architecture:** A `'use client'` provider is mounted in `[locale]/layout.tsx` **only when `shouldUseDraftMode()`** — because pages/layout are server components, the SDK JS ships only on draft renders (production visitors get nothing). Each in-scope page branches `isEnabled ? <XLive raw locale/> : <XView content={…}/>`; the `*Live` client wrapper runs a shared `useLivePreview` hook (live updates + inspector) and feeds the existing view. `config/headers.js` becomes env-aware: production restores strict clickjacking; only preview/dev allows Contentful framing.

**Tech Stack:** Next.js 16 App Router (RSC), React 19.2, `@contentful/live-preview@^4.10`, Contentful GraphQL, Vitest (jsdom), Playwright (`e2ePublic`).

## Global Constraints

- Package manager: **pnpm**; site package filter `@idcr/web`; worktree `.claude/worktrees/ICR-21`.
- Verify commands: `pnpm type-check` · `pnpm lint` · `pnpm test` · `pnpm build` (all from worktree root).
- **Functional-first**: pure functions + plain objects; model outcomes as return values; **no `class`** (repo rule).
- `interface` over `type` for object shapes; `??` over `||`; `satisfies` for validation; named exports for components; lowercase-dash dirs.
- **RSC-first**: the ONLY new `'use client'` boundaries are the provider, `useLivePreview`, and the `*Live` wrappers. Never add `'use client'` to a page/layout.
- Commit type `feat`, header ≤ 100 chars, conventional-commits, scope `(ICR-21)`.
- **Do NOT** touch `fetchGraphQL`, `/api/draft/*`, `/api/revalidate`, or `revalidateTag`.
- **Bind to installed types**: before finalizing SDK calls, read `node_modules/@contentful/live-preview/`'s types/README to confirm `ContentfulLivePreviewProvider` props, `useContentfulLiveUpdates(data, opts)`, `useContentfulInspectorMode(shared?)`, and the CSS export path.
- Contentful field API ids (from `getSection`): `headline`, `subHeadline`, `body`, `ctaText`, `image`, `layout`, `urlParameters`. BeliefItem: `title`, `description`, `bibleVerse`, `image`, `kind`. ContentCollection: `title`, `description`.

---

## Task 1 (CP1): SDK install + draft-gated provider

**Files:**

- Modify: `apps/web/package.json` (dependency)
- Create: `apps/web/src/components/shared/contentful-preview/ContentfulPreviewProvider.tsx`
- Create: `apps/web/src/components/shared/contentful-preview/index.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`

**Interfaces — Produces:**

- `ContentfulPreviewProvider({ locale }: { readonly locale: string }): JSX.Element` (`'use client'`, wraps children).

- [ ] **Step 1: Install the SDK** (no peer-dep flags — v4.10 lists `react ^19`).

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-21
pnpm --filter @idcr/web add @contentful/live-preview
```

Expected: adds `@contentful/live-preview` to `apps/web/package.json`; lockfile updates; no `ERR_PNPM_PEER_DEP_ISSUES`.

- [ ] **Step 2: Confirm the CSS export path.** Read `node_modules/@contentful/live-preview/package.json` `exports`. Use the real style entry (expected `@contentful/live-preview/style.css`). If none exists, omit the CSS import and note it.

- [ ] **Step 3: Create the provider** (`ContentfulPreviewProvider.tsx`):

```tsx
"use client";

import "@contentful/live-preview/style.css"; // adjust to the verified export path from Step 2
import { ContentfulLivePreviewProvider } from "@contentful/live-preview/react";
import type { PropsWithChildren } from "react";

interface ContentfulPreviewProviderProps {
  readonly locale: string;
}

export function ContentfulPreviewProvider({
  locale,
  children,
}: PropsWithChildren<ContentfulPreviewProviderProps>) {
  return (
    <ContentfulLivePreviewProvider
      locale={locale}
      enableInspectorMode
      enableLiveUpdates
    >
      {children}
    </ContentfulLivePreviewProvider>
  );
}
```

`index.ts`: `export { ContentfulPreviewProvider } from "./ContentfulPreviewProvider";`

- [ ] **Step 4: Mount it draft-gated in `layout.tsx`.** `isEnabled` already exists at line 86. Wrap the content subtree so the provider is an ancestor of `{children}`. Replace the `<ThemeProvider>…</ThemeProvider>` block with a draft-gated wrap:

```tsx
import { ContentfulPreviewProvider } from "@src/components/shared/contentful-preview";
// …
const content = (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <NextIntlClientProvider messages={messages}>
      <NavbarWrapper menuItems={navMenu} />
      {children}
      <SubscribeBanner content={subscribeContent} />
      <Footer content={footerContent} />
      <ConsentBanner />
      <Toaster />
    </NextIntlClientProvider>
    <SpeedInsights />
    <Analytics />
  </ThemeProvider>
);
// …in the returned <body>, replace the inline ThemeProvider block with:
{
  isEnabled ? (
    <ContentfulPreviewProvider locale={locale}>
      {content}
    </ContentfulPreviewProvider>
  ) : (
    content
  );
}
```

Keep the `<Script>`, `<JsonLd>`, `<GoogleTagManager>` siblings exactly as-is.

- [ ] **Step 5: Verify.**

```bash
pnpm type-check && pnpm lint && pnpm build
```

Expected: all pass. (Build needs `.env.local` — already copied into the worktree.)

- [ ] **Step 6: Commit.**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/shared/contentful-preview apps/web/src/app/'[locale]'/layout.tsx
git commit -m "feat(ICR-21): add draft-gated Contentful Live Preview provider"
```

---

## Task 2 (CP2): CSP env-gating

**Files:**

- Create: `apps/web/config/securityHeaders.js` (pure builder, CommonJS to match `headers.js`)
- Create: `apps/web/config/securityHeaders.test.ts`
- Modify: `apps/web/config/headers.js`

**Interfaces — Produces:**

- `buildSecurityHeaders({ previewLike }: { previewLike: boolean }): Array<{ key: string; value: string }>`

- [ ] **Step 1: Write the failing test** (`securityHeaders.test.ts`):

```ts
import { describe, expect, it } from "vitest";
// CommonJS module — import via require-interop
import { buildSecurityHeaders } from "./securityHeaders";

const find = (hs: Array<{ key: string; value: string }>, k: string) =>
  hs.find((h) => h.key.toLowerCase() === k.toLowerCase());

describe("buildSecurityHeaders", () => {
  it("production: strict clickjacking, no Contentful frame-ancestors", () => {
    const hs = buildSecurityHeaders({ previewLike: false });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'self';");
    expect(csp).not.toContain("app.contentful.com");
  });

  it("preview: no X-Frame-Options, both Contentful origins framed", () => {
    const hs = buildSecurityHeaders({ previewLike: true });
    expect(find(hs, "X-Frame-Options")).toBeUndefined();
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("https://app.contentful.com");
    expect(csp).toContain("https://app.eu.contentful.com");
  });

  it("keeps other CSP directives identical across envs", () => {
    const prod = find(
      buildSecurityHeaders({ previewLike: false }),
      "Content-Security-Policy",
    )!.value;
    const prev = find(
      buildSecurityHeaders({ previewLike: true }),
      "Content-Security-Policy",
    )!.value;
    for (const d of ["script-src", "connect-src", "img-src", "media-src"]) {
      const grab = (csp: string) =>
        csp
          .split(";")
          .find((s) => s.trim().startsWith(d))
          ?.trim();
      expect(grab(prod)).toBe(grab(prev));
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './securityHeaders'`).

```bash
pnpm --filter @idcr/web test -- securityHeaders
```

- [ ] **Step 3: Implement `securityHeaders.js`** (move the CSP directive strings here verbatim from the current `headers.js`, split so `frame-ancestors` is composed):

```js
const SCRIPT_SRC =
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.googletagmanager.com https://va.vercel-scripts.com";
const CONNECT_SRC =
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://va.vercel-scripts.com https://vitals.vercel-insights.com";
const IMG_SRC =
  "img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://images.ctfassets.net https://images.eu.ctfassets.net https://images.unsplash.com";
const MEDIA_SRC =
  "media-src 'self' https://assets.ctfassets.net https://assets.eu.ctfassets.net https://downloads.ctfassets.net";
const CONTENTFUL_APP_ORIGINS =
  "https://app.contentful.com https://app.eu.contentful.com";

function buildCsp(previewLike) {
  const frameAncestors = previewLike
    ? `frame-ancestors 'self' ${CONTENTFUL_APP_ORIGINS}`
    : "frame-ancestors 'self'";
  return [frameAncestors, SCRIPT_SRC, CONNECT_SRC, IMG_SRC, MEDIA_SRC].join(
    "; ",
  );
}

function buildSecurityHeaders({ previewLike }) {
  return [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    // X-Frame-Options is OMITTED in preview/dev — it would block the Contentful iframe even with a correct CSP.
    ...(previewLike ? [] : [{ key: "X-Frame-Options", value: "SAMEORIGIN" }]),
    { key: "Content-Security-Policy", value: buildCsp(previewLike) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}

module.exports = { buildSecurityHeaders };
```

- [ ] **Step 4: Rewrite `headers.js`** to compute `previewLike` from the deploy env and delegate:

```js
const { buildSecurityHeaders } = require("./securityHeaders");

module.exports = async () => {
  const previewLike =
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development";
  return [
    {
      source: "/:path*",
      headers: buildSecurityHeaders({ previewLike }),
    },
  ];
};
```

- [ ] **Step 5: Run tests — expect PASS.**

```bash
pnpm --filter @idcr/web test -- securityHeaders
```

- [ ] **Step 6: Full verify** (build confirms `next.config.ts` still loads `headers.js`):

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 7: Commit.**

```bash
git add apps/web/config/securityHeaders.js apps/web/config/securityHeaders.test.ts apps/web/config/headers.js
git commit -m "feat(ICR-21): env-gate frame-ancestors and X-Frame-Options for Live Preview"
```

---

## Task 3 (CP3): raw-data flow + `useLivePreview` hook

**Files:**

- Modify: `apps/web/lib/contentful/getContentCollection.ts`
- Create: `apps/web/lib/contentful/mapContentCollection.ts`
- Create: `apps/web/lib/contentful/mapContentCollection.test.ts`
- Modify/replace: `apps/web/lib/contentful/getContentCollection.test.ts` (retarget to the mapper, or delete if fully moved)
- Create: `apps/web/src/components/shared/contentful-preview/useLivePreview.ts`
- Create: `apps/web/src/components/shared/contentful-preview/useLivePreview.test.ts`
- Modify: `apps/web/src/app/[locale]/page.tsx`, `apps/web/src/app/[locale]/community/page.tsx` (only the `getContentCollection` call sites → wrap in `mapContentCollection`, non-draft path)

**Interfaces — Produces:**

- `getContentCollection(name, locale, isDraftMode?): Promise<RawContentCollection>` — now returns the **raw** entry node (`{ title, description, contentItemsCollection, sys, __typename }`).
- `mapContentCollection(raw): ContentCollection` — the old shape `{ title, description, creedItems, image }`.
- `useLivePreview<T>(raw: T, locale: string): { data: T; inspectorProps: InspectorProps }` where `InspectorProps = (a: { entryId: string; fieldId: string; locale?: string }) => Record<string, string>`.

### 3a — Nested ids + raw getter + mapper

- [ ] **Step 1:** Add `sys { id }` + `__typename` inside the `... on BeliefItem` block of `getContentCollection.ts` `GRAPHQL_FIELDS` (keep top-level `sys{id}`/`__typename`). Add after `kind`:

```graphql
        kind
        sys { id }
        __typename
```

- [ ] **Step 2:** Change `getContentCollection` to return the **raw** first item (drop the reshape):

```ts
return data?.data?.contentCollectionCollection?.items?.[0];
```

Export a type for the raw node (or reuse existing GraphQL types). Keep the `preview` interpolation + `fetchGraphQL(query, isDraftMode)` exactly as-is.

- [ ] **Step 3: Write the mapper + failing test.** Look at the current `getContentCollection.test.ts` fixture for the exact input/output shape; port it. `mapContentCollection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapContentCollection } from "./mapContentCollection";

it("maps a raw content collection to the presentational shape", () => {
  const raw = {
    title: "Our Creed",
    description: { json: { nodeType: "document", content: [] } },
    contentItemsCollection: {
      items: [{ title: "Unity", sys: { id: "b1" }, __typename: "BeliefItem" }],
    },
    sys: { id: "c1" },
    __typename: "ContentCollection",
  };
  expect(mapContentCollection(raw)).toEqual({
    title: "Our Creed",
    description: raw.description,
    creedItems: raw.contentItemsCollection.items,
    image: undefined, // preserve today's pre-existing behavior — do NOT fix here
  });
});
```

- [ ] **Step 4: Implement `mapContentCollection.ts`** (pure; mirrors the removed reshape exactly, incl. `image: raw?.image`):

```ts
import type { ContentCollection } from "./types";

export function mapContentCollection(raw: any): ContentCollection {
  return {
    title: raw?.title,
    description: raw?.description,
    creedItems: raw?.contentItemsCollection?.items,
    image: raw?.image,
  };
}
```

- [ ] **Step 5: Update the 3 call sites** (non-draft path stays behaviorally identical): in `page.tsx` and `community/page.tsx`, wrap each `getContentCollection(...)` result with `mapContentCollection(...)` where it's passed to `OurMissionSection` / `CreedSection`. (Task 4/5 replaces these with the `isEnabled` branch — this keeps the tree green in between.)

- [ ] **Step 6: Run mapper tests — expect PASS**, then `pnpm type-check && pnpm lint && pnpm test`.

### 3b — `useLivePreview` hook

- [ ] **Step 7: Write the failing test** (`useLivePreview.test.ts`, jsdom — with no provider host the SDK returns data unchanged; assert passthrough + inspector attribute shape). Confirm the SDK export names first (Global Constraints):

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLivePreview } from "./useLivePreview";

it("returns the raw data untouched when there is no live-preview host", () => {
  const raw = { sys: { id: "e1" }, __typename: "Section", headline: "Hi" };
  const { result } = renderHook(() => useLivePreview(raw, "es-AR"));
  expect(result.current.data).toEqual(raw);
});

it("inspectorProps yields data-contentful-* attributes for an entry+field", () => {
  const raw = { sys: { id: "e1" }, __typename: "Section", headline: "Hi" };
  const { result } = renderHook(() => useLivePreview(raw, "es-AR"));
  const attrs = result.current.inspectorProps({
    entryId: "e1",
    fieldId: "headline",
  });
  expect(attrs["data-contentful-entry-id"]).toBe("e1");
  expect(attrs["data-contentful-field-id"]).toBe("headline");
});
```

> If `@testing-library/react` is not a dev dep, either add it (dev) or restructure to test the tiny wrapper via direct call with the SDK mocked (`vi.mock("@contentful/live-preview/react")`). Prefer mocking the SDK to avoid a new dep — verify what's installed first.

- [ ] **Step 8: Run — expect FAIL.**

- [ ] **Step 9: Implement `useLivePreview.ts`:**

```tsx
"use client";

import {
  useContentfulInspectorMode,
  useContentfulLiveUpdates,
} from "@contentful/live-preview/react";

export type InspectorProps = (args: {
  entryId: string;
  fieldId: string;
  locale?: string;
}) => Record<string, string>;

export interface UseLivePreviewResult<T> {
  readonly data: T;
  readonly inspectorProps: InspectorProps;
}

export function useLivePreview<T>(
  raw: T,
  locale: string,
): UseLivePreviewResult<T> {
  const data = useContentfulLiveUpdates<T>(raw, { locale });
  const inspectorProps = useContentfulInspectorMode({
    locale,
  }) as InspectorProps;
  return { data, inspectorProps };
}
```

> Verify `useContentfulInspectorMode`'s real signature against installed types; if it takes no shared arg, drop `{ locale }` and pass `locale` per element instead.

- [ ] **Step 10: Run tests — expect PASS**, then full verify:

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 11: Commit.**

```bash
git add apps/web/lib/contentful/getContentCollection.ts apps/web/lib/contentful/mapContentCollection.ts apps/web/lib/contentful/mapContentCollection.test.ts apps/web/lib/contentful/getContentCollection.test.ts apps/web/src/components/shared/contentful-preview/useLivePreview.ts apps/web/src/components/shared/contentful-preview/useLivePreview.test.ts apps/web/src/app/'[locale]'/page.tsx apps/web/src/app/'[locale]'/community/page.tsx
git commit -m "feat(ICR-21): raw-data flow, useLivePreview hook, BeliefItem sys ids"
```

---

## Task 4 (CP4): home components — live + inspector

**Pattern for every in-scope component:** keep the existing component as the **view**, add an optional `inspectorProps?: InspectorProps` prop, and spread `inspectorProps?.({ entryId, fieldId })` on each editable element. Add a sibling `'use client'` `*Live` wrapper that runs `useLivePreview` and renders the view. Branch the page: `isEnabled ? <XLive raw={raw} locale={locale}/> : <XView content={…}/>`.

**Files:**

- Modify: `apps/web/src/components/features/our-mission-cta/OurMissionCta.tsx` (+ `index.ts`)
- Create: `apps/web/src/components/features/our-mission-cta/OurMissionCtaLive.tsx`
- Modify: `apps/web/src/components/features/component-cta/ComponentCta.tsx` (+ `index.ts`)
- Create: `apps/web/src/components/features/component-cta/ComponentCtaLive.tsx`
- Modify: `apps/web/src/components/features/our-mission-section/OurMissionSection.tsx` (+ `index.ts`)
- Create: `apps/web/src/components/features/our-mission-section/OurMissionSectionLive.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`

**Interfaces — Consumes:** `useLivePreview`, `InspectorProps` (Task 3); `mapContentCollection` (Task 3).

- [ ] **Step 1: `OurMissionCta` view** — add `inspectorProps?: InspectorProps` to props; `entryId = content.sys.id` (the raw section already carries `sys.id`; extend the view's `content` type with `sys: { id: string }`). Spread on: headline `<span>` (`fieldId:"headline"`), subHeadline `<span>` (`"subHeadline"`), body wrapper (`"body"`), CTA button (`"ctaText"`), image container (`"image"`). Example:

```tsx
<span {...inspectorProps?.({ entryId: content.sys.id, fieldId: "headline" })}>
  {content.headline}
</span>
```

- [ ] **Step 2: `OurMissionCtaLive.tsx`:**

```tsx
"use client";

import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import { OurMissionCta } from "./OurMissionCta";

interface OurMissionCtaLiveProps {
  readonly raw: Parameters<typeof OurMissionCta>[0]["content"];
  readonly locale: string;
}

export function OurMissionCtaLive({ raw, locale }: OurMissionCtaLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return <OurMissionCta content={data} inspectorProps={inspectorProps} />;
}
```

Export it from `index.ts`.

- [ ] **Step 3: `ComponentCta` view** — add `inspectorProps?`; `entryId = content.sys.id`; spread on headline (`"headline"`) + CTA link (`"ctaText"`). Add `sys: { id: string }` to its `content` type. Create `ComponentCtaLive.tsx` (same shape as Step 2).

- [ ] **Step 4: `OurMissionSection` view** — add `inspectorProps?`; the view takes the mapped `ContentCollection` but now also needs the collection `sys.id` and per-item `sys.id`. Extend `ContentCollection` (or the view props) so `content.sys.id` and each `creedItems[i].sys.id` are available (they exist on the raw node after Task 3a; ensure `mapContentCollection` carries `sys` through on the collection and items). Spread: SectionHeader title (`entryId: content.sys.id, fieldId:"title"`), each card title (`entryId: item.sys.id, fieldId:"title"`), each card body (`entryId: item.sys.id, fieldId:"description"`).
  - Update `mapContentCollection` to preserve `sys` on the collection (`sys: raw?.sys`) — items already retain `sys` since `creedItems = contentItemsCollection.items` passes them through. Update its test to assert `sys` passthrough.

- [ ] **Step 5: `OurMissionSectionLive.tsx`** — runs `useLivePreview(raw, locale)`, then `mapContentCollection(data)`:

```tsx
"use client";

import { mapContentCollection } from "@lib/contentful/mapContentCollection";
import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import { OurMissionSection } from "./OurMissionSection";

interface OurMissionSectionLiveProps {
  readonly raw: unknown; // raw ContentCollection node
  readonly locale: string;
}

export function OurMissionSectionLive({
  raw,
  locale,
}: OurMissionSectionLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return (
    <OurMissionSection
      content={mapContentCollection(data)}
      inspectorProps={inspectorProps}
    />
  );
}
```

- [ ] **Step 6: Branch `page.tsx`.** Replace the three in-scope renders:

```tsx
{
  isEnabled ? (
    <OurMissionCtaLive raw={ourMission} locale={locale} />
  ) : (
    <OurMissionCta content={ourMission} />
  );
}
{
  isEnabled ? (
    <OurMissionSectionLive raw={ourMissionCollection} locale={locale} />
  ) : (
    <OurMissionSection content={mapContentCollection(ourMissionCollection)} />
  );
}
{
  /* BlogSection unchanged */
}
{
  isEnabled ? (
    <ComponentCtaLive raw={contactCta} locale={locale} />
  ) : (
    <ComponentCta content={contactCta} />
  );
}
```

(`ourMissionCollection` is now the raw node from Task 3.)

- [ ] **Step 7: Verify** — `pnpm type-check && pnpm lint && pnpm test && pnpm build`. Confirm the non-draft branch renders identically (no `data-contentful-*` when `inspectorProps` is undefined).

- [ ] **Step 8: Commit.**

```bash
git add apps/web/src/components/features/our-mission-cta apps/web/src/components/features/component-cta apps/web/src/components/features/our-mission-section apps/web/lib/contentful/mapContentCollection.ts apps/web/lib/contentful/mapContentCollection.test.ts apps/web/src/app/'[locale]'/page.tsx
git commit -m "feat(ICR-21): live updates and inspector on home components"
```

---

## Task 5 (CP5): community components — live + inspector

**Files:**

- Modify: `apps/web/src/components/features/info-community/InfoCommunity.tsx` (+ `index.ts`)
- Create: `apps/web/src/components/features/info-community/InfoCommunityLive.tsx`
- Modify: `apps/web/src/components/features/creed-section/CreedSection.tsx` (+ `index.ts`)
- Create: `apps/web/src/components/features/creed-section/CreedSectionLive.tsx`
- Modify: `apps/web/src/app/[locale]/community/page.tsx`

**Interfaces — Consumes:** Task 3 + Task 4 (`ComponentCtaLive`, `OurMissionSectionLive` reused).

- [ ] **Step 1: `InfoCommunity` view** — add `inspectorProps?`; `entryId = content.sys.id`; add `sys: { id: string }` to its `content` type; spread on the body container (`fieldId:"body"`). Note it is a **default export** — keep it; the Live wrapper imports the default.

- [ ] **Step 2: `InfoCommunityLive.tsx`** (imports the default export):

```tsx
"use client";

import { useLivePreview } from "@src/components/shared/contentful-preview/useLivePreview";
import InfoCommunity from "./InfoCommunity";

interface InfoCommunityLiveProps {
  readonly raw: Parameters<typeof InfoCommunity>[0]["content"];
  readonly locale: string;
}

export function InfoCommunityLive({ raw, locale }: InfoCommunityLiveProps) {
  const { data, inspectorProps } = useLivePreview(raw, locale);
  return <InfoCommunity content={data} inspectorProps={inspectorProps} />;
}
```

- [ ] **Step 3: `CreedSection` view** — add `inspectorProps?`. Spread: SectionHeader title (`entryId: content.sys.id, fieldId:"title"`). For each item, apply inspector at the card level via `IconCard` — pass a wrapping element or extend `IconCard` to accept a `containerProps`/`inspectorProps` spread. Minimal approach: wrap each `<IconCard>` in a `<div {...inspectorProps?.({ entryId: credo.sys.id, fieldId: "title" })}>` so clicking the card jumps to that BeliefItem. If per-field is feasible without disturbing `IconCard`, also tag the description/bibleVerse; otherwise entry+title is acceptable for pass 1 (AC #2 met at item granularity). Ensure `credo.sys.id` is available (present after Task 3a).

- [ ] **Step 4: `CreedSectionLive.tsx`** — same shape as `OurMissionSectionLive` (uses `mapContentCollection(data)`), rendering `CreedSection`.

- [ ] **Step 5: Branch `community/page.tsx`:**

```tsx
{
  isEnabled ? (
    <InfoCommunityLive raw={infoCommunity} locale={locale} />
  ) : (
    <InfoCommunity content={infoCommunity} />
  );
}
{
  isEnabled ? (
    <CreedSectionLive raw={ourCreedContent} locale={locale} />
  ) : (
    <CreedSection content={mapContentCollection(ourCreedContent)} />
  );
}
{
  isEnabled ? (
    <OurMissionSectionLive raw={ourMissionCollection} locale={locale} />
  ) : (
    <OurMissionSection content={mapContentCollection(ourMissionCollection)} />
  );
}
{
  isEnabled ? (
    <ComponentCtaLive raw={contactCta} locale={locale} />
  ) : (
    <ComponentCta content={contactCta} />
  );
}
```

Keep the `PhotoGrid` guard using `infoCommunity` (now raw — `infoCommunity?.imagesCollection?.items` is still valid on the raw section node). The `Header` is unchanged.

- [ ] **Step 6: Verify** — `pnpm type-check && pnpm lint && pnpm test && pnpm build`.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/components/features/info-community apps/web/src/components/features/creed-section apps/web/src/app/'[locale]'/community/page.tsx
git commit -m "feat(ICR-21): live updates and inspector on community components"
```

---

## Task 6 (CP6): e2e coverage + docs

**Files:**

- Create: `apps/web/e2e/live-preview.spec.ts` (Playwright project `e2ePublic`)
- Modify: `docs/architecture/contentful-data-layer.md`

- [ ] **Step 1: Author `live-preview.spec.ts`.** Use the `e2ePublic` project + `BASE_URL` (preview) per existing Playwright config conventions (read `playwright.config.ts` for the base-URL + project setup). Cover:

```ts
import { expect, test } from "@playwright/test";

test.describe("Live Preview @e2ePublic", () => {
  test("home renders on both locales", async ({ page }) => {
    for (const locale of ["es-AR", "en-US"]) {
      const res = await page.goto(`/${locale}`);
      expect(res?.status()).toBeLessThan(400);
    }
  });

  test("community renders on both locales", async ({ page }) => {
    for (const locale of ["es-AR", "en-US"]) {
      const res = await page.goto(`/${locale}/community`);
      expect(res?.status()).toBeLessThan(400);
    }
  });

  test("preview deploy allows Contentful framing (CSP)", async ({ page }) => {
    const res = await page.goto("/es-AR");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("app.contentful.com");
    expect(res?.headers()["x-frame-options"]).toBeUndefined(); // preview drops it
  });

  test("no live-preview attributes leak on a normal render", async ({
    page,
  }) => {
    // Draft is auto-on for VERCEL_ENV=preview, so this asserts inspector attrs are only present
    // where wired — sanity that production would carry none. Scope per how the preview resolves draft.
    await page.goto("/es-AR");
    // The manager script only loads under the provider; assert no stray attributes outside wired regions.
    // (Adjust selectors to the actual DOM; keep this a smoke assertion, not brittle.)
  });
});
```

> These run against the **Vercel preview** in QA (step 13), not locally. Keep them resilient (status + header + presence smoke), not pixel-brittle. The real live-editing check is manual inside Contentful.

- [ ] **Step 2: Update `docs/architecture/contentful-data-layer.md`** (§ Draft / preview). Add a "Live Preview" subsection covering: the draft-gated provider + `useLivePreview` + `*Live` wrapper pattern; the raw-GraphQL-to-hook rule (why `getContentCollection` returns raw + `mapContentCollection`); `sys{id}`+`__typename` requirement; the CSP env-gating (prod strict / preview relaxed) and the `X-Frame-Options` gotcha; and the **editor setup**: configure the Content Preview URL in Contentful (Settings → Content preview) → `<preview-deploy>/api/draft/enable?secret=…&locale=…`. Note this is preview-only (production is not Contentful-framable by design).

- [ ] **Step 3: Verify** — `pnpm type-check && pnpm lint && pnpm test && pnpm build`. (Do not run e2e locally — no preview target; it runs in QA.)

- [ ] **Step 4: Commit.**

```bash
git add apps/web/e2e/live-preview.spec.ts docs/architecture/contentful-data-layer.md
git commit -m "feat(ICR-21): e2e coverage and docs for Live Preview"
```

---

## Self-Review notes (coverage map)

- R1→T1s1 · R2→T1s3-4 · R3→T2 · R4→T3a s1 · R5→T3a s2-4 · R6→T3b · R7→T4 · R8→T5 · R9→(server-conditional rendering, T4/T5 branches) · R10→Global Constraints (untouched) · R11→T6s2 · R12→(orchestrator creates the Jira follow-up at PR time, not a code task).
- Edge cases: E1/E3 asserted in T6 e2e; E2 by design (no code); E4 in T6; E5 in T3a (targetPage left alone); E6/OQ1 flagged for manual smoke; E7 in T4/T5 (`locale` threaded) + T6 both-locale renders.
- No placeholders: all new files have full code; component edits specify exact field ids + elements. `IconCard` inspector granularity is the one intentional implementer judgment (entry-level acceptable for pass 1), called out explicitly.
