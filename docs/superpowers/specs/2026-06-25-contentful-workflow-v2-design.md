# Contentful workflow v2 — design spec (ICR-83)

> **Status:** approved design, ready for implementation planning.
> **Card:** [ICR-83](https://trello.com/c/6Wh0vPg9) (In Progress).
> **Supersedes:** the PR #54 handoff brief (`docs/superpowers/plans/2026-06-25-contentful-entry-sync-handoff.md`) and the obsolete card **ICR-72** (old `agent-sandbox`/`master-0.0.1` env-hygiene).
> **Companion docs to update:** `docs/contentful-environments.md` (rewritten as the canonical doc), `docs/contentful-mcp.md`, `docs/contentful-data-layer.md`.

## 1. Goal

After the ICR-76 model refactor the space is on its final topology (`master` alias → `production`, plus `staging`). This iteration makes the **content + model workflow official, documented, and tooled** so humans and agents follow the same playbook, and fixes the leftovers from deleting `agent-sandbox`:

1. **One canonical workflow doc** covering the three real scenarios (entries-only / model-only / model+entries).
2. **An entry-sync tool** (`scripts/contentful/sync-entries.mjs`) — the missing free-tier replacement for Contentful **Launch** (paid) and for Merge's model-only limitation.
3. **Re-point `/predica`** off the deleted `agent-sandbox` → `production` (draft-only, human publishes).
4. **A read-only drift detector** so staging↔production divergence surfaces without anyone remembering to check.

Non-goals: Contentful **Launch** (paid — rejected), auto `staging→production` promotion (always human-gated), and any new content-type changes (that's ordinary model work that _uses_ this workflow).

## 2. The mental model (the rule to keep in your head)

> **Content lives in production; models are forged in staging.**
> **Content flows _down_ (production → staging) to refresh; models flow _up_ (staging → production) at cutover.**

| Name         | Kind                            | Role                                                                                   |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------- |
| `master`     | **alias** → always `production` | What the app reads (live). Re-pointed only during the brief heavy-cutover window (§5). |
| `production` | environment                     | **Live.** Where entries are authored & live (blog, Creed, sermons).                    |
| `staging`    | environment                     | Work env. Where model changes are built & tested. The free tier's one spare slot.      |

Free-tier quota = **two environments** (the alias target `production` + one more = `staging`). You can never hold a third; this constraint shapes every cutover below.

## 3. Dependencies check (must hold before implementation)

- `production` and `staging` both exist; `master` alias → `production`. (Verified 2026-06-25.)
- Env vars available to scripts: `CONTENTFUL_SPACE_ID` (= `vg9le24yw8hb`), `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` (CMA, all-env access), `NEXT_PUBLIC_BASE_URL` + `CONTENTFUL_REVALIDATE_SECRET` (for the post-sync revalidate call).
- The CDA/CPA API keys allow `staging` (human-granted once) so the staging-pointed preview renders. Production is covered by the alias automatically.
- Proven precedent to reuse: `scripts/contentful/migrations/03b-remap-belief-item.mjs` & `05b-remap-section.mjs` (CMA create/copy-locales/repoint-links/publish/delete, `--dry-run`), the D0.5 sermon cross-env copy (same `sys.id`, all locales, assets via upload-from-URL), `.claude/scripts/predica/upload-contentful-asset.mjs` (binary upload fallback).
- Node 22.14.0; ESM; `contentful-management` plain client already a dependency.

## 4. The three scenario playbooks (the documented process)

### Scenario A — Entries only (the daily case, ~95%)

1. Author/edit **directly in `production`** — the Contentful web app, or `/predica` for sermons. Draft → preview in prod (preview token + draft mode) → **Publish**.
2. Publish fires the Contentful webhook → `POST /api/revalidate` → `revalidateTag("site-content")` → the site refreshes. **No staging, no code, no merge tool.**
3. **Keep staging fresh** (so future model work builds against real content): periodically, and always before starting model work, run:
   ```
   node scripts/contentful/sync-entries.mjs --from production --to staging --apply
   ```
   This is also the **immediate fix for the current drift** (prod has published entries staging lacks).

### Scenario B — Model changes only

1. Build the model change in `staging` (committed `scripts/contentful/` migrations + the Contentful MCP, default env `staging`). Test on the `staging`-pointed Vercel preview + local.
2. **Cut over (HUMAN), sized by risk:**
   - **Small / additive** (new type/field, validation, default, help text) → Contentful **Merge** app diffs the _model_ `staging → production`. No alias move. Land it with the code PR.
   - **Destructive** (delete/rename a type or field that has entries or inbound links) → **delete/remap the dependent entries in `production` FIRST** (committed remap migration run against prod, or the web app), _then_ Merge the schema deletion. Merge will not sequence this — this is the ordering trap.
   - **Big / breaking / many-coupled** → the **heavy alias-swap cutover** (§5).

### Scenario C — Model + entries (the common combo)

1. **Refresh staging ← production first** (`sync-entries.mjs --from production --to staging --apply`) so you build against current content.
2. Build the model **and** the content in `staging`. Test.
3. **Cut over (HUMAN):**
   - **Small** → Merge the model up, then promote the specific new entries:
     ```
     node scripts/contentful/sync-entries.mjs --from staging --to production --ids <id,id,...> --apply
     ```
     (drafts by default; you publish) — or run the committed entry-remap migration against `production`.
   - **Big / breaking** → the **heavy alias-swap clone** (§5) moves model + entries together, atomically. Cleanest for big combos.

## 5. Heavy alias-swap cutover runbook (stable-name version)

Use **only** when a reverse migration would be painful (type deletions, field renames, merges, big combos). Replaces the old semver `master-X.Y.Z` naming with **stable names** (`production` + `staging`).

Start: `master → production`, plus `staging` (work env, fully tested).

0. **Cold backup (insurance).** Export old production to a gitignored local file — kept until you're confident, then deleted:
   ```
   npx contentful space export --space-id vg9le24yw8hb --environment-id production \
     --management-token "$CONTENTFUL_MANAGEMENT_ACCESS_TOKEN" \
     --content-file scripts/contentful/backups/production-YYYY-MM-DD.json
   ```
1. **Re-point `master` alias → `staging`.** (Contentful → Settings → Environments → Environment Aliases.) The live site now reads the tested `staging` env. Do this at the same moment the code PR merges (the new code expects the new model).
2. **Delete the old `production` env.** (Frees the slot. Contentful forces this order — you cannot delete the env an alias points at, which is why step 1 comes first.)
3. **Clone `staging` → a fresh env named `production`** (`create_environment` with `sourceEnvironmentId: staging`). Re-grant CDA/CPA key access if the recreate dropped it.
4. **Re-point `master` alias → `production`.**
5. **Re-establish staging for the next cycle:** `sync-entries.mjs --from production --to staging --apply` (or re-clone). Delete the cold backup once the site is verified healthy.

End: `master → production` + `staging`. Stable names preserved.

**⚠️ Known tradeoff (documented, accepted):** on the free tier you cannot hold three envs, so during steps 1–4 there is **no separate rollback env**. Mitigations: (a) the alias points at the **known-good, fully-tested `staging`** the whole window; `staging` is never deleted, so a failed clone is just retried; (b) the only thing truly lost is the _pre-change_ production state, which a breaking change couldn't roll back to without also reverting code; (c) the §0 cold backup is the cold-restore path of last resort.

## 6. Safety model (who can write where)

| Writer                                           | May write                | Must NOT write                    | Enforced by                                                                     |
| ------------------------------------------------ | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| **Contentful MCP** (interactive agent edits)     | `staging`                | `master` alias **+** `production` | `ENVIRONMENT_ID=staging` (default) + `PROTECTED_ENVIRONMENTS=master,production` |
| **CMA scripts** (`/predica`, `sync-entries.mjs`) | `production` + `staging` | the `master` **alias** by name    | each script's own guard + explicit confirm on a `production` apply              |
| **Humans** (web app)                             | anything                 | —                                 | judgment + the human cutover gate                                               |

Key facts that make this work:

- Every Contentful **MCP** tool takes `environmentId` as a **required per-call argument** (verified against `get_entry`/`search_entries`/`create_entry` schemas). `ENVIRONMENT_ID` only sets the _default_. So the MCP is never truly "pinned": reads work against any env by passing the arg; `PROTECTED_ENVIRONMENTS` blocks _write_ tools whenever the target is protected, regardless of caller.
- Therefore `predica-publisher` reads `production` by passing `environmentId: "production"` on its read calls, while casual/forgetful model edits default to `staging` and can never hit live.
- The CMA scripts bypass the MCP entirely (management token), so protecting `production` in the MCP does not block them — their own alias guard + confirm is the control.

## 7. The entry-sync tool — `scripts/contentful/sync-entries.mjs`

A standalone ESM script using the plain CMA client, mirroring the existing migration conventions (`createClient({ accessToken: CONTENTFUL_MANAGEMENT_ACCESS_TOKEN }, { type: "plain" })`, `client.entry.getMany` pagination, `pick()` locale helper).

### 7.1 CLI

```
node scripts/contentful/sync-entries.mjs [options]

  --from <env>          source env id          (default: production)
  --to <env>            target env id          (default: staging)
  --apply               perform writes         (default: OFF → dry-run report only)
  --content-type <id>   restrict to a type (repeatable)
  --ids <id,id,...>     restrict to specific entry/asset sys.ids
  --publish             on staging→production, publish instead of leaving draft
  --allow-deletes       delete target entries/assets absent from source (default: OFF)
  --force               overwrite a target entry edited more recently than source
  --no-assets           skip assets (entries only)
  --skip-model-check    bypass the model-compatibility gate (power users only)
  --revalidate          after a production apply, POST /api/revalidate (default: ON for --to production)
```

**Dry-run is the default.** Writes require `--apply`. (Opposite of the migration runner's `--dry-run` flag, deliberately — the safe mode is the default for a tool that can touch production.)

### 7.2 Guards (run before anything else)

1. **Refuse the `master` alias** as `--from` or `--to` (you sync env ids, never the alias). Hard error.
2. **`--to production` requires `--apply` + an explicit typed confirmation** (read a `yes` from stdin; auto-`yes` only when `CONTENTFUL_SYNC_ASSUME_YES=1`, for the drift-detector's dry-runs which never apply to prod anyway).
3. Validate `--from` ≠ `--to`.

### 7.3 Pipeline

1. **Model-compatibility gate** (the core safeguard). Fetch content types from both envs (`client.contentType.getMany`). For every type involved in the copy (all types, or the `--content-type`-filtered set, or the types of the `--ids` set), assert: the type exists in the target, and field shapes match (`id`, `type`, `linkType`, `items.type`/`items.linkType`, `required`). On mismatch, **print a readable diff and abort** (unless `--skip-model-check`). This is what stops entries landing where their model doesn't exist.
2. **Diff (always printed).** Compare entries and assets by `sys.id` across source/target. Classify each as **new** (in source, not target), **changed** (different `sys.version`/`updatedAt`), **deleted** (in target, not source), **unchanged**. Print counts + a per-item list. In dry-run, stop here.
3. **Conflict detection.** For a **changed** item where the _target_ `sys.updatedAt` is newer than the _source_ `sys.updatedAt` (target edited since divergence), **skip + report** unless `--force`. (Last-writer-wins is opt-in, never silent.)
4. **Copy (apply mode), dependency-ordered:**
   - **Assets first** (entries link to them). Upsert each asset by `sys.id`: create with the same id if absent, else update fields. Asset binaries via **upload-from-URL** (source asset `file.url`); fall back to the predica binary-upload pattern if URL-source fails. Process (publish) the asset per the publish policy.
   - **Entries second**, two-pass if needed so link targets exist before linkers. Upsert by `sys.id`: copy **all locales**, **all fields** verbatim; entry/asset links keep their ids (same-id copy keeps inbound references intact automatically). Use get→merge→update for existing target entries (carry `sys.version`); create with explicit id for new ones.
5. **Publish policy** (per the locked decision):
   - **production → staging (refresh):** **mirror** the source publish state (published in prod ⇒ publish in staging; draft ⇒ leave draft) so staging looks like prod.
   - **staging → production (promote):** create/leave as **draft**; only publish when `--publish` is passed.
6. **Deletions:** only with `--allow-deletes` — unpublish (if published) then delete target items absent from source. Off by default.
7. **Revalidate:** after a successful `--to production` apply, `POST $NEXT_PUBLIC_BASE_URL/api/revalidate` with header `x-vercel-reval-key: $CONTENTFUL_REVALIDATE_SECRET` (best-effort; the publish webhook is the backstop). Skipped for prod→staging.
8. **Summary:** print created/updated/published/skipped/deleted counts and a non-zero exit on any error.

### 7.4 Implementation notes

- Reuse `pick()`, `getAll()`-style pagination from `03b-remap-belief-item.mjs`.
- Idempotent: re-running with no source changes is a no-op (everything classifies `unchanged`).
- Keep it a single file (~250–350 lines) with small pure helpers (`diff`, `compareContentTypes`, `copyAsset`, `copyEntry`) so each is unit-testable.

## 8. `/predica` re-point (agent-sandbox → production)

Behavior change: create the sermon entry as a **DRAFT in `production`**; the human reviews both locales, attaches media if deferred, and **Publishes**. Keeps the pipeline's two human gates.

| File                                                  | Change                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/config.json` → `predica`                     | `contentfulEnv: "production"`; rewrite `contentfulEnvNote` (no more "re-create agent-sandbox if missing"); update Gate-2 note (review+publish in prod). |
| `.claude/commands/predica.md`                         | Replace all `agent-sandbox` language; target `production`; "draft-only, human publishes"; drop the env-recreate step.                                   |
| `.claude/agents/predica-publisher.md`                 | Target `production`; **reads pass `environmentId: "production"`**; description updated; still no publish\_\* tools.                                     |
| `.claude/scripts/predica/upload-contentful-asset.mjs` | Default env `production`; **guard: refuse the `master` alias** (was: refuse master / use agent-sandbox).                                                |
| `.claude/scripts/predica/create-contentful-entry.mjs` | Default env `production`; same guard flip.                                                                                                              |
| `tasks/specs/sermon-pipeline.md`                      | Update the env references for accuracy (historical doc; note the v2 change).                                                                            |

The publisher continues to write via the two committed CMA scripts (no MCP writes), so the MCP's `PROTECTED_ENVIRONMENTS=production` does not impede it.

## 9. MCP configuration

- `.claude/config.json` (and the inline MCP registration documented in `docs/contentful-mcp.md`): default `ENVIRONMENT_ID=staging`; `PROTECTED_ENVIRONMENTS=master,production`.
- Update `docs/contentful-mcp.md` to describe the new default + dual protection and the per-call `environmentId` read pattern.

## 10. Drift detector — `.github/workflows/contentful-drift.yml`

- **Trigger:** `schedule` (weekly, e.g. Mondays 12:00 UTC) + `workflow_dispatch`.
- **Steps:** checkout → setup Node/pnpm → install → run the tool **dry-run both directions** with `CONTENTFUL_SYNC_ASSUME_YES=1` (it never applies — dry-run ignores the flag for writes):
  ```
  node scripts/contentful/sync-entries.mjs --from production --to staging
  node scripts/contentful/sync-entries.mjs --from staging --to production
  ```
- **Report:** if either run reports non-zero drift, **open or update a single GitHub issue** (stable title, e.g. `Contentful drift: staging ↔ production`) with the diff summary, via `gh issue` or `actions/github-script`. If no drift, close the issue if open. **Zero writes to Contentful.**
- **Secrets:** `CONTENTFUL_SPACE_ID`, `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` as repo secrets.

## 11. Files

### New

| File                                                                 | Purpose                                  |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `scripts/contentful/sync-entries.mjs`                                | The entry/asset sync tool (§7).          |
| `scripts/contentful/sync-entries.test.mjs` (or under test dir)       | Unit tests for the pure helpers (§13).   |
| `.github/workflows/contentful-drift.yml`                             | Weekly report-only drift detector (§10). |
| `docs/superpowers/specs/2026-06-25-contentful-workflow-v2-design.md` | This spec.                               |

### Modified

| File                                                  | Change                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `docs/contentful-environments.md`                     | Rewrite as the single canonical doc (§2–§6); drop ICR-76-in-flight text. |
| `docs/contentful-mcp.md`                              | New MCP default + dual protection + per-call env reads (§9).             |
| `docs/contentful-data-layer.md`                       | Cross-link the new workflow doc where relevant.                          |
| `.claude/config.json`                                 | predica `contentfulEnv` + MCP env/protection (§8, §9).                   |
| `.claude/commands/predica.md`                         | Re-point to production (§8).                                             |
| `.claude/agents/predica-publisher.md`                 | Re-point to production; per-call env reads (§8).                         |
| `.claude/scripts/predica/upload-contentful-asset.mjs` | Default prod + alias guard (§8).                                         |
| `.claude/scripts/predica/create-contentful-entry.mjs` | Default prod + alias guard (§8).                                         |
| `.gitignore`                                          | Add `scripts/contentful/backups/`.                                       |
| `tasks/specs/sermon-pipeline.md`                      | Env-reference accuracy note (§8).                                        |

### Closed / archived (not in this repo)

- PR #54 branch `docs/contentful-entry-sync-handoff` (content folded into this spec + the rewritten doc).
- Trello ICR-72 (superseded — human archives).

## 12. Edge cases

1. **Type missing in target** → model-compat gate aborts with a diff (don't create orphans).
2. **Field shape drift** (e.g. a field is `Symbol` in one env, `Text` in the other) → gate aborts; human reconciles the model first (Merge), then re-runs.
3. **Asset URL not fetchable** (unpublished source asset) → fall back to binary re-upload; if that fails, report the asset and continue with entries that don't depend on it (or abort if `--ids` targeted it).
4. **Concurrent edit conflict** (target newer than source) → skip + report unless `--force`.
5. **Same id, different content type** across envs (shouldn't happen, but) → treat as a hard error, never coerce.
6. **Rich-text embedded links** to entries/assets → preserved automatically by same-id copy; verify the linked targets are in the copy set or already present in target.
7. **Large assets** (e.g. ~20 MB sermon MP3) → upload-from-URL handles these (proven in D0.5); allow a generous timeout.
8. **Empty diff** → tool prints "in sync" and exits 0 (the drift detector's happy path).
9. **`--to production` without confirm/`--apply`** → refuses; prints what _would_ change.
10. **Revalidate endpoint unreachable** → warn, don't fail the sync (publish webhook is the backstop).

## 13. Testing strategy

- **Unit (Vitest)** for the pure helpers: `diffById` (classification), `compareContentTypes` (compat pass/fail + diff output), publish-policy resolver (direction × source-state × `--publish` → action), arg parser/guards (alias refusal, default direction, dry-run default). No network — feed fixture arrays.
- **Manual smoke** (the §11 acceptance run): change one entry in `staging` → `--dry-run` shows it → `--apply` → verify in `production`; then a `production → staging` refresh dry-run. Plus the **initial prod→staging refresh** (human-gated apply) that fixes the live drift.
- **Drift workflow:** trigger via `workflow_dispatch`; confirm it opens an issue on drift and is a no-op when in sync.
- Gate: `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.

## 14. Implementation checkpoints

Each checkpoint ends green and is independently committable (Conventional Commits, header ≤ 100 chars).

1. **Tool skeleton + guards + diff (dry-run only).** `sync-entries.mjs` arg parsing, alias guard, env clients, `diffById`, model-compat gate, report printer. Unit tests for helpers.
   `feat(ICR-83): add Contentful entry-sync tool — dry-run diff + model-compat gate`
2. **Apply path: assets + entries + publish policy + conflicts + revalidate.**
   `feat(ICR-83): entry-sync apply — asset/entry copy, publish policy, conflict guard`
3. **/predica re-point to production** (config, command, agent, 2 CMA scripts, sermon-pipeline note) + `.gitignore` backups.
   `fix(ICR-83): point /predica at production (draft-only); guard the master alias`
4. **MCP config** (default staging, protect master+production) + `docs/contentful-mcp.md`.
   `chore(ICR-83): MCP default=staging, protect master+production`
5. **Drift detector workflow.**
   `ci(ICR-83): weekly report-only Contentful staging↔production drift detector`
6. **Canonical doc rewrite** (`docs/contentful-environments.md`) + cross-links; close PR #54.
   `docs(ICR-83): rewrite contentful-environments as the canonical workflow doc`
7. **Run the initial prod→staging refresh** (dry-run → human approves → apply). Not a commit — an operational step recorded on the card.

## 15. Open questions (resolve during implementation)

- **Issue-management in the drift workflow:** `gh issue` CLI vs `actions/github-script`. (Lean `github-script` for find-or-create-or-close in one step.)
- **Asset publish on mirror:** confirm processing/publishing an upserted asset in staging doesn't require re-fetching the binary (it shouldn't — the asset record carries the file). Verify in checkpoint 2.
- **Per-call `environmentId` for predica reads:** confirmed supported by the MCP schema; verify the publisher actually threads it on every read during checkpoint 3.
