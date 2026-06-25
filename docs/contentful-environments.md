# Contentful environments — semver blue-green cutover workflow

> **Purpose:** the canonical workflow for changing the Contentful **content model** (and remapping
> entries) safely, now and in the future. It's a **blue-green deployment via environment aliases**,
> with **semver-named work environments**. Read this before any work that creates/changes/deletes a
> content type or field, or remaps entries.
>
> **Companion docs:** `docs/contentful-mcp.md` (the agent write path + token/safety model),
> `docs/contentful-data-layer.md` (the app's read path). Machine-readable wiring lives in
> `.claude/config.json` → `contentful`.

## TL;DR — two lanes

- **Content edits** (new blog post, text fix, a Creed item, a sermon) happen **directly in production**
  (the `master` environment) in the Contentful web app. Publish → the revalidate webhook refreshes the
  site. **No environment, no API-key change, no merge tool, no code.** Draft + preview in prod first if
  you want (preview token + draft mode). This is the common case — most changes need nothing below.
  > Contentful's **Merge** app compares content _models_ (schemas), not entries — it's a model tool, not
  > a content tool. Content entries never need it.
- **Model changes** (a new/changed/deleted content type or field, or an entry remap) are the only thing
  that needs a work environment, because the app's code and the model are coupled. Two variants:
  - **Default — permanent `staging`** (§ Standing workflow): one stable `staging` env, granted on the
    API keys **once**, MCP/`.env.local`/preview pointed at it **once**. Develop + test the change there,
    then promote to production at cutover by applying the tested migration (Contentful **Merge** for the
    model and/or the committed `scripts/contentful/` migrations). Near-zero per-change setup. Rollback =
    a reverse migration / fix-forward.
  - **Heavy — alias re-point** (§ Heavy variant; this epic, ICR-76): for a big **breaking** change,
    clone production into a versioned env `master-<major>.<minor>.<patch>`, do the work there, and
    **re-point the `master` alias** to it at cutover. Atomic, with **instant rollback** (flip the alias
    back). Costs a one-time API-key tick + config pointer per such change — reserved for changes where a
    reverse migration would be painful (type deletions, field renames, merges).
- **`master` is an alias**, not an environment (today → `master-0.0.1`); production config reads the
  alias and never changes. **You never rename an environment** (IDs are immutable).
- **Cutover is HUMAN-ONLY** — applying to prod / re-pointing the alias is a human promotion, like
  merging a PR or moving a card to Done. Agents make changes in the work env and propose.
- **Free-tier quota: 1 environment beyond the `master` alias target** (creating a second fails with
  `Quota reached … 1 out of 1 allotted`). The default lane spends that slot on the permanent `staging`;
  the heavy lane spends it on the versioned env (so the two lanes don't run simultaneously).

## Why the heavy variant works the way it does

Contentful environment **aliases** let a stable name (`master`) point at any underlying environment —
the blue-green primitive the **heavy variant** uses. Its shape is forced by two constraints:

1. **One-work-env cap (free tier).** Production (the `master` alias target) + exactly **one** other
   environment; the API enforces a quota of 1 environment beyond the alias target (creating a second
   fails with `Quota reached … 1 out of 1 allotted`). The default lane already spends that one slot on
   the permanent `staging`, so a heavy-variant cycle uses the slot **instead** — the two lanes can't run
   at once, and you can't hold the new and old prod simultaneously beyond the cutover instant.
2. **Editors keep adding content to production** between cycles. So the work env must be a **fresh
   clone of current production** at the start of each cycle — you can't refresh an env in place, and
   you can't keep a third around. Hence **delete-stale + clone-current-prod each cycle**.

A permanently-fixed work-env _name_ is impossible here: promoting the work env **consumes its name
into production**. So we accept a small, predictable cost — pointing a few **dev/preview** settings at
the new env each cycle (Delivery + Preview API-key access, MCP `ENVIRONMENT_ID`, `.env.local`, Vercel
Preview), never any production config.

## Semver naming rule

Work environments are named `master-<major>.<minor>.<patch>`. The new work env's version is the
**current production version bumped by the change class**:

| Bump                       | When                                                                                                                                                    | Example                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Major** (`master-X.0.0`) | **Significant / breaking** model change — content-type deletion, field rename/removal, type merges, or anything that **breaks the existing read code**. | `master-0.0.1` → `master-1.0.0` |
| **Minor** (`master-0.X.0`) | **New models or non-breaking modifications** — additive content types/fields the existing code still reads cleanly.                                     | `master-1.0.0` → `master-1.1.0` |
| **Patch** (`master-0.0.X`) | **Fixing an issue** in an existing model — a validation, default, help text, or small correction.                                                       | `master-1.1.0` → `master-1.1.1` |

> Judgment call: a change that is both "new models" and "breaking" is **major** (breaking wins). The
> `/work` model-change gate proposes the class; the human confirms it at the cutover.

## Standing workflow: permanent `staging` (default)

For everyday model changes, keep **one permanent work env named `staging`** — set it up once, reuse forever:

1. **One-time setup.** Create `staging` (a clone of production); add it to BOTH the Delivery + Preview
   API keys' environments; point the MCP `ENVIRONMENT_ID`, `.env.local` `CONTENTFUL_ENVIRONMENT`, and the
   Vercel Preview at `staging`. You never repeat this.
2. **Refresh before a change set** (only when entry-accuracy matters). If `staging` has drifted from
   production, sync it — Contentful **Merge** (model) and/or re-clone. _(If re-cloning forces an API-key
   re-tick — to be confirmed whether same-id recreate preserves the grant — that's the one recurring
   cost; model-only changes can skip the refresh entirely.)_
3. **Develop + test** the change in `staging` (committed `scripts/contentful/` migrations + the MCP),
   verified on local + the `staging`-pointed preview.
4. **Cut over (HUMAN).** Apply the **tested** migration to production — Contentful **Merge** for the model
   diff and/or run the committed scripts against the prod env — and merge the PR together.
5. **Rollback** = a reverse migration / fix-forward (no instant alias flip — that's the heavy variant).

The `master` alias is **never** re-pointed in this lane; production stays the same env and changes are
applied into it. Near-zero per-change setup, at the cost of a heavier rollback.

## Heavy variant: alias re-point (big breaking changes)

> Use this **only** when a reverse migration would be painful — type deletions, field renames, merges
> (e.g. the **ICR-76** epic). It spends the single free-tier work-env slot on a versioned env instead of
> `staging`, so don't run both lanes at once. The payoff is an **atomic cutover + instant rollback**.

Let the current production env be `env-A` (the alias `master` → `env-A`).

1. **Refresh the work env.**
   - Delete the **stale idle** env if one exists. _(Contentful blocks deleting the env the alias
     points at — a built-in safety net; you can only ever delete the non-production env.)_
   - **Clone current production → a fresh work env** named per the semver rule (`env-B` =
     `master-X.Y.Z`). You're back to production + one work env (the quota max).
2. **Point tooling at the work env** (the per-cycle config touch — all dev/preview, never prod):
   - **Grant API-key access (do this first).** Add the new env to BOTH the **Delivery (CDA)** and
     **Preview (CPA)** API keys' environment list (Contentful → Settings → API keys → [key] →
     Environments → check the new env → save). The app's read tokens are **environment-scoped** (the
     existing ones allow only the `master` alias); without this, reading the work env fails with
     `UNKNOWN_ENVIRONMENT`. Production is unaffected — the alias is already on the keys.
   - **MCP** `ENVIRONMENT_ID` → `env-B` (so agent writes land in the work env; re-register + restart).
   - **`.env.local`** `CONTENTFUL_ENVIRONMENT=env-B` (so local renders the work env).
   - **Vercel Preview** `CONTENTFUL_ENVIRONMENT=env-B`, **branch-scoped** to the feature branch (so
     the PR preview renders the work env — required, because new code only works against the new model).
3. **Work + test** in `env-B`: make model + entry changes (committed `contentful-migration` scripts +
   the MCP), then verify the **whole site** locally and on the sandbox-pointed preview.
4. **Cut over (HUMAN).** Re-point the `master` alias → `env-B` (Contentful → Settings → Environments →
   Environment Aliases). Done at the same moment the PR merges. `env-B` is now production; `env-A` is
   the stale idle env.
5. **Next cycle:** delete `env-A`, clone `env-B` → the next versioned work env, repeat from step 2.

```
            ┌─────────────── master (alias) ───────────────┐
 cycle N:   │  → master-0.0.1 (PROD)      master-1.0.0 (WORK, you edit here)
 cutover →  │                              ↘ alias re-points
 cycle N+1: │     master-0.0.1 (stale,     → master-1.0.0 (PROD)   master-1.1.0 (WORK)
            │      delete + reclone)
```

## App & tooling configuration

- **Production reads the alias.** The app omits any `CONTENTFUL_ENVIRONMENT`, so `fetchGraphQL`
  targets `.../environments/master` (the alias) — see `lib/contentful/fetch.ts`. **This never changes.**
- **`CONTENTFUL_ENVIRONMENT`** (added for this workflow) overrides the environment segment. Unset →
  `master`. Set it in `.env.local` and the **branch-scoped** Vercel Preview to the current work env.
- **API keys are environment-scoped.** The Delivery (CDA) + Preview (CPA) tokens only read
  environments on their allowlist — the existing tokens allow the `master` alias **only**, so a freshly
  created work env returns `UNKNOWN_ENVIRONMENT` until it's added to **both** keys (Settings → API keys
  → Environments). After cutover the alias covers the new env automatically, so production never needs
  a key change.
