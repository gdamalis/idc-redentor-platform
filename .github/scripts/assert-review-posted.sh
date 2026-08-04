#!/usr/bin/env bash
#
# Fail the Claude Code Review workflow when it produces no review.
#
# The action exits 0 whether or not it posted anything, so a green check used to mean only "the
# process ran" while reading as "this PR was reviewed and found clean". This guard makes the check
# mean what people already assume it means. See AOS-13.
#
# Passes when the PR carries a Claude-authored review on ANY surface, including one from an earlier
# run: the review command declines by design to re-review a PR it has already commented on, so
# requiring a same-run review would turn every re-push red, and a chronically red check gets ignored
# — which would recreate the bug in reverse.
#
# Env: GH_TOKEN, REPO (owner/name), PR (number).

set -euo pipefail

fail() { printf '::error::%s\n' "$*" >&2; exit 1; }

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${REPO:?REPO is required (owner/name)}"
: "${PR:?PR is required (pull request number)}"

[[ "$PR" =~ ^[0-9]+$ ]] || fail "PR must be a number, got: ${PR}"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || fail "REPO must be owner/name, got: ${REPO}"

# Count entries authored by the Claude app on one endpoint.
#
# Matches a "claude" substring in the login, which covers claude[bot]. github-actions[bot] is
# deliberately NOT matched: any unrelated bot comment would otherwise satisfy the guard.
count_claude() {
  local endpoint=$1 out
  if ! out=$(gh api --paginate "$endpoint" \
    --jq '[.[] | select((.user.login // "") | ascii_downcase | contains("claude"))] | length'); then
    fail "Could not query ${endpoint} (gh error above). An unverifiable review is an unproven one, so this fails rather than assume ${REPO}#${PR} was reviewed. (AOS-13)"
  fi
  # --paginate emits one count per page; sum them.
  printf '%s' "$out" | awk '{ s += $1 } END { print s + 0 }'
}

# The action refuses to run at all when the PR modifies the review workflow itself — the workflow
# file must byte-match the default branch, so a PR author cannot rewrite the review to exfiltrate
# secrets. It logs "Skipping action due to workflow validation" and still reports success.
#
# That is a structural skip, not a silent no-op: it is expected, self-resolving on merge, and no
# review could have been posted. AC2 allows "explicitly reported as inconclusive" for exactly this
# case. Without this branch the guard would redden every workflow-editing PR, and a chronically red
# check gets ignored.
#
# The gh call is checked separately from the grep on purpose. Piped together under `pipefail`, a
# transient API failure would surface as grep's "no match" and be read as "workflow not touched",
# sending a workflow-editing PR into the hard-fail branch with a message blaming --comment. Same
# standard as count_claude: unverifiable is unproven, and says so.
review_workflow_touched() {
  local files
  if ! files=$(gh api --paginate "repos/${REPO}/pulls/${PR}/files" --jq '.[].filename'); then
    fail "Could not list changed files for ${REPO}#${PR} (gh error above). Cannot tell whether this PR edits the review workflow, so neither pass nor inconclusive is safe to report. (AOS-13)"
  fi
  printf '%s\n' "$files" | grep -qxF '.github/workflows/claude-code-review.yml'
}

pr_comments=$(count_claude "repos/${REPO}/issues/${PR}/comments") || exit 1
inline_comments=$(count_claude "repos/${REPO}/pulls/${PR}/comments") || exit 1
reviews=$(count_claude "repos/${REPO}/pulls/${PR}/reviews") || exit 1

total=$(( pr_comments + inline_comments + reviews ))

if [ "$total" -eq 0 ] && review_workflow_touched; then
  printf '::warning::Review INCONCLUSIVE on %s#%s — this PR edits .github/workflows/claude-code-review.yml, so the action refused to run.\n' \
    "$REPO" "$PR"
  cat >&2 <<'EOF'
The action requires the review workflow to byte-match the default branch, so that a PR cannot
rewrite its own review. It logs "Skipping action due to workflow validation" and exits 0 having
reviewed nothing.

This is reported as inconclusive rather than pass or fail: no review happened, but nothing is
broken, and the workflow starts working again once this PR merges. Get a review on this PR by
commenting `@claude review` (the tag-mode path in claude.yml, which is unaffected).
EOF
  exit 0
fi

if [ "$total" -eq 0 ]; then
  printf '::error::Claude Code Review posted no review on %s#%s.\n' "$REPO" "$PR" >&2
  cat >&2 <<'EOF'
This check fails instead of passing green, because a green check here is read as "reviewed and
clean" and there is no review to back that up.

Usual causes:
  * The review command was invoked without `--comment`, so it printed its review to the job log
    instead of posting it. Check the `prompt:` in this workflow.
  * `claude_args` no longer names a github comment tool, so the comment MCP server was not
    installed and the found-issues path had nowhere to post.
  * The command declined the PR as closed, trivial, or already reviewed. Check the job summary
    (`display_report: true`) for what it actually concluded.

See AOS-13 for the full root cause.
EOF
  exit 1
fi

printf '::notice::Review confirmed on %s#%s — %s PR comment(s), %s inline comment(s), %s review(s).\n' \
  "$REPO" "$PR" "$pr_comments" "$inline_comments" "$reviews"
