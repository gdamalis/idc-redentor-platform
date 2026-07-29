# Admin responsive navigation — sidebar, bottom tab bar, and the PWA manifest

ICR-126. Before this ticket, `apps/admin` rendered `AppShell` = `Sidebar` (`hidden … md:flex`) +
`Topbar` + `main` — below the `md` breakpoint there was **no navigation at all**: a phone user could
reach the dashboard and then had no way to move. This ticket adds a bottom tab bar for mobile, keeps
the sidebar for desktop, gives both an active-route indicator (neither surface had one before), and
ships a minimal PWA manifest. Design record: `tasks/specs/ICR-126-admin-responsive-nav.md`.

## One `NAV_ITEMS` source of truth, two rendering surfaces

`apps/admin/src/components/shell/nav-items.ts` is a pure module — no `next-intl/server`, no rbac
lookups, nothing async — so its logic is unit-testable with zero mocks. It exports the `NavItem`
shape, the ordered `NAV_ITEMS` array, and `splitNavItems()`, the adaptive overflow rule both
`Sidebar` and `MobileNav` consume:

```ts
export const TAB_BAR_PRIMARY_MAX = 4; // link cells shown alongside the "More" trigger
export const TAB_BAR_FLAT_MAX = 5; // largest list that fits with zero overflow

export function splitNavItems(items: readonly NavItem[]): SplitNavItems {
  if (items.length <= TAB_BAR_FLAT_MAX) {
    return { primary: items, overflow: [] };
  }
  return {
    primary: items.slice(0, TAB_BAR_PRIMARY_MAX),
    overflow: items.slice(TAB_BAR_PRIMARY_MAX),
  };
}
```

The `≤5 → flat` / `>5 → 4 + More` split is deliberately **not** "always 4 + More": a user with a
small permission set (say, only `dashboard` and `settings`, both ungated) gets a flat two-tab bar,
not a bar with one real link plus a "More" sheet holding nothing useful. `NAV_ITEMS`'s array order
_is_ tab priority — there is no separate `primary: true` flag to keep in sync, so reprioritizing a
destination (e.g. promoting Calendar above Families) is a one-line reorder in `NAV_ITEMS`, not a
code restructure.

`splitNavItems` never filters by permission itself — the caller (`AppShell`, see below) must hand it
an already-filtered list. This keeps the function pure and boring: given 8 items it always returns
4+4; given 2 it always returns 2+0. The full 8-item admin nav splits as `[dashboard, people,
families, activities]` primary / `[calendar, users, roles, settings]` overflow.

## Why `NavLink` takes `children`, never a `NavItem`

This is the single most likely thing for a future "simplification" to break.
`apps/admin/src/components/shell/nav-link.tsx` is `"use client"` and is the _only_ route-aware
component in the shell. Its props are `href`, `className`, `activeClassName`, `inactiveClassName`,
and `children: ReactNode` — deliberately **not** a `NavItem`:

```ts
interface NavLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly activeClassName?: string;
  readonly inactiveClassName?: string;
  readonly children: ReactNode;
}
```

`NavItem.icon` is typed `ComponentType<{ className?: string }>` — a function. React's RSC boundary
serializes props passed from a server component into a client component, and **functions cannot
cross that boundary**; passing a `NavItem` (or just its `icon` field) into `NavLink` throws at
runtime, not at compile time (TypeScript has no way to reject it — `ComponentType` typechecks fine
as a prop). `Sidebar` and `MobileNav` both stay server components precisely because they render the
`<Icon className="…" />` element and the translated label themselves, and hand `NavLink` the
_already-rendered_ `ReactNode` result as `children`. `ReactNode` — unlike a raw function — survives
the serialization boundary.

If a future change wants `NavLink` to accept a `NavItem` "for convenience," that change either (a)
forces `NavLink` itself to become the icon-rendering component (fine, but then every caller loses
the ability to vary icon size/wrapper per surface, which `Sidebar` — `h-4 w-4` — and `MobileNav` —
`h-5 w-5` — both currently do), or (b) breaks the build the moment a permission-gated item without
an icon override tries to render. Keep the `children`-based shape.

## `usePathname` must come from `@src/i18n/routing`, never `next/navigation`

The active-route rule lives in exactly one place, `nav-items.ts#isNavItemActive`, so `NavLink` and
`MoreSheet`'s trigger can never disagree about what counts as active (a Codex review finding — see
below — surfaced that `MoreSheet` originally had no active-state logic of its own):

