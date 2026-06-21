---
description: Acceptance-QA a Trello card (or every card in "In Review") against its Vercel preview deployment — drives a real browser + APIs, posts a structured Trello comment with inline screenshots, and respects the human gate (never moves a card to Done). Phase 1 = report-only.
argument-hint: "[ICR-123] [--mode report] [--dry-run] [--max N]"
---

# /qa — card acceptance QA against the Vercel preview

Runs **acceptance QA** on a Trello card by reading its acceptance criteria (ACs) and driving a real
browser (and APIs where relevant) against the **PR's Vercel preview deployment**, then posting a
consistent, structured result comment on the card. With no card it processes the whole **In Review**
list, one fresh `qa-acceptance` agent per card.

> **Phase status.** This command ships **Phase 1**: testing + the structured Trello comment + the
> In Review transition. Modes `seed`, `fix`, and `auto` (staging seeding / autonomous remediation /
> gated auto-merge) are **recognized but gated** until later phases land; requesting them prints a
> notice and runs the testing portion in `report` mode.

## Hard rules (all phases)
- **Never** edit/commit on `main`. Every change that will be merged happens on a feature branch in a
  dedicated worktree and ships as a PR.
- **Never** print or post secrets (Trello token, Mongo URIs, Mailchimp/SendGrid/Resend keys). The agent
  reads them from `qa-env.json` itself; this command never inlines them into prompts, comments, or logs.
- **Never** write to production data — no Mongo write, no Mailchimp subscribe, no contact email in
  Phase 1.
- **`--dry-run`** performs **no** writes — no Trello move, no comment, no PR. It prints every action it
  *would* take.
- **Never move a card to Done — humans merge & close** (`config.qaLoop.humanGate.neverMoveTo`).

## 0. Pre-flight
1. Read `.claude/config.json` → `config.tracker`, `config.qaLoop`, `config.qaDepth`, `config.paths`,
   `config.commands`, `config.playwrightProjectMap`. Resolve `MAIN_REPO_ROOT` (`git rev-parse --show-toplevel`).
   If `config.qaLoop.ticketSource` ≠ `"trello"`, stop and report.
2. Read `qa-env.json` at the repo root (if present). It is **optional** in ICR: it only supplies
   `trello.{apiKey,token}` for the REST script and an optional test `mongodbUri`. There are no auth
   tokens (the site has no auth). If `qa-env.json` is missing, note "screenshots will post via MCP
   fallback (text + attached images), not the REST renderer" and continue — do **not** stop.
3. Parse `$ARGUMENTS`:
   - Optional card key matching `ICR-\d+` (case-insensitive → upper-case it).
   - `--mode <m>` (default `config.qaLoop.defaultMode` = `report`). If `m` not in `config.qaLoop.modes`,
     reject. If `m` not in `config.qaLoop.enabledModes`, print: "⚠️ mode `<m>` is Phase 2/3 (not enabled)
     — running report mode." and set the effective mode to `report`.
   - `--dry-run` → boolean. `--max <n>` → batch cap (default `config.qaLoop.batch.maxTickets`).
   - Generate a short `runId` (e.g. `qa-<epoch>` from `date +%s`).
4. `mcp__trello__set_active_board(boardId = config.tracker.boardId)` once. (Trello tools are deferred —
   load via ToolSearch `select:<name>` if a call errors as unavailable.)

## 1. Resolve the card list
- **Card given** (`ICR-N`): translate `N` → Trello card. The Trello MCP `get_card` /
  `update_card_details` / `move_card` operate on Trello card ids/shortLinks, while `ICR-N` is the card's
  `idShort`. So: `mcp__trello__get_cards_by_list_id` across lists (or `get_my_cards`) and match
  `card.idShort === N`; capture the card's full `id` / `shortLink`. Allow any list (note the current list
  in the report).
- **No card**: batch mode over the **In Review** list —
  `mcp__trello__get_cards_by_list_id(listId = config.tracker.lists.inReview.id)`. Take the first
  `min(max, config.qaLoop.batch.maxTickets)` by oldest activity; remember any overflow to report at the
  end (no silent truncation). Process **sequentially** (`config.qaLoop.batch.sequential`) to avoid
  preview-seed collisions and to serialize any future merges.

## 2. Per card (sequential)
For each card:

1. **Read** the card: `mcp__trello__get_card`. Capture `name` (summary), `desc`, current list, `labels`,
   `idShort`. Resolve **QA Depth** from a label/checklist if present (`config.qaDepth.default` = `standard`
   otherwise).
2. **Parse acceptance criteria** from `desc` (and/or `mcp__trello__get_acceptance_criteria` /
   `get_checklist_items` if the card uses a checklist named "Acceptance Criteria" / "Criterios de
   aceptación"). Prefer an explicit AC section in Spanish or English; else derive candidate checks. If
   none derivable:
   - single mode → ask the user to confirm the derived checks before continuing;
   - batch mode → proceed with best-effort checks and mark the report `PARTIAL` with a note.
3. **Resolve the preview URL (the ICR core adaptation — replaces a `staging.baseUrl`).** Find the PR for
   this card's branch and its Vercel preview:
   - Find the PR: `gh pr list --search "ICR-N" --json number,headRefName,url` (branch convention
     `<type>/ICR-N-<slug>`), or match by branch.
   - Resolve the preview deployment URL, in order: (a) `mcp__claude_ai_Vercel__list_deployments` for
     project `idc-redentor-web` filtered to the PR's branch/commit → take the latest READY preview's URL;
     or (b) `gh pr view <n> --json statusCheckRollup` / the GitHub deployments API to read the Vercel
     preview URL from the PR's deployment status. Prefer the Vercel MCP; fall back to `gh`. (Vercel and
     `gh` MCP tools are deferred — load via ToolSearch if needed.)
   - **Validate the host before anything else** (the safety gate): extract the hostname; require it to
     match `config.qaLoop.env.preview.baseUrlHostAllow` (`*.vercel.app`); if it matches
     `config.qaLoop.env.preview.productionHostDeny` (the `idcredentor` production domains) or any
     non-allowlisted host, **stop this card immediately**: "`/qa` refuses to run against `<host>` — not an
     allowlisted preview host. Expected a `*.vercel.app` preview." This enforces "never touch production"
     before any browser/API action.
   - If no READY preview exists (deploy pending/failed), mark the card BLOCKED with "no READY Vercel
     preview for ICR-N — wait for the deploy or check build logs
     (`mcp__claude_ai_Vercel__get_deployment_build_logs`)" and continue.
