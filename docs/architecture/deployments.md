# Deployments and production releases

> **Last reviewed:** 2026-11-21 (ICR-224). Facts live in `.claude/config.json` → `release`; on any
> disagreement the JSON wins. The command itself is the yoke plugin's `/yoke:release`.

## The short version

Merging to `main` never reaches production. It deploys **staging** only. Production changes in
**batched, versioned releases** that the owner decides to cut, and **one release ships both apps**:

| App | Vercel project | Production host | Staging host |
|---|---|---|---|
| Website (`apps/web`) | `idc-redentor-web` | `www.idcredentor.org` | `staging.idcredentor.org` |
| Ministry Admin Panel (`apps/admin`) | `idc-redentor-admin` | `ministerio.idcredentor.org` | `staging.ministerio.idcredentor.org` |

```
/yoke:work → PR → /yoke:merge → In Testing ──staging QA passes──▶ Ready for Release
                                                                        │
            owner decides to cut ──▶ /yoke:release cut   (Linear release + runbook ticket)
                                     /yoke:release deploy (approval phrase → both apps → smoke → actions)
                                     owner runs the close in their own terminal ──▶ Done
```

## Why it works this way

- **Production is held.** Both Vercel projects have their *Production Branch* set to the sentinel
  branch `production-hold` (verified 2026-11-21), so a push to `main` builds a preview — which the
  `staging` custom environment (branch `main`) serves on the staging hosts — and never production. A
  push to `production-hold` **would** be a real production build that skips every gate, which is why
  it is in `release.forbiddenBranches`: never push, delete or merge into it.
- **A release is everything merged since the last one.** The deploy ships HEAD, and HEAD already
  holds every merged ticket, so a release cannot leave a merged ticket out. **Ready for Release** is a
  per-ticket readiness signal: the gate refuses to hand out an approval phrase while any ticket in
  the range is not there, and the release waits. There is no "ship a subset".
- **Both apps, one commit.** The two apps share `packages/` and are tested together on staging, so
  they ship together: one version, one runbook, one approval. An app with no changes is simply
  rebuilt from the same code.
- **Done means shipped.** Only the release close step moves tickets to Done, and only after the
  deploy is live and every runbook action is verified (`closeIssuesOnRelease: "after-runbook"`). A
  ticket reading Done while its Contentful cutover is still pending would be a lie.

## Versions

Releases live in the Linear release pipeline **`idc-redentor-platform`** (team ICR, scheduled,
rollover off), named `idc-redentor-platform/{YYYY}.{M}.{N}`; `N` counts releases in the month they
ship. These are **not** the Changesets versions of `@idcr/web` and `@idcr/admin`
([`versioning.md`](./versioning.md)): those bump on merges to `main` and describe the code; a
production release describes what reached production, and usually spans several package versions.
The deployed commit is recorded on the Linear release, and the next release measures from it.

## The deploy script

`release.deployCommand` is `bash scripts/deploy-prod.sh`. It:

1. refuses a dirty tree;
2. exports **`git archive HEAD`** to a temporary directory and deploys from there — the Vercel CLI
   uploads the *directory it is pointed at*, not a commit, and the checkout also holds `.env.local`
   files, `.claude/worktrees/*`, `graphify-out/` and `tasks/`. The archive is exactly the commit;
3. runs `vercel deploy --prod --project <name> --scope divine-lab` for the website, then the admin
   app. Each project's Root Directory (`apps/web`, `apps/admin`) is applied by Vercel to the uploaded
   repository root, so the shared `packages/` are present. `--meta githubCommitSha=<sha>` records the
   commit on each deployment, since an archive has no git metadata;
4. prints `web: <url>` and `admin: <url>` (both go on the runbook), and stops on the first failure,
   listing what it already deployed.

`bash scripts/deploy-prod.sh --preview` makes the identical upload as preview deployments — the way to
test the script. Never run it without `--preview` outside `/yoke:release deploy`.

## Rollback

Per app, pinned to that app's previous production deployment (the runbook records both):

```
vercel rollback <previous-web-deployment-url> --scope divine-lab
vercel rollback <previous-admin-deployment-url> --scope divine-lab
```

Rolling back one app leaves the other on the new release. A Contentful cutover is rolled back by its
own reverse migration ([`contentful-environments.md`](./contentful-environments.md)), never by a
Vercel rollback.

## Production actions a merge does not perform

Anything production needs beyond the deploy — a Contentful model promotion or alias swap, a data
script, an env change, a cron, a third-party console change — gets its own **`Prod actions deferred
from ICR-N`** ticket when it is identified (`/yoke:merge` §3.1 makes it from the PR's Release Notes).
`/yoke:release cut` folds those tickets into the release's runbook ticket in order (pre-deploy, then
post-deploy, honouring every "do not run until"), and the close step will not finish while one is
unverified.

## The first release

The pipeline started empty, so its first release had no earlier release to measure from. It was cut
with `--since 8377d89`: the website's production commit at the time (2026-07-16). The admin app was on
`64a2ba2` (2026-07-29), which is later, so measuring from the website's commit missed nothing; the
admin commits in between were simply redeployed from the same code. Every later release measures from
the last completed one, and `--since` is never passed again.

## Other tools

The rules here are tool-neutral. Antigravity (`agy`) reads `AGENTS.md`, not `CLAUDE.md`, and yoke's
commands and guard do not run there yet. Until they do, an `agy` session must not deploy, push
`production-hold`, or move issues to Ready for Release or Done (`AGENTS.md` § Tracker says so).
