# Contentful environments — content & model workflow

> **Purpose:** The canonical playbook for all Contentful work — daily content edits, model changes,
> and heavy-cutover deployments. Read this before any work that creates, changes, or deletes a
> content type or field, or syncs / remaps entries.
>
> **Companion docs:** `docs/contentful-mcp.md` (agent write path + safety model),
> `docs/contentful-data-layer.md` (the app's GraphQL read path). Machine-readable wiring in
> `.claude/config.json` → `contentful`.

## TL;DR — final topology

The space has **two environments** (the free-tier maximum):

| Name         | Kind                            | Role                                                                                            |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `master`     | **alias** → always `production` | What the app reads (live). Re-pointed only during a heavy cutover (§ Heavy alias-swap runbook). |
| `production` | environment                     | **Live.** Where entries are authored and published (blog, Creed, sermons).                      |
| `staging`    | environment                     | Work env. Where model changes are built and tested. The free tier's one spare slot.             |

Free-tier quota = **two environments** (the alias target `production` + one more = `staging`). A third
cannot be held; this constraint shapes every cutover below.

## The mental model

> **Content lives in production; models are forged in staging.**
> **Content flows _down_ (production → staging) to refresh; models flow _up_ (staging → production) at cutover.**

The practical consequence: editors author directly in `production`; engineers build content-type
changes in `staging`; a human promotes at cutover. Agents write to `staging` by default, and the
MCP blocks writes to `master` and `production`.

## Scenario playbooks

### Scenario A — Entries only (the daily case, ~95%)

1. Author or edit **directly in `production`** — the Contentful web app, or `/predica` for sermons.
   Draft → preview in prod (preview token + draft mode) → **Publish**.
2. Publish fires the Contentful webhook → `POST /api/revalidate` → `revalidateTag("site-content")` →
   the site refreshes. **No staging, no API-key change, no merge tool, no code.**

   > **Note:** Contentful's **Merge** app compares content _models_ (schemas), not entries. Content
   > entries never need it.

3. **Keep staging fresh** (so future model work builds against real content): periodically, and
   always before starting model work, run:

   ```
   node scripts/contentful/sync-entries.mjs --from production --to staging --apply
   ```

   This is also the **immediate fix for staging drift** (prod has published entries staging lacks).

### Scenario B — Model changes only

1. Build the model change in `staging` (committed `scripts/contentful/` migrations + the Contentful
   MCP, which defaults to `staging`). Test on the `staging`-pointed Vercel preview and local.
2. **Cut over (HUMAN), sized by risk:**
   - **Small / additive** (new type, new field, validation, default, help text) → Contentful
     **Merge** app diffs the _model_ `staging → production`. No alias move. Land it with the code PR.
   - **Destructive** (delete or rename a type or field that has entries or inbound links) →
     **delete or remap the dependent entries in `production` first** (committed remap migration run
     against prod, or the web app), _then_ Merge the schema deletion. Merge will not sequence this —
     this is the ordering trap.
   - **Big / breaking / many-coupled** → the **heavy alias-swap cutover** (§ Heavy alias-swap runbook).

### Scenario C — Model + entries (the common combo)

1. **Refresh staging ← production first** so you build against current content:

   ```
   node scripts/contentful/sync-entries.mjs --from production --to staging --apply
   ```

2. Build the model **and** the content in `staging`. Test.
3. **Cut over (HUMAN):**
   - **Small** → Merge the model up, then promote the specific new entries:

     ```
     node scripts/contentful/sync-entries.mjs --from staging --to production --ids <id,id,...> --apply
     ```

     (Drafts by default; you publish.) Or run the committed entry-remap migration against `production`.

   - **Big / breaking** → the **heavy alias-swap clone** (§ Heavy alias-swap runbook) moves model +
     entries together, atomically.

## Heavy alias-swap cutover runbook

Use **only** when a reverse migration would be painful (type deletions, field renames, merges, or a
large model + entries combo). This is the stable-name version — `production` and `staging` keep
their names across cycles.

**Start state:** `master → production`, plus `staging` (fully tested).

**Step 0 — Cold backup (insurance).** Export old production to a gitignored local file — keep until
confident, then delete:

```
npx contentful space export --space-id vg9le24yw8hb --environment-id production \
  --management-token "$CONTENTFUL_MANAGEMENT_ACCESS_TOKEN" \
  --content-file scripts/contentful/backups/production-YYYY-MM-DD.json
```

**Step 1 — Re-point `master` alias → `staging`.**
Contentful → Settings → Environments → Environment Aliases. The live site now reads the tested
`staging` env. Do this at the same moment the code PR merges (the new code expects the new model).

**Step 2 — Delete the old `production` env.**
Frees the free-tier slot. Contentful forces this order — you cannot delete the env an alias points
at, which is why step 1 comes first.

**Step 3 — Clone `staging` → a fresh env named `production`.**
(`create_environment` with `sourceEnvironmentId: staging`.) Re-grant CDA/CPA key access if the
recreate dropped it (Settings → API keys → Environments).

**Step 4 — Re-point `master` alias → `production`.**

**Step 5 — Re-establish staging for the next cycle:**

```
node scripts/contentful/sync-entries.mjs --from production --to staging --apply
```

(Or re-clone.) Delete the cold backup once the site is verified healthy.

**End state:** `master → production` + `staging`. Stable names preserved.

> **Known tradeoff (documented, accepted):** on the free tier you cannot hold three envs, so during
> steps 1–4 there is **no separate rollback env**. Mitigations: (a) the alias points at the
> **known-good, fully-tested `staging`** the whole window; `staging` is never deleted, so a failed
> clone is just retried; (b) the only thing truly lost is the _pre-change_ production state, which a
> breaking change couldn't roll back to without also reverting code; (c) the §0 cold backup is the
> cold-restore path of last resort.

## Safety model

| Writer                                           | May write                | Must NOT write                    | Enforced by                                                                     |
| ------------------------------------------------ | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| **Contentful MCP** (interactive agent edits)     | `staging`                | `master` alias **+** `production` | `ENVIRONMENT_ID=staging` (default) + `PROTECTED_ENVIRONMENTS=master,production` |
| **CMA scripts** (`/predica`, `sync-entries.mjs`) | `production` + `staging` | the `master` **alias** by name    | each script's own guard + explicit confirm on a `production` apply              |
| **Humans** (web app)                             | anything                 | —                                 | judgment + the human cutover gate                                               |

Key facts that make this work:

- Every Contentful **MCP** tool takes `environmentId` as a **required per-call argument** (verified
  against `get_entry`/`search_entries`/`create_entry` schemas). `ENVIRONMENT_ID` only sets the
  _default_. `PROTECTED_ENVIRONMENTS` blocks _write_ tools whenever the target is protected,
  regardless of caller.
- Therefore `predica-publisher` reads `production` by passing `environmentId: "production"` on its
  read calls, while casual or forgetful model edits default to `staging` and can never hit live.
- The CMA scripts bypass the MCP entirely (management token), so their own alias guard + confirm
  is the control.

**Cutover is HUMAN-ONLY.** No agent or command ever re-points the `master` alias. Agents propose
changes in `staging`; a human promotes at PR-merge time — like merging a PR or moving a card to Done.

## Entry-sync tool — `scripts/contentful/sync-entries.mjs`

A standalone ESM script for syncing entries and assets between environments — the free-tier
replacement for Contentful Launch and Merge's model-only limitation.

### CLI flags

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

**Dry-run is the default.** Writes require `--apply`. For `--to production`, an explicit typed
confirmation is also required (or `CONTENTFUL_SYNC_ASSUME_YES=1` for the drift detector's dry-runs,
which never apply to production anyway).

### Publish policy

| Direction                        | Default behaviour                                                        | Override                           |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `production → staging` (refresh) | Mirror source state: published → publish in staging; draft → leave draft | —                                  |
| `staging → production` (promote) | Create / leave as **draft**; human reviews and publishes                 | `--publish` to publish immediately |

### Model-compatibility gate

Before any copy, the tool fetches content types from both environments and asserts that every type
involved in the copy exists in the target and that field shapes match (`id`, `type`, `linkType`,
`required`). On mismatch it prints a readable diff and aborts. This prevents entries landing where
their model does not exist. Use `--skip-model-check` only when you have confirmed the mismatch is
intentional.

## Drift detector

`.github/workflows/contentful-drift.yml` runs **weekly (Mondays 12:00 UTC)** and on
`workflow_dispatch`. It executes the sync tool in **dry-run both directions** (never applies):

```
node scripts/contentful/sync-entries.mjs --from production --to staging
node scripts/contentful/sync-entries.mjs --from staging --to production
```

If either run reports non-zero drift it opens or updates a single GitHub issue (stable title:
`Contentful drift: staging ↔ production`) with the diff summary. If no drift, it closes the issue
if open. **Zero writes to Contentful.**

## Quick reference

| Thing                  | Value                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Live handle            | `master` **alias** → `production` (the app reads the alias; this never changes)                                                       |
| Work env               | permanent `staging` (set up once; the free tier's one spare slot)                                                                     |
| App override           | `CONTENTFUL_ENVIRONMENT` (unset ⇒ `master`; set to `staging` in `.env.local` + branch-scoped Vercel Preview for model-change PRs)     |
| Write path             | Contentful MCP + `scripts/contentful/` migrations targeting `staging`; CMA scripts for `/predica` writes to `production` (draft-only) |
| Default sync direction | `production → staging` (refresh staging from live content)                                                                            |
| Entry promotion        | `sync-entries.mjs --from staging --to production --ids <id,...> --apply` (defaults to DRAFT)                                          |
| Cutover (heavy)        | HUMAN: re-point `master` → `staging` → delete old `production` → clone `staging` → `production` → re-point back                       |
| Rollback (heavy)       | No separate rollback env during the cutover window; alias serves the known-good `staging`; §0 cold backup is the last resort          |
| Free-tier cap          | `production` (alias target) + **1** work env = `staging`; a third env cannot be created                                               |
| API key access         | CDA + CPA keys must allowlist `staging` once (Settings → API keys → Environments); production is covered by the alias automatically   |
