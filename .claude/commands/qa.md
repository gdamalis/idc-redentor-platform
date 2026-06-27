---
description: Acceptance-QA a Jira issue (or every issue in "In Review") against the staging deployment (default) or the PR's Vercel preview (--preview) — drives a real browser + APIs, runs tester → acceptance-judge, posts a structured Jira comment with inline screenshots, and respects the human gate (never transitions an issue to Done). Phase 1 = report-only.
argument-hint: "[ICR-123] [--preview] [--mode report] [--dry-run] [--max N]"
---

# /qa — issue acceptance QA (staging by default, --preview for the PR preview)

Runs **acceptance QA** on a Jira issue by reading its acceptance criteria (ACs) and driving a real
browser (and APIs where relevant) against the **resolved env target**, then posting a consistent,
structured result comment on the issue. By **default** the target is the dedicated **staging** deployment
(`staging.idcredentor.com`); pass **`--preview`** to re-target the PR's **Vercel preview** deployment
(the original pre-merge path). With no issue key it batches the **env-appropriate** status — **In Testing**
for the default staging target (post-merge issues awaiting staging verification), or **In Review** with
`--preview` (pre-merge issues on their PR preview) — one fresh `qa-acceptance` (tester) →
`acceptance-judge` (verdict) pair per issue.

> **Phase status.** This command ships **Phase 1**: testing + the structured Jira comment + the
> In Review transition. Modes `seed`, `fix`, and `auto` (staging seeding / autonomous remediation /
> gated auto-merge) are **recognized but gated** until later phases land; requesting them prints a
> notice and runs the testing portion in `report` mode.

## Hard rules (all phases)

- **Never** edit/commit on `main`. Every change that will be merged happens on a feature branch in a
  dedicated worktree and ships as a PR.
- **Never** print or post secrets (Jira API token, Mongo URIs, Mailchimp/SendGrid/Resend keys). The agent
  reads them from `qa-env.json` itself; this command never inlines them into prompts, comments, or logs.
- **Never** write to production data — no Mongo write, no Mailchimp subscribe, no contact email in
  Phase 1.
- **Never run against production — in EITHER env.** The production custom domains AND the production
  `*.vercel.app` aliases are hard-denied for both `staging` and `preview` (`envBlock.productionHostDeny`).
  Staging skips the must-be-a-Vercel-preview check (`requirePreviewEnvironment === false`) but keeps the
  prod hard-deny.
- **Staging is `no-POST`** (`config.qaLoop.env.staging.liveIntegrationPolicy`): no live happy-path POST to
  `/api/subscribe` or `/api/contact` (live Mailchimp/SendGrid/Resend); test forms up to the network
  boundary only. The prod `website` DB is never read/written (staging may read `website-staging`).
- **`--dry-run`** performs **no** writes — no Jira transition, no comment, no PR. It prints every action it
  _would_ take.
- **Never transition an issue to Done — humans merge & close** (`config.qaLoop.humanGate.neverMoveTo`).

## 0. Pre-flight

1. Read `.claude/config.json` → `config.tracker` (pin `cloudId`, `projectKey`, `statuses`,
   `statusResolution`), `config.qaLoop`, `config.qaDepth`, `config.paths`, `config.commands`,
   `config.playwrightProjectMap`, and **`config.qaLoop.reviewAgents.acceptance`** (the judge agent name →
   `acceptance-judge`). Resolve `MAIN_REPO_ROOT` (`git rev-parse --show-toplevel`).
   If `config.qaLoop.ticketSource` ≠ `"jira"`, stop and report.
2. Read `qa-env.json` at the repo root (if present). It is **optional** in ICR: it only supplies
   `jira.{email,apiToken}` for the REST script and an optional test `mongodbUri`. There are no app auth
   tokens (the site has no auth). The base URL it carries depends on the target env: **staging** reads
   `staging.baseUrl`, **preview** reads `preview.baseUrl`. If `qa-env.json` is missing, note "screenshots
   will post via the MCP fallback (text-only comment), not the REST renderer" and continue — do **not** stop.
