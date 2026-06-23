# Harness Automation v2 — Implementation Spec

**Status:** Draft for approval · **Owner:** Gabriel · **Date:** 2026-06-23
**Goal:** Extend the agent harness from _"idea → reviewed PR"_ to a fully automated
_"idea → merged → staging-verified"_ pipeline, keeping exactly **two human gates**:
(1) a _conditional_ brainstorm/spec gate, and (2) the **merge approval**.

This spec is grounded in the gap audit run on 2026-06-23 (13 gaps, REQ1–REQ13) against the
current harness (`/pm`, `/work`, `/qa`, `/verify`, the 8-agent roster, `config.json`).

---

## 0. Decisions locked (this session)

| Decision            | Choice                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Post-PR review loop | **`ScheduleWakeup` (dynamic-paced)** — keeps session+worktree context for stateful fixes & idempotent replies; delay tuned to CI+Codex time. `CronCreate` deferred (headless-only variant). |
| Merge trigger       | **Dedicated `/merge ICR-N`** command (the real owner); `/work` hands off to it on "merge"         |
| Staging domain      | **`staging.idcredentor.com`** → host allowlist `^staging\.idcredentor\.com$`                       |
| Design gates        | **Skip trivial, gate on material decisions**; the six sensitive areas **always** gate            |
| Staging Mongo       | Real **`website-staging`** DB exists (created by Gabriel). QA may read/write it; prod `website` stays hard-denied. |
| `/merge` CI gate    | **Refuse to merge on red CI** (`requireCiGreen: true`).                                            |
| Docs                | Full **`docs/agent-harness.md`** rewrite at the end (v1 snapshot → v2).                            |

### Live-board facts (verified 2026-06-23)

The board (`IDCR Website`, id `67a7a743186065f07e87bbe9`) already has the target list shape — **no list creation needed**, only config wiring + drift fixes:

```
Backlog → To Do → In Progress → In Review → In Testing → Done
67a7a748…  67b500c7…  67a7a74b…    67a7a74d…    6a3a7f99c43d9b731c47fe61  67a7a758…
```

- **`Dsicovery` was renamed to `Backlog`** (same id `67a7a748b44f06e964c9eddd`). Remove every "intentionally misspelled — do NOT correct" note across the harness; the display name is now `Backlog`.
- **`In Testing` already exists** → id `6a3a7f99c43d9b731c47fe61`.
- **Board name drifted**: config `tracker.boardName` is `"IDC Redentor website"` but the board is now **`IDCR Website`** (id unchanged). Fix in Phase 0.

---

## 1. Target end-to-end flow

```
/pm  ──► card in To Do (Refinement→needs-refinement checklist cleared = ready)
        │
/work ICR-N
   1. resolve card
   2. ★ NEW GATE: open `needs-refinement`? → STOP, carrail: (a) refine now  (b) pick another
   3. worktree + branch ; To Do → In Progress  (automated move #1)
   4. explore (explorer emits machine-readable `needsDesignGate`)
   5. ★ CONDITIONAL GATE: brainstorm + spec ONLY if needsDesignGate ; else automated
   6. implement ↔ verify loop  (local stack)
   7. open DRAFT PR  → preview deploy
   8. ★ PRE-MERGE QA on PREVIEW (always-on, type-aware):
         UI → browser walk + screenshots ; API → API tests ; chore → unit/codebase
         tester (evidence) → acceptance-judge (verdict) → post to PR + Trello
   9. flip PR ready ; In Progress → In Review  (automated move #2)
  10. ★ POST-PR LOOP (detached ScheduleWakeup): watch review comments + CI
         comments → implementer + receiving-code-review → fix + reply per thread
         CI red → feed back to implementer
         clean (QA pass ∧ CI green ∧ comments addressed) → 🔔 notify "ready for your review"
        │
   you review ──► (changes? iterate on same PR)  ──►  you say "merge"
        │
/merge ICR-N   (user-triggered ONLY)
  11. gh pr merge --squash --delete-branch  (squash ONLY)
  12. remove worktree + branch
  13. In Review → In Testing  (NEW list)        (automated move #3)
  14. ★ POST-MERGE QA on STAGING (staging.idcredentor.com):
         tester → acceptance-judge → post results to Trello
        │
   you deploy prod from Vercel  ──►  you move In Testing → Done   (HUMAN ONLY)
```

