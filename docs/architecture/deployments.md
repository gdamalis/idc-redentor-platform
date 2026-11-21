# Deployments and production releases

> **Last reviewed:** 2026-11-21 (ICR-224). The deploy mechanics here are in place today. The
> release bookkeeping (Linear release, runbook ticket, approval phrase) arrives with the yoke
> release command once it runs releases separately from ticket status; until then the
> `release` block is deliberately absent from `.claude/config.json`.

## The short version

Merging to `main` never reaches production. It deploys **staging** only. Production changes in
**batched releases** that the owner decides to cut, and **one release ships both apps**:

| App                                 | Vercel project       | Production host              | Staging host                         |
| ----------------------------------- | -------------------- | ---------------------------- | ------------------------------------ |
| Website (`apps/web`)                | `idc-redentor-web`   | `www.idcredentor.org`        | `staging.idcredentor.org`            |
| Ministry Admin Panel (`apps/admin`) | `idc-redentor-admin` | `ministerio.idcredentor.org` | `staging.ministerio.idcredentor.org` |

Releases are **separate from ticket status**. A ticket's life ends when it is merged and verified on
staging. Releases are cut separately: a release is everything merged since the last one, and the
owner decides when to make one.

```
ticket:   /yoke:work → PR → /yoke:merge → staging QA → verified on staging
release:  owner decides to cut → everything merged since the last release
          → owner approves → scripts/deploy-prod.sh (both apps) → smoke-check both hosts
          → production actions from the runbook
```

## Why it works this way

- **Production is held.** Both Vercel projects have their _Production Branch_ set to the sentinel
  branch `production-hold` (verified 2026-11-21), so a push to `main` builds a preview, which the
  `staging` custom environment (branch `main`) serves on the staging hosts, and never production. A
  push to `production-hold` **would** be a real production build that skips every gate: never push,
  delete or merge into it.
- **A release is everything merged since the last one.** The deploy ships HEAD, and HEAD already
  holds every merged ticket, so a release cannot leave a merged ticket out. Hold a change back by
  not merging it, or behind a flag.
- **Both apps, one commit.** The two apps share `packages/` and are tested together on staging, so
  they ship together: one release, one approval. An app with no changes is simply rebuilt from the
  same code.

## Versions

Releases are named `idc-redentor-platform/{YYYY}.{M}.{N}` and recorded as Linear releases in the
pipeline `idc-redentor-platform` (team ICR); `N` counts releases in the month they ship. These are
**not** the Changesets versions of `@idcr/web` and `@idcr/admin` ([`versioning.md`](./versioning.md)):
those bump on merges to `main` and describe the code. A production release describes what reached
production, and usually spans several package versions. The deployed commit is recorded on the
release, and the next release measures from it.

## The deploy script

`scripts/deploy-prod.sh` (the release's deploy command). It:

1. refuses a dirty tree;
2. exports **`git archive HEAD`** to a temporary directory and deploys from there. The Vercel CLI
   uploads the _directory it is pointed at_, not a commit, and the checkout also holds `.env.local`
   files, `.claude/worktrees/*`, `graphify-out/` and `tasks/`. The archive is exactly the commit;
3. runs `vercel deploy --prod --project <name> --scope divine-lab` for the website, then the admin
   app. Each project's Root Directory (`apps/web`, `apps/admin`) is applied by Vercel to the uploaded
   repository root, so the shared `packages/` are present. `--meta githubCommitSha=<sha>` records the
   commit on each deployment, since an archive has no git metadata;
4. prints `web: <url>` and `admin: <url>`, and stops on the first failure, listing what it already
   deployed.

`bash scripts/deploy-prod.sh --preview` makes the identical upload as preview deployments, which is
how to test the script (done 2026-11-21: both apps built READY with the commit recorded). Never run it
without `--preview` outside an owner-approved release.

## Rollback

Per app, pinned to that app's previous production deployment:

```
vercel rollback <previous-web-deployment-url> --scope divine-lab
vercel rollback <previous-admin-deployment-url> --scope divine-lab
```

Rolling back one app leaves the other on the new release. A Contentful cutover is rolled back by its
own reverse migration ([`contentful-environments.md`](./contentful-environments.md)), never by a
Vercel rollback.

## Production actions a merge does not perform

Anything production needs beyond the deploy (a Contentful model promotion or alias swap, a data
script, an env change, a cron, a third-party console change) gets its own **`Prod actions deferred
from ICR-N`** ticket when it is identified (`/yoke:merge` §3.1 makes it from the PR's Release Notes).
Each release's runbook lists the ones its commit range needs, in order: pre-deploy, then post-deploy,
honouring every "do not run until". A release is not finished while one of them is unverified.

## The first release

The website's production deployment is commit `8377d89` (2026-07-16); the admin app's is `64a2ba2`
(2026-07-29). The first release measures from `8377d89`, the older one, so nothing unshipped is
missed; the admin commits in between are simply redeployed from the same code.

## Other tools

These rules are tool-neutral. Antigravity (`agy`) reads `AGENTS.md`, not `CLAUDE.md`, and yoke's
commands and guard do not run there yet. Until they do, an `agy` session must not deploy production or
push `production-hold` (`AGENTS.md` § Tracker says so).
