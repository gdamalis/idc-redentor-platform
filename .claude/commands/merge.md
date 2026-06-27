---
description: Squash-merge a Trello card's PR after human approval — refuse on red CI, delete branch + worktree, move In Review → In Testing, then run post-merge staging QA. Never autonomous, never moves a card to Done.
argument-hint: ICR-N
---

# /merge — human-gated squash-merge + post-merge staging QA

This command merges a single card's PR **only when a human explicitly asks**. It is the owner of the
**In Review → In Testing** move (automated move #3) and of the **post-merge staging QA**. It **NEVER**
moves a card to **Done** — that stays human-only, after the human's manual prod deploy from Vercel.

The ticket key is in `$1` (e.g., `ICR-45`). If empty, ask the user. `ICR-N` is a derived display key:
`N` is the Trello card's `idShort`; resolve the card by `idShort`, then use its Trello `id` for every write.

## Hard rules (read first)

- **Merge is user-triggered ONLY** (`config.merge.requireUserTrigger`). Nothing here is autonomous;
  `config.qaLoop.autoMerge.enabled` stays `false`. This command _is_ the human trigger.
- **Squash ONLY** (`config.merge.method === "squash"`, `config.merge.squashOnly === true`). Never a
  merge-commit, never a rebase-merge.
- **Refuse to merge on red CI** when `config.merge.requireCiGreen` is `true` (the default). Pending CI is
  also a refusal — never merge into an unknown CI state.
- **Never print or post secrets** (Trello token, Mongo URIs, Mailchimp/SendGrid/Resend/Contentful keys).
  Read them from `qa-env.json`; secret-scrub every `gh`/Trello write.
- **Never move a card to Done** (`config.tracker.forbiddenTransitions` blocks `→ done`). The human does
  that after the manual prod deploy.
- **Staging QA is `no-POST`** — no live happy-path POST to `/api/subscribe` or `/api/contact`; production
  custom domains AND production `*.vercel.app` aliases are hard-denied; the prod `website` DB is never
  touched.

## 0. Pre-flight

1. Read `.claude/config.json`. Pin **by name** (never hardcode the values):
   - `config.tracker` — `boardId`, `lists` (need `inReview`, `inTesting`, `done`, plus the others for the
     resolve scan), `workflow`, `forbiddenTransitions`, `ticketKeyPrefix`.
   - `config.merge` — `method`, `squashOnly`, `requireUserTrigger`, `requireCiGreen`,
     `deleteWorktreeAndBranch`, `moveTo` (`inTesting`), `postMergeQa` (`staging`).
   - `config.qaLoop.env.staging` — `baseUrlFrom`, `baseUrlHostAllow`, `productionHostDeny`,
     `requirePreviewEnvironment`, `liveIntegrationPolicy`, `mongoMcp`, `dbNameAllow`.
   - `config.qaLoop.reviewAgents.acceptance` — the judge agent name (`acceptance-judge`).
   - `config.paths` — `qaEnv` (`qa-env.json`), `specs`, etc.
     **Hard-stop** with `Phase 0 config missing — add config.merge / tracker.lists.inTesting / config.qaLoop.env.staging first`
     if any of `config.merge`, `config.tracker.lists.inTesting`, or `config.qaLoop.env.staging` is absent.
     **Hard-stop** if `config.merge.requireUserTrigger !== true` (a safety assertion — this command must only
     exist as a user-gated path).
2. Validate `$1` matches `ICR-\d+` (case-insensitive → upper-case). Extract `N` (the numeric `idShort`).
   If it doesn't match, stop and ask the user.
3. **Resolve `MAIN_REPO_ROOT`** — `git rev-parse --git-common-dir` then take its `dirname`. This returns
   the main repo's `.git/` even when run from inside a worktree, so the main root is correct whether
   `/merge` is invoked from the main checkout or from a worktree. **Pin it — every git/worktree op below is
   anchored to `MAIN_REPO_ROOT`, never to the current working directory.**
4. `mcp__trello__set_active_board(boardId = config.tracker.boardId)` once. (Trello tools are deferred —
   load via ToolSearch `select:mcp__trello__get_cards_by_list_id,mcp__trello__get_card,mcp__trello__move_card,mcp__trello__add_comment,mcp__trello__get_acceptance_criteria`
   before first use.)

## 1. Resolve card + PR

1. **Card** — `ICR-N` is the card's `idShort`. Scan `mcp__trello__get_cards_by_list_id` across the lists
   (or `get_my_cards`) and match `card.idShort === N`. Capture the full `id` (`cardId`), `shortLink`,
   `name`, `desc`, and its **current list**.
2. **Guard the current list.** The card **must** currently be in **In Review**
   (`config.tracker.lists.inReview.id`). If it sits elsewhere:
   - In **In Testing** or **Done** → stop: `ICR-N is already in <list> — already merged/closed?`.
   - In **To Do** / **In Progress** / **Backlog** → surface the drift and **ask the user** before
     proceeding (do not silently merge a card that never reached review).
3. **PR** — `gh pr list --search "ICR-N" --json number,headRefName,url,state,mergeStateStatus,isDraft`
   (branch convention `<type>/ICR-N-<slug>`; match by branch if the search is ambiguous). Pin `prNumber`,
   `branch`, `prUrl`.
   - If no PR is found → stop and report (nothing to merge).
   - If the PR is **draft** → refuse: `PR #<n> is still a draft — flip it to ready (or let the /work review loop finish) before /merge.`
   - If the PR is already **MERGED/CLOSED** → stop: `PR #<n> is already <state>.` (and offer to run just
     the In Testing move + staging QA if the card is still In Review).

## 2. CI gate (refuse on red)

If `config.merge.requireCiGreen`:

1. `gh pr checks <prNumber>` (or `mcp__github__pull_request_read` → `statusCheckRollup`; load via
   ToolSearch `select:mcp__github__pull_request_read` if needed).
2. Classify every check. Treat **anything not `SUCCESS` / `NEUTRAL` / `SKIPPED`** (i.e. `FAILURE`,
   `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, or still **`PENDING`/`IN_PROGRESS`**) as **not
   green**.
3. If **not green** → **REFUSE**: print the failing/pending check names and
   `CI is not green — fix it (or finish the /work review loop) and re-run /merge.` **Stop. Leave the card
   In Review. Do not merge, do not clean up, do not move the card.**

> Re-read PR state right before merging (step 3). A detached `/work` review-loop tick (Phase 4) may have
> pushed a fix or replied to a thread after the human said "merge"; the CI gate + the not-draft guard catch
> an in-flight fix. The human's `/merge` trigger is the serialization point.

## 3. Squash-merge (squash ONLY)

```bash
gh pr merge <prNumber> --squash --delete-branch
```

(Or, if `gh` is unavailable, `mcp__github__merge_pull_request(merge_method: "squash")` — load via
ToolSearch `select:mcp__github__merge_pull_request` — followed by the remote-branch delete.) `--squash`
is mandatory (`config.merge.method`); never `--merge` or `--rebase`.

- **Verify the PR is MERGED** afterward (re-read state via `gh pr view <prNumber> --json state,mergedAt`
  or `mcp__github__pull_request_read`).
- On merge failure (conflict, branch protection, non-fast-forward) → **stop, report the exact error,
  leave the card In Review.** Do not proceed to cleanup or the move.

`--delete-branch` deletes the **REMOTE** branch only. The **local** branch and its worktree still exist —
step 4 cleans those up.

## 4. Remove worktree + local branch (SAFE ordering — get this right)

> **Why this is delicate:** the local feature branch cannot be deleted while a worktree has it checked
> out, and you must **not** delete the worktree you are currently running inside. So: anchor every git op
> to `MAIN_REPO_ROOT` (pinned in pre-flight), and if `/merge` is running _inside_ the target ticket's
> worktree, leave it first. `--delete-branch` already removed the remote branch; this step clears the
> local worktree + local branch.

When `config.merge.deleteWorktreeAndBranch` is `true`:

1. The target worktree path is `${MAIN_REPO_ROOT}/.claude/worktrees/ICR-N`.
2. **If the current session is running INSIDE that worktree** (compare the current `git rev-parse --show-toplevel`
   to the target worktree path): leave it first — call `ExitWorktree(action: "remove")` (load via ToolSearch
   `select:ExitWorktree`). `ExitWorktree` switches the session's cwd back to the main repo _before_ removing
   the worktree, so the shell is never stranded in a deleted directory. If `ExitWorktree` is unavailable,
   **instruct the user** to leave the worktree (or re-run `/merge` from the main checkout) and stop — do
   **not** try to `rm` the cwd out from under the running shell.
3. **Else (running from the main checkout or another worktree)** — anchor to `MAIN_REPO_ROOT` and run, in
   order:
   ```bash
   git -C "${MAIN_REPO_ROOT}" worktree remove "${MAIN_REPO_ROOT}/.claude/worktrees/ICR-N" --force
   git -C "${MAIN_REPO_ROOT}" branch -D "<branch>"
   git -C "${MAIN_REPO_ROOT}" worktree prune
   ```

   - `worktree remove --force` is safe here because the squash-merge already consumed the branch's work
     (it's on `main`); there is no unmerged content to lose.
   - `branch -D <branch>` clears the **local** branch (the remote one is already gone via `--delete-branch`).
   - `worktree prune` clears any stale administrative refs.
4. **Tolerate "already gone" non-fatally.** If the worktree or branch was already removed (e.g. a prior
   partial run), log it and continue — cleanup is idempotent and must not abort the rest of the flow.

## 5. Move In Review → In Testing (AUTOMATED MOVE #3)

This is the **only** automated Trello move `/merge` owns, and it happens **only after a verified
squash-merge** (steps 3–4 succeeded).

```
mcp__trello__move_card(
  cardId,
  listId = config.tracker.lists.inTesting.id   // "6a3a7f99c43d9b731c47fe61"
)
```

- Verify the move (re-read the card or trust the move result).
- **NEVER move to Done** (`config.tracker.lists.done.id` / `config.tracker.forbiddenTransitions`).
- Post a short, secret-scrubbed comment via `mcp__trello__add_comment(cardId, …)`:
  `squash-merged PR #<n>, moved to In Testing, running staging QA…`.

## 6. Post-merge staging QA

Staging QA proves the merged change on `staging.idcredentor.org`. **Staging is NOT a Vercel preview** — it
has its own host allowlist and **skips** the `requirePreviewEnvironment` check, but the production hard-deny
still applies.

1. **Resolve + validate the staging URL.** Read the base URL from `qa-env.json` →
   `config.qaLoop.env.staging.baseUrlFrom` (`staging.baseUrl`). Validate the host:
   - host **matches** `config.qaLoop.env.staging.baseUrlHostAllow` (`^staging\.idcredentor\.org$`), **and**
   - host is **NOT** in `config.qaLoop.env.staging.productionHostDeny` (custom domains AND prod
     `*.vercel.app` aliases).
   - **Do NOT run the `requirePreviewEnvironment` check** — for staging it is `false` (staging is not a
     Vercel preview). The prod hard-deny above keeps it safe.
   - If the URL is missing or fails a check → mark staging QA **BLOCKED** with a precise reason and skip to
     step 7 with that status (still post the result; do not merge-rollback).
2. **Parse the ACs** — `mcp__trello__get_acceptance_criteria(cardId)` (and `get_card` desc for context).
3. **Dispatch a fresh `qa-acceptance` tester** (Task tool — one agent, fresh context) with:
   - `env = { name: "staging", baseUrl: <stagingUrl>, target: "staging", isPreview: false,
baseUrlHostAllow: envStaging.baseUrlHostAllow, productionHostDeny: envStaging.productionHostDeny,
requirePreviewEnvironment: false, mongoMcp: envStaging.mongoMcp,
dbNameAllow: envStaging.dbNameAllow /* ^website-(test|qa|e2e|staging)$ */,
liveIntegrationPolicy: "no-POST" }`
   - `ticketId: "ICR-N"`, `summary` (card title), `acceptanceCriteria`, `depth` (from the card's QA Depth
     or `config.qaDepth.default`), `mode: "report"`, `dryRun: false`, `mainRepoRoot: MAIN_REPO_ROOT`, `runId`.
     The tester re-validates the staging host defensively, reads any URIs from `qa-env.json` itself, and
     returns its **evidence bundle** (block-1 JSON + a Markdown fallback comment).
4. **Dispatch the acceptance-judge** — `config.qaLoop.reviewAgents.acceptance` (`acceptance-judge`, fresh
   Task) with the tester's **evidence bundle**, the card's `acceptanceCriteria`, `cardId`, `ticketId: "ICR-N"`,
   and `envName: "staging"`. It returns the **authoritative** `overall: pass | partial | fail` verdict + a
   `perAC` array. The tester proves what the system does; the judge decides whether it meets the card —
   never fuse them. A `no-POST` happy-path AC the tester correctly skipped is **BLOCKED/deferred**, not
   FAIL.

## 7. Post results to Trello

Build the payload (same renderer as `/qa` and `/work`):

```jsonc
{
  "cardId": "<trello card id>",
  "cardShortLink": "<shortLink>",
  "ticketKey": "ICR-N",
  "qaEnvPath": "<config.paths.qaEnv>", // "qa-env.json"
  "configPath": ".claude/config.json",
  "dryRun": false,
  "meta": {
    "title": "<card title>",
    "testedAt": "<iso, e.g. $(date +'%Y-%m-%d %H:%M')>",
    "envName": "staging", // REQUIRED — drives the "Staging:" label; script exits 2 if absent
    "host": "<staging host>",
    "targetUrl": "<stagingUrl>", // the "Staging:" link (previewUrl is the back-compat alias)
    "testType": "<from the tester>",
    "buildUnderTest": "staging <merged sha>",
    "mode": "report",
    "runId": "<run id>",
    "postedBy": "/merge", // provenance footer — not mislabeled as /qa
  },
  "result": {
    /* judge overall→status + perAC mapped to {n,text,type,result,notes} + summary + blockers + observations */
  },
  "evidence": [{ "path": "<abs screenshot>", "caption": "…", "ac": 1 }],
}
```

- Map the **judge's** verdict onto `result`: `verdict → result`, `rationale (+evidenceRef) → notes`,
  `overall → status` (pass→PASS, partial→PARTIAL, fail→FAIL, any blocked→BLOCKED). The judge's verdict is
  authoritative; the tester's provisional `result` is not posted.
- Run the secret-scrub regex set over the text fields (the script scrubs too — defense in depth). Write the
  payload to a **`0600` temp file** (never inline secrets).
- `node .claude/scripts/qa/post-trello-result.mjs <payloadFile>`:
  - **Exit 0** → posted (screenshots attached + comment).
  - **Exit 3 (`CREDS_ABSENT`)** or **any non-zero** → fall back to `mcp__trello__add_comment(cardId, text=<block 2>)`
    - `mcp__trello__attach_image_to_card` per screenshot. Note in the summary that REST posting needs
      `qa-env.json → trello.{apiKey,token}`.
  - Always delete the temp payload file in a `finally`-style step.

> If Phase 3's `post-trello-result.mjs` parameterization were absent at runtime (it ships in Phase 3), the
> `meta.envName`/`postedBy`/`targetUrl` fields would be ignored and the label could read `Preview:`
> incorrectly — in that case use the MCP `add_comment` fallback (block 2) directly rather than mislabel.

## 8. Final summary (to the user)

Report:

- PR #`<n>` **squash-merged**; remote + local branch and the worktree removed.
- Card moved **In Review → In Testing** (Trello comment link).
- Staging QA verdict: **PASS / PARTIAL / FAIL / BLOCKED** (+ the posted Trello comment link). Note that
  full end-to-end `/api/subscribe` + `/api/contact` POSTs are **DEFERRED** on staging (`no-POST`) — do not
  claim "fully verified on staging".
- Reminder: **Done is human-only** — deploy prod from Vercel, then move **In Testing → Done** yourself.

Then **STOP.**

## The transition /merge owns

- **OWNS — Move #3:** `In Review → In Testing` (step 5), via
  `mcp__trello__move_card(cardId, listId=config.tracker.lists.inTesting.id /* 6a3a7f99c43d9b731c47fe61 */)`,
  **only after** a verified squash-merge.
- **MUST NOT:** move any card to **Done**; merge without an explicit human trigger; merge on red (or
  pending) CI; use any merge method other than squash; POST to live integrations on staging; run against
  production (custom domains or prod `*.vercel.app` aliases); read/write the production `website` DB.