3. Parse `$ARGUMENTS`:
   - Optional issue key matching `ICR-\d+` (case-insensitive → upper-case it).
   - **`--preview`** → boolean. Sets the QA target env. **DEFAULT is `staging`**; `--preview` re-targets the
     PR's Vercel preview. Pin `qaEnvName = preview ? "preview" : "staging"` and
     `envBlock = config.qaLoop.env[qaEnvName]`. **Hard-stop** if `envBlock` is missing
     (`env.<name> not in config.qaLoop.env — Phase 0 config not landed`).
   - `--mode <m>` (default `config.qaLoop.defaultMode` = `report`). If `m` not in `config.qaLoop.modes`,
     reject. If `m` not in `config.qaLoop.enabledModes`, print: "⚠️ mode `<m>` is Phase 2/3 (not enabled)
     — running report mode." and set the effective mode to `report`.
   - `--dry-run` → boolean. `--max <n>` → batch cap (default `config.qaLoop.batch.maxTickets`).
   - Generate a short `runId` (e.g. `qa-<epoch>` from `date +%s`).
   - Note in the final summary which env was targeted (`staging` is the new default — a `--preview` flag is
     required to QA the PR preview).
4. There is no board to activate — Jira issues resolve by key. (Atlassian tools are namespaced
   `mcp__atlassian-divinelab__*` and may be deferred — load via ToolSearch
   `select:mcp__atlassian-divinelab__getJiraIssue,mcp__atlassian-divinelab__searchJiraIssuesUsingJql,mcp__atlassian-divinelab__getTransitionsForJiraIssue,mcp__atlassian-divinelab__transitionJiraIssue,mcp__atlassian-divinelab__addCommentToJiraIssue`
   if a call errors as unavailable.)

## 1. Resolve the issue list

- **Issue given** (`ICR-N`): fetch it directly — `mcp__atlassian-divinelab__getJiraIssue(cloudId,
issueIdOrKey="ICR-N")`. `ICR-N` is the native key, so there is no board/list scan; capture the issue's
  `key`, `summary`, `description`, `status`, `labels`. Allow any status (note the current status in the
  report).
- **No issue**: batch mode over the **env-appropriate** status — pick the status by the resolved target:
  default **staging** → **In Testing** (`config.tracker.statuses.inTesting`, post-merge issues awaiting
  staging verification); `--preview` → **In Review** (`config.qaLoop.batch.status` /
  `config.tracker.statuses.inReview`, pre-merge issues on their PR preview). Query
  `mcp__atlassian-divinelab__searchJiraIssuesUsingJql(cloudId, jql='project = ICR AND status = "<status name>" ORDER BY updated ASC')`.
  Running default staging QA against In Review would test unmerged issues that have no staging build yet,
  and `--preview` against In Testing would test already-merged issues that no longer have a PR preview — so
  the status MUST follow the env. Take the first `min(max, config.qaLoop.batch.maxTickets)` keys; remember
  any overflow to report at the end (no silent truncation). Process **sequentially**
  (`config.qaLoop.batch.sequential`).

## 2. Per issue (sequential)

For each issue:

1. **Read** the issue: `mcp__atlassian-divinelab__getJiraIssue(cloudId, issueIdOrKey="ICR-N")`. Capture
   `summary`, `description`, current `status`, `labels`. Resolve **QA Depth** per `config.qaDepth.sourceNote`
   (a `qa-<depth>` label → a `QA: <depth>` token in the description → `config.qaDepth.default` = `standard`).
2. **Parse acceptance criteria** from the issue **`description`** — prefer an explicit "Acceptance
   Criteria" / "Criterios de aceptación" section (Spanish or English); else derive candidate checks. (ICR
   keeps ACs in the description, not a checklist.) If none derivable:
   - single mode → ask the user to confirm the derived checks before continuing;
   - batch mode → proceed with best-effort checks and mark the report `PARTIAL` with a note.
