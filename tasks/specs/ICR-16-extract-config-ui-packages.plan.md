# ICR-16 — Extract `@idcr/config` + `@idcr/ui` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `tasks/specs/ICR-16-extract-config-ui-packages.md` (read it first — the locked decisions
and the Vercel findings are there).

**Goal:** Extract two shared workspace packages (`@idcr/config`, `@idcr/ui`) out of `apps/web` and
consume them there, with **zero user-visible change**.

**Architecture:** `packages/config` ships base tsconfig/eslint/postcss/prettier that `apps/web`
extends. `packages/ui` ships raw TS/CSS (`cn`, `LOGO` path constants, `tokens.css`) consumed via
`transpilePackages`. No build step, no `dist/`, no new runtime dependency.

**Tech Stack:** pnpm 10.33.0 workspace · Turborepo 2 · Next.js 16 · Tailwind CSS **v4 (CSS-first)** ·
TypeScript 5.9 · ESLint 9 (flat config) · Prettier 3.7 · Vitest 4.

**Worktree:** `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-16`
**Branch:** `feat/ICR-16-extract-config-ui-packages`

---

## Global Constraints

These apply to **every** task. Copied verbatim from the spec.

- **Commit type is `refactor`**, never `feat` — `refactor(ICR-16): …`. A `feat` would make
  semantic-release cut a spurious minor bump for a change with no user-visible effect.
- **`pnpm-lock.yaml` MUST be committed** in any task that touches a `package.json`. Vercel installs
  with `--frozen-lockfile`; a stale lockfile fails the **deploy**, not just CI.
- **Never move `paths` out of `apps/web/tsconfig.json`.** There is no `baseUrl`, so relative `paths`
  resolve against the file that _declares_ them. Moving them into the shared base would silently
  repoint `@src/*` at `packages/config/src/*` and break `vite-tsconfig-paths` (which
  `vitest.config.ts` depends on).
- **Do not change any logo URL string's value.** `lib/metadata.test.ts:125` and
  `lib/sermonMetadata.test.ts:218` assert them exactly; those tests are the regression guard.
- **Do not bump any dependency version.** Reuse the exact versions already in `apps/web`:
  `clsx@^2.1.1`, `tailwind-merge@^3.0.2`, `eslint@^9.39.1`, `eslint-config-next@^16.0.1`,
  `typescript@^5.9.3`, `vitest@^4.1.9`, `@tailwindcss/postcss@^4.1.16`.
- **Do not touch `apps/web/vercel.json`.** The build command stays `next build`.
- **`prebuild`/`postbuild` lifecycle hooks do not run on Vercel.** Never rely on one.
- **Verification stack** runs from the **repo root** (so Turbo covers all workspace projects):
  `pnpm type-check && pnpm lint && pnpm test && pnpm build`.

### A note on TDD for this plan

This is a **pure structural refactor**: no new behavior, therefore no new red test to write. The
existing 438-test suite plus `type-check`, `lint`, and `build` **are** the regression harness — they
must stay green at every step, and a failure means the move broke something. The one genuinely new
artifact (`LOGO`) is already covered by the two existing metadata tests that assert the exact URLs.
Do not invent tests to satisfy a TDD ritual (the spec's §12 explicitly rules that out); do verify
that the moved test still **executes**.

---

## Task 1 (CP1): Extract `packages/config`, delete the dead Tailwind config

**Files:**

- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/config/eslint.base.mjs`
- Create: `packages/config/postcss.base.mjs`
- Create: `packages/config/prettier.base.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/eslint.config.mjs`
- Modify: `apps/web/postcss.config.mjs`
- Modify: `apps/web/package.json`
- Modify: `.prettierrc.json` (repo root)
- Modify: `package.json` (repo root — needs `@idcr/config` to resolve the Prettier config)
- Delete: `apps/web/tailwind.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: package `@idcr/config` with subpath exports `./tsconfig.base.json`,
  `./eslint.base.mjs`, `./postcss.base.mjs`, `./prettier.base.json`.
- Consumes: nothing.

- [ ] **Step 1: Create `packages/config/package.json`**

`eslint-config-next` must be a **dependency of this package**, because `eslint.base.mjs` resolves it
via `createRequire(import.meta.url)` — i.e. relative to _this_ file. Under pnpm's strict
`node_modules`, it will not resolve from `apps/web`.

```json
{
  "name": "@idcr/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint.base.mjs": "./eslint.base.mjs",
    "./postcss.base.mjs": "./postcss.base.mjs",
    "./prettier.base.json": "./prettier.base.json"
  },
  "dependencies": {
    "eslint-config-next": "^16.0.1"
  }
}
```

- [ ] **Step 2: Create `packages/config/tsconfig.base.json`**

Shareable compiler options **only**. No `paths`, no `plugins`, no `include`/`exclude` — those are
app-specific and stay in `apps/web/tsconfig.json` (see Global Constraints).

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true
  }
}
```

- [ ] **Step 3: Create `packages/config/eslint.base.mjs`**

This is the current `apps/web/eslint.config.mjs` **minus its app-specific `ignores` block**, exported
as an array to spread.

```js
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Next.js ESLint configs are CommonJS modules.
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

