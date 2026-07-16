# design-sync — repo notes (idc-redentor-platform)

Project: **IDC Redentor** — https://claude.ai/design/p/7329c8ed-3ed2-46c0-bb2c-4f6edd7aca07

## The core fact about this repo

**There is no design-system package.** `@idcr/ui` (`packages/ui`) is named like one but has
**zero components** — only `cn()`, a `LOGO` constant, and `tokens.css`. The real components live
inside the Next.js app at `apps/web/src/components/{ui,shared,features}`. There is no Storybook,
no stories, no `examples/`, and no `dist/`.

Everything below exists to bridge that gap. See "Re-sync risks" at the bottom.

## Layout / key decisions

- **PKG_DIR is `apps/web`, deliberately.** The converter walks up from `--entry` to the first named
  `package.json`. The entry therefore lives at **`apps/web/ds-entry.tsx`**, NOT under `.design-sync/`.
  This is load-bearing: `lib/dts.mjs` derives `node_modules` from PKG_DIR (NOT from `--node-modules`)
  and walks _up_ looking for `@types/react`. From the repo root that walk fails (pnpm doesn't hoist;
  root `node_modules` has no `@types` at all) → `[DTS_REACT]` → every prop body emits EMPTY.
  From `apps/web` it finds `apps/web/node_modules/@types/react` immediately.
  Moving the entry back under `.design-sync/` will silently gut every `.d.ts`.
- **`apps/web/ds-entry.tsx` is the single source of component scope.** Edit that file to add/remove a
  component. It's committed and covered by `pnpm type-check`, so a renamed component fails the build
  instead of silently vanishing from the DS.
- `cfg.cssEntry` is bounded to **PKG_DIR**, so the compiled CSS must live under `apps/web`
  (`apps/web/.ds-css/`, gitignored). Other cfg paths (`tsconfig`, `extraEntries`) are also
  PKG_DIR-relative — hence the `../../` prefixes.

## Build (cfg.buildCmd runs both steps — re-run before the converter)

1. **Tailwind v4 standalone compile** → `apps/web/.ds-css/ds-tailwind.css`.
   The app's real CSS only ever exists inside the Next build, so `.design-sync/ds-styles.css` is a
   standalone mirror of `apps/web/src/app/globals.css`. **Keep the two in sync.**
2. **`tsc --emitDeclarationOnly` → `apps/web/dist/types`.** Without this there is no `.d.ts` tree, so
   component discovery finds nothing and prop bodies degrade to `[key: string]: unknown`.
   `findTypesRoot` checks `dist/types` _before_ `lib`, which is why this path was chosen — no change
   to `apps/web/package.json` is needed.

`componentSrcMap` is **required**, not optional: with no shipped `.d.ts` the converter discovers zero
components (`[ZERO_MATCH]`). Every non-null entry adds one. Regenerate it from `ds-entry.tsx` rather
than hand-editing.

## Shims (`.design-sync/shims/`, wired via `.design-sync/tsconfig.ds.json` paths)

These replace **framework primitives, never the church's own components**. The repo's own tests mock
exactly the same set — see `apps/web/src/components/features/sermon-section/SermonCard.test.tsx`.

