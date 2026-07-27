# ICR-18 — Design system (website + admin panel) via Claude Design

**Jira:** [ICR-18](https://divinelab.atlassian.net/browse/ICR-18) · Story · Priority **Highest** ·
Component **Ministry Admin Panel** · Epic [ICR-14](https://divinelab.atlassian.net/browse/ICR-14)
**Branch:** `feat/ICR-18-design-system-website-admin` · **QA depth:** standard · **QA type:** `chore`
**Design gate:** held 2026-07-27 (mandatory — `needsDesignGate: true`)

> **Post-design-gate note (2026-07-27, vigil checkpoint 12):** `ICR-127` (admin Firebase auth) merged
> to `main` while this ticket's PR was open, then this branch merged `origin/main`. Two claims below
> and in `docs/architecture/design-system.md` were point-in-time snapshots that ICR-127 invalidated,
> now corrected in that doc: (1) `apps/admin/src/components/ui/` has **two** flat primitives —
> `button.tsx` **and** `input.tsx` — not one; (2) the admin sign-in and reset-password screens are no
> longer placeholders — ICR-127 shipped the real
> `apps/admin/src/app/[locale]/(auth)/{login,reset-password}/` implementation (the sign-in screen
> even reproduces this system's Google-mark-omission artifact limitation in the shipped code). The
> rest of `apps/admin/(app)/*` (people, families, activities, calendar, users, roles, settings)
> remains `<PlaceholderPage>` stubs, unaffected. This spec's body below is left as the point-in-time
> snapshot it was written as; `design-system.md` is the corrected, evergreen source.

---

## 0. Decisions locked at the design gate

These were chosen by the maintainer during the gate. They are binding for this ticket; do not
re-litigate them mid-implementation.

| #   | Decision                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Design-only. No production code.** The `@idcr/ui` code migration is a separate follow-up ticket.                                                        |
| D2  | **A new, dedicated claude.ai/design project.** The existing "IDC Redentor" project stays an auto-synced mirror of `apps/web` and is treated as read-only. |
| D3  | **14 primitives** — the ticket's named 7 plus the 7 the screens actually require.                                                                         |
| D4  | **Keep the split** — no pilot component migration inside ICR-18.                                                                                          |
| D5  | Re-render the accepted **v1 People list as the anchor screen**, so the shell (sidebar + topbar) is defined once.                                          |
| D6  | The 5 dead `tokens.css` tokens are **documented as defects, not fixed here** (fixing them would breach D1).                                               |

### Why the ticket's own text needed a decision

The ticket contains an internal contradiction: its Scope bullet says _"**Land** the shared layer in
`@idcr/ui`"_ while AC3 says the system _"maps cleanly onto shadcn/ui **for implementation in**
`@idcr/ui`"_. The first ships code; the second ships readiness. The maintainer resolved it in favour
of AC3's reading, which also matches the ticket's declared type (**design / NFR**).

---

## 1. Dependencies check

All preconditions the ticket names are **satisfied** — both were open when the ticket was written and
are now closed. State them as closed rather than re-checking them.

| Dependency                                              | State | Evidence                                                                                                      |
| ------------------------------------------------------- | :---: | ------------------------------------------------------------------------------------------------------------- |
| `@idcr/ui` exists (ticket's "M1a" / monorepo migration) |  ✅   | `packages/ui/src/{cn.ts,cn.test.ts,logo.ts,tokens.css,index.ts}` — landed by ICR-16                           |
| Claude Design available (ticket's explicit gate)        |  ✅   | `DesignSync` tool present this session; `list_projects` returns writable projects                             |
| `apps/web` + `apps/admin` both exist                    |  ✅   | ICR-124 scaffold                                                                                              |
| Accepted v1 mockup                                      |  ✅   | `tasks/specs/design-mockups/people-list.html` (376 lines, static CSS, no framework)                           |
| v1 design prompt + acceptance record                    |  ✅   | `tasks/specs/admin-design-prompt.md` §A tokens, §B 10-screen prompt, §D v1 accepted 2026-06-23                |
| `monorepo-migration.md` CP3 (cited by the ticket)       |  ✅   | `tasks/specs/monorepo-migration.md` — **git-tracked and present** (23,670 bytes)                              |
| shadcn runtime deps                                     |  ✅   | `@radix-ui/react-slot`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react` in **both** apps |
| `components.json` (shadcn CLI config)                   |  ❌   | Absent repo-wide — components were hand-scaffolded from shadcn source, never via the CLI                      |

### Adjacent work — read before starting

- **ICR-37 (open)** owns converging the shadcn↔hand-rolled seam described in
  `docs/architecture/code-patterns-and-conventions.md` §9/§11.1. ICR-18 **feeds** ICR-37 with a
  specified target; it must not pre-empt or partially perform that convergence.
- **ICR-127 (in flight,** `feat/ICR-127-admin-firebase-auth`**)** builds admin Firebase auth. The
  Sign-in screen here is a **static design artifact only** and must not contradict that work; the
  Roles-matrix screen's permission shape should be coordinated with it by the implementing ticket.
- **`chore/design-sync` (local, unmerged, unpushed)** is a preview/sync harness that pushed
  `apps/web` components to the existing Claude Design project. It is **not a dependency and not a
  blocker** — ICR-18 neither needs it nor supersedes it. It is, however, **stale**: `git diff main`
  shows `code-patterns-and-conventions.md`, `versioning.md`, `admin-database.md`, `predica-usage.md`
  and three `tasks/specs/ICR-149|164|166` files as pure deletions, so merging it as-is would revert
  them. Flagged for triage; out of scope here.

---

## 2. Target architecture (binding end-state)

This section exists so the follow-up code ticket cannot drift into "each app keeps its own copy."
ICR-18 **specifies** this; it does not build it.

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

**The boundary: primitives are shared; feature/domain components stay app-local.** `SermonCard`,
`BlogPostCard`, `ContactForm` and `CreedSection` are coupled to Contentful types and web-only
next-intl namespaces. Moving them into `@idcr/ui` would drag those dependencies into a package that
`apps/admin` consumes. Only presentation-neutral primitives cross the boundary.

**Current reality (the gap the code ticket closes):** `packages/ui` has **zero** components;
`apps/web/src/components/ui/` holds ~13; `apps/admin/src/components/ui/` holds exactly one
(`button.tsx`, a duplicate). Modifying a button today requires editing two files in two apps.

### The one prerequisite the code ticket must not miss

**`@source` scanner directive — the silent breaker.** Per
[`monorepo-packages.md`](../../docs/architecture/monorepo-packages.md) §8, once `@idcr/ui` contains
class-name-bearing components, **both** apps' `globals.css` need
`@source "../../../packages/ui";`. Without it Tailwind never scans the package, the utility classes
are never generated, and components render **unstyled with no error and no warning**.

Verified against the branch: `@source` is **absent from both** `apps/web/src/app/globals.css` and
`apps/admin/src/app/globals.css`. This is the single highest-risk step in the migration.

**Already satisfied — do not re-do.** `@idcr/ui` ships raw source with no build step and no `dist/`
(`monorepo-packages.md` §2), consumed via `transpilePackages`. **Both** apps already declare it —
`apps/web/next.config.ts:8` and `apps/admin/next.config.ts:7`. An earlier exploration pass reported
`apps/admin` as missing it; that is incorrect and was corrected by direct verification. The code
ticket needs no `next.config.ts` change in either app.

**Do not introduce a Tailwind JS preset.** Tailwind v4 here is CSS-first; the shared preset _is_
`@idcr/ui/tokens.css` consumed via `@import`. A `tailwind.config.ts` with no `@config` directive is
dead code — one already existed and was deleted for exactly this reason (`monorepo-packages.md` §4).

---

## 3. Requirements

| #   | Requirement                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Create a claude.ai/design project named **"IDC Redentor · Design System"** of type `PROJECT_TYPE_DESIGN_SYSTEM`. If a project with that name already exists, **reuse it** — never create a duplicate. |
| R2  | Publish a **Foundations** page rendering every semantic colour token with its paired `-foreground`, **light and dark side by side**, plus the type ramp, spacing scale and radius scale.              |
| R3  | Document the type scale using the **correct Tailwind v4 namespaces** (`--text-*`, `--tracking-*`, `--leading-*`) — not the dead v3 names currently in `tokens.css` (see R12).                         |
| R4  | Publish **14 primitives**, each as a variant grid, each in light **and** dark.                                                                                                                        |
| R5  | Publish **7 screens** (the 6 MVP screens + the People-list anchor), each in light **and** dark, with **es-AR** copy.                                                                                  |
| R6  | The **A4 print calendar** uses a fixed A4 `@page` with print margins, has **no dark variant**, and encodes status **monochrome-safely** (shape/label, never colour alone).                            |
| R7  | Write `docs/architecture/design-system.md` — the token contract, the per-primitive migration table, the two prerequisites from §2, and the known defects.                                             |
| R8  | That doc states the **§2 target architecture as binding**, including the primitives-vs-features boundary.                                                                                             |
| R9  | **No production code changes.** `apps/web/**`, `apps/admin/**` and `packages/ui/**` are untouched. The one permitted exception is adding the new doc to the `CLAUDE.md` + `AGENTS.md` doc indexes.    |
| R10 | Artifact sources are **repo-tracked** under `tasks/specs/design-system/{foundations,primitives,screens}/` and uploaded from there, so the PR is reviewable and the system is reproducible.            |
| R11 | Verify by **reading the published project back** (`DesignSync` `list_files` + `get_file`), never by inferring success from the upload call returning OK.                                              |
| R12 | Record as defects for the code ticket: the 5 dead v3-namespace tokens, `Divider`'s invisible `vertical` variant, and `apps/admin`'s flat `ui/button.tsx` layout.                                      |
| R13 | Honour the v1 quality bar (`admin-design-prompt.md` §B): **no** gradient washes, **no** emoji, **no** Inter/Roboto, **no** rounded-card-with-left-border-accent cliché.                               |

---

## 4. Data model changes

**None.** This ticket touches no database and no CMS model.

- **MongoDB:** no reads or writes. Neither the `website` nor the `ministry-admin` database is
  contacted; no collections, no indexes.
- **Contentful:** **no content-type or field change and no entry remap.** The repo's Contentful
  model-change gate (`CLAUDE.md` § "Contentful model-change gate") therefore **does not apply** to
  this ticket, and no work happens in the `staging` work env.
- **TypeScript:** no shipped interfaces. The per-primitive prop contracts in the design artifacts are
  _documentation of an intended_ shape; they are authored as illustrative `.d.ts`-style blocks and are
  never compiled or imported by either app.

## 5. API changes

**None.** No route handlers, no Server Actions, no Zod schemas, no request/response contracts. The
design system is inert artifacts plus one Markdown doc.

---

## 6. New / modified files

### New

| Path                                                       | Purpose                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `tasks/specs/design-system/foundations/foundations.html`   | Colour tokens (light+dark pairs), type ramp, spacing, radius |
| `tasks/specs/design-system/primitives/<Name>.html` × 14    | One variant grid per primitive, light+dark                   |
| `tasks/specs/design-system/screens/people-list.html`       | Anchor screen — defines the shell (D5)                       |
| `tasks/specs/design-system/screens/person-detail.html`     | MVP screen                                                   |
| `tasks/specs/design-system/screens/calendar-month.html`    | MVP screen                                                   |
| `tasks/specs/design-system/screens/calendar-print-a4.html` | MVP screen — print medium (R6)                               |
| `tasks/specs/design-system/screens/sign-in.html`           | MVP screen                                                   |
| `tasks/specs/design-system/screens/users.html`             | MVP screen                                                   |
| `tasks/specs/design-system/screens/roles-matrix.html`      | MVP screen                                                   |
| `tasks/specs/design-system/README.md`                      | How to re-upload the bundle; which project id it targets     |
| `docs/architecture/design-system.md`                       | The system doc + `@idcr/ui` migration path (R7, R8)          |
| `tasks/specs/ICR-18-design-system-website-admin.md`        | This spec                                                    |
| `tasks/specs/ICR-18-design-system-website-admin.plan.md`   | The implementation plan                                      |

### Modified

| Path        | Change                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| `CLAUDE.md` | Add `design-system.md` to the `docs/architecture/` index (12 existing refs)              |
| `AGENTS.md` | Add the same entry — **both** files enumerate docs; updating one creates a contradiction |

### Explicitly NOT modified

`packages/ui/src/tokens.css` · `apps/web/**` · `apps/admin/**` · `packages/config/**` ·
`public/locales/*.json` · `.changeset/**` (no changeset — see §10) · the existing "IDC Redentor"
Claude Design project.

---

## 7. Component hierarchy

### Design-system project structure (as published)

```
IDC Redentor · Design System
├── README.md                     ← how to consume; token vocabulary
├── foundations/
│   └── foundations.html          ← swatches · type · spacing · radius (light | dark)
├── primitives/
│   ├── Button.html               ← default | secondary | outline | ghost | destructive
│   │                                × sm | md | lg × icon-only × disabled | loading
│   ├── Input.html                ← default | focus | error | disabled (+ label, help, error)
│   ├── Textarea.html
│   ├── Select.html
│   ├── Checkbox.html             ← unchecked | checked | indeterminate | disabled
│   ├── Badge.html                ← tag pill × status dot (active | occasional | inactive)
│   ├── Avatar.html               ← initials | image × sm | md | lg
│   ├── Table.html                ← header | row | dense | sortable | selected | empty state
│   ├── Dialog.html               ← confirm variant | form variant
│   ├── DropdownMenu.html         ← the kebab menu (open state)
│   ├── Tabs.html                 ← 2–5 tabs, active | hover | disabled
│   ├── Sidebar.html              ← nav item | active | disabled "Pronto" | section group
│   ├── Pagination.html           ← numbered pager, first | middle | last page
│   └── SegmentedToggle.html      ← ES/EN · theme light/dark
└── screens/
    ├── people-list.html          ← ANCHOR: defines shell, re-rendered from accepted v1
    ├── person-detail.html
    ├── calendar-month.html
    ├── calendar-print-a4.html    ← print only, no dark variant
    ├── sign-in.html              ← no shell (unauthenticated)
    ├── users.html
    └── roles-matrix.html
```

### Screen shell composition (from the accepted v1)

```
AppShell
├── Sidebar
│   ├── section: Personas · Familias · Actividades · Calendario
│   ├── section: Usuarios · Roles y permisos · Configuración
│   └── section: Finanzas · Cultos          [disabled — "Pronto"]
└── main
    ├── Topbar
    │   ├── breadcrumb
    │   ├── SegmentedToggle (ES | EN)
    │   ├── theme icon-button
    │   └── Avatar (user)
    └── <screen content>

Responsive: sidebar collapses to icon-rail at md, to an overlay drawer at sm.
Sign-in renders WITHOUT AppShell. calendar-print-a4 renders WITHOUT AppShell (print medium).
```

---

## 8. Edge cases

| #   | Case                                                          | Expected behaviour                                                                                                                                                                                        |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | A project named "IDC Redentor · Design System" already exists | Reuse it (`list_projects` → match by name). Never create a duplicate. Verify `type` is `PROJECT_TYPE_DESIGN_SYSTEM` via `get_project` — the type is immutable at creation.                                |
| E2  | `DesignSync` write ordering                                   | `finalize_plan` must precede any write, and must declare every path (globs allowed) plus `localDir`. Writes outside the plan are rejected.                                                                |
| E3  | Upload batch size                                             | `write_files` caps at 256 files/call; ~23 files fits one call. No splitting needed.                                                                                                                       |
| E4  | `get_file` 256 KiB cap                                        | Keep `foundations.html` under the cap so readback verification (R11) can actually read it. Split into two pages if it grows past ~200 KiB.                                                                |
| E5  | Dark mode is a `.dark` **ancestor class**, not a prop         | Each artifact must render both themes **statically** — duplicate the tree inside a `.dark` wrapper. A JS toggle would leave the dark state unverifiable by readback.                                      |
| E6  | Fonts are injected externally                                 | `tokens.css` does **not** define `--font-outfit`/`--font-playfair` (next/font supplies them). Standalone artifacts must declare the font families directly, or type silently falls back to a system font. |
| E7  | A4 print page                                                 | `@page { size: A4; margin: … }`. The artifact must also remain viewable on screen so it can be reviewed without printing.                                                                                 |
| E8  | Status conveyed by colour alone                               | Fails both accessibility and the monochrome print requirement. Every status badge carries a shape or text label in addition to its hue.                                                                   |
| E9  | es-AR copy correctness                                        | Voseo where natural; **accents are correctness defects, not style**. The plan lists the exact strings verbatim so the implementer transcribes rather than composes (lesson ICR-49).                       |
| E10 | The existing "IDC Redentor" project                           | **Read-only.** It is a hash-keyed machine mirror (`_ds_sync.json`, `shape: "package"`); writing hand-authored files into it risks a later sync clobbering them.                                           |
| E11 | Verification that "observed nothing" reads as pass            | Every negative/absence assertion must first prove it read a non-empty artifact (lesson ICR-144). Assert file present **and** non-empty **and** contains the `.dark` block.                                |
| E12 | Primitive already exists in `apps/web`, divergently           | Document the **target** shape and record the divergence in the migration table. Do not edit the web implementation (R9/D1).                                                                               |

---

## 9. i18n

**No locale-file changes.** `public/locales/es-AR.json` and `en-US.json` are untouched (R9).

Screen copy is **hardcoded es-AR** inside the design artifacts as illustrative content — that is what
a design mockup is. The system doc records the namespace shape the _implementing_ ticket will need, so
the key design is not lost:

```
admin.people.*      admin.person.*     admin.calendar.*
admin.users.*       admin.roles.*      admin.auth.*
```

es-AR is the project default locale; en-US is secondary. The artifacts show es-AR only — rendering
both locales for every screen doubles the artifact count for no design signal, since the layout is
locale-independent apart from string length. The ES/EN `SegmentedToggle` primitive documents the
switch affordance itself.

---

## 10. Release impact

**No release.** Verified against the live config, not intuition:

- `.releaserc.json` is **absent** — semantic-release was retired by ICR-164.
- `.changeset/config.json` is present and governs versioning.
- Under Changesets, **a PR cuts a release iff it carries a `.changeset/*.md` file.** The commit/PR
  type has **no** release effect.

ICR-18 adds **no changeset**, because it changes no shipped package: `@idcr/web` and `@idcr/admin` are
both untouched. PR title is `feat(ICR-18): …` per `config.tracker.issueTypeToCommitType` (Story →
`feat`), and that title cuts no version bump.

---

## 11. Testing strategy

### Unit tests: none, deliberately

No code ships, so there is nothing whose behaviour could regress. A test asserting that an HTML
artifact contains a string it was just written with is a green rubber stamp — it cannot fail
meaningfully (lesson ICR-108). Stating this explicitly so the omission reads as a decision, not an
oversight.

### Regression gate (proves R9 — no production code changed)

`pnpm type-check` · `pnpm lint` · `pnpm test` · `pnpm build` must all remain green. Because the diff
is Markdown and HTML only, **any** failure here means something was touched that shouldn't have been.
Baseline captured at worktree creation: **3 Turbo tasks successful, `@idcr/admin` 54/54 tests pass.**

`.env.local` was pre-copied to `apps/web/.env.local` at worktree setup, so `pnpm build` will not
false-negative with `ERR_INVALID_URL` (lessons ICR-39 / ICR-136).

### Formatting

`prettier --check` on **touched files only**. A repo-wide `pnpm format:check` reports ~173 pre-existing
unclean files on `main`; the gate is delta-vs-base, not the absolute count (lesson ICR-109).

### Artifact verification (R11)

For every one of the 14 primitives + 7 screens + foundations, read the **published** project back:

1. `DesignSync list_files` → the path exists.
2. `DesignSync get_file` → content is **non-empty**.
3. Content contains a `.dark` wrapper (except `calendar-print-a4`, which by R6 has none).

Each check must prove it observed a non-empty response before asserting anything about content
(E11 / lesson ICR-144).

### Acceptance-criteria evidence map

| AC                                                     | Evidence                                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 Shared tokens + primitives documented and rendered | `foundations.html` + 14 primitive artifacts readback-verified in the published project; `docs/architecture/design-system.md`                                         |
| AC2 Admin MVP screens designed, light + dark           | 7 screen artifacts readback-verified, each carrying both themes (print screen exempt per R6)                                                                         |
| AC3 System maps cleanly onto shadcn/ui for `@idcr/ui`  | The per-primitive migration table in `design-system.md`: primitive → shadcn source → radix dep → target `@idcr/ui` path → divergence note; plus the §2 prerequisites |

### QA type

**`chore`** — the diff is docs + spec artifacts with no UI or API code, so QA is local checks only:
no browser walk, no Vercel preview target, no Playwright suite. Recorded here so the QA step does not
attempt to resolve a preview deployment for a ticket that has no runtime surface.

---

## 12. Implementation checkpoints

Seven checkpoints — under the harness's 8-checkpoint guard. **Every checkpoint commits _and_
pushes**; the draft PR only reflects what has been pushed (lesson ICR-164).

| CP  | Scope                                                                                  | Files                                                                   | Verification                                                                                    | Commit                                                                     |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Create/reuse the project (E1); author + publish Foundations (R1–R3)                    | `design-system/foundations/foundations.html`, `design-system/README.md` | `get_project` type is `…DESIGN_SYSTEM`; readback of `foundations.html` non-empty, has `.dark`   | `feat(ICR-18): create the design-system project and publish foundations`   |
| 2   | Primitives A — Button, Input, Textarea, Select, Checkbox, Badge, Avatar                | `design-system/primitives/` × 7                                         | Readback all 7; each non-empty + `.dark`                                                        | `feat(ICR-18): add core input primitives to the design system`             |
| 3   | Primitives B — Table, Dialog, DropdownMenu, Tabs, Sidebar, Pagination, SegmentedToggle | `design-system/primitives/` × 7                                         | Readback all 7; each non-empty + `.dark`                                                        | `feat(ICR-18): add layout and overlay primitives to the design system`     |
| 4   | Anchor People list (D5) + Person detail                                                | `design-system/screens/{people-list,person-detail}.html`                | Readback both; shell matches the v1 sidebar/topbar inventory                                    | `feat(ICR-18): add the people-list anchor and person-detail screens`       |
| 5   | Users + Roles matrix + Sign-in                                                         | `design-system/screens/{users,roles-matrix,sign-in}.html`               | Readback all 3; sign-in renders without `AppShell`                                              | `feat(ICR-18): add the users, roles-matrix and sign-in screens`            |
| 6   | Calendar month view + A4 print calendar (R6)                                           | `design-system/screens/{calendar-month,calendar-print-a4}.html`         | Readback both; print artifact has `@page size: A4`, **no** `.dark`, monochrome-safe status      | `feat(ICR-18): add the calendar month view and A4 print calendar`          |
| 7   | System doc + migration table (R7, R8, R12) + doc-index updates                         | `docs/architecture/design-system.md`, `CLAUDE.md`, `AGENTS.md`          | Full stack green; `prettier --check` on touched files; migration table covers all 14 primitives | `docs(ICR-18): document the design system and its @idcr/ui migration path` |

---

## 13. Follow-ups to file at triage

| Item                                                                                                                                                                                                                                                                                                                                                                                                              | Type                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **The code ticket** — migrate the 14 primitives into `@idcr/ui`, delete `apps/admin`'s duplicate `ui/button.tsx`, repoint both apps. Must include the `@source` directive in **both** `globals.css` files, the 5 dead-token fix (`tokens.css:56-60`), and the `Divider` vertical fix. **No `next.config.ts` change needed** — both apps already declare `transpilePackages`. Coordinate with / absorb **ICR-37**. | Story                               |
| **`chore/design-sync` is stale** — would revert 4 architecture docs + 3 spec files if merged as-is. Needs a rebase onto current `main`, or an explicit decision to abandon.                                                                                                                                                                                                                                       | Task                                |
| `Divider`'s `vertical` variant renders as an invisible zero-width box (`apps/web/src/components/ui/divider/Divider.tsx:18`); 0 call sites today.                                                                                                                                                                                                                                                                  | Bug (may fold into the code ticket) |

---

## 14. Open questions

1. **Does the code ticket absorb ICR-37 or run alongside it?** ICR-37 formally owns the seam
   convergence; the migration performs it. A PM/human call, not an implementation decision.
2. **`chore/design-sync`: rebase or abandon?** Its owner decides. ICR-18 is unaffected either way.
3. **Should the A4 calendar also ship a rendered PDF sample?** Not required by any AC; deferred unless
   asked. The repo already has serverless Chromium PDF machinery (`/predica`) that a later ticket
   could reuse.
