#!/usr/bin/env bash
#
# Fail the Claude Code Review workflow when it produces no review.
#
# The action exits 0 whether or not it posted anything, so a green check used to mean only "the
# process ran" while reading as "this PR was reviewed and found clean". This guard makes the check
# mean what people already assume it means. See AOS-13.
#
# WHAT COUNTS AS A REVIEW
#
# Evidence must LOOK like a review, not merely come from Claude. The tag-mode workflow in
# claude.yml answers `@claude` mentions under the very same `claude[bot]` identity, so counting
# every Claude-authored comment would let an unrelated tag-mode reply stand in for a review that
# never happened. That is not a corner case: the review command's FIRST step declines any PR that
# "Claude has already commented on", so one `@claude` exchange both suppresses the review and
# supplies the comment that would have vouched for it — the original silent false positive,
# restored. Only the surfaces the review command actually posts on count:
#
#   * found issues  -> standalone inline comments on the diff (pulls/{pr}/comments), posted with
#                      `mcp__github_inline_comment__create_inline_comment`. Threaded replies are
#                      excluded: those are conversation, and tag mode produces them.
#   * found nothing -> one summary comment headed "## Code review" (issues/{pr}/comments), posted
#                      with `gh pr comment` in a format the command mandates verbatim.
#   * declined      -> the same "## Code review" comment, bodied "Declined: <reason>".
#
# That third state needs no special handling here, and that is the point: the heading is the whole
# contract, so a decline satisfies it exactly as a clean review does. The command itself posts
# nothing when it declines — it stops at its eligibility check — which is why the workflow's
# `prompt:` carries a completion contract obliging it to say so. Before that contract existed, a
# correctly-declined PR (a one-line docs fix, say) was indistinguishable from a broken run and this
# guard reddened it, leaving a check no amount of work on the PR could clear.
#
# A formal review carrying that same heading counts too, which is what a human-requested
# `@claude review` produces — a real review, just via the other door.
#
# Matching on the heading means a change to the command's output format turns this check red rather
# than silently green. That is the intended direction for a guard: the failure message below names
# the heading it looked for, so the fix is a one-line edit here.
#
# Reviews from ANY earlier run count, not just this one. The review command declines by design to
# re-review a PR it has already commented on, so requiring a same-run review would turn every
# re-push red — and a chronically red check gets ignored, which recreates the original bug in
# reverse.
#
# Env: GH_TOKEN, REPO (owner/name), PR (number). EXECUTION_FILE is optional and advisory.

set -euo pipefail

fail() { printf '::error::%s\n' "$*" >&2; exit 1; }

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${REPO:?REPO is required (owner/name)}"
: "${PR:?PR is required (pull request number)}"

[[ "$PR" =~ ^[0-9]+$ ]] || fail "PR must be a number, got: ${PR}"
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || fail "REPO must be owner/name, got: ${REPO}"

# The review action mints its own GitHub App token via OIDC and posts as `claude[bot]`
# (CLAUDE_BOT_LOGIN in anthropics/claude-code-action); `claude-code[bot]` is the same app under the
# name older releases used. Matched exactly rather than by substring: a substring also matches a
# human account such as `claude-hernandez`, and the app's numeric user id has already drifted
# between releases, so the login is the only stable handle. If either workflow is ever given a
# `github_token`, comments post under that token's account and this must change.
BY_CLAUDE='(((.user.login // "") | ascii_downcase) | (. == "claude[bot]" or . == "claude-code[bot]"))'

# The heading the review command is required to post verbatim on every ending it is allowed to
# reach. The level is matched loosely because it has already moved between plugin versions ("### "
# became "## "), but the heading must stand ALONE on its line.
#
# That trailing anchor is the whole point and is easy to drop by accident. Without it the pattern
# is a prefix match, so "## Code review workflow" — prose ABOUT the review, exactly what a tag-mode
# answer to "how does CI work?" produces — satisfies the guard and the check goes green with no
# review behind it. That is the AOS-13 failure shape rebuilt inside the thing meant to catch it.
REVIEW_HEADING='((.body // "") | test("(^|\\n)[ \\t]*#{1,6}[ \\t]*code review[ \\t\\r]*(\\n|$)"; "i"))'