| Shim                | Why                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next/image`        | No Next pipeline in a browser bundle. Renders the `<img>` next/image resolves to anyway. Handles `fill`.                                                                                                                                                                                                                                                        |
| `@src/i18n/routing` | The real module calls next-intl's `createNavigation()`, whose Link/useRouter read App Router context that doesn't exist here. **Note: there is NO `next/link` usage in this repo** — links come from here.                                                                                                                                                      |
| `framer-motion`     | **Highest-value shim.** IconCard / SermonCard / OurMissionSection / BlogPostCard use `initial={{opacity:0}}` + `whileInView`. IntersectionObserver never fires in a static screenshot, so they stay at **opacity 0 and render INVISIBLE**. SermonCard came back fully blank before this. Animation is therefore not represented in previews — final state only. |
| `contact-services`  | ContactForm → `contactFormAction` ("use server") → contact.service (MongoDB) + contact-form-email.service (SendGrid/Resend) → ~27 node builtins → build fails. Stubbed so the form's markup ships; only submission is inert.                                                                                                                                    |

**Directory → `index.ts` path entries are NOT boilerplate.** `tsconfigPathsPlugin` tries extensions
`['', '.ts', …]` in order and `existsSync()` is true for a directory, so a bare directory import
(`@src/components/ui/dropdown`) resolves to the _directory_ and esbuild dies with "is a directory".
The app's own components import dirs this way, so it must be fixed in the resolver. Regenerate with:

```sh
# lists every component dir that has an index.ts; add each as an exact path entry
# ABOVE the "@src/*" wildcard (first matching rule wins)
find apps/web/src/components -name index.ts | sed 's|/index.ts||'
```

## The `process` shim (in `ds-provider.tsx`)

`lib/bundle.mjs` defines the exact expression `process.env.NODE_ENV`, but a bundled dep reads
`process?.env?.["NODE_ENV"]`, which that define does not match. **Optional chaining does not rescue an
undeclared identifier** — it still throws. Without the shim all 74 previews die with
"ReferenceError: process is not defined". Do not remove it.

## Fonts — read before touching `ds-styles.css`

`next/font/google` self-hosts Outfit + Playfair at Next **build** time and injects `--font-outfit` /
`--font-playfair` via the body className. Neither exists in a plain browser.

This is subtler than it looks: `tokens.css` says `--font-sans: var(--font-outfit), "Outfit", sans-serif`.
If `--font-outfit` is undefined the whole declaration is **invalid at computed-value time** — the
`"Outfit"` fallback in that list never applies and everything silently renders in the browser default.
`ds-styles.css` therefore (a) loads both families from the Google Fonts CDN and (b) **defines the two
vars itself**. Verified rendering: headings in Playfair, body in Outfit.

`[FONT_REMOTE]` is expected and non-blocking (fonts load at runtime from the CDN). If offline
rendering is ever needed, self-host woff2 via `cfg.extraFonts`.

## Traps when authoring previews (learned the hard way — read before writing one)

### `RichTextField` is `{ json: Document }`, NOT a bare `Document`

**The costliest bug of the first pass, because it fails SILENTLY.** Pass a bare Contentful
`Document` to a rich-text-fed prop (`ContentCollection.description`, `creedItems[].description`,
`SectionHeader.description`, `IconCard.children`) and the body text just **vanishes** — while
titles, icons and verses still render. The card looks plausible and grades `good` unless you know
text is supposed to be there. Fixture casts (`as never`) mean **tsc will not catch it**.

Rich-text-fed props are `ReactNode`, not strings — a bare string renders unstyled. The app pipes
them through `lib/contentful/rich-text-options`; port those exact paragraph renderers
(`text-muted-foreground text-lg` / `text-muted-foreground leading-relaxed`) to stay honest.

### `preview-rebuild.mjs` does NOT recompile the Tailwind CSS

`ds-styles.css` has `@source "./previews"`, but the compile only runs inside `cfg.buildCmd`.
`preview-rebuild.mjs` re-bundles preview **JS only**. So **any utility class a preview introduces
that isn't already used somewhere in `apps/web/src/components` has no CSS rule at all** and fails
silently. This blanked a perfectly good Navbar (`h-28` → no rule → `height: 0` → `overflow-hidden`
clipped it to white, while the DOM had every element). **A blank cell does not mean a broken
component.**

Two independent agents hit this. Classes confirmed absent (each simply unused in the app) — the
usual traps are **arbitrary opacity modifiers** (`/5`, `/15`, `/50`) and **off-scale spacing/width**:

| Wanted                                        | Present alternative                               |
| --------------------------------------------- | ------------------------------------------------- |
| `bg-primary/15`, `bg-primary/5`               | `bg-primary/10`, `bg-primary/20`, `bg-primary/90` |
| `bg-secondary/50`                             | `bg-secondary`, `bg-secondary/30`                 |
| `max-w-md`, `max-w-lg`, `max-w-xl`            | `max-w-xs`, `max-w-sm`, `max-w-2xl`…`max-w-6xl`   |
| `py-8`                                        | `py-0/1/2/4/6/12/16/20/24`                        |
| `h-20`, `h-24`, `h-28`, `h-32`, `justify-end` | inline `style={{…}}`                              |

> Running `cfg.buildCmd` AFTER all previews are authored fixes this (verified: `.h-28` went from
> absent to present once recompiled with the previews on disk, because `@source "./previews"` then
> has something to scan). The trap only bites DURING authoring, when only `preview-rebuild` is available.

**`cn()` is tailwind-merge, so a missing class can still "work" — and mask the problem.**
`CardHeader` is `flex flex-col space-y-1.5 p-6`; passing `flex-row space-y-0` renders a correct row
_even though neither class exists in the CSS_, because tailwind-merge strips the conflicting
`flex-col`/`space-y-1.5`. The removal does the work, not the added class.

Check before trusting a class — note the `\/` escape or opacity variants give false negatives:

```sh
grep -c '\.h-28' apps/web/.ds-css/ds-tailwind.css   # 0 = no rule exists
```

Prefer classes the app already uses (previews then read in the app's own vocabulary); use inline
`style={{…}}` for genuine one-offs. **Always re-run `cfg.buildCmd` before the final
`package-build.mjs`** so preview-introduced classes get rules.

### ⚠ The `[CONFIG_STALE]` ordering trap — a GREEN result over stale output

**The single most dangerous failure mode found in this repo.** After editing `cfg.overrides`:
`preview-rebuild.mjs` refuses (`✗ [CONFIG_STALE] … run package-build.mjs first`) and **exits without
re-emitting** — but `package-capture.mjs` **still runs**, re-shoots the _stale_ HTML, and reports
`0 with errors` with fresh-looking cells. The emitted `viewport` attr and the raw PNG dimensions are
unchanged. A scoped loop therefore **cannot** apply a new override; only a full `package-build.mjs`
re-stamps the grade keys.

**Before grading after any override change**, verify the override actually landed — check the emitted
`viewport` attr and the raw PNG dimensions (`_screenshots/*.png` should NOT be 900x700).

### ⚠ `pendingGrade` needs a SECOND capture to clear

`pendingGrade` is written at **capture time, before grading**. So a freshly-graded component still
reads `pendingGrade: true` on disk and looks **ungraded** to the resync driver / upload gate. It only
flips once a subsequent capture carries it forward. After grading, re-run a scoped
`package-capture` and confirm `carried forward` / `pendingGrade: false` before treating a group as done.

### ⚠ `package-capture` DELETES the grade file when the gradeKey changes

Editing `cfg.overrides` changes the gradeKey, and capture then `rm`s `<Name>.grade.json`. So **"the
grade file is missing" is NOT evidence that nobody graded it** — an orchestrator config edit can punch
that hole itself. (This happened during the first sync and produced a false accusation.)

### `cardMode` and `viewport` are ORTHOGONAL — you usually want both

- `cardMode` fixes the **product's live grid card** (`ds-col`).
- `viewport` fixes the **review-sheet capture**.

`package-capture` screenshots each story via `?story=<Export>` — the full-bleed `.ds-single` path — at
`fullPage: false`, sized by the card's declared viewport (**default 900x700**). It never renders the
grid, so **cardMode has zero effect on the sheets** (`lib/emit.mjs:121` says so outright: "Captures
are unaffected: the harnesses drive ?story="). Content taller than the viewport is simply cropped.

### ⚠ The default 900px capture viewport is BELOW Tailwind's `lg` (1024px)

Any `lg:` layout renders in its **mobile** form on its sheet unless given a `viewport` override.
Audited blast radius for this DS (small, but re-check when adding components):

- `hidden lg:block` → **ContactForm only** (its whole info column vanished at 900px).
- `lg:grid-cols-*` in scope → CreedSection + ContactForm (**both have viewport overrides**), plus
  CommunityEvent / SermonSection / BlogSection — all three ship the **floor card**, so there's no
  collapsed layout to misrepresent.

Measure a viewport with a read-only probe (drive the real `?story=` path, compare `scrollHeight` to
the viewport) rather than guessing. Verified values: CreedSection content 1208px → `1280x1250`;
ContactForm 1189px at 900 wide but ~990px at 1280 (because `lg:grid-cols-2` shortens it) → `1280x1050`.

### `rm -rf apps/web/dist/types` before the declarations run (in `cfg.buildCmd`)

`apps/web/tsconfig.json` includes `**/*.ts`, so on the SECOND run the previous run's emitted `.d.ts`
tree becomes an _input_ → `TS5055: Cannot write file … would overwrite input file`. Harmless-looking,
but it degrades the emit. The `rm -rf` in `buildCmd` prevents it.

### Card grids: use 2 cells, not 3

`lg:grid-cols-3` never applies at preview-cell width, so a 3rd card wraps to a second row and clips.

### Unsplash IDs used in fixtures (verified against the actual renders)

- `photo-1438032005730-c779502df39b` — **stained glass** (NOT an open bible)
- `photo-1511632765486-a01980e01a18` — people together outdoors
- `photo-1507692049790-de58290a4334` — **worship concert** (NOT a generic gathering)
  Never use `example.com` image URLs — they render broken.

## The Navbar logo + `assets/` (POST-BUILD STEP — do not skip)

`Navbar` renders `<Image src={LOGO.default} />`; `@idcr/ui`'s `LOGO` constants are **root-relative**
paths (`/assets/img/redentor_logo.png`) baked into the component — **no prop can override them**.
The capture server (and the design tool) serve the bundle root, so without the files there the logo
404s in every Navbar cell.

**`package-build.mjs` wipes the out dir, so this must run AFTER every build** (it cannot live in
`cfg.buildCmd`, which runs _before_ the converter):

```sh
mkdir -p ds-bundle/assets/img && cp apps/web/public/assets/img/redentor_logo*.png ds-bundle/assets/img/
```

`assets/**` must also be in the upload plan's `writes`, or the logo renders locally but 404s in the
project — a grade that lies. Verified: with the copy, both Navbar cells render the real logo.
`Footer` dodges this only because its logo arrives as `content.logo.url` (a prop).

## `cfg.overrides` — cardMode

`column` is set for `CreedSection`, `ContactForm`, `Navbar`, `Footer`, `SubscribeBanner`.
**The trigger is intrinsic content height, not full-bleed-ness**: the cell is ~630×505px and these
render 1100–1200px tall (or one wide row). `OurMissionCta` is also full-bleed (`min-h-screen`) but
needs NO override — `min-h-screen` resolves against the iframe height.

## Components whose state a preview cannot reach (honest limitations, not bugs)

- **`Dropdown`** (Headless UI `Listbox`) owns selection internally and exposes no `open`/`value`
  prop → previews can only ever show the closed button; the options list never mounts.
- **`Toaster`** reads the `useToast()` store, which starts empty and is only fillable at runtime;
  the hook is not a bundle export. Its preview **reproduces `toaster.tsx`'s markup by hand** —
  ⚠ a hand-maintained copy: if `toaster.tsx` changes, `previews/Toaster.tsx` must be updated
  manually. Nothing enforces the link.
- **Radix overlays** (`Toast`) portal into `ToastViewport`, which ships `fixed …`. No `cardMode`
  override needed — pass `className="static w-full md:max-w-none"` to `ToastViewport`; `cn()` is
  tailwind-merge so `static` beats `fixed`. Use `<ToastProvider duration={86_400_000}>` (NOT
  `Infinity`/`MAX_SAFE_INTEGER` — setTimeout overflows int32 and fires immediately).
- **`position: fixed`** components (Navbar) escape their cell unless an ancestor has a `transform`
  (which makes it the containing block for fixed descendants).
- **`LoadingSpinner`** is styled for branded surfaces (`text-white/80`, `fill-primary/40`) and is
  near-invisible on a white card — preview it on the `bg-primary` surface it's designed for.
- **`IconCard`'s `icon` prop is a `ComponentType`, not an element** — `icon={Heart}`, not `icon={<Heart />}`.
- **`FormMessage`** returns `null` without a real error — seed `useForm({ errors })` rather than
  faking a `<p>`.

## Known render warns (triaged — not new)

- `[FONT_REMOTE] "Outfit", "Playfair Display"` — by design, see above.
- `[RENDER_BLANK]` / `[RENDER_THIN]` on unauthored components — these are the honest floor card, not
  failures. 51 components currently ship the floor card.

## Excluded from the DS (and why)

| Excluded                                                                                                  | Why                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SermonDetails`, `KeywordTags`                                                                            | async RSC (`next-intl/server`) — cannot run in a browser bundle. **`KeywordTags` is also dead code**: its only call site is commented out at `BlogPostContent.tsx:39-41`. |
| `ComponentCtaLive`, `CreedSectionLive`, `InfoCommunityLive`, `OurMissionCtaLive`, `OurMissionSectionLive` | Contentful live-preview wrappers (`useLivePreview`) around the base component — infrastructure, not design system. Use the base component.                                |
| `Portal`, `JsonLd`, `ContentfulPreviewProvider`                                                           | non-visual infrastructure                                                                                                                                                 |
| `Content` (`ui/content/`)                                                                                 | dead code (zero usage) + trivial wrapper                                                                                                                                  |

`form.tsx` **is** synced but is **dead code** — zero usage anywhere; `ContactForm` uses raw
`Input`/`Label`/`Textarea` instead. Flagged to Gabriel; keep or drop on his call.

## Re-sync risks (what can silently rot)

1. **`ds-styles.css` vs `globals.css` drift.** They are hand-mirrored. If someone edits `globals.css`
   (or `tokens.css` gains a font var), previews diverge from the real site with no error.
2. **`componentSrcMap` + `ds-entry.tsx` drift.** Adding a component to the app does NOT add it to the
   DS. `pnpm type-check` catches renames/deletions, not additions.
3. **The directory→index.ts path block** must grow when a new component directory is added, or the
   build fails with "is a directory".
4. **Fonts are network-fetched at render time** (Google Fonts CDN). An offline/blocked environment
   renders fallback fonts with no error.
5. **`tokens/` and `guidelines/` ship empty.** Tokens are compiled into `_ds_bundle.css` (197 defined,
   reachable via the `styles.css` @import closure), so this is fine — but a future `cfg.tokensGlob`
   pointing at `packages/ui/src/tokens.css` would resolve OUTSIDE PKG_DIR and be rejected.
6. **The real fix is structural.** All of the above is scaffolding around a missing DS package. The
   clean long-term move is promoting `apps/web/src/components/ui` into `@idcr/ui` as a proper built
   package with a real `dist/` — especially relevant now that `apps/admin` exists and will want the
   same primitives. Worth an ICR ticket.

## 🐛 Repo finding: 5 dead tokens in `packages/ui/src/tokens.css` (worth an ICR ticket)

Found while validating `conventions.md` against the built CSS. These are declared in `@theme inline`
but use **Tailwind v3 namespaces that v4 does not recognise** — v4 wants `--text-*`, `--tracking-*`,
`--leading-*`:

| Declared (dead)                   | Should be           | Generates                                              |
| --------------------------------- | ------------------- | ------------------------------------------------------ |
| `--font-size-2xs: 0.625rem`       | `--text-2xs`        | nothing — `text-2xs` has no rule                       |
| `--font-size-3xl: 1.75rem`        | `--text-3xl`        | nothing — `text-3xl` falls back to Tailwind's 1.875rem |
| `--font-size-4xl: 2.5rem`         | `--text-4xl`        | nothing — `text-4xl` falls back to Tailwind's 2.25rem  |
| `--letter-spacing-snug: -0.011em` | `--tracking-snug`   | nothing — `tracking-snug` has no rule                  |
| `--line-height-tighter: 1.1`      | `--leading-tighter` | nothing — `leading-tighter` has no rule                |

`--animate-highlight` in the same block **does** work (`--animate-*` IS a valid v4 namespace), which
is why the problem isn't obvious.

**Severity: low, but real.** No production breakage — a repo-wide grep shows `text-2xs`,
`tracking-snug` and `leading-tighter` are used in **0** files. But the intended 3xl/4xl type-scale
overrides are silently NOT applying anywhere on the site, and anyone who reaches for one of these
"documented" tokens gets nothing.

**This affects the live site identically** (`globals.css` imports the same `tokens.css`), so the DS
is faithful to production either way — fixing it would change both together, which is the point.

## Environment

- Node 22.14.0 (`.nvmrc`); pnpm. Chromium for the render check was already cached at
  **`~/Library/Caches/ms-playwright`** (macOS — NOT `~/.cache/ms-playwright`; checking the Linux path
  gives a false "not installed").
- `playwright@1.61.0` + `typescript` must be installed into `.ds-sync/` or validate skips the render
  check and the `.d.ts` parse check. Repo pins playwright 1.61.0 → chromium build 1228.