`/qa ICR-N` (standalone) — default target **staging**; `--preview` re-targets the PR preview.
Same tester → acceptance-judge → post-to-card pipeline as the embedded QA steps.

---

## 2. Trello list-model change (REQ8)

**"In Testing" already exists** between **In Review** and **Done** (id `6a3a7f99c43d9b731c47fe61`) — this is config wiring only, no board mutation:

```
Backlog → To Do → In Progress → In Review → In Testing → Done
  (PM)     (PM)     (#1 /work)   (#2 /work)  (#3 /merge)  (HUMAN, after prod deploy)
```

- `Done` stays **human-only** — `forbiddenTransitions` keeps blocking `→ done`. Nothing infers
  "staging passed" ⇒ "safe for Done"; the human's manual prod deploy is the precondition.
- All moves by **`listId`**, never name. (The `Dsicovery` misspelling is gone — it's `Backlog` now;
  purge the "do not correct the misspelling" guards from the harness.)

---

## 3. Config changes (`.claude/config.json`)

### 3.1 `tracker.lists` + `workflow` + `automatedTransitions`

```jsonc
"tracker": {
  "boardName": "IDCR Website",            // was "IDC Redentor website" — renamed (id unchanged)
  "lists": {
    "discovery": { "id": "67a7a748b44f06e964c9eddd", "name": "Backlog" },   // was "Dsicovery"
    // ...todo, inProgress, inReview unchanged...
    "inTesting": { "id": "6a3a7f99c43d9b731c47fe61", "name": "In Testing" },
    "done":      { "id": "67a7a758f2da48a6482634a2", "name": "Done" }
  },
  "workflow": [
    { "key": "discovery", "name": "Backlog", "listId": "67a7a748b44f06e964c9eddd", "order": 1, "automated": false, "setBy": "PM / human" },
    // ...todo(2) inProgress(3) inReview(4)...
    { "key": "inTesting", "name": "In Testing", "listId": "6a3a7f99c43d9b731c47fe61", "order": 5, "automated": true,  "setBy": "/merge (In Review -> In Testing, after squash-merge)" },
    { "key": "done",      "name": "Done",       "listId": "67a7a758f2da48a6482634a2", "order": 6, "automated": false, "setBy": "HUMAN ONLY — after manual prod deploy" }
  ],
  "automatedTransitions": [
    // ...existing two...
    { "from": "inReview", "to": "inTesting", "ownedBy": "/merge", "gate": "after squash-merge succeeds" }
  ]
}
```
> **Drift sweep (Phase 0):** the `Dsicovery`→`Backlog` rename and `IDC Redentor website`→`IDCR Website`
> rename touch `config.json` **and** prose in `work.md`, `pm.md`, `product-manager.md`, `explorer.md`,
> `pr-author.md`, `docs/agent-harness.md`. Grep `Dsicovery` and `IDC Redentor website` and fix all hits.

### 3.2 needs-refinement matchers (REQ1 — make the gate deterministic)

```jsonc
"tracker": {
  // ...
  "needsRefinementChecklistName": "Refinement",
  "needsRefinementItemText": "needs-refinement"
}
```

### 3.3 `qaLoop.env.staging` (REQ13) — env-aware, prod still hard-denied

```jsonc
"qaLoop": {
  "env": {
    "preview": { /* unchanged */ },
    "staging": {
      "target": "staging",
      "baseUrlFrom": "qa-env.staging.baseUrl",
      "baseUrlHostAllow": "^staging\\.idcredentor\\.com$",
      "productionHostDeny": ["idcredentor.com", "www.idcredentor.com", "idcredentor.org",
                             "idc-redentor-website.vercel.app", "idc-redentor-web.vercel.app"],
      "requirePreviewEnvironment": false,
      "requirePreviewEnvironmentNote": "Staging is NOT a Vercel preview — it has its own allowlist. It MUST NOT inherit the preview's must-be-a-Vercel-preview check, but it MUST keep the production hard-deny.",
      "liveIntegrationPolicy": "no-POST",
      "liveIntegrationNote": "Staging has its OWN 'website-staging' Mongo DB (created by Gabriel + wired in Vercel), so Mongo reads/writes against website-staging are allowed. BUT Mailchimp/SendGrid/Resend are presumed LIVE on staging unless sandbox creds exist — so QA must NOT happy-path POST /api/subscribe or /api/contact (it would email a real recipient / hit the live audience). Form submit/validation can be tested up to the network boundary; full end-to-end form POST is DEFERRED until staging has sandbox mail creds or a test recipient.",
      "mongoMcp": "mcp__mongodb-localhost__",
      "dbNameAllow": "^website-(test|qa|e2e|staging)$",
      "dbNameAllowNote": "Now INCLUDES 'website-staging' (the real staging DB). Prod 'website' stays excluded — never read/write it."
    }
  }
}
```
> ⚠️ Update `qaLoop._note` — it currently says "there is NO separate staging env." That line is now false.

