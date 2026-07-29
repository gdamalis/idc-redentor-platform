# ICR-126 — Admin responsive nav: bottom tab bar (mobile) / sidebar (desktop)

**Jira:** [ICR-126](https://divinelab.atlassian.net/browse/ICR-126) · Story · High · Component: Ministry Admin Panel · Epic: ICR-13 Admin · Platform Foundation
**Commit type:** `feat` · **QA depth:** standard · **QA type:** ui
**Sensitive areas:** `i18n-messages`

## Context

`apps/admin` today renders `AppShell` = `Sidebar` + `Topbar` + `main`. The sidebar is
`hidden … md:flex` (`sidebar.tsx:52`), so **below `md` there is no navigation at all** — a phone
user can reach the dashboard and then has no way to move. This ticket adds a bottom tab bar for
mobile, keeps the sidebar for desktop, and makes both share one nav definition.

Two things the ticket's framing got wrong, both verified this session:

- **There is no active-route indicator anywhere.** The sidebar never highlights the current page.
  A tab bar without an active state is broken, so this ticket must add one regardless; the approved
  decision is to fix both surfaces at once rather than ship a visibly inconsistent shell.
- **There is no PWA.** No manifest, no service worker, no `next-pwa`, no `safe-area-inset` usage.
  The ticket's rationale ("so the installed PWA behaves like a mobile app") described something that
  does not exist. The approved decision is to add a minimal manifest in this ticket so the premise
  becomes true.

### Decisions locked at the design gate (2026-07-29)

| #   | Question                     | Decision                                                                                                                  |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | 8 nav items, tab bar fits ~5 | **Adaptive** — reuse `NAV_ITEMS` order; ≤5 permitted → show all; >5 → first 4 + "More" sheet                              |
| 2   | Topbar on mobile             | **Keep it**, add the app name on the left at `md:hidden` (the hidden sidebar is the only thing rendering the brand today) |
| 3   | Active-route indicator       | **Both surfaces now** — tab bar and sidebar                                                                               |
| 4   | PWA premise                  | **Include a minimal manifest** + safe-area handling                                                                       |

## 1. Dependencies Check

Everything required already exists. Nothing new is installed.

| Needs                                                  | Exists? | Where                                                                                                 |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| RBAC permission resolution                             | ✅      | `getSessionPermissions()` — `src/lib/rbac/require-permission.ts:33`, `cache()`-scoped per request     |
| `PermissionKey` type                                   | ✅      | `src/lib/rbac/permissions.ts:9-25`                                                                    |
| Locale-aware `Link` / `usePathname`                    | ✅      | `src/i18n/routing.ts:14` (`createNavigation`)                                                         |
| Dialog primitive (focus trap, Escape, overlay, portal) | ✅      | `src/components/ui/dialog.tsx` — Radix wrapper; `DialogTitle` **required**, `closeLabel` **required** |
| `common.close` translation                             | ✅      | both catalogs (`"Close"` / `"Cerrar"`)                                                                |
| Icon library                                           | ✅      | `lucide-react`                                                                                        |
| `cn()`                                                 | ✅      | `@idcr/ui`                                                                                            |
| Square PWA icons (192/512)                             | ❌      | **must be generated** — every existing logo is non-square (334×223, 100×67)                           |

**Verified against current official docs (standing rule 2):**

- **Next.js 16.2.11 manifest convention** — `app/manifest.ts` default-exports a function returning
  `MetadataRoute.Manifest`; must live at the **root of `app/`**, i.e. `src/app/manifest.ts`, _not_
  inside `[locale]/`. Served at **`/manifest.webmanifest`**.
- **PWA installability (MDN, current)** — a **service worker is NOT required** to be installable.
  Chromium requires: `name` or `short_name`; `icons` including a **192px and a 512px**; `start_url`;
  `display`; `prefer_related_applications` false/absent; HTTPS. This is why the ticket ships a
  manifest only and defers offline support.

## 2. Requirements

### R1 — Extract the nav definition into a pure module

Create `src/components/shell/nav-items.ts`. It **must not import anything server-only** (no rbac, no
`next-intl/server`) so its logic stays unit-testable without mocks.

```ts
import type { ComponentType } from "react";
import type { PermissionKey } from "@src/lib/rbac/permissions";

export type NavLabelKey =
  | "dashboard"
  | "people"
  | "families"
  | "activities"
  | "calendar"
  | "users"
  | "roles"
  | "settings";

export interface NavItem {
  readonly href: string;
  readonly labelKey: NavLabelKey;
  readonly icon: ComponentType<{ className?: string }>;
  /** Absent = ungated (dashboard, settings). Present = hidden unless granted. */
  readonly permission?: PermissionKey;
}

export const NAV_ITEMS: readonly NavItem[] = [
  /* moved verbatim from sidebar.tsx:30-39 */
];

/** Tab slots when an overflow tab is present: 4 links + the "More" trigger = 5 cells. */
export const TAB_BAR_PRIMARY_MAX = 4;
/** Most items that fit without needing an overflow tab. */
export const TAB_BAR_FLAT_MAX = 5;

export interface SplitNavItems {
  readonly primary: readonly NavItem[];
  readonly overflow: readonly NavItem[];
}

export function splitNavItems(items: readonly NavItem[]): SplitNavItems;
```

`splitNavItems` contract:

- `items.length <= TAB_BAR_FLAT_MAX` → `{ primary: items, overflow: [] }` (no More tab).
- otherwise → `{ primary: items.slice(0, TAB_BAR_PRIMARY_MAX), overflow: items.slice(TAB_BAR_PRIMARY_MAX) }`.
- Pure, order-preserving, no mutation. The permission filter has **already** been applied by the caller.

The `NAV_ITEMS` order is the single source of truth for tab priority — no second `primary` flag.

### R2 — Resolve permissions once in `AppShell`

`AppShell` becomes `async`. It resolves `getSessionPermissions()` **once**, filters `NAV_ITEMS`, and
passes the filtered array to both nav surfaces.

```tsx
export async function AppShell({ children }: { readonly children: ReactNode }) {
  const authz = await getSessionPermissions();
  const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
  const items = NAV_ITEMS.filter((i) => !i.permission || granted.has(i.permission));
  …
}
```

`Sidebar` changes from doing its own resolution to accepting `items: readonly NavItem[]`. The
convenience-not-a-gate comment moves with the code — per-page `requirePermission()` remains the gate
of record, and this refactor must not weaken that.

### R3 — `NavLink`: the only client component that knows the route

`src/components/shell/nav-link.tsx`, `"use client"`.

**Why this shape:** `NavItem.icon` is a `ComponentType`. **Functions cannot be passed from a server
component to a client component** — React throws. So the client island must never receive nav items.
It receives `href` + already-rendered `children` (ReactNodes, which _are_ serializable).

```tsx
interface NavLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly activeClassName?: string;
  readonly inactiveClassName?: string;
  readonly children: ReactNode;
}
```

Behaviour:

- `usePathname()` from `@src/i18n/routing` — next-intl's wrapper returns the pathname **with the
  locale prefix stripped**, so it compares directly against `NAV_ITEMS` hrefs.
- Active match: **exact** equality when `href === "/"`; otherwise `pathname === href ||
pathname.startsWith(href + "/")`.
- Active link sets `aria-current="page"`; inactive omits the attribute entirely.
- Renders the locale-aware `Link` from `@src/i18n/routing` (never raw `next/link`).

### R4 — `MobileNav` (server component)

`src/components/shell/mobile-nav.tsx`. Receives `items`, calls `splitNavItems`, renders the fixed bar.

- Root: `<nav aria-label={t("shell.mobileNavigation")}
className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden
pb-[env(safe-area-inset-bottom)]">`
- Each primary item → `<NavLink>` with a stacked icon-over-label layout, min touch target 44px.
- When `overflow.length > 0`, a final **More** cell rendered by `MoreSheet` (R5).
- Grid columns must match the rendered cell count so tabs are evenly distributed
  (`grid-cols-{n}` chosen from `primary.length + (overflow.length ? 1 : 0)`); use an explicit
  lookup map, not an interpolated class name — Tailwind cannot see dynamically built strings.

### R5 — `MoreSheet` (client component, built on the existing Dialog)

`src/components/shell/more-sheet.tsx`, `"use client"`. Owns only disclosure state; its **content is
passed as `children` from the server**, so overflow links are still server-rendered.

- Built on `Dialog` / `DialogTrigger` / `DialogContent` from `@src/components/ui/dialog`.
- `DialogContent` className overridden to bottom-sheet geometry — `cn()` is tailwind-merge, so
  `left-0 bottom-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-xl`
  correctly displaces the primitive's centered defaults.
- `DialogTitle` is **required by the primitive** → renders the localized `nav.more` heading.
- `closeLabel` is **required** → pass `t("common.close")`.
- The sheet also needs `pb-[env(safe-area-inset-bottom)]` since it sits against the bottom edge.
- Props: `readonly triggerLabel: string`, `readonly title: string`, `readonly closeLabel: string`,
  `readonly children: ReactNode`. All strings are passed in already-translated — the client component
  performs no lookups.

### R6 — Active state on the sidebar

`Sidebar` wraps each item in `NavLink` with the same active/inactive class pair, so both surfaces
highlight consistently. Sidebar keeps its existing visual language (`bg-sidebar-accent` /
`text-sidebar-accent-foreground` for active).

### R7 — Layout accommodation in `AppShell`

`main` gains bottom padding on mobile only so the fixed bar never covers content:

```
p-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-6
```

`fixed` is chosen deliberately over restructuring the flex column to `h-dvh overflow-hidden` — the
latter changes desktop scroll behaviour, which is out of scope for this ticket.

### R8 — Topbar brand on mobile

`Topbar` gains a left-side `shell.appName` label shown only below `md` (`md:hidden`), using
`justify-between`. On desktop the sidebar still owns the brand and the topbar looks unchanged.

### R9 — PWA manifest

`src/app/manifest.ts` (root of `app/`, **outside** `[locale]/`):

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IDC Redentor · Panel de Administración",
    short_name: "IDCR Admin",
    description:
      "Panel de administración del ministerio — Iglesia de Cristo Redentor",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0059b3",
    icons: [
      { src: "/assets/img/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/assets/img/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

Colors are the light-theme tokens converted to hex: `--background: 210 20% 98%` → `#f9fafb`,
`--primary: 210 100% 35%` → `#0059b3` (`packages/ui/src/tokens.css:68,72`).

`name`/`short_name`/`description` are **deliberately not localized**. `manifest.ts` sits above the
`[locale]` segment and is fetched once by the browser with no locale context; `es-AR` is the default
locale, so Spanish is the correct single value. This is a documented tradeoff, not an oversight.

### R10 — Generate the square icons

No square asset exists. Generate two from `apps/admin/public/assets/img/redentor_logo.png`
(334×223) by scaling then padding onto the manifest `background_color`:

```bash
sips -Z 400 redentor_logo.png --out /tmp/step.png
sips --padToHeightWidth 512 512 --padColor F9FAFB /tmp/step.png --out icon-512.png
sips -Z 150 redentor_logo.png --out /tmp/step192.png
sips --padToHeightWidth 192 192 --padColor F9FAFB /tmp/step192.png --out icon-192.png
```

Verified: `sips --padToHeightWidth` produces a true 512×512 on this machine. Both PNGs are committed
to `apps/admin/public/assets/img/`. `purpose` is left at the default (`"any"`); maskable variants are
deferred (see §11).

### R11 — `proxy.ts` must let the manifest through ← **bug fix, not a nicety**

`apps/admin/src/proxy.ts` bypasses middleware for a `safeExtensions` allowlist. That list contains
`json` but **not `webmanifest`**, and the matcher `"/((?!_next|_vercel|api|trpc).*)"` **does** match
`/manifest.webmanifest`. So today an unauthenticated request for the manifest falls through to the
session check and is **302'd to `/login`** — the browser never sees a manifest and the app is not
installable from the sign-in screen, which is exactly where a user would install it.

Add `"webmanifest"` to `safeExtensions`. This is invisible in local dev if you only ever test signed
in, so it needs a regression test (§9).

## 3. Data Model Changes

**None.** No MongoDB collections, documents, indexes, or Contentful content types are touched. No
migration. `getSessionPermissions()` is read-only and already exists.

## 4. API Changes

**No route handlers added or changed.** One new **generated static route** appears via the Next.js
file convention:

| Route                   | Method | Auth                           | Response                    |
| ----------------------- | ------ | ------------------------------ | --------------------------- |
| `/manifest.webmanifest` | GET    | **public** (must be — see R11) | `application/manifest+json` |

No Zod schemas: the manifest takes no input. The response shape is constrained by
`MetadataRoute.Manifest` at compile time.

## 5. New / Modified Files

### New

| File                                                  | Purpose                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/admin/src/components/shell/nav-items.ts`        | `NavItem`, `NAV_ITEMS`, `TAB_BAR_*`, `splitNavItems()` — pure, no server imports |
| `apps/admin/src/components/shell/nav-items.test.ts`   | `splitNavItems` boundaries                                                       |
| `apps/admin/src/components/shell/nav-link.tsx`        | `"use client"` active-route island                                               |
| `apps/admin/src/components/shell/nav-link.test.tsx`   | active matching incl. the `/` exact-match trap                                   |
| `apps/admin/src/components/shell/mobile-nav.tsx`      | server-rendered fixed bottom tab bar                                             |
| `apps/admin/src/components/shell/mobile-nav.test.tsx` | tab count, More presence, safe-area class                                        |
| `apps/admin/src/components/shell/more-sheet.tsx`      | `"use client"` bottom-sheet disclosure over `Dialog`                             |
| `apps/admin/src/app/manifest.ts`                      | PWA manifest                                                                     |
| `apps/admin/src/app/manifest.test.ts`                 | required-field + icon-size assertions                                            |
| `apps/admin/src/proxy.test.ts` _(or extend existing)_ | pins the `webmanifest` bypass                                                    |
| `apps/admin/public/assets/img/icon-192.png`           | generated square icon                                                            |
| `apps/admin/public/assets/img/icon-512.png`           | generated square icon                                                            |
| `.changeset/<name>.md`                                | `@idcr/admin` minor bump                                                         |

### Modified

| File                                            | Change                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/admin/src/components/shell/sidebar.tsx`   | drop the local `NAV_ITEMS` + own permission resolution; accept `items` prop; wrap links in `NavLink` |
| `apps/admin/src/components/shell/app-shell.tsx` | becomes `async`; resolves permissions once; renders `MobileNav`; `main` bottom padding               |
| `apps/admin/src/components/shell/topbar.tsx`    | app name on the left at `md:hidden`; `justify-between`                                               |
| `apps/admin/src/proxy.ts`                       | add `"webmanifest"` to `safeExtensions`                                                              |
| `apps/admin/messages/en-US.json`                | `nav.more`, `shell.mainNavigation`, `shell.mobileNavigation`                                         |
| `apps/admin/messages/es-AR.json`                | same keys, Spanish                                                                                   |
| `docs/architecture/admin-*.md`                  | new `admin-navigation.md` (see §10 CP6)                                                              |

## 6. Component Hierarchy

```
AppShell (server, async)  ── resolves getSessionPermissions() ONCE
│                            filters NAV_ITEMS → items
├── Sidebar (server)                       hidden md:flex
│   └── NavLink (client) × n               ← children = <Icon/> + label (ReactNodes only)
│
├── div.flex-col
│   ├── Topbar (server)
│   │   ├── span.md:hidden  {shell.appName}      ← NEW
│   │   ├── LocaleSwitcher · ThemeToggle · SignOutButton
│   │
│   └── main  p-6 pb-[calc(4rem+safe-area)] md:pb-6
│
└── MobileNav (server)                     fixed bottom-0 md:hidden
    ├── NavLink (client) × primary          splitNavItems().primary
    └── MoreSheet (client)                  only when overflow.length > 0
        └── Dialog ▸ DialogContent[bottom-sheet]
            ├── DialogTitle {nav.more}
            └── {children}  ← NavLink × overflow, SERVER-rendered, passed in
```

Responsive summary:

| Breakpoint | Sidebar | Tab bar            | Topbar brand |
| ---------- | ------- | ------------------ | ------------ |
| `< md`     | hidden  | **visible, fixed** | visible      |
| `≥ md`     | visible | hidden             | hidden       |

## 7. Edge Cases

1. **User has 0 permitted gated items** → `items` = `[dashboard, settings]` (both ungated). 2 ≤ 5 →
   flat bar, 2 tabs, no More. Must not render an empty More sheet.
2. **Exactly 5 permitted** → flat bar with all 5, **no** More tab. This is the boundary
   `TAB_BAR_FLAT_MAX` exists to protect; off-by-one here yields 4+More for a set that fits.
3. **Exactly 6 permitted** → 4 primary + More holding 2.
4. **Full admin, 8 permitted** → 4 primary (dashboard, people, families, activities) + More holding
   4 (calendar, users, roles, settings).
5. **`/` prefix-match trap** — naive `pathname.startsWith(href)` with `href === "/"` marks **every**
   route active. Dashboard must match exactly.
6. **`/people/123` deep route** → `/people` tab stays active (prefix match with `/` boundary).
7. **`/peopleXYZ`** → must **not** activate `/people`; that is why the check is
   `startsWith(href + "/")` and not `startsWith(href)`.
8. **`getSessionPermissions()` returns not-ok** → `granted` is an empty set; only ungated items show.
   Nav degrades to dashboard + settings rather than throwing.
9. **Unauthenticated manifest fetch** → must return the manifest, not a `/login` redirect (R11).
10. **iOS home indicator** → `env(safe-area-inset-bottom)` on both the bar and the sheet; on browsers
    without safe-area support the value resolves to `0px`, so no regression.
11. **Locale prefix in pathname** — next-intl's `usePathname` strips it; using `next/navigation`'s
    `usePathname` instead would return `/es-AR/people` and match nothing. Import site matters.
12. **Tailwind dynamic class names** — `grid-cols-${n}` is invisible to the Tailwind scanner; use an
    explicit map of literal class strings.
13. **Hydration** — visibility is pure CSS (`md:hidden` / `hidden md:flex`), never JS media queries,
    so server and client markup are identical and no hydration mismatch is possible.

## 8. i18n

Both `apps/admin/messages/en-US.json` and `es-AR.json` — **every key in both files**.

| Key                      | en-US             | es-AR                  |
| ------------------------ | ----------------- | ---------------------- |
| `nav.more`               | `More`            | `Más`                  |
| `shell.mainNavigation`   | `Main navigation` | `Navegación principal` |
| `shell.mobileNavigation` | `Main navigation` | `Navegación principal` |

`shell.*` are `aria-label`s for the two `<nav>` landmarks — two landmarks with the same accessible
name is itself an a11y smell, but here only ever **one is in the accessibility tree at a time**
(`display:none` via `hidden`/`md:hidden` removes the other), so the shared string is correct.

Reused, already present in both catalogs: `common.close`, `shell.appName`, `nav.*` item labels.

The manifest strings are intentionally not localized (R9).

## 9. Testing Strategy

Vitest + Testing Library, matching `topbar.test.tsx` conventions.

**Unit**

1. `nav-items.test.ts` — `splitNavItems` at **2, 5, 6, 8** items: the 5→flat and 6→split boundary is
   the load-bearing assertion; also order preservation and no input mutation.
2. `nav-link.test.tsx` — mock `@src/i18n/routing`'s `usePathname`:
   - `/` active only at `/`, **not** at `/people` (edge case 5)
   - `/people` active at `/people` and `/people/123`, **not** at `/peopleXYZ` (edge 6, 7)
   - active renders `aria-current="page"`; inactive omits it
3. `mobile-nav.test.tsx` — renders n tabs for n ≤ 5 with no More trigger; renders 4 + More for 6+.
4. `manifest.test.ts` — asserts `start_url`, `display: "standalone"`, and that icons include both a
   `192x192` and a `512x512` entry. This is the guard that keeps the app installable if someone edits
   the manifest later.
5. `proxy` webmanifest bypass — asserts a request for `/manifest.webmanifest` with **no session
   cookie** is not redirected. Regression guard for R11, which is invisible when testing signed in.

**Manual smoke (against the PR's Vercel preview, both locales)**

- 375px viewport: tab bar visible, sidebar hidden, More opens, Escape closes, active tab highlights.
- ≥768px: sidebar visible with active highlight, no tab bar, topbar unchanged.
- `/manifest.webmanifest` returns JSON **while signed out**.
- Content is not obscured by the bar when scrolled to the bottom.

No e2e specs — Phase 1 has none and `standard` depth does not author them.

## 10. Implementation Checkpoints

| #   | Scope                                                                   | Files                                                                                                        | Verify                                      | Commit                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Pure nav module + tests                                                 | `nav-items.ts`, `nav-items.test.ts`                                                                          | `pnpm test`                                 | `refactor(ICR-126): extract NAV_ITEMS into a pure, testable shell module` |
| 2   | `NavLink` active island + tests; sidebar adopts it                      | `nav-link.tsx`, `nav-link.test.tsx`, `sidebar.tsx`                                                           | `pnpm test`, `pnpm type-check`              | `feat(ICR-126): add active-route indication to the admin nav`             |
| 3   | `MobileNav` + `MoreSheet`; `AppShell` wiring; `Topbar` brand; i18n keys | `mobile-nav.tsx`, `more-sheet.tsx`, `app-shell.tsx`, `topbar.tsx`, both message files, `mobile-nav.test.tsx` | `pnpm test`, `pnpm type-check`, `pnpm lint` | `feat(ICR-126): add mobile bottom tab bar with overflow sheet`            |
| 4   | PWA manifest + generated icons + proxy fix + tests                      | `manifest.ts`, `icon-192.png`, `icon-512.png`, `proxy.ts`, `manifest.test.ts`, proxy test                    | `pnpm test`, `pnpm build`                   | `feat(ICR-126): add PWA manifest and unblock it in the auth proxy`        |
| 5   | Docs + changeset                                                        | `docs/architecture/admin-navigation.md`, `.changeset/*.md`                                                   | `pnpm format:check`                         | `docs(ICR-126): document the responsive admin navigation`                 |

TDD per checkpoint: test first, watch it fail, implement, watch it pass.

## 11. Open Questions / Deferred

1. **Service worker + offline support** — deliberately out. Not required for installability (verified
   against MDN this session). If offline is wanted it is its own ticket.
2. **Maskable icons** — the generated icons use `purpose: "any"`. A proper maskable variant needs a
   40% safe zone and a designer's call on crop. Deferred.
3. **`apple-touch-icon` / iOS splash screens** — iOS ignores much of the manifest. Deferred with (2).
4. **Tab priority** currently follows `NAV_ITEMS` order, giving admins _dashboard, people, families,
   activities_. If real usage shows Calendar outranks Families, reordering `NAV_ITEMS` is a one-line
   change — no code restructure needed. Flagged for post-launch observation.
5. **Two `<nav>` landmarks share an accessible name** — safe today because only one is ever in the
   a11y tree (§8). Worth revisiting if the sidebar ever becomes a mobile drawer.

## Deferred production actions

Per standing rule 1 — **none**. The manifest ships with the merge and requires no console change,
flag flip, migration, or manual send. Nothing here needs a follow-up runbook ticket.
