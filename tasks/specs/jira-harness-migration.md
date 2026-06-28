# Spec: Repoint the agent harness from Trello → Jira (ICR)

**Status:** Draft — awaiting spec review (human gate)
**Owner ticket:** to be created as the first ICR issue (see Checkpoint 0)
**Author:** Claude (spec-first per user decision, 2026-06-27)

## Context

The IDC Redentor agent harness (`/pm`, `/work`, `/qa`, `/merge`, `/verify`) is wired
end-to-end to **Trello**. We have migrated task tracking to **Jira Cloud** (company-managed
project **IDC Redentor**, key **ICR**, on `divinelab.atlassian.net`). The official Atlassian
Remote MCP is now connected in this repo as the server **`atlassian-divinelab`** (per-account
OAuth, isolated from foodista's `atlassian`). This spec repoints the harness to Jira.

**Reference implementation:** `foodista-web` already completed this migration. Its harness is the
**prose/flow template** — but NOT a copy-paste source (see Dependency 4: namespace).

### Jira coordinates (verified live)

| Field        | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Site         | `divinelab.atlassian.net`                                      |
| cloudId      | `0228eaa6-e8fa-4746-b2ac-6c58f1478e42`                         |
| Project key  | `ICR`                                                          |
| Project id   | `10038`                                                        |
| Project name | `IDC Redentor`                                                 |
| Type         | software, company-managed (classic), Epics enabled             |
| Issue types  | Epic, Story, Task, Bug, Sub-task                               |
| Issues today | **0** (empty board)                                            |
| MCP server   | `atlassian-divinelab` → namespace `mcp__atlassian-divinelab__` |

---

## Dependencies Check (must be true before/while implementing)

1. **PR #50 merged.** The monorepo-migration PR already edited `.claude/config.json`. Branch this
   work off `main` only **after** #50 lands, or the `config.json` rewrite will conflict.
2. **Jira workflow has the 6 statuses.** Trello columns are Backlog · To Do · In Progress · In
   Review · In Testing · Done. A default company-managed project ships only To Do / In Progress /
   Done. **The ICR board likely needs `In Review` and `In Testing` (and possibly `Backlog`) statuses
   added to its workflow** before the harness's automated transitions can run. This is a board-config
   task (Jira UI), not code. Confirm/configure at Checkpoint 0.
3. **`atlassian-divinelab` authenticated** as `gabriel@divinelab.ai` — DONE (verified).
4. **Namespace nuance — the headline risk.** Every tool must be **`mcp__atlassian-divinelab__*`**.
   foodista's files use bare `mcp__atlassian__*` (and foodista is itself mid-migration to
   `atlassian-foodista`), so copying foodista tool strings verbatim **will silently break** (tools
   won't resolve). Final-diff must grep-fail on any `mcp__atlassian__` (no suffix) or `mcp__trello__`.
5. **Local, per-machine prerequisites (NOT in the PR — both gitignored):**
   - `.claude/settings.local.json` → add `"atlassian-divinelab"` to `enabledMcpjsonServers`.
   - `qa-env.json` (repo root) → add a `jira` block (`email`, `apiToken`) for the screenshot REST helper.

---

## Locked design decisions (match foodista — confirm at spec review)

These three Trello features have **no 1:1 Jira tool**. We adopt foodista's resolutions:

- **D1 — Acceptance criteria.** Trello `get_acceptance_criteria` (a checklist reader) → ACs live in
  the **issue description** and are parsed by the consuming agents/commands. The `acceptance-judge`
  agent receives parsed ACs (or reads them via `getJiraIssue`); the bespoke `get_acceptance_criteria`
  tool is dropped from its allowlist.
- **D2 — "Needs refinement" state.** Trello "Refinement" checklist → a **`needs-refinement` Jira
  label**. `product-manager` adds it on intake; `refine` removes it; `/work` step-1.5 ready-gate
  checks its absence.
- **D3 — QA screenshots.** Trello `attach_image_to_card`/`attach_image_data_to_card` have no MCP
  analog → inline screenshots post through the **Jira REST API** in a new `post-jira-result.mjs`,
  reading `email` + `apiToken` from `qa-env.json`.

**Open decision (D4 — commit-type classification):** idc's Trello config maps 4 board labels
(Feature/Bug/Integration/NFR) → commit types. Recommendation: drive commit type from the **Jira
issue type** (Bug→`fix`, Story→`feat`, Task→`chore`) with an optional label override for
`perf`/`refactor`. Decide at spec review. (foodista's PM uses an issue-type map.)

---

## Requirements

1. **R1 — config.json `tracker` → `jira`.** Replace the entire Trello `tracker` block with a `jira`
   block (see Data Model Changes). `ticketLinkBase` → `https://divinelab.atlassian.net/browse/`.
   `qaLoop.ticketSource` → `"jira"`; `qaLoop.batch.list` → `batch.status`.
2. **R2 — Issue resolution by key.** Everywhere the harness "finds a card by idShort / scans lists",
   it instead fetches **directly by key** via `getJiraIssue(cloudId, "ICR-N")`. No board/list scan.
3. **R3 — Transitions by name.** The two automated moves (To Do→In Progress at `/work` step 3;
   In Progress→In Review at `/work` step 14 via `pr-author`) and `/merge`'s In Review→In Testing
   resolve transitions at runtime via `getTransitionsForJiraIssue` matching `transition.to.name`
   against `jira.workflow[].name`. **Never hardcode numeric transition ids.** **Done is human-only.**
4. **R4 — Agent tool allowlists.** Repoint frontmatter `tools:` in `product-manager`, `pr-author`,
   `acceptance-judge` to `mcp__atlassian-divinelab__*` equivalents (see Section B table).
5. **R5 — Command flows.** Rewrite Trello touchpoints in `/work`, `/pm`, `/qa`, `/merge` (heavy) and
   one-line reworDs in `/verify`, `/predica`.
6. **R6 — Screenshot helper.** Port `post-trello-result.mjs` → `post-jira-result.mjs` (Jira REST).
7. **R7 — Docs.** Repoint harness docs (board→project, list→status, card→issue, idShort→key,
   namespace, link base).
8. **R8 — Preserve `ICR-N` grammar.** Unchanged string; only reword text that explains N (now the
   Jira issue number, not a Trello idShort). `session-namer.sh` is **untouched**.
9. **R9 — No `Done` automation.** Keep the human-gate guarantee: agents/commands never transition to
   Done. Carry over `forbiddenTransitions`.

---

## Data Model Changes — proposed `jira` block in `.claude/config.json`

Status `name` values are **TO-CONFIRM at Checkpoint 0** against the live board.

```jsonc
"ticketLinkBase": "https://divinelab.atlassian.net/browse/",
"jira": {
  "site": "divinelab.atlassian.net",
  "cloudId": "0228eaa6-e8fa-4746-b2ac-6c58f1478e42",
  "projectKey": "ICR",
  "projectId": "10038",
  "projectName": "IDC Redentor",
  "projectType": "company-managed-classic",
  "mcpNamespace": "mcp__atlassian-divinelab__",
  "ticketIdField": "key",
  "ticketKeyNote": "ICR-N is the native Jira issue key — N is the issue number, not a Trello idShort. Fetch directly via getJiraIssue(cloudId, issueIdOrKey='ICR-N'); no board/list scan. Branches/PRs/commits and all Atlassian calls use the ICR-N key string.",
  "statuses": {
    "discovery": "Backlog",       // TO-CONFIRM
    "todo": "To Do",              // TO-CONFIRM
    "inProgress": "In Progress",  // TO-CONFIRM
    "inReview": "In Review",      // TO-CONFIRM
    "inTesting": "In Testing",    // TO-CONFIRM
    "done": "Done"               // TO-CONFIRM
  },
  "workflow": [
    { "key": "discovery",  "name": "Backlog",     "order": 1, "automated": false, "setBy": "PM / human (backlog grooming)" },
    { "key": "todo",       "name": "To Do",       "order": 2, "automated": false, "setBy": "PM / human (ready to pick up)" },
    { "key": "inProgress", "name": "In Progress", "order": 3, "automated": true,  "setBy": "/work step 3 (To Do -> In Progress)" },
    { "key": "inReview",   "name": "In Review",   "order": 4, "automated": true,  "setBy": "/work step 14 via pr-author" },
    { "key": "inTesting",  "name": "In Testing",  "order": 5, "automated": true,  "setBy": "/merge (after squash-merge)" },
    { "key": "done",       "name": "Done",        "order": 6, "automated": false, "setBy": "HUMAN ONLY — never set by any agent or command." }
  ],
  "transitionResolution": "by-name",
  "transitionResolutionNote": "Resolve transitions via mcp__atlassian-divinelab__getTransitionsForJiraIssue, matching transition.to.name against jira.workflow[].name (case-insensitive/trimmed). Never hardcode numeric transition IDs.",
  "automatedTransitions": [
    { "from": "todo",       "to": "inProgress", "ownedBy": "/work step 3" },
    { "from": "inProgress", "to": "inReview",   "ownedBy": "/work step 14 (pr-author)" },
    { "from": "inReview",   "to": "inTesting",  "ownedBy": "/merge" }
  ],
  "forbiddenTransitions": [
    { "to": "done", "reason": "Human-only. /work and all agents MUST NOT move any issue to Done." }
  ],
  "needsRefinementMechanism": "label",
  "needsRefinementLabel": "needs-refinement",
  "humanGateNote": "Every tracker WRITE happens at/after a human gate. /work owns exactly two automated transitions (todo->inProgress, inProgress->inReview). It NEVER moves an issue to Done."
}
```

`qaDepth.sourceNote`, `labelToCommitType`, `needsRefinement*`, and `qaLoop.transitions._note` prose
must be reworded off Trello (custom-field/label, not checklist; transition, not list move).
`qaLoop.env.*` (Vercel/Mongo allowlists) are tracker-agnostic — **no change**.

---

## API / tool mapping (Trello MCP → `atlassian-divinelab`)

| Trello tool                                               | Replacement                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `set_active_board` / `get_lists` / `get_cards_by_list_id` | (gone — resolve by key) `getJiraIssue`; for batches `searchJiraIssuesUsingJql` |
| `get_card`                                                | `getJiraIssue`                                                                 |
| `move_card`                                               | `getTransitionsForJiraIssue` → `transitionJiraIssue` (by name)                 |
| `add_comment`                                             | `addCommentToJiraIssue`                                                        |
| `add_card_to_list`                                        | `createJiraIssue`                                                              |
| `update_card_details`                                     | `editJiraIssue`                                                                |
| `get_board_labels`                                        | (Jira labels are free-text; read via `getJiraIssue` fields.labels)             |
| `*checklist*`                                             | dropped → `needs-refinement` label via `editJiraIssue` (D2)                    |
| `get_acceptance_criteria`                                 | dropped → parse ACs from issue description (D1)                                |
| `attach_image_to_card`                                    | dropped → Jira REST in `post-jira-result.mjs` (D3)                             |

**`post-jira-result.mjs` contract:** POST `/rest/api/3/issue/{key}/attachments` (Basic auth
`email:apiToken`, header `X-Atlassian-Token: no-check`) for each screenshot, then
`addCommentToJiraIssue` with an ADF/markdown body embedding the attachment thumbnails + the
structured per-AC result table.

---

## Modified / New Files

**Tracked (in the PR) — ~23 files:**

| File                                                                 | Change                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `.claude/config.json`                                                | tracker→jira block; link base; qaLoop fields                                   |
| `.claude/agents/product-manager.md`                                  | frontmatter tools + heavy body rewrite                                         |
| `.claude/agents/pr-author.md`                                        | frontmatter tools + body (transition-by-name)                                  |
| `.claude/agents/acceptance-judge.md`                                 | frontmatter (drop `get_acceptance_criteria`/`get_card` → `getJiraIssue`); body |
| `.claude/agents/explorer.md`                                         | body prose (createJiraIssue; idShort→key)                                      |
| `.claude/agents/implementer.md`                                      | body prose (idShort→key)                                                       |
| `.claude/agents/qa-runner.md`                                        | body prose (idShort→key)                                                       |
| `.claude/agents/qa-acceptance.md`                                    | body prose (idShort→key)                                                       |
| `.claude/commands/work.md`                                           | heavy rewrite (intro, resolution, transitions, refinement gate, QA post)       |
| `.claude/commands/qa.md`                                             | batch/single via JQL; ACs from description; transitions; screenshots           |
| `.claude/commands/merge.md`                                          | resolve by key; In Review→In Testing; post-merge comment                       |
| `.claude/commands/pm.md`                                             | resolve by key; namespace                                                      |
| `.claude/commands/verify.md`                                         | one-line reword ("…or Jira")                                                   |
| `.claude/commands/predica.md`                                        | one-line reword ("never move any Jira issue to Done")                          |
| `.claude/scripts/qa/post-trello-result.mjs` → `post-jira-result.mjs` | **new code** (REST)                                                            |
| `CLAUDE.md`                                                          | session-naming line; /pm desc; harness doc ref                                 |
| `AGENTS.md`                                                          | "## Tracker (Trello)" → Jira; idShort→key                                      |
| `docs/agent-harness.md`                                              | the big doc rewrite (board/lists/keys/gates)                                   |
| `docs/contributing.md`                                               | ICR-N/idShort; label map; PR template line                                     |
| `docs/contentful-mcp.md`                                             | incidental example list (optional)                                             |
| `docs/product/README.md`                                             | "draft a Trello card" → "Jira issue"                                           |
| `docs/product/scope-and-boundaries.md`                               | same                                                                           |
| `.github/PULL_REQUEST_TEMPLATE.md`                                   | `trello.com/c/<shortLink>` → `divinelab.atlassian.net/browse/ICR-N`            |

**Local / not committed:** `.claude/settings.local.json` (enable server), `qa-env.json` (jira block).
**No change:** `.claude/hooks/session-namer.sh`, `.claude/settings.json`.

---

## Tracker-flow (who writes what, Jira)

```
PM (/pm) ───────── create issue (To Do) + needs-refinement label ── createJiraIssue / editJiraIssue
                                                                     (Done? NEVER)
/work step 1.5 ─── ready-gate: absence of needs-refinement label ── getJiraIssue
/work step 3 ───── To Do → In Progress ───────────────────────────── getTransitions → transition
/work step 14 ──── (pr-author) In Progress → In Review + PR comment ─ getTransitions → transition + addComment
/qa ────────────── read ACs from description; post result + shots ── searchJQL / getJiraIssue / post-jira-result.mjs
/merge ─────────── In Review → In Testing (after squash-merge) ───── getTransitions → transition
HUMAN ──────────── In Testing → Done ─────────────────────────────── (no agent path exists)
```

---

## Edge Cases

1. **Missing status on board** (e.g. no "In Review"): `getTransitionsForJiraIssue` won't offer it →
   transition fails loudly. Mitigation: Dependency 2 (configure board) + Checkpoint 0 confirmation.
2. **Stale issue key (ICR-N 404):** surface the error; never invent/guess a key.
3. **Transition name drift** (board renamed "In Review"→"Review"): by-name match fails → update
   `jira.workflow[].name`. Document that names are the contract, resolved at runtime.
4. **`needs-refinement` label absent on a legacy issue:** treat absence as "ready" (same as Trello
   no-checklist) — acceptable; PM owns labeling on intake.
5. **Screenshot attach auth missing** (`qa-env.json` has no `jira` block): `post-jira-result.mjs`
   degrades to a text-only comment + a logged warning; never crashes the QA run.
6. **Two automated transitions only:** `/work` must never reach In Testing or Done.

---

## i18n

N/A — the harness is agent/dev tooling; no `public/locales/*` user-facing strings are touched.

---

## Testing Strategy

- **Static:** grep the final diff — must return **zero** `mcp__trello__` and zero bare
  `mcp__atlassian__` (no `-divinelab`). JSON-lint `config.json`. `pnpm type-check && pnpm lint`
  (no source touched, but run for safety).
- **Live smoke (post-merge, on a throwaway ICR test issue):**
  - `getJiraIssue("ICR-N")` resolves by key.
  - `getTransitionsForJiraIssue` returns the configured status names.
  - A dry `/pm` intake creates an issue in To Do with `needs-refinement`.
  - A dry `/work` on a test issue performs To Do→In Progress then In Progress→In Review only.
  - `post-jira-result.mjs` attaches a sample PNG + posts a comment.
- No vitest unit tests warranted (config/markdown/script-glue only).

---

## Implementation Checkpoints

**Branch:** `chore/ICR-N-jira-harness-migration` off `main` (after PR #50 merges). One PR, staged commits.

- **CP0 — Confirm board + statuses.** Create the migration issue **ICR-1** ("chore: repoint agent
  harness Trello→Jira"); read `getTransitionsForJiraIssue` to lock the real status names; if In
  Review/In Testing are missing, add them in the Jira board UI. Update the spec's `jira.statuses`.
  _Verify:_ transitions list the 6 names. _(requires human OK to create the first issue)_
- **CP1 — config.json.** Write the `jira` block (R1, R9). _Verify:_ JSON lints; names match CP0.
  _Commit:_ `chore(ICR-N): config.json tracker→jira block`
- **CP2 — Agents.** Repoint 3 frontmatter allowlists + 4 prose bodies (R4). _Verify:_ grep clean.
  _Commit:_ `chore(ICR-N): repoint agents to atlassian-divinelab`
- **CP3 — Commands.** Rewrite `/work` `/qa` `/merge` `/pm`; reword `/verify` `/predica` (R5).
  _Verify:_ grep clean; flows read coherently. _Commit:_ `chore(ICR-N): repoint slash commands to Jira`
- **CP4 — Screenshot helper.** `post-jira-result.mjs` (R6, D3). _Verify:_ dry-run attaches to a test
  issue. _Commit:_ `chore(ICR-N): port QA result poster to Jira REST`
- **CP5 — Docs.** Repoint harness docs + PR template (R7). _Verify:_ no Trello/idShort left in docs.
  _Commit:_ `docs(ICR-N): repoint harness docs Trello→Jira`
- **CP6 — Local prereqs (not committed).** Enable server in `settings.local.json`; add `qa-env.json`
  `jira` block. _Verify:_ full `/work`→`/qa` dry run on the ICR test issue.

---

## Open Questions

1. **D4 commit-type source:** Jira issue type vs. labels? (recommend issue type + optional label).
2. **Status names / board config:** confirm at CP0; does the board already have In Review / In
   Testing, or do we add them? Is "Backlog" a real status or just a board column?
3. **Trello data migration:** are there open Trello cards on "IDCR Website" to import into ICR, or do
   we start ICR fresh? (Out of scope for the harness repoint; track separately if needed.)
4. **foodista server rename:** foodista is mid-flight renaming its server to `atlassian-foodista`;
   unrelated to this repo, noted only so we don't copy its transitional `mcp__atlassian__` strings.