/** Shared flat-config base for every @idcr app/package. */
export const eslintBase = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Allow require() in JavaScript config files
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintBase;
```

- [ ] **Step 4: Create `packages/config/postcss.base.mjs`**

Keep the plugin as a **string key**, not an imported instance. Next resolves the plugin name relative
to the _app_ that loads the config, and `@tailwindcss/postcss` is already a dependency of `apps/web`
— so nothing new needs installing, and the resolution path is unchanged from today.

```js
/** @type {import('postcss-load-config').Config} */
export const postcssBase = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default postcssBase;
```

- [ ] **Step 5: Create `packages/config/prettier.base.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80
}
```

- [ ] **Step 6: Point `apps/web/tsconfig.json` at the base**

Keep `plugins`, `paths`, `include`, `exclude`. Delete the options now inherited.

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
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", "trial-idcr"]
}
```

- [ ] **Step 7: Point `apps/web/eslint.config.mjs` at the base**

The app keeps **only** its `ignores`.

```js
import { eslintBase } from "@idcr/config/eslint.base.mjs";

const eslintConfig = [
  ...eslintBase,
  {
    ignores: [
      "scripts/**/*.js",
      "src/**/__generated",
      ".next/**",
      "node_modules/**",
      ".claude/**",
      "coverage/**",
    ],
  },
];

export default eslintConfig;
```

- [ ] **Step 8: Point `apps/web/postcss.config.mjs` at the base**

```js
export { default } from "@idcr/config/postcss.base.mjs";
```

- [ ] **Step 9: Add the workspace dep to `apps/web/package.json`, drop the dead typography dep**

In `dependencies`, **remove** `"@tailwindcss/typography": "^0.5.19"`.
In `devDependencies`, **add** `"@idcr/config": "workspace:*"`.

- [ ] **Step 10: Delete the dead Tailwind config**

```bash
git rm apps/web/tailwind.config.ts
```

It is provably inert: Tailwind v4 is CSS-first here and never loads it (there is no `@config`
directive in any CSS file), and the app uses zero `prose` classes — so the typography plugin it
registers has no effect. Deleting it cannot change a pixel.

- [ ] **Step 11: Wire the root Prettier config**

Prettier 3.7 supports a shared config referenced by a **bare string** in `.prettierrc.json`. Replace
the whole root `.prettierrc.json` with:

```json
"@idcr/config/prettier.base.json"
```

For that specifier to resolve from the repo root, add to the **root** `package.json`
`devDependencies`: `"@idcr/config": "workspace:*"`.

