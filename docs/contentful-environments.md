# Contentful environments — semver blue-green cutover workflow

> **Purpose:** the canonical workflow for changing the Contentful **content model** (and remapping
> entries) safely, now and in the future. It's a **blue-green deployment via environment aliases**,
> with **semver-named work environments**. Read this before any work that creates/changes/deletes a
> content type or field, or remaps entries.
>
> **Companion docs:** `docs/contentful-mcp.md` (the agent write path + token/safety model),
> `docs/contentful-data-layer.md` (the app's read path). Machine-readable wiring lives in
> `.claude/config.json` → `contentful`.

## TL;DR

- **`master` is an alias**, not an environment. It points at whichever environment is **production**
  (today: `master-0.0.1`). The website and all production config read the `master` alias and **never
  change**.
- The **free tier caps us at two environments.** So we **ping-pong**: always work in the environment
  the alias is _not_ pointing at; when verified, **re-point the alias** to it; it becomes production;
  the freed (old-production) env is recycled for the next cycle.
- **You never rename an environment** (IDs are immutable). The stable handle for production is the
  **alias**. Work environments carry **semver IDs** — `master-<major>.<minor>.<patch>`.
- **The alias re-point is HUMAN-ONLY** — like merging a PR or moving a card to Done. Agents make
  changes in the work env and propose; a human promotes.

## Why this shape

Contentful environment **aliases** let a stable name (`master`) point at any underlying environment.
Production code targets the alias, so it's insulated from which physical environment is live. That's
the blue-green primitive. Two constraints force the rest:

1. **Two-environment cap (free tier).** We can hold production + exactly one work env. No third
   "permanent sandbox," no holding the new and old prod simultaneously beyond the cutover instant.
2. **Editors keep adding content to production** between cycles. So the work env must be a **fresh
   clone of current production** at the start of each cycle — you can't refresh an env in place, and
   you can't keep a third around. Hence **delete-stale + clone-current-prod each cycle**.

A permanently-fixed work-env _name_ is impossible here: promoting the work env **consumes its name
into production**. So we accept a small, predictable cost — a **version bump** in three dev/preview
config spots per cycle (never in production config).

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

## The cycle (the recurring runbook)

Let the current production env be `env-A` (the alias `master` → `env-A`).

1. **Refresh the work env.**
   - Delete the **stale idle** env if one exists. _(Contentful blocks deleting the env the alias
     points at — a built-in safety net; you can only ever delete the non-production env.)_
   - **Clone current production → a fresh work env** named per the semver rule (`env-B` =
     `master-X.Y.Z`). You're back to exactly two environments.
2. **Point tooling at the work env** (the only per-cycle config touch — all dev/preview, never prod):
   - **MCP** `ENVIRONMENT_ID` → `env-B` (so agent writes land in the work env).
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
  fragment), `/work` stops and requires this workflow: pick the semver bump, provision/point at the work
  env, defer the alias re-point to the human cutover. (`docs/agent-harness.md` → "Contentful
  model-change workflow"; the spec's "Data Model Changes" section must include the env-cutover plan.)
- **`implementer`** — when a checkpoint changes the model, it operates via the Contentful MCP against
  the versioned **work env** (never the `master` alias) and **never re-points the alias**.
- **Golden rule:** _Never re-point the Contentful `master` alias — human promotion only, like Done._

## This epic (first cycle of the scheme)

The `agent-sandbox` env was the pre-scheme work env (a fresh clone of `master-0.0.1`). For the
ICR-76 model-optimization epic — a **major** change (type deletions, field renames, merges) — the work
env is **`master-1.0.0`**:

1. Delete `agent-sandbox` (frees the slot), clone `master-0.0.1` → `master-1.0.0`.
2. Point the MCP / `.env.local` / branch Preview at `master-1.0.0`.
3. Run the epic's migrations + tests there.
4. **Human cutover:** re-point `master` → `master-1.0.0` at PR-merge time. Rollback = re-point to
   `master-0.0.1`.

From here on, work envs are versioned (`master-1.1.0`, `master-1.0.1`, …) and `agent-sandbox` is retired.

## Quick reference

| Thing                        | Value                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| Production handle            | the `master` **alias** (never renamed; app reads it)                      |
| Work env                     | `master-<major>.<minor>.<patch>`, a fresh clone of current prod           |
| Bump = major / minor / patch | breaking-or-significant / new-or-additive / fix                           |
| App override                 | `CONTENTFUL_ENVIRONMENT` (unset ⇒ `master`)                               |
| Write path                   | Contentful MCP + `scripts/contentful/` migrations, targeting the work env |
| Cutover                      | **human** re-points the `master` alias (≈ merge/Done)                     |
| Rollback                     | re-point alias to previous prod env (kept intact)                         |
| Free-tier cap                | 2 environments → delete-stale + clone-current-prod each cycle             |
