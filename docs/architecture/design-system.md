# Design System — shared UI for `apps/web` + `apps/admin`

> **Purpose:** What the ICR-18 design system is, where it lives, the token contract every consumer
> must satisfy, and the binding `@idcr/ui` migration path the follow-up code ticket implements
> against. Written at the close of ICR-18 (2026-07-27), which produced the artifacts and this spec
> but changed **no production code** — see §7 for what still needs to be built.

## 1. What this is

The shared design system for both IDC Redentor products — the public website (`apps/web`) and the
Ministry Admin Panel (`apps/admin`). Artifacts (foundations, primitives, screens) are **hand-authored**
static HTML/CSS files, repo-tracked at `tasks/specs/design-system/` and published to a claude.ai/design
project named **"IDC Redentor · Design System"**.

**Do not confuse this with the pre-existing "IDC Redentor" Claude Design project.** That other
project is an **auto-synced mirror** of `apps/web` component code, driven by a sync manifest
(`_ds_sync.json`) — machine-generated, read-only from this ticket's point of view, and must never be
hand-edited. The design-system project this doc describes is the opposite: written and reviewed in
the repo first, then published deliberately. Nothing in ICR-18 writes to the auto-synced project.

Every artifact links one shared `tasks/specs/design-system/styles.css`, renders **both themes** as
duplicated static HTML trees (a `.preview` block and a second `.preview.dark` block with the same
content — never a JS toggle), and contains **no `<script>`** — a JS-only state (e.g. a checkbox's
`indeterminate` IDL property) is invisible both to readback verification and to any renderer that
screenshots before scripts run (spec E5). The whole bundle is gated by
`tasks/specs/design-system/verify-artifacts.mjs`, which bans gradients, emoji, Inter/Roboto, and
missing `.dark` blocks, and enforces the one sanctioned exception: `calendar-print-a4.html`, a print
medium that must **not** ship a dark variant (spec R6). The hit-target check is **rendered, not
static**: three consecutive static approximations (round 1-4's px arithmetic, then two more static
passes added and superseded within the same PR #112 post-review vigil) each missed a real defect in
turn, because ≥44px-and-no-overlap is a rendered-layout property, not something a regex over the
stylesheet text can fully derive. The gate now launches headless Chromium, measures every native
interactive element (`button`/`select`/`textarea`/`a[href]`/`input` excl. checkbox/radio) plus every
element matching a CSS-declared interactive class (`cursor: pointer`, or a bare `input` selector),
and asserts each hit region (its own box unioned with any `::before` halo) clears 44px on both axes
**and** that no two hit regions on the same rendered page intersect — closing the halo-overlap gap
(thread 3660378526) the same pass that closes the markup-blindness gap (thread 3660378522), since
both are just facets of "measure the real box." See the script's own header comment for the full
static-vs-rendered breakdown, what's checked nowhere at all, and why this gate isn't wired into CI
yet (nothing blocks it — see that comment for the concrete follow-up).

## 2. The token contract

The palette lives in exactly one place: `packages/ui/src/tokens.css`. Both `apps/web/src/app/globals.css`
and `apps/admin/src/app/globals.css` are **byte-identical** and import it the same way:

```css
@import "tailwindcss";
@import "@idcr/ui/tokens.css";
```

`tokens.css` is **not** fully self-contained — two things it relies on from the outside, which every
consumer (including a future third app) must satisfy:

1. **Fonts.** `--font-sans` / `--font-serif` reference `--font-outfit` / `--font-playfair`, two CSS
   custom properties `tokens.css` never defines. They're injected by `next/font` in each app's own
   `[locale]/layout.tsx` (`Outfit` + `Playfair_Display` from `next/font/google`). Both `apps/web` and
   `apps/admin` already do this correctly today. A consumer that skips this falls back to the browser
   default font with no error.
2. **The community background image.** `--background-image-community` is a root-absolute URL
   (`url("/assets/img/community_redentor_camp.jpeg")`) that resolves against whichever app's
   `public/` serves the page. `apps/admin` has already copied the asset to
   `apps/admin/public/assets/img/community_redentor_camp.jpeg`. A consumer missing the file at that
   exact path gets a silent broken image, not a build error.

## 3. Derived tokens to add to `tokens.css`

The design uses a handful of tokens that don't exist in `tokens.css` yet. The follow-up code ticket
must add them:

| Token                  | Light                   | Dark                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--gold`               | `35 45% 46%`            | `35 40% 58%`          | Derived from the `--secondary` hue. Sparing use — leadership/favourite accents (e.g. the calendar's birthday `.star` marker). Light L darkened 62%->46% (PR #112 whole-palette contrast sweep): as a graphical fill it needs WCAG 1.4.11's 3:1, not 4.5:1, but the original was 2.293:1 on `--card` / 2.193:1 on `--background`. Verified: 3.636:1 / 3.476:1. Dark already passed (6.464:1 / 6.907:1), left unchanged. |
| `--status-active-fg`   | `160 60% 29%`           | `160 55% 60%`         | Status-dot text/icon colour, "Activo". Light L darkened 34%->29% for WCAG AA (Codex round-4 P2; 3.66:1 -> 4.77:1 on `--card`).                                                                                                                                                                                                                                                                                         |
| `--status-active-bg`   | `160 60% 34% / .12`     | `160 55% 50% / .15`   | Status-dot background, "Activo".                                                                                                                                                                                                                                                                                                                                                                                       |
| `--status-occ-fg`      | `35 70% 33%`            | `35 75% 62%`          | "Ocasional". Light L darkened 38%->33% for WCAG AA (Codex round-4 P2; 3.81:1 -> 4.80:1 on `--card`).                                                                                                                                                                                                                                                                                                                   |
| `--status-occ-bg`      | `35 70% 45% / .14`      | `35 70% 50% / .16`    | "Ocasional".                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--status-inactive-fg` | `215.4 16.3% 42%`       | `215 20.2% 65.1%`     | "Inactivo". Replaces the old direct `--muted-foreground`-on-`--muted` reuse, which was an AA near-miss (4.34:1, PR #112 post-review vigil thread 3660378517) — see §3a. Light darkened 46.9%->42%L; dark unchanged (already passed). Verified (composited over `--card`): 4.894:1 / 5.501:1.                                                                                                                           |
| `--status-inactive-bg` | `215.4 16.3% 47% / .12` | `215 20.2% 50% / .15` | "Inactivo" — translucent wash over `--card`, mirroring Activo/Ocasional's pattern instead of the old opaque `--muted` swatch.                                                                                                                                                                                                                                                                                          |

## 3a. Contrast fixes to the production palette (PR #112 post-review vigil)

Findings from the same post-PR vigil that produced §3's status tokens (`tasks/specs/ICR-18-vigil-handoff.md`). Unlike §3's `--status-*` tokens, the destructive-palette fix below **widens ICR-18's D1 design-only scope** by explicit maintainer decision (2026-07-27) — it edits `packages/ui/src/tokens.css`, the shared production palette both apps consume, not just the design-system spec files.

**F1/F2 — destructive contrast (threads 3660378508, 3660378512).** `--destructive` was designed as a _background_ token (buttons, badge fills) and was unsafe both as a background at its old light lightness and as small foreground text at any lightness:

| Pair                                                        | Before                         | After                                                                                       |
| ----------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Light button: `--destructive-foreground` on `--destructive` | 3.59:1 (fail)                  | `--destructive` darkened `60.2%L`->`46%L` (same hue/sat) -> **4.987:1**                     |
| Dark button: `--destructive-foreground` on `--destructive`  | 9.564:1 (already passes)       | unchanged, recorded only                                                                    |
| Light text: `--destructive` on `--card`                     | 3.76:1 (fail)                  | new `--destructive-text: 0 84.2% 40%` -> **6.526:1** on `--card`, 6.240:1 on `--background` |
| Dark text: `--destructive` on `--card`                      | 1.67-1.79:1 (fail, unreadable) | new `--destructive-text: 0 84.2% 65%` -> **5.081:1** on `--card`, 5.429:1 on `--background` |

`--destructive-text` is a dedicated pair for small FOREGROUND text (field errors, destructive menu items) — `--destructive` itself stays background-only. Added to `packages/ui/src/tokens.css` (both `@theme inline` as `--color-destructive-text` and the `:root`/`.dark` blocks) and mirrored verbatim in `tasks/specs/design-system/styles.css`. App-level rewires (genuine small-foreground-text usages of the old `text-destructive` utility, found by grepping both apps for `destructive` as a Tailwind text class — background usages on `Button`/`toast` were left alone):

- `apps/web/src/components/ui/form.tsx` — `FormLabel`'s error state and `FormMessage` (the actual field-error text).
- `apps/admin/src/app/[locale]/(auth)/login/login-form.tsx` — the sign-in error banner.
- `apps/admin/src/components/shell/sign-out-button.tsx` — the inline sign-out error.

`packages/ui` versions via a Changesets patch (`.changeset/icr-18-destructive-contrast.md`), which cascades a patch to `@idcr/web` and `@idcr/admin` per `updateInternalDependencies: "patch"` (`docs/architecture/versioning.md`).

## 3b. Pager hit-target fix (PR #112 post-review vigil)

**F5 — pager hit-halo overlap (thread 3660378526).** `.pager button` was `min-width: 30px` with a `::before` halo (`inset: 0 -7px`, `36px` wide) inside a `.pager` with `gap: 6px` — pitch was only `30 + 6 = 36px`, so adjacent halos overlapped by `44 - 36 = 8px` and a click near a pager boundary could activate the neighbouring page. This was a regression from round 1's own width fix (widening `.pager button` without re-checking the halo it already had), not a v1 defect. Fixed the same way round 4 fixed seven other controls: floored `.pager button` to `min-width: 44px` directly and deleted its `::before` halo, so the pitch becomes `44 + 6 = 50px` — no overlap. Measured headlessly (`getBoundingClientRect`) across every artifact rendering a pager: adjacent buttons now sit `913-957`, `963-1007`, … (6px gaps, no intersection). The three remaining halo users were measured the same way everywhere they appear, via the gate's own rendered pass (§1): `.icon-btn` (`inset: 0 -4px`) and `.kebab` (`inset: 0 -7px`) across `people-list`, `person-detail`, `roles-matrix`, `users`, `calendar-month`, `Table`, `DropdownMenu` all render a clean 44x44 hit area with no overlap against neighbouring controls. `.th-sort` (`inset: -14px 0`, vertical-only, `Table.html`) is the delicate one — its halo's bottom edge sits 1.5px past the header row into the first body row's vertical range (measured: halo `[105.75, 151]` vs. first body row `[149.5, 218.5]`), but no interactive control occupies that overlapping strip in the current layout, so the gate's actual overlap check (element-vs-element, not row-vs-row) reports clean. Recorded rather than "fixed" because there's nothing to fix yet — re-run the gate if anything is ever added to that cell.

## 3c. Whole-palette contrast sweep (PR #112 post-review vigil)

Every fg/bg (or fill/stroke) token pair this stylesheet actually composites together, both themes,
computed the same way §3a/§3's pairs were (direct WCAG ratio, or alpha-compositing over the
declared base for a translucent pair) and now enforced by a static gate rule (`checkTokenContrast` in
`verify-artifacts.mjs` — see §1's header comment). Two more near-misses turned up beyond `--gold`
(§3's table) — both the same shape as the original `--status-inactive` defect (thread 3660378517):
raw `--muted-foreground` used directly as text against a muted-tinted background. Both were repointed
to the already-existing `--status-inactive-fg` token (background left untouched in each case) rather
than raising the base pair, which would have rippled into every other opaque-`--muted` consumer.

| Pair                                                                                   | Light                        | Dark     | Status                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------- |
| `foreground` on `background`                                                           | 17.113:1                     | 17.092:1 | pass                                                                      |
| `card-foreground` on `card`                                                            | 17.899:1                     | 15.996:1 | pass                                                                      |
| `popover-foreground` on `popover`                                                      | 17.899:1                     | 17.092:1 | pass                                                                      |
| `primary-foreground` on `primary`                                                      | 6.502:1                      | 6.005:1  | pass (brand mark, `.seg button.on`, `.btn-primary`, pager `.on`)          |
| `secondary-foreground` on `secondary`                                                  | 14.211:1                     | 13.945:1 | pass (`.tag`, `.btn-secondary`)                                           |
| `muted-foreground` on `muted` (graphical, 3:1 — icon fill only, see below)             | 4.341:1                      | 5.696:1  | pass — `.avatar-photo`'s SVG fill/stroke is the only remaining opaque use |
| `accent-foreground` on `accent`                                                        | 16.296:1                     | 13.945:1 | pass                                                                      |
| `destructive-foreground` on `destructive`                                              | 4.987:1 (fixed, was 3.59:1)  | 9.564:1  | pass — fixed in §3a (F1)                                                  |
| `sidebar-foreground` on `sidebar`                                                      | 9.992:1                      | 16.125:1 | pass                                                                      |
| `sidebar-primary-foreground` on `sidebar-primary`                                      | 16.960:1                     | 6.713:1  | pass                                                                      |
| `sidebar-accent-foreground` on `sidebar-accent`                                        | 16.125:1                     | 13.548:1 | pass                                                                      |
| `destructive-text` on `card`                                                           | 6.526:1                      | 5.081:1  | pass — new token, §3a (F2)                                                |
| `destructive-text` on `background`                                                     | 6.240:1                      | 5.429:1  | pass — new token, §3a (F2)                                                |
| `gold` on `card` (graphical, 3:1)                                                      | 3.636:1 (fixed, was 2.293:1) | 6.464:1  | pass — fixed above (§3)                                                   |
| `gold` on `background` (graphical, 3:1)                                                | 3.476:1 (fixed, was 2.193:1) | 6.907:1  | pass — fixed above (§3)                                                   |
| `status-active-fg` on `status-active-bg` (over `card`)                                 | 4.765:1                      | 6.785:1  | pass (Codex round-4 P2, pre-vigil)                                        |
| `status-occ-fg` on `status-occ-bg` (over `card`)                                       | 4.800:1                      | 6.456:1  | pass (Codex round-4 P2, pre-vigil)                                        |
| `status-inactive-fg` on `status-inactive-bg` (over `card`) — `.b-active`/`.b-inactive` | 4.894:1 (fixed, was 4.341:1) | 5.501:1  | pass — fixed in §3                                                        |
| `muted-foreground` on `muted/.5` over `card` — `thead th`                              | 4.544:1                      | 6.122:1  | pass, thin margin light — recorded, not changed                           |
| `status-inactive-fg` on opaque `muted` — `.badge.b-neutral`                            | 5.179:1 (fixed, was 4.341:1) | 5.696:1  | pass — **new fix, this sweep**                                            |
| `status-inactive-fg` on `muted/.5` over `background` — `.cal-dow div`                  | 5.299:1 (fixed, was 4.441:1) | 6.361:1  | pass — **new fix, this sweep**                                            |

## 4. Target architecture (binding end-state)

**The boundary: primitives are shared; feature/domain components stay app-local.**

```
                packages/ui  (@idcr/ui)
                ┌──────────────────────────────────────────┐
                │  tokens.css        ← already there       │
                │  cn(), LOGO        ← already there       │
                │  Button, Input, Table, Dialog, Badge,    │
                │  Avatar, Tabs, Select, Checkbox,         │
                │  Textarea, DropdownMenu, Pagination,     │
                │  SegmentedToggle, Sidebar   ← ADDED by   │
                │                               the code   │
                │                               ticket     │
                └──────────────────────────────────────────┘
                     ▲                             ▲
   import { Button } │                             │ import { Button }
                     │                             │
              ┌──────┴───────┐             ┌───────┴──────┐
              │   apps/web   │             │  apps/admin  │
              │              │             │              │
              │ feature cpts │             │ feature cpts │
              │ stay local:  │             │ stay local:  │
              │ SermonCard,  │             │ PeopleTable, │
              │ BlogPostCard,│             │ CalendarGrid,│
              │ ContactForm, │             │ RolesMatrix, │
              │ CreedSection │             │ AppShell     │
              └──────────────┘             └──────────────┘
```

`SermonCard`, `BlogPostCard`, `ContactForm` and `CreedSection` are coupled to Contentful types and
`apps/web`-only next-intl namespaces — moving them into `@idcr/ui` would drag those dependencies into
a package `apps/admin` also consumes. Only presentation-neutral primitives cross the boundary.

**Current reality (the gap the code ticket closes):** `packages/ui` has **zero** components today —
it exports only `cn()`, `LOGO`, and `tokens.css`. `apps/web/src/components/ui/` has ~13 primitives
(some folder+barrel, some flat shadcn files). `apps/admin/src/components/ui/` has exactly **two**
files, `button.tsx` and `input.tsx` — both duplicates of the same primitives, flat (`input.tsx`
shipped with ICR-127's login/reset-password screens, merged into this branch after the design gate).
Editing a button or input today means changing two files in two apps; the goal is to edit it once
and have both apps pick it up.

## 5. The migration table

Target layout for every primitive is **folder+barrel** (`button/Button.tsx` + `index.ts`), per
`code-patterns-and-conventions.md`'s "Folder-per-thing + barrel" convention — not flat files.

**Exists today in `apps/web`** (migrate into `@idcr/ui`, converting flat files to folder+barrel).
This table is the **full current `apps/web/src/components/ui/` inventory**, a superset of the 14
system primitives listed in §4 — Label, Card, Toast, Divider, Typography, Container, IconCard, and
SectionHeader are web components included here for migration completeness, not members of that 14.
`Dropdown` is neither migrated nor one of the 14; see the disambiguation note below the next table,
which is the authority on its status:

| Primitive     | Target `@idcr/ui` path                          | `apps/web` today                                                                                     |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Button        | `button/Button.tsx` + `index.ts`                | `src/components/ui/button/` (already folder+barrel)                                                  |
| Input         | `input/Input.tsx` + `index.ts`                  | `src/components/ui/input.tsx` (flat)                                                                 |
| Textarea      | `textarea/Textarea.tsx` + `index.ts`            | `src/components/ui/textarea.tsx` (flat)                                                              |
| Label         | `label/Label.tsx` + `index.ts`                  | `src/components/ui/label.tsx` (flat)                                                                 |
| Card          | `card/Card.tsx` + `index.ts`                    | `src/components/ui/card.tsx` (flat)                                                                  |
| Toast         | `toast/Toast.tsx` + `index.ts`                  | `src/components/ui/toast.tsx` + `toaster.tsx` (flat)                                                 |
| Dropdown      | — not migrated (superseded by `Select`)         | `src/components/ui/dropdown/` — Headless-UI `Listbox`, one call site (`contact-form/formFields.tsx`) |
| Divider       | `divider/Divider.tsx` + `index.ts`              | `src/components/ui/divider/` (already folder+barrel; carries a known defect, see §7)                 |
| Typography    | `typography/Typography.tsx` + `index.ts`        | `src/components/ui/typography/` (already folder+barrel)                                              |
| Container     | `container/Container.tsx` + `index.ts`          | `src/components/ui/container/` (already folder+barrel)                                               |
| IconCard      | `icon-card/IconCard.tsx` + `index.ts`           | `src/components/ui/icon-card/` (already folder+barrel)                                               |
| SectionHeader | `section-header/SectionHeader.tsx` + `index.ts` | `src/components/ui/section-header/` (already folder+barrel)                                          |

**`apps/admin` now duplicates two of these rows, not one.** `apps/admin/src/components/ui/` carries
its own flat `button.tsx` (pre-existing) and, since ICR-127's login/reset-password screens, a flat
`input.tsx` too — the identical shadcn↔hand-rolled seam as `apps/web`'s inventory above, just
doubled. Both still collapse into the single `@idcr/ui` `Button`/`Input` targets in the table above;
see §7 for the defect entry this strengthens.

**New — do not exist anywhere yet** (design-system artifacts under `tasks/specs/design-system/primitives/`
are the spec; the code ticket builds the real component):

| Primitive       | shadcn source                                                        | Radix dep                                                                  |
| --------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Table           | `table`                                                              | — (plain HTML table, no Radix primitive)                                   |
| Dialog          | `dialog`                                                             | `@radix-ui/react-dialog`                                                   |
| Tabs            | `tabs`                                                               | `@radix-ui/react-tabs`                                                     |
| Select          | `select`                                                             | `@radix-ui/react-select`                                                   |
| Checkbox        | `checkbox`                                                           | `@radix-ui/react-checkbox`                                                 |
| Avatar          | `avatar`                                                             | `@radix-ui/react-avatar`                                                   |
| Badge           | `badge`                                                              | — (variant-only, no Radix primitive)                                       |
| Pagination      | (no direct shadcn equivalent — compose from `Button`)                | —                                                                          |
| SegmentedToggle | (no direct shadcn equivalent — compose from `Button`/`toggle-group`) | `@radix-ui/react-toggle-group` (optional)                                  |
| Sidebar         | `sidebar`                                                            | — (mostly plain markup + `@radix-ui/react-tooltip` for the collapsed rail) |
| DropdownMenu    | `dropdown-menu`                                                      | `@radix-ui/react-dropdown-menu`                                            |

**`Dropdown` and `DropdownMenu` are different components — do not conflate them.** The existing
`apps/web/src/components/ui/dropdown/Dropdown.tsx` is a Headless-UI `Listbox` single-select form
control, i.e. the functional equivalent of shadcn's `select`; it is legacy web inventory, not one
of the 14 system primitives, and it has exactly **one** call site —
`apps/web/src/components/features/contact-form/formFields.tsx`. `DropdownMenu` is the unrelated
kebab-anchored contextual action menu (shadcn `dropdown-menu`), one of the 14 primitives, new and
built by the code ticket.

**`Dropdown.tsx` is deprecated, not migrated.** `Select` is the net-new system primitive and is
Radix-based (`@radix-ui/react-select`); `Dropdown.tsx` is Headless-UI-based (`@headlessui/react`
`Listbox`). `@idcr/ui` should not carry two headless-library implementations of the same control, so
`Dropdown.tsx` does not move into `@idcr/ui`. Instead, when the code ticket builds `Select`, it
repoints the single call site (`formFields.tsx`) to `Select` and deletes
`apps/web/src/components/ui/dropdown/` (component + barrel). One call site makes this a low-risk,
contained deprecation.

## 6. Implementation prerequisites for the code ticket

- **The `@source` directive is the silent breaker.** Once `@idcr/ui` ships class-name-bearing
  components, **both** `apps/web/src/app/globals.css` and `apps/admin/src/app/globals.css` need:

  ```css
  @source "../../../../packages/ui";
  ```

  Tailwind resolves `@source` relative to the CSS file that declares it. Both `globals.css` files
  sit at `apps/<app>/src/app/`, so reaching repo-root `packages/ui` takes **four** `../` levels
  (`app` → `src` → `web`/`admin` → `apps` → repo root) — three levels resolves to the non-existent
  `apps/packages/ui` instead. Verified: it is currently **absent from both** files. Without it, Tailwind's v4 automatic content
  scanner never walks into `packages/ui`, the utility classes referenced by the new components are
  never generated, and the components render **completely unstyled — with no error and no warning**.
  See `monorepo-packages.md` §8 for why it isn't added yet (there's nothing to scan today).

- **`transpilePackages` needs no change.** Verified present in both apps already:
  `apps/web/next.config.ts:8` and `apps/admin/next.config.ts:7`, both `["@idcr/ui"]`. (An earlier
  exploration pass claimed `apps/admin` was missing it; that was checked directly against the file
  and found to be wrong.)

- **Do not introduce a Tailwind JS preset.** Tailwind v4 in this repo is CSS-first — the shared
  "preset" _is_ `tokens.css`, consumed via `@import`. A `tailwind.config.ts` with no `@config`
  directive is dead code; one already existed in `apps/web` and was deleted for exactly this reason
  (`monorepo-packages.md` §4). Don't reintroduce the pattern in `packages/config` either.

- **None of the eight Radix packages named in §5's "New" table are installed anywhere in the repo
  yet.** Verified against both apps' `package.json`: `apps/web` has only `@radix-ui/react-label`,
  `@radix-ui/react-slot`, and `@radix-ui/react-toast`; `apps/admin` has only
  `@radix-ui/react-slot`. `react-dialog`, `react-tabs`, `react-select`, `react-checkbox`,
  `react-avatar`, `react-toggle-group`, `react-tooltip`, and `react-dropdown-menu` all still need
  to be added. Because the primitives live in `@idcr/ui`, these deps — plus
  `class-variance-authority` for the `cva` variants — belong in `packages/ui/package.json`, not in
  either app's `package.json`. `packages/ui/package.json` currently has no `peerDependencies`
  section; the code ticket adds one with `react` as a peer dependency (the primitives are consumed,
  not bundled, by each app's own React copy).

## 7. Known defects for the code ticket

- **`packages/ui/src/tokens.css:56-60`** declares five tokens under dead Tailwind **v3** namespaces:
  `--letter-spacing-snug`, `--font-size-2xs`, `--font-size-3xl`, `--font-size-4xl`,
  `--line-height-tighter`. Tailwind v4 reads `--tracking-*`, `--text-*`, `--leading-*` instead — these
  five are silently ignored. Verified: zero consumers reference them today, so fixing the namespace
  changes no rendered pixel.
- **`packages/ui/src/tokens.css`** defines `--chart-1` through `--chart-5` in `:root` (5 declarations)
  but never overrides them in `.dark` (0 declarations, verified). Any future data-visualization
  component renders light-mode chart hues on the dark navy background until this is fixed.
- **`apps/web/src/components/ui/divider/Divider.tsx:18`** gives the `vertical` variant the classes
  `mx-2 h-full` on an `<hr>` that otherwise only carries border-_colour_ classes
  (`border-gray-200 dark:border-gray-700`) — no `w-*` utility anywhere in the component. The result is
  an `<hr>` with no explicit width, which typically collapses to an invisible zero-width box instead
  of a visible vertical line. Verified: zero call sites use `variant="vertical"` today, so this has
  never been exercised in the running app.
- **`apps/admin/src/components/ui/{button,input}.tsx`** are both flat files — the folder+barrel
  convention (§5) isn't applied yet to either of the two components `apps/admin` already has.
  `input.tsx` landed with ICR-127's auth screens after this defect was first recorded; it repeats
  the same convention gap, not a new one.

## 8. Deviations from the v1 design prompt

The original mockup (`tasks/specs/design-mockups/people-list.html`, informally "v1") got several
things wrong that this system deliberately corrects. Recorded here so the deviation is a documented
decision, not a silent drift:

- **Hit targets.** v1 ships 30–38px interactive controls (buttons, icon-buttons, pager/kebab
  controls) against its own stated **≥44px** hit-target bar. This system standardises on **≥44px hit
  areas** everywhere; dense table rows keep their visual compactness via padding, not by shrinking the
  actual hit area.
- **Sample-data realism.** v1's sidebar/table sub-line reads "128 personas · 34 familias", which
  contradicts the documented reality of a **~40–60-person congregation**. This system's artifacts use
  **52 personas · 21 familias · 6 países de origen** throughout, and the pagination primitive shows the
  correspondingly correct **7 pages** (`ceil(52 / 8)`), not v1's 16.
- **The sign-in artifact omits the Google brand mark — and so did the real screen.** The official
  Google "G" icon is fixed four-colour brand hex, which conflicts with this system's tokens-only /
  no-raw-hex rule, so the artifact renders `Continuar con Google` as a plain outline button with no
  icon. **This was an artifact limitation, not a design decision** when written — but ICR-127 has
  since shipped the real `apps/admin` sign-in screen
  (`apps/admin/src/app/[locale]/(auth)/login/login-form.tsx`), and it uses the identical plain
  outline-button treatment (same `auth.login.googleButton` copy, still no icon). Adding the official
  mark is now a small polish item against **shipped** code, not a forward-looking build note; treat
  `sign-in.html` as a design reference to reconcile against that real implementation, not a
  greenfield target.

## 9. i18n

No locale keys ship with ICR-18 — `apps/web`'s `public/locales/{es-AR,en-US}.json` are untouched.
`apps/admin` doesn't share that file location: it keeps its own next-intl messages at
`apps/admin/messages/{es-AR,en-US}.json`. This section originally predicted an `admin.*`-prefixed
namespace shape inside whichever file the follow-up ticket would add to. That prediction is now
superseded: `apps/admin/messages/*.json` already establishes **flat, unprefixed top-level
namespaces** — `nav`, `pages`, and, since ICR-127, `auth` (`auth.login.*`, `auth.resetPassword.*`,
`auth.noAccess`, `auth.signOut`) — with no `admin.` prefix anywhere. The follow-up implementing
ticket should match that shipped convention:

- `people.*`
- `person.*`
- `calendar.*`
- `users.*`
- `roles.*`
- ~~`auth.*`~~ — already shipped flat (ICR-127); nothing left to add here.

## See also

- `tasks/specs/ICR-18-design-system-website-admin.md` — the full spec (requirements, edge cases,
  testing strategy) this doc summarizes.
- `tasks/specs/ICR-18-design-system-website-admin.plan.md` — the checkpoint-by-checkpoint
  implementation plan.
- `tasks/specs/design-system/README.md` — the artifact bundle's own README (upload procedure, hand-authored vs. auto-synced distinction).
- `docs/architecture/monorepo-packages.md` — `@idcr/ui`'s raw-source/no-build posture, the `@source`
  scanner mechanics (§8), and why there's no Tailwind JS preset (§4).
- `docs/architecture/code-patterns-and-conventions.md` — the folder+barrel convention and the
  shadcn-derived-vs-hand-rolled seam this migration closes.