3. **Resolve the target URL (staging default; preview when `--preview`).** Branch on `qaEnvName`. In
   **both** branches the **production hard-deny is non-negotiable**: reject any host in
   `envBlock.productionHostDeny` (the `idcredentor` custom domains AND the production `*.vercel.app`
   aliases `idc-redentor-website.vercel.app` / `idc-redentor-web.vercel.app`).

   **STAGING (`qaEnvName === "staging"`, the default):**
   - Read the base URL from `qa-env.json` → `staging.baseUrl` (`envBlock.baseUrlFrom`).
   - Validate the host (two gates, both required):
     1. **Host allowlist**: host matches `envBlock.baseUrlHostAllow` (`^staging\.idcredentor\.com$`).
     2. **Host denylist**: host is NOT in `envBlock.productionHostDeny` (prod hard-deny — custom domains AND
        prod `*.vercel.app` aliases).
   - **SKIP the Vercel preview-environment check** — staging is NOT a Vercel preview
     (`envBlock.requirePreviewEnvironment === false`), so there is no `target !== "production"` gate. The
     production hard-deny above keeps staging safe.
   - If the URL is missing or fails a gate, mark the issue **BLOCKED** with a precise reason
     (`no allowlisted staging URL — expected a host matching ^staging\.idcredentor\.com$ that is not in productionHostDeny`)
     and continue.

   **PREVIEW (`qaEnvName === "preview"`, only with `--preview`):** the original three-gate path.
   - Find the PR: `gh pr list --search "ICR-N" --json number,headRefName,url` (branch convention
     `<type>/ICR-N-<slug>`), or match by branch.
   - Resolve the preview deployment URL, in order: (a) `mcp__claude_ai_Vercel__list_deployments` for
     project `idc-redentor-web` filtered to the PR's branch/commit → take the latest READY preview's URL;
     or (b) `gh pr view <n> --json statusCheckRollup` / the GitHub deployments API to read the Vercel
     preview URL from the PR's deployment status. Prefer the Vercel MCP; fall back to `gh`. (Vercel and
     `gh` MCP tools are deferred — load via ToolSearch if needed.)
   - **Validate the target before anything else** (the safety gate — three required checks, all must pass):
     1. **Host allowlist**: extract the hostname; require it to match `envBlock.baseUrlHostAllow`
        (`^[a-z0-9-]+\.vercel\.app$`).
     2. **Host denylist**: reject if the host is in `envBlock.productionHostDeny` — this includes the
        **production `*.vercel.app` aliases** (`idc-redentor-website.vercel.app`,
        `idc-redentor-web.vercel.app`) as well as the `idcredentor` custom domains. (The host regex alone is
        NOT enough: production has a `*.vercel.app` alias too.)
     3. **Preview-environment check** (`envBlock.requirePreviewEnvironment === true`): confirm the resolved
        deployment is a **Preview**, not Production — `mcp__claude_ai_Vercel__get_deployment` →
        `target !== "production"` (or the GitHub deployment `environment === "Preview"`). Reject a Production
        deployment even if its host ends in `.vercel.app`. Prefer the per-PR branch preview (host contains
        `-git-<branch>-` or a unique deployment hash).
        If any check fails, **stop this issue immediately**: "`/qa` refuses to run against `<host>` — not a Vercel
        Preview deployment for this PR. Expected a `*.vercel.app` preview with target=preview." This enforces
        "never touch production" before any browser/API action.
   - If no READY preview exists (deploy pending/failed), mark the issue BLOCKED with "no READY Vercel
     preview for ICR-N — wait for the deploy or check build logs
     (`mcp__claude_ai_Vercel__get_deployment_build_logs`)" and continue.

   In both branches: if the URL stays unresolved → mark the issue **BLOCKED** and continue.

