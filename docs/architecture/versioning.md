# Versioning (Changesets, per-app)

This repo uses [Changesets](https://github.com/changesets/changesets) for **independent per-app
versioning**. It replaced single-version `semantic-release` in ICR-164.

> **Versioning here is traceability, not deploy control.** Vercel redeploys on every git push, and the
> release commit is `[skip ci]`, so a version bump never triggers a build. The number answers "did
> _this_ package change," nothing more.

## The packages

| Package                 | Path              | Versioned?        | Notes                                  |
| ----------------------- | ----------------- | ----------------- | -------------------------------------- |
| `@idcr/web`             | `apps/web`        | ✅ own line (1.x) | deploys as its own Vercel project      |
| `@idcr/admin`           | `apps/admin`      | ✅ own line (0.x) | deploys as its own Vercel project      |
| `@idcr/ui`              | `packages/ui`     | ✅ own line       | internal; changes cascade to consumers |
| `@idcr/config`          | `packages/config` | ✅ own line       | internal; changes cascade to consumers |
| `idc-redentor-platform` | repo root         | ❌ frozen         | not a workspace member; never bumps    |

All packages are `private: true`; nothing is published to a registry. We only ever run
`changeset version` (bookkeeping), never `changeset publish`.

## Config: `.changeset/config.json`

- **`ignore: []`** — every workspace package versions. **Never** add a name here:
  - Adding the root package (`idc-redentor-platform`) **hard-fails validation** —
    `The package or glob expression "idc-redentor-platform" is specified in the `ignore` option but it
is not found in the project` — because the root is outside the `pnpm-workspace.yaml` globs
    (`apps/*`, `packages/*`). That same fact is why the root can never be bumped: Changesets doesn't
    see it as a package. The root is protected **structurally**, not by an ignore entry.
  - Adding `@idcr/config`/`@idcr/ui` would defeat the cascade below.
- **`updateInternalDependencies: "patch"`** (the default) — when a shared package bumps, its consumers
  auto-bump at least a patch. Example (verified): a single `@idcr/ui` patch changeset bumps `@idcr/ui`
  **and** cascades a patch to `@idcr/web` **and** `@idcr/admin`; `@idcr/config` and the root stay put.
  Trade-off: a shared-package change bumps **both** apps even if only one visibly uses it — correct
  under "did this app's inputs change."
- **`privatePackages: { version: true, tag: true }`** — the default `tag` is `false`, which for an
  all-private monorepo would **silently drop the git-tag lineage**. We set `tag: true` so releases tag
  every bumped package.
- **`commit: false`** — the release workflow commits; Changesets does not.

## Bump mapping — the `.changeset/*.md` file decides, NOT the commit type

**The single biggest behavioral change from the old model:** under `semantic-release`, the merged
**PR title** decided the release. Under Changesets, a **`.changeset/*.md` file** decides it. A PR with
no changeset cuts no release, whatever its title.

We still write Conventional Commit messages/PR titles (enforced by
`amannn/action-semantic-pull-request` in `pr.yml`) — they drive history and readability. Only the
_bump decision_ moved to changeset files. The mapping from Jira-issue-type-derived commit type to
changeset bump (standard conventional-changelog preset):

| Commit type                          | Changeset bump |
| ------------------------------------ | -------------- |
| `feat`                               | `minor`        |
| `fix`                                | `patch`        |
| `perf`                               | `patch`        |
| `docs`                               | _no changeset_ |
| `chore` / `refactor` / `test` / `ci` | _no changeset_ |

> **`docs` no longer cuts a release.** The old `semantic-release` config was non-standard —
> `{ "type": "docs", "release": "patch" }` cut a patch on docs. ICR-164 dropped that to match the
> standard preset. Vercel still redeploys the site on every push, so a docs change still ships — it
> just no longer earns a version bump.

### Authoring a changeset

A changeset is a markdown file with YAML frontmatter (hand-authored files are fully supported — the
interactive `changeset add` CLI is not required):

```markdown
---
"@idcr/web": minor
---

ICR-123: short human-readable summary
```

Scope it to the package(s) that actually changed. For a shared-package change, name the shared package
(`@idcr/ui`) — Changesets fans the bump out to consumers automatically. A PR that only touches an
internal package with no consumer-visible effect can still name the shared package; the apps will get
a cascaded patch.

> **Harness automation (out-of-repo):** teaching `/work`'s `pr-author` to auto-write these files is
> tracked in **YK-1** (the Yoke plugin project). Until it ships, author the changeset by hand before
> marking a PR ready.

## Release flow — direct auto-push on merge to `main`

`.github/workflows/release.yml` runs on every push to `main`:

1. If there are no pending changesets → **no-op** (only changeset-carrying merges release).
2. Otherwise: `changeset version` (bump + changelogs, consume changesets) → commit
   `chore(release): version packages [skip ci]` → `changeset tag` →
   `git push --atomic --tags origin HEAD:main`.

- **Atomic push** — the branch and all new tags land in one all-or-nothing transaction. This closes
  the ICR-145 failure where `semantic-release` pushed the release commit but not the tag, leaving
  `main` versioned with no tag.
- **No infinite loop** — the release commit carries `[skip ci]` (GitHub Actions skips it) and is
  pushed via `GITHUB_TOKEN` (which never recursively triggers workflows). Vercel also honors
  `[skip ci]`, so the bookkeeping commit doesn't rebuild the site.
- **Serialized** — a `concurrency: release-main` group prevents two quick merges from racing.
- **No build step** — versioning is bookkeeping; Vercel builds the deploy and `/work` heavy QA builds
  pre-merge.

We deliberately do **not** use `changesets/action` (it implements only the bot "Version Packages" PR
flow). This also sidesteps its input trap: its `main`-branch README documents `@v2` kebab-case inputs,
but `@v2` is unreleased — the latest stable is `v1.9.0` with camelCase inputs.

## Tags and releases

- **Per-app tags:** `@idcr/web@1.28.0`, `@idcr/admin@0.1.0`, `@idcr/ui@0.0.1`, etc. `changeset tag`
  tags every package at its current version on the first run (so `@idcr/admin@0.0.0` etc. appear once
  as baselines) and only creates not-yet-existing tags thereafter.
- **Legacy `v1.x` tags** (the single-version era) remain as history.
- **GitHub Releases lapse** — the workflow has no publish/release-create step. Per-app `CHANGELOG.md`
  is the release-notes surface.

## First-bump baselines

`@idcr/admin`, `@idcr/config`, `@idcr/ui` stay at `0.0.0` until their first real changeset. Do not
pre-bump them. `@idcr/web` continues its `1.x` line.