4. **Move the card to In Review (human-gate-aware).** If the card is currently in `To Do` or
   `In Progress`, `mcp__trello__move_card(cardId, listId = config.tracker.lists.inReview.id)`. If already
   In Review, no-op. **Never move to Done** (`config.qaLoop.humanGate.neverMoveTo`). On `--dry-run`, print
   the intended move only.
5. **Dispatch a fresh `qa-acceptance` agent** (Task tool — one per card, fresh context) with:
   - `ticketId` (`ICR-N`), `summary`, `acceptanceCriteria` (the parsed list, numbered)
   - `depth`, `mode` (effective `report` in Phase 1), `dryRun`
   - `env`: `{ name: "preview", baseUrl: <resolved preview URL>, mongoMcp: config.qaLoop.env.preview.mongoMcp, dbNameAllow: config.qaLoop.env.preview.dbNameAllow }`
   - `mainRepoRoot`, `runId`
   The agent re-validates the preview host defensively, reads any URIs from `qa-env.json` itself, and
   returns a fenced JSON result block (block 1) + a ready-to-post Trello Markdown comment (block 2).
6. **Post the result via the Trello script** (with screenshots attached). Build a payload
   `{ cardId, cardShortLink, ticketKey:"ICR-N", qaEnvPath, configPath, dryRun, meta, result, evidence }` —
   `meta` = `{ title, testedAt: $(date +'%Y-%m-%d %H:%M'), envName:"preview", host, previewUrl, testType, buildUnderTest, mode, runId }`,
   with `result`/`evidence` from the agent's block 1. Run the secret-scrub regex set over the text fields
   as a safety net (the script also scrubs). Write the payload to a **`600` temp file** (never inline
   secrets). Then `node .claude/scripts/qa/post-trello-result.mjs <payloadFile>`:
   - **Exit 0** → posted (comment + attached screenshots).
   - **Exit 3 (`CREDS_ABSENT`)** → no `trello.{apiKey,token}` in `qa-env.json`. **Fallback:** post the
     agent's Markdown **block 2** via `mcp__trello__add_comment(cardId, text=...)`, then attach each
     screenshot via `mcp__trello__attach_image_to_card` (or `attach_image_data_to_card` for base64). Note
     in the summary: "posted via MCP fallback — add `qa-env.json → trello.{apiKey,token}` for the
     single-call REST renderer."
   - Any other non-zero exit → surface the error and fall back the same way.
   - **`--dry-run`** → run the script with `dryRun:true` (it uploads/posts nothing and prints intent); do
     not call the MCP. Always delete the temp payload file in a `finally`-style step.
7. **Act on the outcome** (from the agent's JSON `status`):
   - **PASS** → leave the card **In Review** and add a recommendation line in the comment ("✅ All ACs
     pass — ready for human merge & close"). Never auto-move to Done (`fix`/`auto` are disabled; even when
     enabled, the human gate keeps Done human-only).
   - **PARTIAL / FAIL** → leave In Review; the comment explains caveats/defects. (Phase 2/3 remediation
     loop is specified-but-disabled; append "Autonomous remediation is Phase 2/3 (not enabled) — left for
     a human.")
   - **BLOCKED** → leave In Review; the comment carries the concrete seed/config/preview instructions.
8. Append any out-of-scope observations to `${MAIN_REPO_ROOT}/tasks/todo.md` (same format/policy as the
   agents); note the count in the final summary. Do not triage here.

## 3. Final summary (to the user)
Print a compact table: `card | ICR-N | status | type | passed/failed/partial/blocked | Trello comment link`.
List any cards deferred because the batch cap was hit, and any cards left for human follow-up
(FAIL/BLOCKED). Never claim success you didn't verify — report exactly what each agent returned.

## Remediation loop (Phase 2/3 — specified, not yet enabled)
When enabled, on an in-scope FAIL the command will author a fix in a remediation worktree and loop
`implementer → verifier → feature-dev:code-reviewer → security-reviewer` until clean. Transitions resolve
by **Trello list move** by id from config (In Review → In Progress when a remediation PR opens, back to
In Review via `pr-author` when that PR is ready). Gated auto-merge stays disabled
(`config.qaLoop.autoMerge.enabled = false`). The human always merges & closes to **Done** — there is no
by-name transition machinery; Trello lists are moved by id. Because most failing ACs are UI/visual, the
`implementer` in this loop invokes the **`ui-ux-pro-max`** skill to ground its visual/UX decisions before
applying a fix, keeping remediation fixes design-aware rather than just "make the test pass".
