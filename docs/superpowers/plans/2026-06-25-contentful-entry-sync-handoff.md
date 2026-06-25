# Contentful entry-sync — planning handoff

> **For a fresh session.** Goal: design + build a reusable way to **sync entries (and assets) between
> Contentful environments** (primarily `staging → production`), because Contentful's native **Merge**
> app on the **free tier merges only the content _model_ (schemas), not entries**. This doc is the
> brief; the next session should produce a spec + a tool, then update `docs/contentful-environments.md`.

## 1. Current environment state (post ICR-76, verified 2026-06-25)

| Handle       | Kind                     | Role                                                                                                  |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `master`     | **alias** → `production` | What the app reads (prod). Never renamed.                                                             |
| `production` | environment              | **Live.** The optimized model from ICR-76 (20 content types incl. `section`, `beliefItem`, `sermon`). |
| `staging`    | environment              | Work/sandbox env — a clone of `production`. Where model + content changes are built/tested.           |

- **Free-tier quota = 2 environments** (the alias target `production` + **one** more = `staging`). You
  cannot hold a third env; this is the core constraint for any sync/refresh design.
- Deleted during normalization: `master-0.0.1` (old prod) and `agent-sandbox` (old sandbox).
- Standing workflow doc: `docs/contentful-environments.md` (now `master` + `production` + `staging`).

## 2. The problem to solve

- **Model changes**: handled today — committed `scripts/contentful/` migrations (contentful-migration
  for schema) run against `staging`, then re-applied to `production` (or promoted). Contentful's Merge
  app can also diff/merge **schemas**. This part works.
- **Entry/content changes have no native promotion on free tier.** Merge does **not** move entries.
  When `staging` has new/edited entries (or assets) that must reach `production` — e.g. content
  prepared/migrated in staging, or a batch of entries created by a script — there is **no built-in
  tool**. We need our own `staging → production` (and `production → staging` refresh) entry sync.
- Note: routine editorial content (a blog post, a Creed item) is still edited **directly in
  production** — no ceremony. Entry-sync is for content **developed in staging** that needs promoting,
  and for **refreshing staging** from production before new work.

## 3. What already exists (reuse this — precedent that CMA entry-copy works)

The ICR-76 epic already proved faithful cross-env entry+asset copying via the CMA. Reuse the patterns:

- `scripts/contentful/run.mjs` — migration runner (schema). Real `--dry-run` via stdin-decline.
- `scripts/contentful/migrations/03b-remap-belief-item.mjs`, `05b-remap-section.mjs` — CMA scripts that
  **create entries, copy all locales, repoint references, preserve order, publish, delete** — idempotent,
  with `--dry-run`. The plain client: `createClient({accessToken}, {type:"plain"})`.
- The **D0.5 sermon-draft copy** (agent-sandbox → master-0.0.1) is the closest precedent: it copied
  entries **and assets** between environments with **same `sys.id`**, all locales, links rewired to the
  copied targets, and **assets created via upload-from-URL** (source asset's CDN `file.url`), leaving
  everything **draft**. That script proved: assets (incl. ~20 MB sermon MP3) copy cleanly by URL-source;
  same-id creation keeps inbound references intact automatically.
- `.claude/scripts/predica/upload-contentful-asset.mjs` — binary asset upload via the CMA upload endpoint
  (fallback when URL-source isn't usable; refuses `master`).

## 4. The planning task

Design + build `scripts/contentful/sync-entries.mjs` (name TBD) that promotes entries+assets between
two env IDs (default `staging` → `production`), then document it in `docs/contentful-environments.md`
as the standing promotion mechanism.

Required behaviour:

1. **Diff (read-only first):** compare entries + assets by `sys.id` between source/target; classify
   new / changed / deleted / unchanged (use `sys.version` + `sys.updatedAt` to detect changes). Print a
   reviewable report.
2. **Modes:** `--dry-run` (report only) and apply. Filters: `--content-type`, `--ids`. Direction flag
   (`--from`/`--to`) so it also does `production → staging` refresh.
3. **Faithful copy:** same `sys.id`; all locales; all fields; entry + asset links; assets via
   upload-from-URL (or the predica upload script for binaries). Two-pass or dependency-ordered so link
   targets exist before linkers.
4. **Publish policy (decide):** preserve source publish state **or** always create in `production` as
   **draft** for human review. The church's content discipline + the `/predica` draft-only model argue
   for **draft-in-prod + human publish** by default, with an opt-in `--publish`.
5. **Deletions:** opt-in only (`--allow-deletes`) — entries in target but not in source.
6. **Safety/idempotency:** re-runnable; **refuse to write to the `master` alias by name** (only env
   IDs); production writes gated behind explicit confirm; never clobber a concurrently-edited prod entry
   without `--force` (report the conflict instead).
7. **After a prod sync:** trigger `POST /api/revalidate` (or rely on the publish webhook) to flush the
   `site-content` cache tag.

### Open questions to resolve in the plan

- **Conflict policy** when an entry changed in _both_ envs since divergence (last-writer-wins +
  report, vs require `--force`).
- **Staging refresh cadence:** on free tier you can't keep a 3rd env, so refreshing `staging` from
  `production` is either delete+re-clone `staging` (loses in-progress staging work) **or** a
  `production → staging` run of this same tool. Recommend the tool (non-destructive).
- **Scope:** selective (by type/id/tag) for promotion vs full-env mirror for refresh.
- **Assets:** confirm upload-from-URL works for unpublished source assets across envs (it did in D0.5);
  fallback to binary re-upload.

## 5. Tooling notes / gotchas

- CMA token `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`, space `vg9le24yw8hb`. Plain client has full access to
  all envs.
- **API keys are env-scoped.** "Main" (app/prod) reads `production` **via the `master` alias** — no
  per-env grant needed for prod. "Local agents" has all envs (use it, or grant a key, for `staging`
  render/QA).
- **Follow-ups now that `agent-sandbox` is gone** (these still point at the deleted env and must be
  re-pointed to `staging`): the Contentful **MCP `ENVIRONMENT_ID`** (currently `agent-sandbox`); the
  **`/predica` skill + its agents + `.claude/config.json`** (write target `agent-sandbox`); the
  predica CMA scripts' default/guards; any worktree `.env.local` `CONTENTFUL_ENVIRONMENT`. List + fix
  these as part of (or before) the entry-sync work so `staging` is the single sandbox.
- `contentful-migration@5` has **no programmatic dry-run** — that's why the runner declines via stdin.
  The entry-sync tool is pure CMA (not contentful-migration), so it controls its own `--dry-run`.

## 6. Deliverable

A spec + the `sync-entries.mjs` tool, validated by: change an entry in `staging` → `--dry-run` →
apply → verify in `production`; and a `production → staging` refresh run. Then document it as the
standing entry-promotion step in `docs/contentful-environments.md`.
