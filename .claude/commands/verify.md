---
description: Run the verification stack (type-check + lint + test + build) on the current branch. Independent of /work.
argument-hint: [light|standard|heavy]
---

# /verify — Manual Verification

Runs the `verifier` subagent on whatever branch + worktree you're currently in. Useful for
sanity-checking work-in-progress outside of the `/work` pipeline.

Steps:

1. Read `.claude/config.json` to resolve `config.commands.*` and `config.qaDepth` defaults.
2. Resolve depth from `$1` (default `standard` if unspecified). Reject if not in `config.qaDepth.allowed`
   (`light` | `standard` | `heavy`).
3. Dispatch the `verifier` subagent with:
   - `depth`
   - the current worktree path (`pwd`)
4. Report the verifier's result to the user **verbatim** — the pass/fail table + any structured error
   output. The verifier runs `pnpm type-check` + `pnpm lint` + `pnpm test` for `light`, and adds
   `pnpm build` for `standard`/`heavy` (commands resolved from `config.commands`; note ICR's `type-check`
   hyphen).

Do NOT touch git, the PR, or Trello. This is **read-only** validation.