4. **Transition the issue to In Review — `--preview` runs ONLY (human-gate-aware).** This transition applies
   only to the **preview** path (pre-merge QA). If `qaEnvName === "preview"` and the issue is currently in
   `To Do` or `In Progress`, transition it to `config.tracker.statuses.inReview` — resolve **by name**:
   `mcp__atlassian-divinelab__getTransitionsForJiraIssue(cloudId, "ICR-N")` → match `transition.to.name`
   (case-insensitive, trimmed) → `mcp__atlassian-divinelab__transitionJiraIssue`. If already In Review,
   no-op. **On the staging path do NOT transition the issue** — staging QA is post-merge and the issue is
   already in **In Testing** (set there by `/merge`); transitioning it would regress it. **Never transition
   to Done** (`config.qaLoop.humanGate.neverMoveTo`). On `--dry-run`, print the intended transition only.
5. **Dispatch a fresh `qa-acceptance` tester** (Task tool — one per issue, fresh context) with the
   **env-name-driven** env block:
   - `ticketId` (`ICR-N`), `summary`, `acceptanceCriteria` (the parsed list, numbered)
   - `depth`, `mode` (effective `report` in Phase 1), `dryRun`
   - `env`: `{ name: qaEnvName, baseUrl: <resolved URL>, target: qaEnvName, isPreview: (qaEnvName === "preview"), baseUrlHostAllow: envBlock.baseUrlHostAllow, productionHostDeny: envBlock.productionHostDeny, requirePreviewEnvironment: envBlock.requirePreviewEnvironment, mongoMcp: envBlock.mongoMcp, dbNameAllow: envBlock.dbNameAllow, liveIntegrationPolicy: (envBlock.liveIntegrationPolicy ?? "no-POST") }` — all fields read off `envBlock` by name; never hardcode preview literals. For preview, `isPreview/target` reflect the Preview-environment check you already passed in step 3; for staging, `requirePreviewEnvironment` is `false` and the tester skips that check while keeping the prod hard-deny.
   - `mainRepoRoot`, `runId`
     The tester re-validates the target host defensively against the passed `env`, reads any URIs from
     `qa-env.json` itself, and returns its **evidence bundle**: a fenced JSON block (block 1) + a
     ready-to-post Jira Markdown fallback comment (block 2).

   **Then dispatch the `acceptance-judge`** (agent name from `config.qaLoop.reviewAgents.acceptance` →
   `acceptance-judge`, a fresh Task) with the tester's **evidence bundle**, the issue's
   `acceptanceCriteria` (parsed from the description), `ticketId` (`ICR-N`),
   and `envName: qaEnvName`. It returns the **authoritative** `overall: pass | partial | fail` verdict plus
   a `perAC` array (`{n, text, type, verdict, rationale, evidenceRef}`). **The tester proves what the system
   does; the judge decides whether it meets the issue — never fuse them.** The posted result uses the
   **judge's** verdict + the tester's evidence; a `no-POST` happy-path AC the tester correctly skipped is
   **BLOCKED/deferred**, not FAIL.