# Count entries matching a jq predicate on one endpoint.
count_matching() {
  local endpoint=$1 predicate=$2 out
  if ! out=$(gh api --paginate "$endpoint" --jq "[.[] | select(${predicate})] | length"); then
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
# standard as count_matching: unverifiable is unproven, and says so.
review_workflow_touched() {
  local files
  if ! files=$(gh api --paginate "repos/${REPO}/pulls/${PR}/files" --jq '.[].filename'); then
    fail "Could not list changed files for ${REPO}#${PR} (gh error above). Cannot tell whether this PR edits the review workflow, so neither pass nor inconclusive is safe to report. (AOS-13)"
  fi
  printf '%s\n' "$files" | grep -qxF '.github/workflows/claude-code-review.yml'
}

summaries=$(count_matching "repos/${REPO}/issues/${PR}/comments" "${BY_CLAUDE} and ${REVIEW_HEADING}") || exit 1
inline_comments=$(count_matching "repos/${REPO}/pulls/${PR}/comments" "${BY_CLAUDE} and (.in_reply_to_id == null)") || exit 1
# Inline comments posted through the MCP tool are grouped under an auto-created review with an
# empty body, so the heading is required here too — otherwise every inline finding is counted twice.
# This surface exists to catch a future version of the command that submits a formal review instead.
reviews=$(count_matching "repos/${REPO}/pulls/${PR}/reviews" "${BY_CLAUDE} and ${REVIEW_HEADING}") || exit 1

total=$(( summaries + inline_comments + reviews ))

if [ "$total" -eq 0 ] && review_workflow_touched; then
  printf '::warning::Review INCONCLUSIVE on %s#%s — this PR edits .github/workflows/claude-code-review.yml, so the action refused to run.\n' \
    "$REPO" "$PR"
  cat >&2 <<'EOF'
The action requires the review workflow to byte-match the default branch, so that a PR cannot
rewrite its own review. It logs "Skipping action due to workflow validation" and exits 0 having
reviewed nothing.

This is reported as inconclusive rather than pass or fail: no review happened, but nothing is
broken, and the workflow starts working again once this PR merges.

To get eyes on this PR anyway, ask the tag-mode path in claude.yml for the review command itself:
`@claude /code-review:code-review <owner>/<repo>/pull/<number> --comment`. A bare `@claude` mention
gets you an answer rather than a review, and leaves behind a comment that makes the automatic
review decline this PR from then on.
EOF
  exit 0
fi

# Quote the run's own last words before failing.
#
# The action reports subtype "success" with is_error false whether the review finished or was
# abandoned partway, so no exit code, no log line and no job status separates the two. The only
# place the difference survives is the final `result` string in the execution transcript: a
# finished run states a verdict, an abandoned one says it is waiting for subagents whose results
# have already returned. Printing it is the difference between a red check that explains itself and
# one that costs an hour of digging.
#
# Advisory only, and deliberately so. EXECUTION_FILE may be unset (older workflow), absent (the
# action wrote nothing) or malformed, and none of those change the verdict — the guard has already
# decided by the time this runs. Hence the existence test, the `|| true` on jq, and no `set -e`
# exposure: a diagnostic that can itself fail the guard is worse than no diagnostic.
report_run_conclusion() {
  [ -n "${EXECUTION_FILE:-}" ] && [ -r "${EXECUTION_FILE}" ] || return 0

  local summary
  summary=$(jq -r '
      def f($k): if has($k) then (.[$k] | tostring) else "?" end;
      [ .[]? | select(.type == "result") ] | last
      | select(. != null)
      | "  turns=\(f("num_turns"))  duration_ms=\(f("duration_ms"))  is_error=\(f("is_error"))\n  final: \(if (.result // "") == "" then "(no result text)" else .result end)"
    ' "${EXECUTION_FILE}" 2>/dev/null) || true

  [ -n "$summary" ] || return 0

  echo "" >&2
  echo "What the review run itself reported:" >&2
  printf '%s\n' "$summary" >&2
}

if [ "$total" -eq 0 ]; then
  printf '::error::Claude Code Review posted no review on %s#%s.\n' "$REPO" "$PR" >&2
  cat >&2 <<'EOF'
This check fails instead of passing green, because a green check here is read as "reviewed and
clean" and there is no review to back that up.

Every ending the reviewer is allowed to reach posts a `## Code review` comment — findings, "No
issues found", or "Declined: <reason>". Reaching none of them means the review did not finish.

Usual causes, likeliest first:
  * The run was abandoned mid-pipeline: the reviewer dispatched subagents and ended its turn
    saying it would wait for them, which the action still reports as success. The `final:` line
    below will read like "waiting for the agents" instead of a verdict. Re-run the job; if it
    recurs, the completion contract in this workflow's `prompt:` needs strengthening.
  * The reviewer declined the PR (closed, draft, trivial, automated, already reviewed) but did
    not post its `Declined:` comment — the completion contract was weakened or dropped.
  * The command changed the heading on its summary comment. This guard looks for a Markdown
    heading standing alone on its line and matching `Code review`; comments by Claude that carry
    no such heading are treated as conversation, not as a review.
  * The review command was invoked without `--comment`, so it printed its review to the job log
    instead of posting it, or `claude_args` no longer names a github comment tool so the comment
    MCP server was never installed and the found-issues path had nowhere to post. Both are
    regressions in this workflow's own inputs; check them before looking anywhere else.
EOF

  # Worth a fourth API call only now that the check is already failing.
  chatter=$(count_matching "repos/${REPO}/issues/${PR}/comments" "${BY_CLAUDE}") || exit 1
  if [ "$chatter" -gt 0 ]; then
    cat >&2 <<'EOF'
  * This PR carries a Claude comment that is not review output — most likely a tag-mode answer to
    an `@claude` mention. The eligibility check declines any PR that "Claude has already commented
    on", so one such exchange suppresses the review for the life of the PR. That comment is no
    longer counted as a review; ask for a real one with
    `@claude /code-review:code-review <owner>/<repo>/pull/<number> --comment`, or review by hand.
EOF
  fi

  report_run_conclusion
  exit 1
fi

printf '::notice::Review confirmed on %s#%s — %s summary comment(s), %s inline comment(s), %s review(s).\n' \
  "$REPO" "$PR" "$summaries" "$inline_comments" "$reviews"