> **Fallback (only if Step 13's `format:check` fails to resolve the config):** delete
> `.prettierrc.json` and create root `prettier.config.mjs`:
>
> ```js
> import base from "@idcr/config/prettier.base.json" with { type: "json" };
> export default base;
> ```
>
> Do not silently revert to a duplicated inline config — the point of the task is that there is one
> source of truth.

- [ ] **Step 12: Install**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-16
pnpm install
```

Expected: pnpm reports **3** workspace projects (root + `@idcr/web` + `@idcr/config`) and writes
`pnpm-lock.yaml`. If `pnpm-lock.yaml` is unchanged, something is wrong — stop and investigate.

- [ ] **Step 13: Run the full verification stack from the root**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build && pnpm format:check
```

Expected: all green. `pnpm test` still reports **438 passed** — this task moves no test.
`format:check` is the check that Step 11 resolved correctly.

- [ ] **Step 14: Commit**

```bash
git add packages/config apps/web/tsconfig.json apps/web/eslint.config.mjs \
        apps/web/postcss.config.mjs apps/web/package.json .prettierrc.json \
        package.json pnpm-lock.yaml
git add -u apps/web/tailwind.config.ts
git commit -m "refactor(ICR-16): extract @idcr/config and consume it in apps/web"
```

---

## Task 2 (CP2): Create `packages/ui`, move `cn` into it

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/cn.ts` (moved)
- Create: `packages/ui/src/cn.test.ts` (moved)
- Delete: `apps/web/src/utils/cn.ts`, `apps/web/src/utils/cn.test.ts`
- Modify: the 15 importers listed in Step 5
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `@idcr/config` (Task 1) for the base tsconfig.
- Produces: `import { cn } from "@idcr/ui"` — `cn(...inputs: ClassValue[]): string`.

- [ ] **Step 1: Create `packages/ui/package.json`**

Raw-source `exports` — no build step, no `dist/`. Versions match `apps/web` exactly (Global
Constraints).

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
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "@idcr/config": "workspace:*",
    "typescript": "^5.9.3",
    "vitest": "^4.1.9"
  }
}
```

> The `"./tokens.css"` export intentionally points at a file that does not exist until Task 3. It is
> not imported by anything before then, so nothing breaks. Do **not** create a placeholder file.

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@idcr/config/tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `packages/ui/vitest.config.ts`**

Without this, `turbo run test` has no `test` task for the package and `cn.test.ts` would be
**silently skipped** (the ICR-21 lesson).

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Move `cn` verbatim**

`packages/ui/src/cn.ts` — identical to the current `apps/web/src/utils/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines classNames and merges tailwind classes efficiently
 * @example cn("text-red-500", isActive && "bg-primary")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`packages/ui/src/index.ts`:

```ts
export { cn } from "./cn";
```

Move the test file with it:

```bash
git mv apps/web/src/utils/cn.test.ts packages/ui/src/cn.test.ts
git rm apps/web/src/utils/cn.ts
```

Then fix the import at the top of `packages/ui/src/cn.test.ts` to `from "./cn"` (it currently
imports from `@src/utils/cn`, an alias that does not exist in this package).

- [ ] **Step 5: Repoint all 15 importers**

Replace the import specifier `"@src/utils/cn"` → `"@idcr/ui"` in each. The specifier is uniform, so
this is mechanical:

```
apps/web/src/components/features/blog-section/BlogSection.tsx
apps/web/src/components/features/sermon-details/PdfDownloadButton.tsx
apps/web/src/components/features/sermon-section/SermonCard.tsx
apps/web/src/components/shared/language-switcher/LanguageSwitcher.tsx
apps/web/src/components/shared/navbar/Navbar.tsx
apps/web/src/components/ui/button/Button.tsx
apps/web/src/components/ui/card.tsx
apps/web/src/components/ui/divider/Divider.tsx
apps/web/src/components/ui/form.tsx
apps/web/src/components/ui/icon-card/IconCard.tsx
apps/web/src/components/ui/input.tsx
apps/web/src/components/ui/label.tsx
apps/web/src/components/ui/textarea.tsx
apps/web/src/components/ui/toast.tsx
apps/web/src/components/ui/typography/Typography.tsx
```

Verify none are left:

```bash
grep -r "@src/utils/cn" apps/web && echo "LEFTOVERS — fix them" || echo "clean"
```

- [ ] **Step 6: Wire `apps/web` to the package**

`apps/web/package.json` → `dependencies`: add `"@idcr/ui": "workspace:*"`.

`apps/web/next.config.ts` → add `transpilePackages` to the `nextConfig` object (keep everything else
byte-identical, including the existing `serverExternalPackages` comment block):

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@idcr/ui"],
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
    "@playwright/test",
  ],
  // …unchanged…
};
```

- [ ] **Step 7: Install + verify**

```bash
pnpm install
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Expected: pnpm reports **4** workspace projects. `pnpm test` output must show **`@idcr/ui`'s
`cn.test.ts` executing (3 tests)** in addition to `@idcr/web`'s suite — total still **438 passed**,
now split across two projects. **Look at the file list, not just the green check** — a test file
outside its config's `include` globs is skipped silently.

> **If `@idcr/web`'s vitest cannot resolve `@idcr/ui`** (a raw-TS workspace package), add to
> `apps/web/vitest.config.ts`:
>
> ```ts
> test: { server: { deps: { inline: ["@idcr/ui"] } }, /* …existing… */ }
> ```
>
> Do **not** switch `@idcr/ui` to a compiled build — that is an explicitly rejected design (spec §4).

- [ ] **Step 8: Commit**

```bash
git add packages/ui apps/web pnpm-lock.yaml
git commit -m "refactor(ICR-16): move cn into @idcr/ui and consume it in apps/web"
```

---

## Task 3 (CP3): Move brand tokens + logo paths into `@idcr/ui`

**Files:**

- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/logo.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: 6 files / 7 call sites (Step 4)

**Interfaces:**

- Consumes: `@idcr/ui` (Task 2).
- Produces: `import { LOGO } from "@idcr/ui"` and `@import "@idcr/ui/tokens.css"` in CSS.

- [ ] **Step 1: Move the tokens — a byte-for-byte relocation**

Cut these from `apps/web/src/app/globals.css` and paste them, **unmodified**, into
`packages/ui/src/tokens.css`:

1. the `@custom-variant dark (&:is(.dark *));` line,
2. the entire `@theme inline { … }` block,
3. the entire `:root { … }` block and the entire `.dark { … }` block (the HSL custom properties),
4. the `@keyframes highlight { … }` rule (it backs the `--animate-highlight` token).

**Do not edit a single value.** The `git diff` must read as a pure move. Two entries look
app-coupled and stay exactly as they are: `--font-sans`/`--font-serif` (which reference
`--font-outfit`/`--font-playfair`, injected by `next/font` in the app layout) and
`--background-image-community` (a root-absolute `url('/assets/img/…')`, which still resolves at
runtime). They are the contract `apps/admin` will have to satisfy — documented, not refactored.

- [ ] **Step 2: Reduce `globals.css` to imports + the base layer**

`@import` rules must precede all other rules. Tailwind v4 inlines `@import` (including bare package
specifiers) _before_ processing, so `@theme` and `@custom-variant` inside the imported file work
normally.

```css
@import "tailwindcss";
@import "@idcr/ui/tokens.css";

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply font-sans antialiased bg-background text-foreground;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-serif font-bold tracking-tight;
  }
}
```

- [ ] **Step 3: Create `packages/ui/src/logo.ts` and export it**

The PNG files **do not move**. These are the exact strings in use today — do not change a character.

```ts
/**
 * Church logo asset paths, served from each app's own `public/` directory.
 * The binaries live in `apps/web/public/assets/img/` — OG cards and email
 * templates need absolute URLs to a real file, so they are not bundled here.
 */