```ts
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

`NavLink` (and `MoreSheet`, see below) call it with `usePathname()` imported from `@src/i18n/routing`
(next-intl's `createNavigation` wrapper), which strips the locale prefix before returning the
pathname. `NAV_ITEMS` hrefs are locale-free (`/people`, `/families`, …). The raw `next/navigation`
`usePathname` returns the **unstripped** path — `/es-AR/people` — which matches none of `NAV_ITEMS`'s
hrefs. Swap the import and every nav item silently goes inactive: no error, no test failure locally
if you only render at `/` (which happens to work at both prefixed and unprefixed values by
coincidence of the `===` check), just a shell where nothing ever highlights. This mirrors the
repo-wide rule already in `CLAUDE.md` § Global Constraints: never `next/link` or `next/navigation` in
`apps/admin`, always the locale-aware wrappers.

Two related traps the active-match logic exists to avoid (both covered by `nav-items.test.ts` and
`nav-link.test.tsx`):

- **The `/` prefix trap.** A naive `pathname.startsWith(href)` with `href === "/"` matches _every_
  route, because every path starts with `/`. Dashboard gets an exact-equality check instead.
- **The `/peopleXYZ` trap.** `startsWith(href)` alone would light up `/people` for a route that
  merely shares a string prefix. The check is `startsWith(`${href}/`)` — with the trailing slash —
  so a deep route like `/people/123` keeps `/people` active, but a sibling route with the same
  prefix does not.

## `MoreSheet` is a controlled Dialog that closes itself on navigation

`MoreSheet` originally rendered Radix's `<Dialog>` fully **uncontrolled** (no `open`/`onOpenChange`)
and had no pathname awareness at all — a post-PR Codex review (P2) caught that nothing could ever
close it. The trigger tap navigates via the `overflow` links rendered as its `children`, but `AppShell`
is rendered by the `(app)` layout, which Next.js does **not** remount on in-app navigation — only
`children` re-render — so the `MoreSheet` client component instance (and an uncontrolled Dialog's
open state) survives the tap. The result: navigating to an overflow destination (e.g. `/users`) left
the sheet, and its Radix focus trap, covering the newly loaded page until the user manually dismissed
it.

The fix makes the Dialog controlled and resets `open` whenever `usePathname()` returns a different
value than it did on the previous render:

```ts
const pathname = usePathname();
const [open, setOpen] = useState(false);
const [priorPathname, setPriorPathname] = useState(pathname);

