# Monorepo Packages — `@idcr/config` + `@idcr/ui`

> **Monorepo note:** the site lives under **`apps/web/`**. Package paths in this doc
> (`packages/config/…`, `packages/ui/…`) are repo-root paths — they are workspace members
> alongside `apps/web/`, not nested under it.

> **Purpose:** Why two shared workspace packages exist, what each one is and isn't for, and the
> non-obvious constraints a future consumer (`apps/admin`) must respect. Written for ICR-16 ("M1a
> Monorepo: extract `@idcr/config` + `@idcr/ui`"), the first ticket to prove workspace-package
> wiring ahead of the admin app.
> **Last reviewed:** 2026-07-13

## 1. The two packages and their surface

Both packages are **`"private": true`**, start at **`"version": "0.0.0"`**, and are consumed only via
the `workspace:*` protocol — they are never published to a registry. Under **Changesets**
(`docs/architecture/versioning.md`) they still version: a change to `@idcr/config`/`@idcr/ui` bumps
that package and cascades a patch to the apps that consume it. Each app (`@idcr/web`, `@idcr/admin`)
keeps its own independent version line; the root `package.json` is frozen.

**`packages/config`** (`@idcr/config`) — four base configs, each exposed as its own subpath
export, no default export:

```json
"exports": {
  "./tsconfig.base.json": "./tsconfig.base.json",
  "./eslint.base.mjs": "./eslint.base.mjs",
  "./postcss.base.mjs": "./postcss.base.mjs",
  "./prettier.base.json": "./prettier.base.json"
}
```

- `tsconfig.base.json` — the _shareable_ compiler options only (`target`, `lib`, `strict`,
  `module`, `moduleResolution: "bundler"`, `jsx`, …). No `paths`, no `baseUrl` — see §3.
- `eslint.base.mjs` — the shared flat-config array (`eslint-config-next` core-web-vitals +
  `/typescript`, plus the repo's two overrides). `apps/web/eslint.config.mjs` spreads it and adds
  its own app-specific `ignores`.
- `postcss.base.mjs` — the `@tailwindcss/postcss` plugin object. `apps/web/postcss.config.mjs`
  re-exports it verbatim.
- `prettier.base.json` — the four shared Prettier keys. The root `.prettierrc.json` is now the
  bare string `"@idcr/config/prettier.base.json"`.

**`packages/ui`** (`@idcr/ui`) — raw TS/CSS source, two subpath exports:

```json
"exports": {
  ".": "./src/index.ts",
  "./tokens.css": "./src/tokens.css"
}
```

- `.` → `cn()` (moved verbatim from `apps/web/src/utils/cn.ts`) + `LOGO` (new typed path
  constants, §5).
- `./tokens.css` → the brand `@theme`/`:root`/`.dark` block moved verbatim out of
  `apps/web/src/app/globals.css` (§7).

`apps/web` depends on both via `"@idcr/ui": "workspace:*"` and `"@idcr/config": "workspace:*"`.

## 2. Why `@idcr/ui` ships raw source, not a build

`@idcr/ui` has **no build step and no `dist/`** — nothing for Turbo to sequence ahead of
`apps/web`'s build. `apps/web/next.config.ts` opts it into `transpilePackages: ["@idcr/ui"]`, and
resolution is split across two toolchains that each already handle raw workspace source for free:

- **TypeScript** resolves it because `tsconfig.base.json` sets `moduleResolution: "bundler"`,
  which reads the package's `exports` map directly and lands on `./src/index.ts` — no `types`
  field or compiled `.d.ts` needed.
- **Vitest** resolves it because pnpm links `@idcr/ui` into `node_modules/@idcr/ui` as a
  **symlink to a real path outside `node_modules`** (`apps/web/node_modules/@idcr/ui ->
../../../../packages/ui`). Vite does not transform `node_modules` by default, but it follows
  symlinks and transforms the real (non-`node_modules`) target normally — so `cn.test.ts` runs
  under Vite's transform pipeline with zero extra config.

This is the standard "raw source workspace package" pattern for a private in-repo package: it
trades a build step for a resolver dependency (bundler-mode TS + a symlinking package manager),
which is the correct trade when the only consumer is another package in the same workspace.

## 3. `paths` aliases MUST stay in `apps/web/tsconfig.json` — never in the base

`apps/web/tsconfig.json` extends the base and layers its own `paths`:

```json
{
  "extends": "@idcr/config/tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@public/*": ["./public/*"],
      "@src/*": ["./src/*"],
      "@lib/*": ["./lib/*"],
      "@icons/*": ["./public/assets/svg/*"]
    }
  }
}
```

**This is a live trap, stated plainly: there is no `baseUrl` set anywhere in this chain.** A
relative `paths` entry in an _extended_ tsconfig resolves against **the file that declares the
`paths` block**, not against the file doing the extending. If `paths` were moved into
`tsconfig.base.json` (inside `packages/config/`), `@src/*` would silently resolve to
`packages/config/src/*` instead of `apps/web/src/*` — every `@src/…` import in the app would
break, and TypeScript would report the errors at arbitrary downstream call sites, not at the
config change itself.

It also breaks a second, independent thing: `apps/web/vitest.config.ts` uses the
`vite-tsconfig-paths` plugin, which reads `paths` straight out of `apps/web/tsconfig.json` at
test time. Moving `paths` into the base would desync Vitest's alias resolution from TypeScript's
the same way.

**Rule:** `tsconfig.base.json` carries only compiler options with no path semantics. Any
app-specific `paths`, `include`, `exclude`, or `plugins` block belongs in that app's own
`tsconfig.json`, declared where it's read.

## 4. Why there is no Tailwind preset in `packages/config`

Tailwind v4 in this repo is **CSS-first**: there is no `@config` directive anywhere in
`apps/web/src/app/globals.css` or elsewhere, so a JS `tailwind.config.ts` is **never loaded** —
`postcss.base.mjs` only wires the `@tailwindcss/postcss` plugin, which reads Tailwind
configuration from `@theme` blocks in CSS, not from a JS config object.

`apps/web/tailwind.config.ts` existed before this ticket but was provably dead code: it only
registered the `@tailwindcss/typography` plugin, and the app uses **zero** `prose` classes
anywhere. It was deleted, along with the now-unused `@tailwindcss/typography` dependency —
deleting an unloaded config file cannot change a rendered pixel.

**Under Tailwind v4 CSS-first, the shared "preset" _is_ `@idcr/ui/tokens.css`** (§7) — a consumer
gets the brand design tokens by `@import`-ing that file, not by extending a JS preset. Do not
reintroduce a JS Tailwind config/preset in `packages/config`; it would be exactly the same class
of dead config this ticket just removed.

## 5. Why the logo PNGs stay in `apps/web/public/` — `@idcr/ui` exports only paths

`packages/ui/src/logo.ts` exports typed path **constants**, not the image bytes:

```ts
export const LOGO = {
  default: "/assets/img/redentor_logo.png",
  light: "/assets/img/redentor_logo_light.png",
  dark: "/assets/img/redentor_logo_dark.png",
  default100: "/assets/img/redentor_logo_100.png",
  light100: "/assets/img/redentor_logo_light_100.png",
  dark100: "/assets/img/redentor_logo_dark_100.png",
} as const;
```

The six PNG files themselves live only in `apps/web/public/assets/img/`. Two consumers need an
**absolute URL to a real served file**, not a component or a bundler-resolved import: OG/Twitter
social cards (`lib/metadata.ts`, `lib/sermonMetadata.ts`) and the email templates
(`src/templates/contact-form.template.ts`, `broadcast.template.ts`, both plain HTML strings with a
`{{baseUrl}}` placeholder). Neither can resolve a package import at the point they need the URL, so
a real file has to exist under the requesting app's own `public/`.

**Vercel Blob was explicitly considered and rejected** for a shared logo store: `public/` is
_already_ served from Vercel's edge CDN, so Blob would buy no speed or availability, while adding
real cost — a new dependency, an env var to manage, a CSP `img-src` change to a
**security-sensitive** file (`config/headers.js`), and it would turn the above-the-fold Navbar
logo into a remote network fetch on every page load. None of that is a win for a single static
asset that already lives at the edge.

**Consequence for `apps/admin`:** when the admin app needs the logo, it copies the six PNGs into
its own `public/assets/img/` once (a one-time `cp`, not a maintained sync script or build step —
consistent with the "raw source, no build" posture of §2) and imports the same `LOGO` path
constants from `@idcr/ui`. The constants are the single source of truth for the _paths_; each app
is the source of truth for the _bytes_ it serves.

## 6. Vercel + pnpm workspace — verified, not assumed

The deploy risk for this ticket was whether Vercel — which builds this repo with **Root Directory
= `apps/web`** and `buildCommand: next build` — can resolve a `workspace:*` dependency that lives
outside that root directory (`packages/*`). This was **verified empirically** against a real
deployment's build log, not assumed:

```
Detected Turbo. Adjusting default settings...
Running "install" command: `pnpm install --frozen-lockfile`...
Scope: all N workspace projects
../.. prepare$ husky
```

`../.. prepare$ husky` proves Vercel's install step runs from the **workspace root**, one level
above the configured Root Directory, with every workspace project (now 4, up from 2 before this
ticket) in scope. So `workspace:*` deps **do** resolve on Vercel.

Two things are binding as a result:

1. **`pnpm-lock.yaml` is load-bearing on deploy, not just CI.** The install command is
   `pnpm install --frozen-lockfile` — a lockfile that's stale relative to `packages/*` or
   `apps/web/package.json` fails the **production deploy**, not merely a CI check. Every
   checkpoint that adds/changes a workspace dependency must commit the regenerated
   `pnpm-lock.yaml`.
2. **`prebuild`/`postbuild` lifecycle hooks never run on Vercel.** The Vercel build command
   invokes `next build` directly, bypassing pnpm's script runner entirely — and pnpm disables
   pre/post lifecycle scripts by default regardless. Never make a deploy depend on a `prebuild` or
   `postbuild` hook (this is part of why the logo strategy in §5 is a one-time copy at admin-setup
   time, not an automated pre-build copy step).

## 7. The tokens contract for `apps/admin`

`packages/ui/src/tokens.css` was moved out of `apps/web/src/app/globals.css` **verbatim, with no
value edits** — `@custom-variant dark`, the full `@theme inline { … }` block, the `:root { … }` /
`.dark { … }` HSL variable blocks, and the `@keyframes highlight` rule. `globals.css` now just
imports it:

```css
@import "tailwindcss";
@import "@idcr/ui/tokens.css";
```

Because the move was verbatim, **two entries in the token file are coupled to `apps/web`
specifically**, and any future consumer (`apps/admin`) must satisfy them before the tokens will
render correctly:

- `--font-sans` / `--font-serif` reference `--font-outfit` / `--font-playfair` — those CSS custom
  properties are injected by `next/font` in `apps/web`'s root layout, not defined in
  `tokens.css` itself. A consumer that doesn't load the same fonts via `next/font` (or otherwise
  define those two variables) falls back to the browser default font.
- `--background-image-community` is a **root-absolute** URL:
  `url("/assets/img/community_redentor_camp.jpeg")`. It resolves against whichever app's
  `public/` is serving the page — a consumer without that file at that exact path gets a missing
  background image, not an error.

Neither is fixed in this ticket — documenting the contract was the deliberate scope boundary (see
`tasks/specs/ICR-16-extract-config-ui-packages.md` §14, open question 1). `apps/admin` must either
define both `next/font` variables and ship that background image at the same path, or override the
two tokens after importing `@idcr/ui/tokens.css`.

## 8. Tailwind class scanning — deliberately not set up yet

`@idcr/ui` currently emits **zero** Tailwind class names — it exports a `cn()` string-merging
utility, a plain object of path constants, and a CSS token file with no `@apply`/utility classes
in it. Tailwind v4's automatic content scanning walks from `apps/web` outward; `packages/ui` sits
outside that walk and holds no class names to find, so no `@source` directive is needed today.

**If `@idcr/ui` ever ships components that use Tailwind utility classes**, `apps/web/src/app/globals.css`
will need an explicit source directive so Tailwind's scanner reaches into the package:

```css
@source "../../../packages/ui";
```

This is intentionally **not** added now. Adding a scan path with nothing yet to scan would be
exactly the kind of dead configuration this ticket deleted in §4 — add it in the same change that
first adds a class-name-bearing component to `@idcr/ui`.

## See also

- `tasks/specs/ICR-16-extract-config-ui-packages.md` — the full decision record (locked design
  decisions, edge cases, checkpoint-by-checkpoint verification) this doc summarizes.
- `docs/architecture/contributing.md` — branch/commit/PR conventions and the worktree flow that
  apply equally to package changes.
