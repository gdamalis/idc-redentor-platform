# Contributing

> **Purpose:** The day-to-day contributor flow — prerequisites, branch naming (`<type>/ICR-N-<slug>`), conventional commits, the PR-title rule and CI gates, semantic-release behavior, and the git-worktree workflow the agent harness uses.
> **Last reviewed:** 2026-06-21

## Prerequisites

- **Node 22.14.0** (`.nvmrc` — run `nvm use`).
- **pnpm** as the package manager. Do not use `npm` or `yarn`.
- A `.env` with the **required** variables — copy from `CLAUDE.md`'s env tables, **not** just from `.env.example` (which is incomplete; see below). Ask @gdamalis for the Contentful / Mailchimp / Mongo / mail-provider credentials.

```bash
nvm use
pnpm install            # runs husky via the prepare script
cp .env.example .env    # then fill in the MISSING required vars (see CLAUDE.md)
pnpm dev
```

> ⚠️ **`.env.example` is incomplete.** It omits several runtime-required variables (`CONTENTFUL_REVALIDATE_SECRET`, `MONGODB_URI`, `MAIL_PROVIDER`, `CONTACT_FORM_RECIPIENT_EMAIL`, `FROM_EMAIL`, `SENDGRID_API_KEY`/`RESEND_API_KEY`). Bringing `.env.example` in line with `src/types/environment.d.ts` is a good starter ticket. **Never commit real secret values.**

## Quality gates (run before pushing)

```bash
pnpm type-check    # tsc --noEmit   (hyphenated — not `typecheck`)
pnpm lint          # eslint .
pnpm test          # vitest run
pnpm build         # next build
pnpm format:check  # prettier --check .
```

`lint-staged` (via husky `pre-commit`) auto-fixes staged files (`eslint --fix` for code, `prettier --write` for json/md/css), and commitlint (`commit-msg`) enforces the commit format. CI re-runs these gates plus the PR-title check.

## Branching

- **Never commit to `main`.** Always work on a feature branch (or, with the harness, in a worktree).
- **Branch name:** `<type>/ICR-N-<slug>` — e.g. `feat/ICR-42-add-events-jsonld`, `fix/ICR-17-contact-email-escape`.
- **`<type>`** is one of `feat` · `fix` · `refactor` · `perf` · `chore` · `docs` · `test` · `ci` (see `config.branchPrefixByType`). It drives the branch prefix, the commit type, and the release impact.
- **`ICR-N`** is the Trello card key (`N` = the card's `idShort`). Working without a ticket? Use a descriptive slug and open the card afterward so the work is tracked.

## Commits

- **Conventional Commits**, header ≤ 100 chars, body lines ≤ 100 chars. Example: `feat(ICR-42): add Event JSON-LD to come-meet-us`.
- Commit `<type>` should match the branch/ticket type. The Trello label maps to it: Feature→`feat`, Bug→`fix`, Integration→`feat`/`chore`, NFR→`chore`/`refactor`/`perf`.
- commitlint (`@commitlint/config-conventional`) rejects malformed messages at commit time.

## Pull requests

- **PR title MUST follow** `<type>(ICR-N): description` — e.g. `feat(ICR-42): add Event JSON-LD`. This is validated in CI by `amannn/action-semantic-pull-request`; a non-conforming title fails the check.
- Fill in the PR template; link the Trello card.
- The harness `pr-author` opens the PR, flips it to ready, comments the PR link on the card, and moves the card **In Progress → In Review**. If you're doing it by hand, do the same and move the card yourself.
- **A human reviews and merges.** No agent merges or moves a card to **Done** — Done means merged-and-closed by a person. See [`agent-harness.md`](./agent-harness.md).

## Releases (semantic-release)

`semantic-release` runs on **`main`** (`.releaserc.json`). On each push to main it analyzes the merged commits and cuts a version + changelog automatically. The release rules are **customized** — note the non-defaults:

| Commit type | Release |
|-------------|---------|
| `feat` | **minor** |
| `fix` | **patch** |
| `perf` | **patch** |
| `docs` | **patch** ← non-standard: docs cut a patch release here |
| `chore` | **none** |

So a `docs:` or `perf:` commit on main **will** produce a release. Be deliberate with commit types. The release commit is `chore(release): <version> [skip ci]`; it updates `CHANGELOG.md` and `package.json`, tags the version, and creates a GitHub release. npm publishing is disabled (`npmPublish: false`). Types not listed (`refactor`, `test`, `ci`) don't trigger a release.

## The worktree workflow (harness default)

The agent harness isolates each ticket in a git worktree so parallel work and the user's checkout never collide:

```
.claude/worktrees/<ICR-N>      # one worktree per ticket, branched from origin/main
```

- `/work` creates the worktree (`config.worktree`: parent `.claude/worktrees`, name = `<ticket-id>`, base `origin/main`), then moves the card To Do → In Progress.
- The session-namer hook reads the worktree dir (or the branch) and titles the session `ICR-N-<slug>`. The naming is automatic — **don't run `/rename`**; the hook handles it and a manual rename is respected if you do set one.
- When you're working by hand and want isolation, create a worktree the same way (`git worktree add .claude/worktrees/ICR-N -b <type>/ICR-N-<slug> origin/main`) or use your tooling's worktree helper. Worktrees are gitignored.
- Clean up the worktree after the PR is merged.

## Scratchpads

- `tasks/todo.md` / `tasks/lessons.md` — personal/working notes (gitignored). Capture lessons here after a correction.
- `tasks/specs/` — implementation specs for non-trivial work; read the relevant spec before coding.

## Conventions recap

Follow the conventions in `CLAUDE.md` / `AGENTS.md`: TypeScript strict, `interface` over `type`, const maps over enums, `satisfies`, `??` over `||`, RSC-first, always `await` runtime APIs, named exports, lowercase-dash dirs, Zod at boundaries, `cn()` for classes, every UI string in both `public/locales/*.json`. When in doubt, read the surrounding code and match it.
