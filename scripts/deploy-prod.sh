#!/usr/bin/env bash
# Deploy both apps (website + ministry admin) to production from ONE commit.
#
# This is config.release.deployCommand: yoke's release command runs it only after the owner
# approves the release with its approval phrase. Never run it by hand outside a release.
# See docs/architecture/deployments.md.
#
# Why it deploys from `git archive HEAD` and not from the checkout: the Vercel CLI uploads the
# DIRECTORY it is pointed at, not a commit. The checkout also holds untracked and git-ignored files
# (.env.local, .claude/worktrees/*, graphify-out/, tasks/), and any of them would ship. An archive
# of HEAD contains exactly the tracked files of the commit being released, so production is that
# commit and nothing else.
#
# Usage: bash scripts/deploy-prod.sh            # production (the release)
#        bash scripts/deploy-prod.sh --preview  # same upload as a preview deploy (to test the script)
set -euo pipefail

SCOPE="divine-lab"
# Order matters only for what is live if the second deploy fails: the website goes first.
PROJECTS=("web:idc-redentor-web" "admin:idc-redentor-admin")

target_flag="--prod"
if [[ "${1:-}" == "--preview" ]]; then
  target_flag=""
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--preview]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "refusing: the working tree is not clean" >&2
  exit 1
fi

sha="$(git rev-parse HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git archive --format=tar HEAD | tar -x -C "$stage"

deployed=()
for entry in "${PROJECTS[@]}"; do
  app="${entry%%:*}"
  project="${entry#*:}"
  echo "deploying $app ($project) at $sha ${target_flag:-(preview)}" >&2
  # The project's Root Directory (apps/web, apps/admin) is applied by Vercel to the uploaded
  # repository root, so the whole monorepo (with the shared packages/) is uploaded for each app.
  # --meta records the commit on the deployment, since an archive carries no git metadata.
  # shellcheck disable=SC2086
  if ! url="$(vercel deploy $target_flag --yes \
      --cwd "$stage" \
      --project "$project" \
      --scope "$SCOPE" \
      --meta "githubCommitSha=$sha" \
      --meta "githubCommitRef=$branch")"; then
    echo "FAILED: $app ($project) did not deploy." >&2
    if [[ ${#deployed[@]} -gt 0 ]]; then
      echo "Already deployed in this run (roll back with the release's rollbackCommand if needed):" >&2
      printf '  %s\n' "${deployed[@]}" >&2
    fi
    exit 1
  fi
  deployed+=("$app: $url")
  echo "$app: $url"
done