6. **Post the result via the Jira script** (screenshots attached as issue attachments). Build a payload
   `{ ticketKey:"ICR-N", qaEnvPath, configPath, dryRun, meta, result, evidence }` —
   `meta` = `{ title, testedAt: $(date +'%Y-%m-%d %H:%M'), envName: qaEnvName, host, targetUrl: <resolved URL>, previewUrl: (qaEnvName === "preview" ? <resolved URL> : undefined), testType, buildUnderTest, mode, runId, postedBy: "/qa" }`.
   `meta.envName` is **REQUIRED** (the script exits 2 if absent) and drives the URL label (`Staging:` for
   staging, `Preview:` for preview); `meta.targetUrl` is the active env's base URL (`previewUrl` stays as the
   back-compat alias, set only on the preview path); `meta.postedBy: "/qa"` sets the provenance footer.
   `result` is the **judge's** verdict mapped onto the jira-result table (`verdict → result`,
   `rationale (+evidenceRef) → notes`, `overall → status`); `evidence` is the tester's block-1 `evidence[]`.
   Run the secret-scrub regex set over the text fields as a safety net (the script also scrubs). Write the
   payload to a **`600` temp file** (never inline secrets). Then
   `node .claude/scripts/qa/post-jira-result.mjs <payloadFile>` (uploads each screenshot as an issue
   attachment via the Jira REST API, then posts a comment whose body renders the per-AC table + each shot
   inline; reads `jira.{email,apiToken}` from `qa-env.json` and `jira.site` from `.claude/config.json`):
   - **Exit 0** → posted (comment + attached screenshots).
   - **Exit 3 (`CREDS_ABSENT`)** → no `jira.{email,apiToken}` in `qa-env.json`. **Fallback:** post the
     agent's Markdown **block 2** via
     `mcp__atlassian-divinelab__addCommentToJiraIssue(cloudId, issueIdOrKey="ICR-N", commentBody=...)`
     (text-only, no inline images). Note in the summary: "posted via MCP fallback — add
     `qa-env.json → jira.{email,apiToken}` for the single-call REST renderer with inline screenshots."
   - Any other non-zero exit → surface the error and fall back the same way.
   - **`--dry-run`** → run the script with `dryRun:true` (it uploads/posts nothing and prints intent); do
     not call the MCP. Always delete the temp payload file in a `finally`-style step.
7. **Act on the outcome** (the pass/fail decision keys off the **acceptance-judge's** `overall` verdict —
   step 5 — not the tester's raw `status`). **Never transition the issue** as a result of QA (the issue stays
   wherever it is — In Review on the preview path, In Testing on the staging path); QA is report-only:
   - **PASS** → leave the issue where it is. On preview, add "✅ All ACs pass — ready for human merge & close
     (`/merge`)"; on staging, add "✅ All ACs pass on staging — ready for the human's prod deploy + transition
     to Done". Never auto-transition to Done (`fix`/`auto` disabled; the human gate keeps Done human-only).
   - **PARTIAL / FAIL** → leave the issue; the comment explains caveats/defects. (Phase 2/3 remediation loop
     is specified-but-disabled; append "Autonomous remediation is Phase 2/3 (not enabled) — left for a human.")
   - **BLOCKED** → leave the issue; the comment carries the concrete seed/config/target instructions
     (including any staging `no-POST` deferral).
8. Append any out-of-scope observations to `${MAIN_REPO_ROOT}/tasks/todo.md` (same format/policy as the
   agents); note the count in the final summary. Do not triage here.

## 3. Final summary (to the user)

Lead with **which env was targeted** — `staging` (default) or `preview` (`--preview`) — so it is never
ambiguous which deployment was QA'd (the default flipped to staging; `--preview` is required for the PR
preview). Then print a compact table:
`issue | ICR-N | env | status | type | passed/failed/partial/blocked | Jira comment link`.
List any issues deferred because the batch cap was hit, and any issues left for human follow-up
(FAIL/BLOCKED). On staging, note that full end-to-end `/api/subscribe` + `/api/contact` POSTs are DEFERRED
(`no-POST`). Never claim success you didn't verify — report exactly the **judge's** verdict per card.

## Remediation loop (Phase 2/3 — specified, not yet enabled)

When enabled, on an in-scope FAIL the command will author a fix in a remediation worktree and loop
`implementer → verifier → feature-dev:code-reviewer → security-reviewer` until clean. Transitions resolve
**by status name** (`config.tracker.statusResolution: by-name`): In Review → In Progress when a remediation
PR opens, back to In Review via `pr-author` when that PR is ready —
`getTransitionsForJiraIssue` → match `transition.to.name` → `transitionJiraIssue`, never a hardcoded id.
Gated auto-merge stays disabled (`config.qaLoop.autoMerge.enabled = false`). The human always merges &
closes to **Done**. Because most failing ACs are UI/visual, the `implementer` in this loop invokes the
**`ui-ux-pro-max`** skill to ground its visual/UX decisions before applying a fix, keeping remediation
fixes design-aware rather than just "make the test pass".