### 3.4 `reviewLoop` (REQ3/4/5/6) — the detached post-PR loop

```jsonc
"reviewLoop": {
  "driver": "schedule-wakeup",              // ScheduleWakeup (dynamic-paced). CronCreate = future headless-only variant.
  "firstCheckSeconds": 240,                  // first tick ~4min after PR-ready — catch Codex bot review + first CI signal
  "pollSeconds": 270,                        // subsequent idle ticks: stay inside the 5-min prompt-cache window
  "afterPushSeconds": 420,                   // after WE push a fix, wait longer for the fresh CI run to start+finish
  "maxIterations": 8,                        // kill switch — never spin forever
  "totalTimeoutSeconds": 2400,               // ~40min hard cap across the whole loop
  "ciTimeoutSeconds": 1800,
  "watch": ["reviewComments", "ciChecks"],   // BOTH: Codex/code-review comment threads AND CI pipeline status
  "idempotency": "reply-marker",             // skip threads we already replied to (track addressed thread ids in state file)
  "readinessRequires": ["qaPass", "ciGreen", "commentsAddressed"],
  "notify": "push"                           // PushNotification to the user on readiness
}
```
> **Pacing rationale:** the Codex review bot posts a few minutes after PR-ready, and each fix we push
> kicks a new CI run. So: first tick ~4 min (catch the bot + first CI), idle re-checks ~270s (cache-warm),
> but after we push a fix wait ~7 min for the new CI to complete before re-evaluating. The loop ends on
> `clean` (QA pass ∧ CI green ∧ no unaddressed threads) OR `maxIterations`/`totalTimeoutSeconds`, then
> notifies the user either way (clean → "ready for review"; capped → "needs your eyes, here's why").

### 3.5 `merge` (REQ7) — user-gated; compatible with `autoMerge.enabled=false`

```jsonc
"merge": {
  "method": "squash",
  "squashOnly": true,
  "requireUserTrigger": true,               // NEVER autonomous; autoMerge stays false
  "requireCiGreen": true,                    // refuse merge if CI not green
  "deleteWorktreeAndBranch": true,
  "moveTo": "inTesting",
  "postMergeQa": "staging"
}
```

### 3.6 `qaLoop.reviewAgents.acceptance`

```jsonc
"reviewAgents": { "code": "feature-dev:code-reviewer", "security": "security-reviewer",
                  "acceptance": "acceptance-judge" }
```

### 3.7 `qa-env.json` contract

Add `staging.baseUrl` (the gitignored runtime file; `.env.example`/docs reference the **name** only).

---

## 4. New agent: `.claude/agents/acceptance-judge.md` (REQ12)

Modeled on **`security-reviewer`** (fresh, adversarial, returns a gating verdict) — the precedent
already exists. Key properties:

- **Fresh context, product-focused.** No browser/MCP execution tools — it does **not** drive a
  browser or re-run anything. Inputs = the tester's **evidence** (written report + screenshot
  paths) + the card's **acceptance criteria** (`mcp__trello__get_acceptance_criteria`).
- **Output:** structured compliance verdict — overall `pass|partial|fail` + per-AC
  `{n, text, verdict, rationale, evidenceRef}` — shaped to drop straight into the `trello-result`
  `perAC` table.
- **Tools:** `Read`, `Grep`, `Glob`, `mcp__trello__get_acceptance_criteria`, `mcp__trello__get_card`.
- **Separation of concerns:** the **tester** proves _what the system does_ (evidence); the
  **judge** decides _whether that meets the card_ (product). Never fused.