- **Draft mode + token.** `pnpm dev` auto-enables draft mode (`draftMode.ts`), so local reads the work
  env via the **preview** token (space-scoped, works across environments). Clear `.next` when switching
  environments so the static `site-content` cache tag doesn't serve cross-env data.
- **MCP** `ENVIRONMENT_ID` = the current work env; `PROTECTED_ENVIRONMENTS=master` blocks writes to the
  alias. Belt-and-suspenders: also list the current **production env id** in `PROTECTED_ENVIRONMENTS`
  when it differs from the alias, so a just-promoted env can't be written to before the next reclone.

## Rollback

Re-point the `master` alias back to the previous production env (kept fully intact until the next
cycle deletes it) and revert/redeploy the PR. Content-side rollback is instant.

## Harness integration

The harness knows this workflow (so `/work` routes model-touching cards through it):

- **`.claude/config.json` → `contentful`** — machine-readable: the protected alias, the work-env semver
  pattern + bump rules, the app env var, the write path, and the human-only cutover gate.
- **`/work` step 8.2 — Contentful model-change gate.** After the plan is written, if it changes the
  content model (a new/changed/deleted content type or field, or an entry remap — _not_ just a new read
  fragment), `/work` stops and asks **which lane** (default `staging` vs heavy alias re-point), then
  enforces it: work in the chosen env, defer the cutover to the human. (`docs/agent-harness.md` →
  "Contentful model-change workflow"; the spec's "Data Model Changes" section must include the cutover plan.)
- **`implementer`** — when a checkpoint changes the model, it operates via the Contentful MCP against the
  **work env** (`staging` or the versioned env), **never** the `master` alias, and **never** applies to
  prod / re-points the alias.
- **Golden rule:** _The cutover is human-only — agents never apply to production or re-point the `master`
  alias (like merge/Done)._

## This epic (ICR-76) — heavy variant, adapted to the live env state

> **Reality check (2026-06-25):** the originally-planned `master-1.0.0` work env was **deleted** during
> the sermon epic (ICR-81) to free the free-tier slot for re-creating `agent-sandbox`. Production
> (`master-0.0.1`, the `master` alias target) now also carries the live **`sermon`** content type. So
> ICR-76 adapts: **`agent-sandbox` is the work/"staging" env** (it is the only non-prod env, and its
> models are already synced to prod via Merge), and we do **not** delete it.

1. **Sermon backup (done).** The sermon DRAFT entries + assets that lived only in `agent-sandbox` were
   copied into `master-0.0.1` **as drafts** (create-only, same `sys.id`s, never published) — both to
   land the long-pending ICR-81 Gate-2 and to back them up before mutating `agent-sandbox`.
2. **Work env = `agent-sandbox`.** Tooling points here: `scripts/contentful/run.mjs` default,
   `.env.local` `CONTENTFUL_ENVIRONMENT=agent-sandbox`, the MCP `ENVIRONMENT_ID`, and (at Task 12) the
   branch-scoped Vercel Preview. The Delivery + Preview keys must allow `agent-sandbox` (human-granted).
   **Pause `/predica` while ICR-76 borrows `agent-sandbox`** — a run would write into the migration env.
3. Run the epic's migrations + tests there.
4. **Human cutover (alias-swap):** re-point `master` → `agent-sandbox` at PR-merge time. **Rollback** =
   re-point `master` → `master-0.0.1` (untouched old model; it also holds the sermon drafts from step 1).
5. **Normalize after confidence:** Merge `agent-sandbox` → `master-0.0.1` (sync the optimized
   model+entries back), re-point the alias → `master-0.0.1`, freeing `agent-sandbox` to be the clean
   staging/predica sandbox again.

**Future direction (agreed):** move to an unversioned **`master` + `staging`** scheme — two stable envs,
the `master` alias normally fixed on the `master` env, and small/non-breaking changes promoted
`staging → master` **in place via the Merge app** (no alias move). Reserve the alias-swap for breaking
changes (instant rollback). The `0.0.1` suffix on the prod env is cosmetic, dropped in a later
housekeeping cycle.

## Quick reference

| Thing                        | Value                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Production handle            | the `master` **alias** (never renamed; app reads it)                                 |
| Work env (default)           | permanent `staging` (set up once); heavy: `master-<major>.<minor>.<patch>`           |
| Bump = major / minor / patch | breaking-or-significant / new-or-additive / fix                                      |
| App override                 | `CONTENTFUL_ENVIRONMENT` (unset ⇒ `master`)                                          |
| Write path                   | Contentful MCP + `scripts/contentful/` migrations, targeting the work env            |
| Cutover                      | **human**: default = apply migration to prod (Merge/scripts); heavy = re-point alias |
| Rollback                     | default = reverse migration; heavy = re-point alias to previous prod env             |
| Free-tier cap                | prod alias target + **1** work env (quota: 1) → delete-stale + clone each cycle      |
| New work env API access      | add it to Delivery + Preview API keys (Settings → API keys → Environments) first     |
