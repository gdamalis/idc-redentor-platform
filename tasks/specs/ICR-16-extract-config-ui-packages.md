# ICR-16 — M1a Monorepo: extract `@idcr/config` + `@idcr/ui`

**Jira:** [ICR-16](https://divinelab.atlassian.net/browse/ICR-16) · Story · Epic **ICR-13 Admin · Platform Foundation** · Component **Ministry Admin Panel**
**Parent spec:** `tasks/specs/monorepo-migration.md` §12 **CP3**
**QA depth:** standard · **QA type:** ui
**Commit type:** `refactor` (see §11)

---

## 1. Goal

Extract the two shared workspace packages the admin app will need, and consume them in `apps/web` to
prove the wiring works. This is a **structural refactor with zero user-visible change** — the
acceptance bar is literally _"no visual diff on a preview deploy"_.

Per the parent spec: **prove the wiring, don't rewrite.**

## 2. Dependencies check

| Dependency                                              | State                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| pnpm + Turborepo workspace                              | ✅ live (`pnpm-workspace.yaml` already globs `packages/*`)                          |
| `apps/web` exists (site moved)                          | ✅ done (PR #50)                                                                    |
| `turbo.json` tasks (`build`/`lint`/`type-check`/`test`) | ✅ present; Turbo auto-discovers new `packages/*` — **no `turbo.json` edit needed** |
| Vercel resolves `workspace:*` deps                      | ✅ **verified empirically**, not assumed — see §3                                   |

### 3. Vercel: the deploy risk, closed

The one real deployment risk was whether Vercel — building with **Root Directory = `apps/web`** and
`buildCommand: "next build"` — can resolve a `workspace:*` dependency on `packages/*`. The build log
of the latest deployment (`dpl_HA9z94WENL5ytvTWt7NTWQCis1ii`) answers it:

```
Detected Turbo. Adjusting default settings...
Running "install" command: `pnpm install --frozen-lockfile`...
Scope: all 2 workspace projects
../.. prepare$ husky
```

Vercel installs from the **workspace root** with all projects in scope (`../..` proves the repo root
is present). Workspace deps will resolve. Two consequences that are **binding on this ticket**:

1. **`pnpm-lock.yaml` MUST be committed** with the new packages. The install is
   `--frozen-lockfile`; a stale lockfile fails the deploy, not just CI.
2. `Scope: all 2 workspace projects` becomes `4` after this change — a useful smoke signal in the
   preview build log.

**No change to `apps/web/vercel.json`.** The build command stays `next build`.

> ⚠️ **`prebuild`/`postbuild` lifecycle hooks do not run on Vercel** — the build command invokes
> `next build` directly, bypassing pnpm's script runner (and pnpm disables pre/post scripts by
> default anyway). Never rely on one for anything a deploy needs. This is why the logo is **not**
> handled by a copy step (§6.3).

---

## 4. Locked design decisions

| #   | Decision                    | Choice                                                                       | Rationale                                                                                                                                                              |
| --- | --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `@idcr/ui` consumption      | **Raw source + `transpilePackages`**                                         | No build step, no `dist/`, nothing for Turbo to sequence. Standard Next monorepo pattern for a private in-repo package.                                                |
| 2   | Brand-token source of truth | **Move to `@idcr/ui/tokens.css`**                                            | Satisfies AC1; the tokens are the shared brand surface `apps/admin` must not fork.                                                                                     |
| 3   | Logo assets                 | **PNGs stay in `apps/web/public/`; `@idcr/ui` exports typed path constants** | OG cards + email templates require absolute URLs to a real file, so a copy lives in `public/` under every design. No Blob, no sync script, no new dep, no deploy risk. |
| 4   | Dead `tailwind.config.ts`   | **Delete it + the unused `@tailwindcss/typography` dep**                     | Provably inert: Tailwind v4 is CSS-first here and never loads it (no `@config` directive), and the app uses **zero** `prose` classes. Deleting cannot change a pixel.  |

**Consequence of #4:** `packages/config` ships **no Tailwind preset**. Under Tailwind v4 CSS-first,
the shared "preset" _is_ `@idcr/ui/tokens.css`. Shipping a JS preset nobody loads would just
recreate the dead config we're deleting.

**Rejected:** Vercel Blob for the logos (`public/` is _already_ on Vercel's edge CDN, so it buys no
speed or availability; it adds cost, an env var, a CSP `img-src` change to a security-sensitive
file, and turns the above-the-fold Navbar logo into a remote fetch). A separate ticket if ever
wanted — never inside a build-config refactor.

---

## 5. Package layout

```
packages/
├── config/                     # "@idcr/config" — no build step, no deps
│   ├── package.json
│   ├── tsconfig.base.json
│   ├── eslint.base.mjs
│   ├── postcss.base.mjs
│   └── prettier.base.json
└── ui/                         # "@idcr/ui" — raw TS/CSS, transpiled by the consumer
    ├── package.json
    └── src/
        ├── index.ts            # export * from "./cn"; export * from "./logo";
        ├── cn.ts               # moved from apps/web/src/utils/cn.ts
        ├── cn.test.ts          # moved with it
        ├── logo.ts             # NEW — typed LOGO path constants
        └── tokens.css          # moved from apps/web/src/app/globals.css
```

Both packages are `"private": true` and **unversioned consumers of the workspace protocol**
(`"@idcr/ui": "workspace:*"`). The release stream stays on the root package (`apps/web` keeps its
static `1.25.1`).

### 5.1 `packages/ui/package.json`

```json
{
  "name": "@idcr/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.1"
  },
  "devDependencies": {
    "@idcr/config": "workspace:*",
    "typescript": "^5"
  },
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Pin `clsx` / `tailwind-merge` to the versions currently in `apps/web/package.json` — do not bump
them in this ticket. `apps/web` keeps its own copies (pnpm dedupes); removing them from the app is
out of scope.

---

## 6. Requirements

### 6.1 `packages/config` — shared base configs

1. **`tsconfig.base.json`** — carries the _shareable_ compiler options only:
   `target`, `lib`, `allowJs`, `skipLibCheck`, `strict`, `noEmit`, `esModuleInterop`, `module`,
   `moduleResolution: "bundler"`, `resolveJsonModule`, `isolatedModules`, `jsx`, `incremental`.
2. **`apps/web/tsconfig.json`** becomes `{"extends": "@idcr/config/tsconfig.base.json", ...}` and
   **retains** `plugins: [{"name":"next"}]`, `paths`, `include`, `exclude`.
   > 🔒 **`paths` MUST stay in the app's own tsconfig.** There is no `baseUrl`; relative `paths` in
   > an extending config resolve against **the file that declares them**. Moving `paths` into the
   > base would silently repoint `@src/*` at `packages/config/src/*` and break
   > `vite-tsconfig-paths` (which `vitest.config.ts` depends on).
3. **`eslint.base.mjs`** — the shared flat-config array (`eslint-config-next/core-web-vitals` +
   `/typescript`, the `.js`/`.mjs` `no-require-imports: off` override, the
   `@typescript-eslint/no-explicit-any: "warn"` override). `apps/web/eslint.config.mjs` spreads it
   and keeps its **app-specific `ignores`** (`scripts/**/*.js`, `.next/**`, `trial-idcr`, …).
4. **`postcss.base.mjs`** — the `@tailwindcss/postcss` plugin object; `apps/web/postcss.config.mjs`
   re-exports it.
5. **`prettier.base.json`** — the current four keys (`semi`, `singleQuote`, `trailingComma`,
   `printWidth`). Root `.prettierrc.json` becomes `"@idcr/config/prettier.base.json"` (Prettier
   supports a bare string as an `extends`-equivalent via the `"prettier"` key / a config that
   requires it — use the documented form; verify `pnpm format:check` still passes).
6. **Delete** `apps/web/tailwind.config.ts` and drop `@tailwindcss/typography` from
   `apps/web/package.json`.

### 6.2 `packages/ui` — `cn`

7. Move `apps/web/src/utils/cn.ts` → `packages/ui/src/cn.ts` **verbatim** (same implementation,
   same named export). Move `cn.test.ts` with it. **Delete** `apps/web/src/utils/cn.ts`.
8. Update **all 15 importers** from `"@src/utils/cn"` → `"@idcr/ui"`. The specifier is uniform
   across every call site (zero relative imports), so this is a mechanical replace:
   `card.tsx`, `textarea.tsx`, `form.tsx`, `toast.tsx`, `IconCard.tsx`, `Divider.tsx`, `label.tsx`,
   `Typography.tsx`, `Button.tsx`, `input.tsx`, `SermonCard.tsx`, `PdfDownloadButton.tsx`,
   `BlogSection.tsx`, `Navbar.tsx`, `LanguageSwitcher.tsx`.
9. `apps/web/package.json` gains `"@idcr/ui": "workspace:*"` and `"@idcr/config": "workspace:*"`.
10. `apps/web/next.config.ts` gains `transpilePackages: ["@idcr/ui"]`.

### 6.3 `packages/ui` — tokens + logo

11. **Tokens — a verbatim move.** Cut from `apps/web/src/app/globals.css` into
    `packages/ui/src/tokens.css`, **byte-for-byte, no value edits**: the `@custom-variant dark`
    line, the whole `@theme inline { … }` block, the `:root { … }` and `.dark { … }` HSL blocks, and
    the `@keyframes highlight` rule (it backs the `--animate-highlight` token).

    `globals.css` is left as:

    ```css
    @import "tailwindcss";
    @import "@idcr/ui/tokens.css";

    @layer base {
      /* unchanged */
    }
    ```

    > Order matters: `@import` rules must precede all other rules. Tailwind v4 inlines `@import`
    > (including bare package specifiers) _before_ processing, so `@theme` / `@custom-variant`
    > inside the imported file work normally.
    >
    > Two entries in the moved block are app-coupled and stay as-is (verbatim move ⇒ zero diff):
    > `--font-sans`/`--font-serif` reference `--font-outfit`/`--font-playfair`, injected by
    > `next/font` in the app layout; and `--background-image-community` is a root-absolute
    > `url('/assets/img/…')`. Both are the **contract `apps/admin` must satisfy** when it adopts the
    > tokens — document, don't refactor.

12. **`packages/ui/src/logo.ts`** — NEW:

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

    The PNG files themselves **do not move**.

13. Replace the hardcoded logo strings with `LOGO.*` at these 7 sites:

    | File                                      | Line  | Current                                         |
    | ----------------------------------------- | ----- | ----------------------------------------------- |
    | `src/app/not-found.tsx`                   | 25    | `/assets/img/redentor_logo_100.png`             |
    | `src/app/not-found.tsx`                   | 34    | `/assets/img/redentor_logo_light_100.png`       |
    | `src/components/shared/navbar/Navbar.tsx` | 56–57 | `redentor_logo.png` / `redentor_logo_light.png` |
    | `src/templates/contact-form.template.ts`  | 79    | `{{baseUrl}}/assets/img/redentor_logo.png`      |
    | `src/templates/broadcast.template.ts`     | 42    | `{{baseUrl}}/assets/img/redentor_logo.png`      |
    | `lib/metadata.ts`                         | 164   | `` `${baseUrl}/assets/img/redentor_logo.png` `` |
    | `lib/sermonMetadata.ts`                   | 120   | `` `${baseUrl}/assets/img/redentor_logo.png` `` |

    The email templates are HTML **strings** with a `{{baseUrl}}` placeholder — interpolate the
    constant into the template string; do **not** restructure the templating.
    `src/utils/predica/assets/pdfAssets.ts` is **out of scope** (it embeds base64, not a URL; the
    only reference is a comment).

---

## 7. Data model / API changes

**None.** No Contentful content-model change, no MongoDB change, no API route touched, no Zod
schema. This ticket adds no runtime behavior.

---

## 8. Files

### New

| File                                 | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `packages/config/package.json`       | `@idcr/config` manifest                     |
| `packages/config/tsconfig.base.json` | Shared TS compiler options                  |
| `packages/config/eslint.base.mjs`    | Shared flat ESLint config                   |
| `packages/config/postcss.base.mjs`   | Shared PostCSS (Tailwind v4) plugin         |
| `packages/config/prettier.base.json` | Shared Prettier options                     |
| `packages/ui/package.json`           | `@idcr/ui` manifest (raw-source `exports`)  |
| `packages/ui/src/index.ts`           | Barrel: `cn` + `LOGO`                       |
| `packages/ui/src/cn.ts`              | Moved from `apps/web/src/utils/cn.ts`       |
| `packages/ui/src/cn.test.ts`         | Moved with it                               |
| `packages/ui/src/logo.ts`            | Typed logo path constants                   |
| `packages/ui/src/tokens.css`         | Brand tokens moved out of `globals.css`     |
| `packages/ui/tsconfig.json`          | Extends `@idcr/config/tsconfig.base.json`   |
| `packages/ui/vitest.config.ts`       | So `cn.test.ts` runs under `turbo run test` |

### Modified

| File                           | Change                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| `apps/web/tsconfig.json`       | `extends` the base; keeps `paths`/`plugins`/`include`/`exclude`         |
| `apps/web/eslint.config.mjs`   | Spreads `@idcr/config/eslint.base.mjs`; keeps app `ignores`             |
| `apps/web/postcss.config.mjs`  | Re-exports `@idcr/config/postcss.base.mjs`                              |
| `apps/web/next.config.ts`      | `+ transpilePackages: ["@idcr/ui"]`                                     |
| `apps/web/package.json`        | `+ @idcr/ui`, `+ @idcr/config` (workspace); `− @tailwindcss/typography` |
| `apps/web/src/app/globals.css` | Tokens replaced by `@import "@idcr/ui/tokens.css"`                      |
| 15 × `cn` importers            | `"@src/utils/cn"` → `"@idcr/ui"`                                        |
| 7 × logo call sites            | Hardcoded string → `LOGO.*`                                             |
| `.prettierrc.json` (root)      | Extends `@idcr/config/prettier.base.json`                               |
| `pnpm-lock.yaml`               | **Must be committed** (Vercel runs `--frozen-lockfile`)                 |

### Deleted

| File                            | Why                                                   |
| ------------------------------- | ----------------------------------------------------- |
| `apps/web/src/utils/cn.ts`      | Moved to `@idcr/ui`                                   |
| `apps/web/src/utils/cn.test.ts` | Moved to `@idcr/ui`                                   |
| `apps/web/tailwind.config.ts`   | Dead: never loaded (v4 CSS-first), zero `prose` usage |

---

## 9. Edge cases & risks

1. **Vitest resolving a raw-TS workspace package.** Vite does not transform `node_modules` by
   default; pnpm links `@idcr/ui` as a **symlink** to a real path outside `node_modules`, so Vite
   follows it and transforms normally. If any test fails to resolve `@idcr/ui`, add
   `test.server.deps.inline: ["@idcr/ui"]` to `apps/web/vitest.config.ts` — do **not** switch the
   package to a compiled build.
2. **TS resolving `@idcr/ui` types.** `moduleResolution: "bundler"` reads the `exports` map and
   resolves straight to `./src/index.ts`. No `types` field or `dist` needed.
3. **`@theme` inside an imported CSS file.** Supported (Tailwind inlines imports first). If the
   tokens fail to apply, the symptom is catastrophic and obvious (unstyled page), not subtle —
   caught instantly by the preview.
4. **Tailwind class scanning.** Not a concern today: `@idcr/ui` ships no components and emits no
   class names. When it eventually does, `globals.css` will need `@source "../../../packages/ui"`.
   Note it in the doc; don't add it now (it would be dead config — the very thing §4.4 deletes).
5. **`--frozen-lockfile` on Vercel.** Forgetting the lockfile fails the _deploy_, not just CI. It
   is an explicit checkpoint verification step.
6. **The 7 logo strings must not change value.** `lib/metadata.test.ts:125` and
   `lib/sermonMetadata.test.ts:218` already assert the exact URLs — those existing tests are the
   guard that the constant swap is behavior-preserving. Do not weaken them.
7. **Prettier root config.** `pnpm format:check` runs from the repo root over the whole workspace;
   confirm it still passes after the `extends` indirection (a broken Prettier config fails the husky
   pre-commit hook, blocking every later commit).

## 10. i18n

**None.** No user-facing string is added, removed, or changed. `public/locales/{es-AR,en-US}.json`
are untouched.

---

## 11. Commit type — `refactor`, not `feat`

The harness maps Story → `feat`, but this ticket ships **zero user-facing change** by definition
(its AC is "no visual diff"). A `feat` commit would make `semantic-release` cut a spurious **minor
version bump** for an internal restructure. Per the ICR-46 precedent (_"use the honest commit type
so semantic-release does not cut a spurious version bump — the branch prefix need not match the
commit type"_), all commits and the PR title use **`refactor(ICR-16): …`**. The branch stays
`feat/ICR-16-extract-config-ui-packages`. `refactor` is in the allowed commitlint types.

## 12. Testing strategy

**Unit** — the moved `cn.test.ts` must run _from its new home_ (verify it actually executes: a test
file outside `vitest.config.ts`'s `include` globs is **silently skipped**, per the ICR-21 lesson —
check the file count in the vitest output, don't trust a green run). The existing metadata tests
cover the logo constants. No new test is warranted for a pure move: a config-extraction has no new
logic to assert, and `type-check` + `lint` + `build` are the real proof.

**Verification stack** (every checkpoint): `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`
— run from the **root** so Turbo exercises all four workspace projects.

**Preview QA (`ui`, standard)** — the AC is _no visual diff_, so QA is a visual walk of the preview
deploy in **both locales**: home, community (uses `--background-image-community`), a blog post, a
sermon page (`PdfDownloadButton`, `SermonCard`), 404 (`not-found` logos), and the Navbar logo in
light **and** dark mode (the `.dark` token block is the highest-risk part of the token move).
Also confirm the preview build log shows `Scope: all 4 workspace projects`.

## 13. Implementation checkpoints

### CP1 — `packages/config` + drop the dead Tailwind config

- **Files:** `packages/config/*` (new), `apps/web/tsconfig.json`, `apps/web/eslint.config.mjs`,
  `apps/web/postcss.config.mjs`, `.prettierrc.json`, `apps/web/package.json`,
  `apps/web/tailwind.config.ts` (delete), `pnpm-lock.yaml`.
- **Verify:** `pnpm install` → `pnpm type-check && pnpm lint && pnpm test && pnpm build` green;
  `pnpm format:check` green; `git status` shows `pnpm-lock.yaml` staged.
- **Commit:** `refactor(ICR-16): extract @idcr/config and consume it in apps/web`

### CP2 — `packages/ui` + move `cn`

- **Files:** `packages/ui/*` (new), `apps/web/src/utils/cn.ts` + `cn.test.ts` (delete),
  15 importers, `apps/web/package.json`, `apps/web/next.config.ts`, `pnpm-lock.yaml`.
- **Verify:** full stack green; **`cn.test.ts` visibly executes** in the vitest output from its new
  package (3 tests); `grep -r "@src/utils/cn" apps/web` returns nothing.
- **Commit:** `refactor(ICR-16): move cn into @idcr/ui and consume it in apps/web`

### CP3 — tokens + logo constants

- **Files:** `packages/ui/src/tokens.css` (new), `packages/ui/src/logo.ts` (new),
  `apps/web/src/app/globals.css`, the 7 logo call sites.
- **Verify:** full stack green; `metadata.test.ts` + `sermonMetadata.test.ts` still pass unchanged
  (logo URLs identical); `git diff` of the token move shows a **pure relocation** (no value edits);
  `pnpm dev` renders the home page styled in light and dark.
- **Commit:** `refactor(ICR-16): move brand tokens and logo paths into @idcr/ui`

## 14. Open questions

1. **`apps/admin` token adoption** — the moved tokens depend on `--font-outfit` / `--font-playfair`
   (injected by `next/font` in the web layout) and a root-absolute community background image. When
   admin adopts `@idcr/ui/tokens.css` it must define those fonts or override the two tokens.
   Documented as the package's contract; no action in this ticket.
2. **Deduping `clsx` / `tailwind-merge`** — `apps/web` keeps its own copies alongside `@idcr/ui`'s.
   pnpm dedupes on disk; removing them from the app is a follow-up, not this ticket.
