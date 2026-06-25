# M1a — Monorepo Migration (in-place) — Implementation Spec

> **Status:** DRAFT v0.1 — for [@gdamalis](https://github.com/gdamalis) review before implementation.
> **Parent:** `tasks/specs/admin-platform-brief.md` (§4 migration plan, steps 1–2). This spec covers **only** the monorepo conversion of the existing public site; it does **not** scaffold `apps/admin` (that's the M1b admin-MVP spec).
> **Author:** PM/eng brainstorm (`/pm` → spec), 2026-06-23
> **Risk:** Touches the **live production deploy** of the public site. Highest-risk step in the whole program — sequence + verification below are mandatory, not optional.

---

## 1. Goal

Convert the existing, deployed `idc-redentor-website` repo **in place** into a pnpm + Turborepo monorepo, with the current public site moved intact to `apps/web` and shared tooling/brand extracted to `packages/*`, **with zero behavior or deploy regression for the public site.** Leave the repo in a state where `apps/admin` can be added next with no further restructuring.

### In scope

- pnpm workspace + Turborepo scaffolding at the repo root.
- Move the public site (today's root app) into `apps/web`, preserving git history (`git mv`).
- Repoint Vercel (Root Directory → `apps/web`), CI, and semantic-release so the public site builds, deploys, and releases exactly as before.
- Extract `packages/config` (shared tsconfig/eslint/prettier/tailwind/postcss presets) and `packages/ui` (brand tokens + logo + `cn`), and have `apps/web` consume them.
- Update the agent harness (`.claude/config.json` machine-read paths) and the top-level docs so `/work`, `/qa`, `/verify` still resolve the web app's files.

### Out of scope (explicitly)

- **Scaffolding `apps/admin`** — M1b. The workspace globs `apps/*`, so admin slots in later with no restructure.
- Auth, People, RBAC, calendar — all M1b+.
- **Multi-board/multi-tracker harness wiring** (the new "IDCR Ministry Admin Panel" board) — deferred to M1b; this spec only keeps the existing website board/harness working for `apps/web`.
- Cleaning up known-dead files (`codegen.ts`, `config/plugins.js`) — they **move as-is** with `apps/web`; cleanup is a separate ticket.
- Changing any product behavior, content, routes, env vars, or the CSP.

---

## 2. Locked decisions (recap from the brief)

- **[DECIDED]** Monorepo via **Turborepo + pnpm workspaces** (mirrors `divinelab/cancionero`).
- **[DECIDED]** **In-place** conversion — preserve git history, the Vercel project, and the harness.
- **[DECIDED]** Target layout: `apps/web` + `apps/admin` (later) + `packages/*`.

---

## 3. Dependencies check (must hold before starting)

| Requirement                                              | Status / note                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| pnpm available, lockfile present                         | ✅ `pnpm-lock.yaml` present; `.npmrc` sets `auto-install-peers=true`, `strict-peer-dependencies=false`, `shamefully-hoist=false`. |
| Node version pinned                                      | ✅ `.nvmrc` = `22.14.0`; CI uses `node-version: 22.x`.                                                                            |
| No existing workspace files to conflict                  | ✅ No `pnpm-workspace.yaml` / `turbo.json` today.                                                                                 |
| Vercel dashboard access                                  | ⚠️ **Required** — the Root Directory change is a dashboard setting, not a repo file. Confirm access before CP2.                   |
| Ability to run a Vercel **preview** deploy from a branch | ✅ Per-PR previews are enabled (per `docs`/config). This is the parity gate.                                                      |
| `turbo` dependency to add                                | New root devDependency `turbo` (latest 2.x).                                                                                      |

---

## 4. Current-state inventory (what the migration must preserve)

Captured from the repo on 2026-06-23:

**Package manifest** (`package.json`, name `idc-redentor-web`, v1.11.1, private). Scripts: `dev` (`next dev --turbopack`), `build` (`next build`), `start`, `lint` (`eslint .`), `type-check` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `e2e` (`playwright test --pass-with-no-tests`), `format`, `format:check`, `prepare` (`husky`). No `packageManager` field. `lint-staged` block present.

**Deploy** (`vercel.json`): `installCommand: pnpm install`, `buildCommand: pnpm run build` — both run from repo root today.

**Release** (`.releaserc.json`): semantic-release on `branches: ["main"]`, conventionalcommits preset, assets `["CHANGELOG.md", "package.json"]`, release-notes + changelog + npm(`npmPublish:false`) + git + github plugins. Single-package.

**CI** (`.github/workflows/`): `pr.yml` (PR-title semantic check + `eslint-tsc` job running `pnpm run lint` → `type-check` → `test`, pnpm v9, Node 22.x) and `release.yml` (on push to `main`: build with `NEXT_PUBLIC_BASE_URL` var, then `pnpm dlx semantic-release`, pnpm v9, Node 22.x).

**Tooling configs** (root): `tsconfig.json` (paths `@public/* @src/* @lib/* @icons/*`, excludes `node_modules`, `trial-idcr`), `eslint.config.mjs` (flat; extends `eslint-config-next` core-web-vitals + typescript; ignores `scripts/**`, `.next`, `node_modules`, `.claude`, `coverage`), `postcss.config.mjs` (`@tailwindcss/postcss`), `tailwind.config.ts` (content `./src/...`, typography plugin), `vitest.config.ts` (jsdom, `vite-tsconfig-paths`, include `src/**`+`lib/**`), `vitest.setup.ts`, `playwright.config.ts` (testDir `./e2e`, projects `e2ePublic/e2eBlog/apiForms/apiLikes`, baseURL from `BASE_URL`), `commitlint.config.mjs` (header-max 100, type-enum, scope-case off).

**Husky** (`.husky/`): `pre-commit` (env-file secret guard + staged secret-content scan + `pnpm exec lint-staged`), `commit-msg` (`pnpm exec commitlint --edit`). Installed via root `prepare: husky`.

**App source**: `src/` (`app/ components/ constants.ts hooks/ i18n/ lib/ proxy.ts service/ templates/ types/ utils/`), `lib/` (`contentful/ metadata.ts`), `public/`, `config/` (`headers.js` — imported by `next.config.ts`; `plugins.js` — **dead, not imported anywhere**), `e2e/`, `next.config.ts` (imports `./config/headers`, image `remotePatterns` for ctfassets + unsplash), `codegen.ts` (**unused** per docs).

**Harness/docs (root)**: `.claude/` (`agents/ commands/ config.json hooks/ scripts/ settings*.json`), `docs/`, `tasks/`, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `README.md`, `CHANGELOG.md`, `.editorconfig`, `.env.example`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `.vercelignore` (`.env`), `qa-env.json.example`, `.vscode/`.

> **Key insight:** CI (`pr.yml`/`release.yml`) and the harness commands (`config.json#commands`) call **root npm scripts** (`pnpm run build`, etc.). If the root scripts proxy to `turbo run …`, CI and the harness keep working with near-zero change. The sharp edges are **Vercel Root Directory** and **semantic-release path/asset**.

---

## 5. Target structure (after migration)

```
idc-redentor-website/                 # monorepo root (git history preserved)
├── apps/
│   └── web/                          # today's public site, moved intact
│       ├── src/  lib/  public/  config/  e2e/
│       ├── next.config.ts  tsconfig.json  tailwind.config.ts
│       ├── postcss.config.mjs  vitest.config.ts  vitest.setup.ts
│       ├── playwright.config.ts  eslint.config.mjs  codegen.ts
│       ├── package.json             # name "@idcr/web", private
│       └── vercel.json              # (if retained) install/build for web
├── packages/
│   ├── config/                      # name "@idcr/config"
│   │   ├── tsconfig.base.json
│   │   ├── eslint.base.mjs
│   │   ├── tailwind-preset.ts
│   │   ├── postcss.base.mjs
│   │   └── prettier.base.json
│   └── ui/                          # name "@idcr/ui"
│       ├── tokens/ (brand colors, fonts)
│       ├── logo/ (church logo asset/component)
│       └── cn.ts (the class-merge helper)
├── .github/workflows/               # updated to turbo
├── .husky/                          # stays at root (repo-wide hooks)
├── .claude/                         # harness — config paths updated to apps/web
├── docs/  tasks/                     # stay at root
├── turbo.json                        # NEW
├── pnpm-workspace.yaml               # NEW (packages: apps/*, packages/*)
├── package.json                      # NEW root (workspace root; holds released version + scripts)
├── pnpm-lock.yaml                    # regenerated (single workspace lockfile)
├── CHANGELOG.md                      # stays at root (semantic-release asset)
├── commitlint.config.mjs  .prettierrc.json  .nvmrc  .npmrc  .gitignore  .vercelignore
└── CLAUDE.md  AGENTS.md  README.md  .cursorrules
```

**Workspace package names** (`@idcr/` scope): `@idcr/web`, `@idcr/config`, `@idcr/ui` (and later `@idcr/admin`).

---

## 6. Requirements

1. **Workspace tooling.** Add `pnpm-workspace.yaml` (`packages: ["apps/*", "packages/*"]`), `turbo.json` (tasks: `build`, `lint`, `type-check`, `test`, `dev`), and a root `package.json` (private, name `idcr-monorepo`, `packageManager: "pnpm@9"`, dev dep `turbo`) whose scripts proxy to Turbo:
   - `build` → `turbo run build`, `lint` → `turbo run lint`, `type-check` → `turbo run type-check`, `test` → `turbo run test`, `dev` → `turbo run dev`, `prepare` → `husky`.
   - Per-app convenience: documented `pnpm --filter @idcr/web <task>`.
2. **Move the site to `apps/web`** with `git mv` (history-preserving). Everything in §4 "App source" + the app-local tooling configs (`tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `eslint.config.mjs`, `next.config.ts`, `codegen.ts`, `.env.example`, `qa-env.json.example`) moves under `apps/web/`. `apps/web/package.json` is renamed `@idcr/web` and keeps the app's deps + the app scripts (`dev/build/start/lint/type-check/test/e2e/format`).
3. **Path aliases unchanged in behavior.** `apps/web/tsconfig.json` keeps `@public/* @src/* @lib/* @icons/*` (now resolved relative to `apps/web`). The `next` TS plugin + `vite-tsconfig-paths` continue to work because the configs live beside the code they map.
4. **Vercel deploy parity.** The existing Vercel project (the public site) gets **Root Directory = `apps/web`** with "Include files outside root directory" enabled (monorepo mode), so `pnpm install` runs at the workspace root and the build runs for `@idcr/web`. The production domain, env vars, and output must be unchanged. **Verified on a preview deploy before merge.**
5. **CI parity.** `pr.yml` and `release.yml` keep calling `pnpm run lint/type-check/test/build` (now Turbo-proxied). The release build still injects `NEXT_PUBLIC_BASE_URL`. pnpm v9 / Node 22.x retained.
6. **Release parity.** semantic-release stays at the **root**, versioning the root `package.json` + root `CHANGELOG.md` (the repo's single release stream for now). The root `package.json` carries the continuing version (`1.11.x`); `apps/web/package.json` is a private app manifest (static version). `.releaserc.json` stays at root.
7. **Husky/commit hooks unchanged.** `.husky/` and `commitlint.config.mjs` stay at root (commits + secret-guard are repo-wide). `lint-staged` runs repo-wide from root; its globs already match by extension, so they cover `apps/**` and `packages/**` without change. Root `prepare: husky` installs hooks on `pnpm install`.
8. **Shared packages.** `packages/config` exposes base tsconfig/eslint/tailwind-preset/postcss/prettier; `packages/ui` exposes brand tokens + the church logo + the `cn` helper (moved from `src/utils/cn`). `apps/web` consumes both (extend the base configs; import `cn` and tokens from `@idcr/ui`) to prove the wiring — a minimal, low-risk refactor, not a sweeping rewrite.
9. **Harness path correctness.** Update `.claude/config.json` machine-read paths that point at the moved app: `playwrightProjectMap` keys, `qaLoop.env.preview.sensitivePaths`, and `paths.*` → prefix with `apps/web/` where they reference app source. Agent-doc prose path references are updated best-effort. The worktree base + Trello (website board) config are unchanged.
10. **No product/behavior change.** No route, content, env, CSP, or i18n change. The diff is structural only.

---

## 7. Deploy & release strategy (the critical section)

### 7.1 Vercel (public site)

**Recommended:** keep the existing Vercel project; set **Root Directory = `apps/web`** + enable **"Include source files outside of the Root Directory in the Build Step"** (monorepo). Vercel detects the pnpm workspace and Next.js; install runs at the repo root, build resolves `@idcr/web`.

- If a `vercel.json` is retained, it lives at `apps/web/vercel.json`; otherwise rely on Vercel's auto-detect. The root `vercel.json` is removed or emptied to avoid double-config.
- **Parity gate:** open the migration PR → confirm the **preview deployment** renders every public route identically (home, who-is-jesus, community, come-meet-us, blog index + a post, both locales), security headers/CSP present, images load from ctfassets/unsplash, contact + subscribe still POST. Only then is merge allowed.

### 7.2 semantic-release

- Stays at root, single stream. Root `package.json` holds the released version; `CHANGELOG.md` stays at root (asset path unchanged). commit-analyzer reads commits repo-wide. No `.releaserc.json` change required beyond confirming assets resolve at root.
- **Future (M1b+):** when `apps/admin` needs its own release cadence, revisit (multi-package release / changesets). Out of scope here — documented so it isn't forgotten.

### 7.3 CI

- `pr.yml`/`release.yml` unchanged except they now exercise Turbo via the root scripts. Optional later: add Turbo remote cache. Keep pnpm v9 / Node 22.x to match local.

---

## 8. Not applicable (with rationale)

- **Data model / API / Zod schemas:** none — pure restructure; no runtime data paths change.
- **Component hierarchy:** unchanged; components only change physical path (`src/...` → `apps/web/src/...`).
- **i18n:** no string changes; `public/locales/{es-AR,en-US}.json` move intact under `apps/web`. (The admin app's own bilingual catalog arrives in M1b.)

---

## 9. New / Moved / Modified files

**New (root):**
| File | Purpose |
|---|---|
| `pnpm-workspace.yaml` | `packages: ["apps/*", "packages/*"]` |
| `turbo.json` | Turbo task graph (build/lint/type-check/test/dev) |
| `package.json` (root) | Workspace root; Turbo-proxy scripts; holds released version; `turbo` devDep |
| `packages/config/*` | Shared tsconfig/eslint/tailwind/postcss/prettier presets |
| `packages/ui/*` | Brand tokens + logo + `cn` helper |

**Moved (root → `apps/web/`, history-preserving):** `src/`, `lib/`, `public/`, `config/`, `e2e/`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `eslint.config.mjs`, `codegen.ts`, `.env.example`, `qa-env.json.example`, and `package.json` (→ `apps/web/package.json`, renamed `@idcr/web`).

**Modified (stay at root):**
| File | Change |
|---|---|
| `.github/workflows/pr.yml`, `release.yml` | Confirm/adjust to Turbo-proxied root scripts; keep pnpm v9 / Node 22.x |
| `vercel.json` | Remove root config (Root Directory handles it) or relocate to `apps/web/` |
| `.releaserc.json` | Confirm assets resolve at root (likely unchanged) |
| `.claude/config.json` | Prefix app-source path refs with `apps/web/` (playwrightProjectMap, sensitivePaths, paths) |
| `CLAUDE.md`, `AGENTS.md`, `docs/*` | Note the monorepo + `apps/web`; update load-bearing path refs |
| `.gitignore`, `.prettierignore` | Adjust globs for `apps/**`, `packages/**`, per-app `.next` |

**Unchanged at root:** `.husky/`, `commitlint.config.mjs`, `.nvmrc`, `.npmrc`, `.prettierrc.json`, `CHANGELOG.md`, `.editorconfig`, `.vscode/`, `tasks/`, `docs/`.

---

## 10. Edge cases

1. **Vercel double-builds or 404s after Root Directory change** → verify on preview first; keep the old project (don't recreate) so domains/env survive; have the dashboard rollback ready.
2. **Path aliases break in tests** (`vite-tsconfig-paths` not finding the moved `tsconfig.json`) → keep `vitest.config.ts` + `tsconfig.json` co-located in `apps/web`; run `pnpm --filter @idcr/web test` to confirm.
3. **semantic-release can't find `package.json`/`CHANGELOG.md`** → both kept at root; run release in CI dry-run on the branch if possible.
4. **Husky hooks stop firing** (git core.hooksPath in a moved layout) → `prepare: husky` runs from root on install; verify a test commit triggers pre-commit + commit-msg.
5. **lint-staged misses `apps/**` files** → globs are extension-based (`\*.{ts,tsx,...}`), so they match nested paths; verify by staging a file under `apps/web`.
6. **`next.config.ts` import of `./config/headers`** → relative import moves with the app (`config/` goes under `apps/web`); CSP unchanged.
7. **Stale `trial-idcr` exclude / dead `codegen.ts` / `config/plugins.js`** → move as-is; don't fix here (separate cleanup ticket) to keep the diff purely structural.
8. **Harness `/work` runs against wrong paths** post-move → CP4 updates `.claude/config.json`; until then, agents fall back to Grep/Read. Validate one `/verify` run on `apps/web`.
9. **pnpm lockfile churn** → regenerate one workspace `pnpm-lock.yaml`; commit it; CI uses `--frozen-lockfile`, so the regenerated lockfile must be committed or CI fails.
10. **Turbo not caching env-dependent build** → `NEXT_PUBLIC_BASE_URL` is a build input; declare it in `turbo.json` (`globalEnv` / task `env`) so cache keys are correct.

---

## 11. Testing & verification strategy

**Per-checkpoint (local):** after each CP, run `pnpm install`, then `pnpm --filter @idcr/web type-check && lint && test && build`, and `pnpm --filter @idcr/web dev` — the site must serve identically at `localhost:3000`.

**Deploy parity (the gate, CP2):** the migration PR's **Vercel preview** must pass a manual smoke matrix — both locales (`es-AR`, `en-US`) × {home, who-is-jesus, community, come-meet-us, blog index, a blog post}, plus: response security headers/CSP present, Contentful images render, contact-form POST + newsletter subscribe succeed, blog "like" works. Compare against current production. **No merge to `main` until green** (merge triggers the production release).

**Release dry-run:** if feasible, run semantic-release in dry-run mode on the branch to confirm it resolves the root `package.json`/`CHANGELOG.md` and computes the next version.

**Regression guard:** existing Vitest suite must stay green throughout (it's the behavioral safety net for the moved utilities/getters).

---

## 12. Implementation checkpoints

Each checkpoint is independently verifiable and committed (Conventional Commits, header ≤100). Branch off `main`; **do not merge until CP2's preview gate passes.**

**CP1 — Workspace skeleton + move public site to `apps/web` (atomic).**

- Add `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (Turbo-proxy scripts, `turbo` devDep). `git mv` the app into `apps/web`; rename its `package.json` to `@idcr/web`. Regenerate `pnpm-lock.yaml`.
- **Verify:** `pnpm install`; `pnpm --filter @idcr/web {type-check,lint,test,build,dev}` all green; site identical locally.
- **Commit:** `chore(monorepo): convert to pnpm+turbo workspace, move site to apps/web`

**CP2 — Restore deploy + CI + release parity.**

- Set Vercel Root Directory → `apps/web` (dashboard); relocate/remove `vercel.json`. Adjust `pr.yml`/`release.yml` if needed. Confirm `.releaserc.json` assets at root. Declare build env in `turbo.json`.
- **Verify:** PR preview passes the §11 smoke matrix vs. production; CI green; release dry-run resolves version.
- **Commit:** `ci(monorepo): point vercel/CI/release at the workspace (apps/web)`

**CP3 — Extract shared packages and consume them in `apps/web`.**

- Create `packages/config` (base tsconfig/eslint/tailwind-preset/postcss/prettier) and `packages/ui` (tokens + logo + `cn`). Refactor `apps/web` to extend the base configs and import `cn`/tokens from `@idcr/ui`.
- **Verify:** `pnpm --filter @idcr/web {type-check,lint,test,build}` green; no visual diff on a preview.
- **Commit:** `refactor(monorepo): extract @idcr/config and @idcr/ui; consume in web`

**CP4 — Update harness + docs for the monorepo.**

- Update `.claude/config.json` app-source path refs (→ `apps/web/`); update `CLAUDE.md`/`AGENTS.md`/`docs` path references; note the monorepo layout.
- **Verify:** a `/verify` run resolves and passes against `apps/web`; explorer/grep paths land.
- **Commit:** `docs(monorepo): update harness paths + docs for apps/web layout`

> **Sequencing rule:** CP1→CP2 must land (and the preview gate pass) before CP3/CP4. CP2 is the production-risk gate.

---

## 13. Rollback plan

- All work on a feature branch; nothing reaches production until merge to `main`.
- If the preview is bad: fix on the branch, or close the PR — production is untouched.
- If a regression appears post-merge: Vercel dashboard **instant rollback** to the prior production deployment; revert the merge commit; the in-place `git mv` is fully reversible.

---

## 14. Resolved decisions (2026-06-23)

1. **Version stream** — ✅ **Root, single stream.** The released version stays at the root `package.json` + root `CHANGELOG.md`; `@idcr/web` is a private app manifest (static version). Revisit multi-package release (changesets) only when `apps/admin` needs its own cadence.
2. **`vercel.json`** — ✅ **Drop the root `vercel.json`** and rely on Vercel auto-detect + Root Directory = `apps/web`. Add a minimal `apps/web/vercel.json` only if a custom install/build command turns out to be needed during CP2.
3. **`packages/ui` initial surface** — ✅ **Minimal:** brand tokens (the HSL design tokens) + church logo + the `cn` helper. Grow it (shared primitives) only when `apps/admin` actually needs shared components.
4. **Turbo remote cache** — ✅ **Defer.** Not on the critical path; wire Vercel remote cache later as a perf nicety.

---

## 15. Tracking

New dedicated board (separate from the website board), captured for when we create cards (next step, after this spec is approved):

- **Board:** "IDCR Ministry Admin Panel" — id `6a3a9b31147d58764714d958` — https://trello.com/b/ccQoGY1R
- **Lists:** Backlog `6a3a9b35ada16d050d70aeed` · To Do `6a3a9b36d4d6c872eba62f13` · In Progress `6a3a9b3981012790caf9252c` · In Review `6a3a9b3bf673c49b1620dd0e` · In Testing `6a3a9b3c5222420616588c01` · Done `6a3a9b3d22e7b978faf647db`
- **Note:** richer flow than the website board (adds _Backlog_ + _In Testing_). When we wire the harness for the admin platform (M1b), this board + these list IDs become the `config.tracker` for `apps/admin` work. The ticket-key prefix for this board is **TBD** (website uses `ICR`).
- **Suggested cards for this migration:** one per checkpoint (CP1–CP4), or a single "Monorepo migration" card with the four checkpoints as a checklist. Not created yet.