if (pathname !== priorPathname) {
  setPriorPathname(pathname);
  setOpen(false);
}
```

This is deliberately **not** a `useEffect` — the repo's `react-hooks/set-state-in-effect` lint rule
(`pnpm lint`) forbids a bare `setState` call in an effect body. Comparing against a previous-value
state and calling `setState` directly in the render body is React's documented "adjusting state when
a prop changes" pattern: React bails out and re-renders with the reset state before committing, so
there is no extra painted frame where the sheet is still visibly open over the page the user just
navigated to. `more-sheet.test.tsx` pins this with the regression guard: open the sheet, re-render
with a different pathname, assert the dialog content is gone.

The same Codex round also found the trigger had a single hardcoded `className` and no `aria-current`
— so on any of the (currently four) overflow destinations, the closed mobile bar showed **no** active
indication anywhere. `MoreSheet` now takes `overflowHrefs: readonly string[]` (the overflow items'
hrefs only — strings, so nothing crosses the RSC boundary illegally) and derives
`overflowHrefs.some((href) => isNavItemActive(pathname, href))` for its own `aria-current` +
`activeClassName`/`inactiveClassName`, mirroring `NavLink`'s prop shape exactly. `mobile-nav.tsx`
passes it the same `TAB_CLASS`/`"text-primary"`/`"text-foreground/70 hover:text-foreground"` strings
already used for the primary tabs, so the More cell is visually identical to its siblings.

## Permission filtering is resolved once in `AppShell` — and is still convenience only

`AppShell` (`apps/admin/src/components/shell/app-shell.tsx`) is `async`. It calls
`getSessionPermissions()` exactly once per request and filters `NAV_ITEMS` before handing the same
`items` array to both `Sidebar` and `MobileNav`:

```ts
const authz = await getSessionPermissions();
const granted = authz.ok ? authz.permissions : new Set<PermissionKey>();
const items = NAV_ITEMS.filter(
  (item) => !item.permission || granted.has(item.permission),
);
```

Resolving once and sharing the result is what guarantees the desktop rail and the mobile tab bar can
never disagree about what a signed-in user is allowed to see — there is exactly one filter
evaluation per request, not one per surface that could theoretically race or drift. If
`getSessionPermissions()` comes back not-`ok`, `granted` is an empty set and the nav degrades to only
the two ungated items (`dashboard`, `settings`) rather than throwing.

This filtering is **convenience only** — it hides links a user has no business seeing, nothing more.
The actual enforcement is `requirePermission()` inside each page (`docs/architecture/admin-rbac.md`).
A hidden nav item that a user reaches by typing the URL directly is still refused there. Do not treat
a nav item's absence/presence as a security boundary, and do not remove or weaken a page's
`requirePermission()` call on the theory that "the nav already hides it."

## The `fixed` tab bar, `main`'s padding, and why the flex column stays as-is

`MobileNav` renders `className="fixed inset-x-0 bottom-0 z-40 …"`. `main` in `AppShell` compensates
with bottom padding so the fixed bar never covers content: `p-6
pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6`. This was a deliberate choice over the more
"modern" alternative of restructuring the outer flex column to `h-dvh overflow-hidden` with an
internal scroll region sized to the viewport minus the bar — that restructure changes **desktop**
scroll behavior too (the whole point of `h-dvh` is to pin the shell to the viewport), and desktop
scroll behavior is explicitly out of scope for this ticket. `fixed` + compensating padding gets the
mobile tab bar its guaranteed screen position with a one-line, desktop-invisible (`md:pb-6` reverts
to the original padding) change, at the cost of one magic-number coupling: if `MobileNav`'s height
(`h-16` = 4rem) or the padding constant `5rem`/`calc(...)` ever drift apart, content can be covered
again. There is no shared constant enforcing that relationship today — if you resize the tab bar,
check `main`'s padding in the same change.

## The manifest ships with no service worker, and is not localized

`apps/admin/src/app/manifest.ts` sits at the **root** of `app/`, outside `[locale]/`, because the
Next.js manifest file convention requires it there and the browser fetches `/manifest.webmanifest`
once, with no locale context. Its `name`/`short_name`/`description` are therefore a fixed Spanish
string (`es-AR` is the site's default locale) rather than pulled from either message catalog — this
is a documented tradeoff, not an oversight.

**No service worker ships with this ticket, and that is not a shortcut** — a service worker is not
required for Chromium's install prompt (verified against current MDN docs, 2026-07-29). Chromium's
actual installability requirements are: `name` or `short_name`, `icons` including a 192px and a 512px
entry, `start_url`, `display`, `prefer_related_applications` false/absent, and HTTPS — every one of
which `manifest.ts` satisfies. Offline support is a real, separate feature (a service worker plus a
caching strategy) and is deferred to its own ticket; do not conflate "installable" with "works
offline" when scoping future PWA work here.

### The `proxy.ts` ↔ manifest coupling — state this plainly

`apps/admin/src/proxy.ts`'s matcher (`"/((?!_next|_vercel|api|trpc).*)"`) matches
`/manifest.webmanifest`. Before this ticket, the safe-asset bypass list had `json` but not
`webmanifest`, so an unauthenticated request for the manifest fell through to the session check and
was **302'd to `/login`** — the browser never saw the manifest, and the app was not installable from
the sign-in screen, which is exactly where a user would install it. This was invisible in local
testing because nobody tests the manifest while signed _out_.

The fix lives in `SAFE_ASSET_EXTENSIONS` and its predicate:

```ts
// `webmanifest` MUST stay in this list: the matcher below catches
// `/manifest.webmanifest`, and without a bypass an unauthenticated browser
// fetching the manifest gets redirected to /login — so the app is not
// installable from the sign-in screen, which is where it gets installed.
const SAFE_ASSET_EXTENSIONS = [, /* … */ "webmanifest" /* … */] as const;

export function isSafeAssetPath(pathname: string): boolean {
  /* … */
}
```

**Removing `"webmanifest"` from this list silently un-installs the PWA.** There is no build error, no
type error, and no user-facing symptom for anyone who is already signed in — the regression only
shows up for a brand-new visitor on the sign-in screen trying to "Add to Home Screen," which is not a
path anyone routinely exercises manually. `proxy.test.ts` pins this behavior
(`isSafeAssetPath("/manifest.webmanifest")` must be `true` with no session cookie present) precisely
because it is invisible otherwise — treat a failure in that test as a real regression, not a flaky
assertion to relax.

## Deferred (tracked in the spec's Open Questions, not follow-up tickets yet)

- **Maskable icons.** `icon-192.png`/`icon-512.png` ship with `purpose: "any"` (the default). A
  maskable variant needs a 40% safe-zone crop and a designer's call — deferred.
- **`apple-touch-icon` / iOS splash screens.** iOS largely ignores the web manifest; deferred
  alongside maskable icons.
- **Offline support.** No service worker, no caching strategy, no `next-pwa`. Installability does not
  require one (see above); if offline behavior is ever wanted, it is new scope, not a bug in this
  ticket.
- **Tab priority reordering.** Currently follows `NAV_ITEMS`'s declaration order. If real usage shows
  a different destination should rank higher, reorder the array — no code change needed elsewhere.

## Related docs

- `docs/architecture/admin-rbac.md` — `requirePermission()` as the actual enforcement gate this
  nav's filtering is only ever a convenience layer in front of.
- `docs/architecture/admin-auth.md` — `getSessionPermissions()`'s session resolution.
- `docs/architecture/i18n.md` — the next-intl setup `@src/i18n/routing`'s `Link`/`usePathname` wrap.
- `docs/architecture/design-system.md` — the shared token contract `Sidebar`/`MobileNav` style
  against (`bg-sidebar-accent`, `bg-accent`, etc.).