export const LOGO = {
  default: "/assets/img/redentor_logo.png",
  light: "/assets/img/redentor_logo_light.png",
  dark: "/assets/img/redentor_logo_dark.png",
  default100: "/assets/img/redentor_logo_100.png",
  light100: "/assets/img/redentor_logo_light_100.png",
  dark100: "/assets/img/redentor_logo_dark_100.png",
} as const;
```

`packages/ui/src/index.ts`:

```ts
export { cn } from "./cn";
export { LOGO } from "./logo";
```

- [ ] **Step 4: Replace the 7 hardcoded logo strings**

| File                                               | Line | Replace with                       |
| -------------------------------------------------- | ---- | ---------------------------------- |
| `apps/web/src/app/not-found.tsx`                   | 25   | `LOGO.default100`                  |
| `apps/web/src/app/not-found.tsx`                   | 34   | `LOGO.light100`                    |
| `apps/web/src/components/shared/navbar/Navbar.tsx` | 56   | `LOGO.default`                     |
| `apps/web/src/components/shared/navbar/Navbar.tsx` | 57   | `LOGO.light`                       |
| `apps/web/src/templates/contact-form.template.ts`  | 79   | `` `{{baseUrl}}${LOGO.default}` `` |
| `apps/web/src/templates/broadcast.template.ts`     | 42   | `` `{{baseUrl}}${LOGO.default}` `` |
| `apps/web/lib/metadata.ts`                         | 164  | `` `${baseUrl}${LOGO.default}` ``  |
| `apps/web/lib/sermonMetadata.ts`                   | 120  | `` `${baseUrl}${LOGO.default}` ``  |

The two email templates are HTML **strings** carrying a literal `{{baseUrl}}` placeholder that is
substituted later — interpolate the constant into the template string and **leave the `{{baseUrl}}`
placeholder mechanism exactly as it is**. Do not restructure the templating.

`apps/web/src/utils/predica/assets/pdfAssets.ts` is **out of scope** — it embeds the logo as base64
and only mentions the path in a comment.

- [ ] **Step 5: Verify**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Expected: green, **438 passed**. Critically, `lib/metadata.test.ts` and `lib/sermonMetadata.test.ts`
must pass **unmodified** — they assert the exact logo URLs and are the proof that the constant swap
changed no behavior. If you find yourself editing those tests, you have changed a URL: revert.

- [ ] **Step 6: Confirm the token move is a pure relocation**

```bash
git diff --stat apps/web/src/app/globals.css packages/ui/src/tokens.css
```

Sanity-check by eye that every `--*` line removed from `globals.css` reappears identically in
`tokens.css`. Then render it:

```bash
pnpm --filter @idcr/web dev
```

Open `http://localhost:3000/es-AR` and confirm the page is **styled** (a failed token import is
catastrophic and obvious — an unstyled page — not subtle). Toggle dark mode and confirm the `.dark`
palette applies. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add packages/ui apps/web
git commit -m "refactor(ICR-16): move brand tokens and logo paths into @idcr/ui"
```

---

## Done criteria

- [ ] `packages/config` + `packages/ui` exist; `apps/web` extends the base configs and imports `cn` + `LOGO` + `tokens.css` from `@idcr/ui` (**AC1**).
- [ ] Root `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check` all green
      (**AC2**).
- [ ] `pnpm-lock.yaml` committed; the preview build log shows `Scope: all 4 workspace projects`.
- [ ] No visual diff on the preview deploy, in **both locales**, light **and** dark (**AC3**) —
      verified in QA against the Vercel preview: home, community (uses
      `--background-image-community`), a blog post, a sermon page, 404 (both `not-found` logos), and
      the Navbar logo in each theme.
