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
medium that must **not** ship a dark variant (spec R6).

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

| Token                | Light                             | Dark                              | Notes                                                                                                                         |
| -------------------- | --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--gold`             | `35 45% 62%`                      | `35 40% 58%`                      | Derived from the `--secondary` hue. Sparing use — leadership/favourite accents (e.g. the calendar's birthday `.star` marker). |
| `--status-active-fg` | `160 60% 34%`                     | `160 55% 60%`                     | Status-dot text/icon colour, "Activo".                                                                                        |
| `--status-active-bg` | `160 60% 34% / .12`               | `160 55% 50% / .15`               | Status-dot background, "Activo".                                                                                              |
| `--status-occ-fg`    | `35 70% 38%`                      | `35 75% 62%`                      | "Ocasional".                                                                                                                  |
| `--status-occ-bg`    | `35 70% 45% / .14`                | `35 70% 50% / .16`                | "Ocasional".                                                                                                                  |
| `--status-inactive`  | `--muted-foreground` on `--muted` | `--muted-foreground` on `--muted` | "Inactivo" reuses the existing muted pair in both themes — no new token needed.                                               |

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
(some folder+barrel, some flat shadcn files). `apps/admin/src/components/ui/` has exactly **one**
file, `button.tsx` — a duplicate of the same primitive, flat. Editing a button today means changing
two files in two apps; the goal is to edit it once and have both apps pick it up.

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
- **`apps/admin/src/components/ui/button.tsx`** is a flat file — the folder+barrel convention (§5)
  isn't applied yet even to the one component `apps/admin` already has.

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
- **The sign-in artifact omits the Google brand mark.** The official Google "G" icon is fixed
  four-colour brand hex, which conflicts with this system's tokens-only / no-raw-hex rule, so the
  artifact renders `Continuar con Google` as a plain outline button with no icon. **This is an
  artifact limitation, not a design decision** — the real `apps/admin` implementation must use the
  official Google mark, per Google's brand guidelines, when it builds the actual sign-in screen.

## 9. i18n

No locale keys ship with ICR-18 — both `public/locales/es-AR.json` and `public/locales/en-US.json`
are untouched. The follow-up implementing ticket will need to add these namespaces:

- `admin.people.*`
- `admin.person.*`
- `admin.calendar.*`
- `admin.users.*`
- `admin.roles.*`
- `admin.auth.*`

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