---

## 5. Agent refactors

| File                     | Change                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qa-acceptance.md`       | Become **tester-only**; select env block by **name** (`preview`\|`staging`) with per-env allowlist; keep production hard-deny + staging `no-POST`. Emit raw evidence (may include a draft per-AC observation) — authoritative verdict comes from `acceptance-judge`. |
| `qa-runner.md`           | Add a **TYPE taxonomy** decoupled from depth: `UI → MCP browser walk + screenshots (always)`, `API → API tests`, `chore → vitest/local only`. Depth becomes the **effort dial**, not an on/off switch (no more `light = skip`). Env-aware like qa-acceptance. |
| `explorer.md`            | Emit machine-readable **`needsDesignGate`** boolean (true if sensitive areas non-empty OR suggestedQaDepth > light OR touches data-model/API/CSP/i18n/email). Keeps sensitive-areas + suggestedQaDepth. |
| `implementer.md`         | New input: **PR review-comment threads**. When present, invoke **`superpowers:receiving-code-review`**, fix on the feature branch (never `--no-verify`), and **reply per-thread** (`mcp__github__add_reply_to_pull_request_comment`). |
| `pr-author.md`           | Unchanged ownership (still only `→ In Review`, **never merges**). The `In Review → In Testing` move and merge live in `/merge`, preserving pr-author's single responsibility + secret-scrub discipline. |

---

## 6. Command changes

| File                          | Change                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work.md`                     | (a) **Entry gate** after card resolve / before move #1: read `Refinement` checklist; open `needs-refinement` → STOP + carrail (refine via `product-manager` refine mode / pick another). (b) **Conditional** brainstorm+spec keyed off `explorer.needsDesignGate`. (c) **Pre-merge QA always-on**, type-aware, tester → judge, **dual-post to PR + Trello**. (d) After mark_ready, **schedule the detached review loop**. (e) On in-session "merge", hand off to `/merge`. |
| `qa.md`                       | **Default env = staging** (`config.qaLoop.env.staging`); `--preview` flag re-targets the PR preview (existing path). Both run tester → `acceptance-judge` → post to card. |
| `merge.md` **(new)**          | User-gated: `gh pr merge --squash --delete-branch` (refuse if `requireCiGreen` and CI not green) → remove worktree+branch → move In Review → In Testing → dispatch **staging QA** (tester → judge → post). **Never** `→ Done`. |
| `verify.md`                   | Unchanged (correctly local-only).                                                                                                                  |

---

## 7. Script change: `.claude/scripts/qa/post-trello-result.mjs`

- **Parameterize provenance** — replace hardcoded footer `_Posted by /qa_` with `meta.postedBy`
  (`/qa` | `/work` | `/merge`) so `/work`-originated and staging QA aren't mislabeled.
- **Generalize the URL label** — replace literal `Preview:` with `meta.envName`-aware label
  (`Preview:` | `Staging:`), reading `meta.targetUrl` (fall back to `previewUrl`).
- **Require `meta.envName`** (don't silently default to `preview`).
- **(REQ9 dual-post)** Add a PR-posting path (or have the orchestrator post via
  `gh pr comment` + screenshot upload) — the script today posts to Trello only.

---

## 8. Security invariants (must-not-weaken)

1. **Production hard-deny in every QA path** — custom domains **and** the prod `*.vercel.app`
   aliases — for both `preview` and `staging`.
2. **Staging gets its own allowlist** and **never inherits** the "must be a Vercel preview" check.
3. **No live-integration POST on staging** (`/api/subscribe`, `/api/contact`); Mongo behind the
   `^website-(test|qa|e2e)$` allowlist (prod `website` DB excluded).
4. **Secret scrub before every `gh`/Trello write** — extend to the new merge + PR-comment paths.
5. **Done stays human-only**; no agent infers staging-pass ⇒ Done.
6. **Autonomous loop kill switch** — `maxIterations` + `ciTimeoutSeconds`; **idempotent replies**
   (never re-reply to an addressed thread).
7. **Merge is user-triggered only** — `autoMerge.enabled` stays `false`; `/merge` requires an
   explicit human "merge".

---

## 9. Phased rollout (dependency-ordered, each phase shippable)

### Phase 0 — Foundation (config + board) — _no behavior change_
- Create "In Testing" list; update `tracker.lists/workflow/automatedTransitions`.
- Add `qaLoop.env.staging`, `reviewLoop`, `merge`, needs-refinement matchers, `reviewAgents.acceptance`.
- Update `qaLoop._note`; add `qa-env.json → staging.baseUrl` to the contract docs.
- **Verify:** `config.json` parses; board shows the new list.
- **Commit:** `chore(harness): add In Testing list + staging env + reviewLoop/merge config`

### Phase 1 — Env-aware QA + tester/judge split — _prereq for staging & always-on QA_
- Refactor `qa-acceptance.md` + `qa-runner.md` to env-by-name (preview|staging), per-env allowlist,
  prod hard-deny in both, staging `no-POST` + data-safety.
- Create `acceptance-judge.md` (fresh, no-exec, evidence + ACs → verdict).
- **Verify:** judge produces a valid verdict from a sample evidence bundle; env selection reasoned.
- **Commit:** `feat(harness): env-aware QA testers + acceptance-judge agent`

### Phase 2 — `/work` entry gate + conditional design gates — _independent; parallel after P0_
- Add needs-refinement read-gate + carrail to `work.md`.
- `explorer.md` emits `needsDesignGate`; `work.md` makes brainstorm+spec conditional on it.
- **Verify:** trivial ticket auto-pilots; sensitive ticket gates.
- **Commit:** `feat(harness): /work needs-refinement gate + conditional brainstorm/spec`

### Phase 3 — Pre-merge QA always-on, type-aware, dual-post — _depends P1_
- `work.md` step 13 unconditional for testable tickets; TYPE→mode; depth=effort.
- `qa-runner.md` chore→unit + API→API paths; tester → acceptance-judge.
- Parameterize `post-trello-result.mjs`; add PR posting.
- **Verify:** UI/API/chore tickets each produce the right evidence on PR + Trello.
- **Commit:** `feat(harness): always-on type-aware pre-merge QA with PR+Trello evidence`

### Phase 4 — Post-PR autonomous loop (detached) — _depends P3 for QA signal_
- `work.md` after mark_ready: `ScheduleWakeup` re-check at `reviewLoop.pollSeconds`; each tick pulls
  review threads + `gh pr checks`; comments → implementer + `receiving-code-review` + per-thread
  reply; CI red → implementer feedback; readiness (QA∧CI∧comments) → `PushNotification`.
- `implementer.md` PR-thread input + receiving-code-review wiring.
- **Verify:** simulate a review comment + a red check; loop addresses both, then notifies; respects
  `maxIterations`.
- **Commit:** `feat(harness): detached post-PR review+CI loop with readiness notify`

### Phase 5 — `/merge` + post-merge staging QA + `/qa` retarget — _depends P0,P1_
- New `merge.md`; `/work` in-session hand-off.
- `qa.md` default staging + `--preview` flag.
- **Verify:** `/merge` squash-merges, cleans up, moves → In Testing, runs staging QA, posts results;
  `/qa` and `/qa --preview` both work.
- **Commit:** `feat(harness): /merge squash + post-merge staging QA + /qa staging default`

---

## 10. Open questions / deferred

**Resolved (2026-06-23):**
1. ✅ **Staging DB** — a real **`website-staging`** Mongo DB exists (Vercel vars wired). Staging QA
   reads/writes it; prod `website` stays hard-denied. `dbNameAllow` includes `staging`.
2. ✅ **`/merge` CI precondition** — `requireCiGreen=true` (refuse merge on red CI).
3. ✅ **Loop driver** — **`ScheduleWakeup`** (dynamic-paced, stateful, worktree-bound). CronCreate
   deferred to a future headless variant.
4. ✅ **Docs** — full `docs/agent-harness.md` rewrite at the end (Phase 6).

**Still deferred:**
- **End-to-end form POST on staging** — testing `/api/subscribe` + `/api/contact` for real would hit
  LIVE Mailchimp/SendGrid unless staging has sandbox creds or a test recipient. Until then, staging
  QA tests forms up to the network boundary only (`no-POST`). Revisit when sandbox creds exist.
- **Loop driver fallback** — if the user routinely closes the session mid-loop, add a `CronCreate`
  headless variant that re-derives state from the PR/Trello each tick (Phase 4 follow-up).
```
