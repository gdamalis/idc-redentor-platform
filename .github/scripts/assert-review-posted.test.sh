#!/usr/bin/env bash
#
# Fixture tests for assert-review-posted.sh.
#
# The guard cannot be proven in CI by the PR that changes it: the review action refuses to run
# whenever a PR edits .github/workflows/claude-code-review.yml, so the guard's own check goes
# inconclusive on exactly the PRs that touch it. These fixtures are the only place its behaviour is
# actually exercised. They matter because the interesting part is a filter — which Claude-authored
# artifacts count as a review — and a filter that is one predicate too loose fails silently green,
# which is the whole bug this guard exists to prevent (AOS-13).
#
# Runs the real script against a stubbed `gh`. Needs only bash, jq, and awk.

set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=${1:-"$HERE/assert-review-posted.sh"}
[ -f "$SCRIPT" ] || { echo "no such script: $SCRIPT" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# A `gh` that serves fixture JSON by endpoint and applies the requested --jq with the real jq.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
endpoint=""; jqfilter=""
while [ $# -gt 0 ]; do
  case "$1" in
    api|--paginate) shift ;;
    --jq) jqfilter=$2; shift 2 ;;
    *) endpoint=$1; shift ;;
  esac
done
case "$endpoint" in
  */issues/*/comments) file=issue-comments.json ;;
  */pulls/*/comments)  file=inline-comments.json ;;
  */pulls/*/reviews)   file=reviews.json ;;
  */pulls/*/files)     file=files.json ;;
  *) echo "stub gh: unknown endpoint $endpoint" >&2; exit 1 ;;
esac
[ "${FAIL_ENDPOINT:-}" = "$file" ] && { echo "stub gh: simulated API failure" >&2; exit 1; }
jq -r "$jqfilter" "${FIXTURE_DIR}/${file}"
STUB
chmod +x "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"

TRACKING='Claude Code is working on this...\n\n[View job run](https://github.com/o/r/actions/runs/1)'
SUMMARY='## Code review\n\nNo issues found. Checked for bugs and CLAUDE.md compliance.'
DECLINED='## Code review\n\nDeclined: trivial change that is obviously correct.'
OLD_SUMMARY='### Code review\n\nFound 3 issues:\n\n1. thing'
WF='[{"filename":".github/workflows/claude-code-review.yml"}]'
OTHER='[{"filename":"src/app/page.tsx"}]'

# An execution transcript in the shape the action writes: a JSON array whose last `result` entry
# carries the run's final words. The abandoned-run text is the real symptom the diagnostic exists
# to surface.
ABANDONED_LOG="$TMP/abandoned.json"
cat > "$ABANDONED_LOG" <<'LOG'
[
  {"type":"system","subtype":"init"},
  {"type":"result","subtype":"success","is_error":false,"num_turns":3,"duration_ms":13600,
   "result":"I've launched both checks. Waiting for results before proceeding."}
]
LOG
MALFORMED_LOG="$TMP/malformed.json"
printf 'not json at all {{{' > "$MALFORMED_LOG"

pass=0
fail=0

fixture() { # name issue-comments inline-comments reviews files
  mkdir -p "$TMP/fix/$1"
  printf '%s' "$2" > "$TMP/fix/$1/issue-comments.json"
  printf '%s' "$3" > "$TMP/fix/$1/inline-comments.json"
  printf '%s' "$4" > "$TMP/fix/$1/reviews.json"
  printf '%s' "$5" > "$TMP/fix/$1/files.json"
}

expect() { # description fixture want-exit want-substring [fail-endpoint] [pr] [execution-file]
  local desc=$1 fix=$2 want=$3 substr=$4 failep=${5:-} pr=${6:-1} execfile=${7:-} out rc
  out=$(FIXTURE_DIR="$TMP/fix/$fix" FAIL_ENDPOINT="$failep" EXECUTION_FILE="$execfile" \
        GH_TOKEN=x REPO=o/r PR="$pr" bash "$SCRIPT" 2>&1)
  rc=$?
  if [ "$rc" -eq "$want" ] && printf '%s' "$out" | grep -qF "$substr"; then
    printf 'ok    %s\n' "$desc"
    pass=$((pass + 1))
  else
    printf 'FAIL  %s\n      expected exit %s containing %q, got exit %s:\n%s\n' \
      "$desc" "$want" "$substr" "$rc" "$out"
    fail=$((fail + 1))
  fi
}

# The regression this filter exists for: claude.yml answers `@claude` under the same identity, and
# that answer must not stand in for a review. Both shapes it can take are covered.
fixture tagmode "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$TRACKING\"}]" '[]' '[]' "$OTHER"
expect "a tag-mode answer alone is not a review" tagmode 1 "posted no review"
expect "the tag-mode answer is named as the likely cause" tagmode 1 "not review output"

fixture reply '[]' "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$TRACKING\",\"in_reply_to_id\":998}]" '[]' "$OTHER"
expect "a tag-mode inline reply is not a review" reply 1 "posted no review"

# Identity is matched exactly, so a human whose login merely contains "claude" cannot vouch.
fixture human "[{\"user\":{\"login\":\"claude-hernandez\"},\"body\":\"$SUMMARY\"}]" \
  '[{"user":{"login":"claude-hernandez"},"body":"nit"}]' '[]' "$OTHER"
expect "a human login containing 'claude' is not the bot" human 1 "posted no review"

fixture otherbot \
  '[{"user":{"login":"github-actions[bot]"},"body":"## Code review\nall good"}]' \
  '[{"user":{"login":"cursor[bot]"},"body":"bug"}]' '[]' "$OTHER"
expect "another bot's comment is not the review" otherbot 1 "posted no review"

# The app has shipped under both logins; either is the same reviewer.
fixture altlogin "[{\"user\":{\"login\":\"claude-code[bot]\"},\"body\":\"$SUMMARY\"}]" '[]' '[]' "$OTHER"
expect "the claude-code[bot] login also counts" altlogin 0 "1 summary comment(s)"

# The three shapes the review command really posts.
fixture clean "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$SUMMARY\"}]" '[]' '[]' "$OTHER"
expect "the no-issues summary comment counts" clean 0 "1 summary comment(s)"

fixture inline '[]' \
  '[{"user":{"login":"claude[bot]"},"body":"This leaks a handle."},{"user":{"login":"claude[bot]"},"body":"Off by one."}]' \
  '[]' "$OTHER"
expect "standalone inline findings count" inline 0 "2 inline comment(s)"

# A decline is a completed review, not a broken run. Before the workflow's completion contract made
# the reviewer say so, a correctly-declined PR was indistinguishable from silence and went red.
fixture declined "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$DECLINED\"}]" '[]' '[]' "$OTHER"
expect "a 'Declined:' summary comment counts as a review" declined 0 "1 summary comment(s)"

# The heading level moved between plugin versions, so it is matched loosely.
fixture oldfmt "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$OLD_SUMMARY\"}]" '[]' '[]' "$OTHER"
expect "an older '###' heading still counts" oldfmt 0 "1 summary comment(s)"

# ...but the heading must stand alone. A tag-mode answer explaining the workflow is not a review,
# and a prefix-only match would let exactly that comment award a green check.
fixture prose \
  '[{"user":{"login":"claude[bot]"},"body":"## Code review workflow\n\nIt runs on every PR."}]' \
  '[]' '[]' "$OTHER"
expect "prose headed 'Code review workflow' is not a review" prose 1 "posted no review"

# CRLF bodies must not defeat the heading match.
fixture crlf '[{"user":{"login":"claude[bot]"},"body":"## Code review\r\n\r\nNo issues found."}]' '[]' '[]' "$OTHER"
expect "a CRLF summary comment still counts" crlf 0 "1 summary comment(s)"

# GitHub wraps MCP-posted inline comments in an empty review; counting it would double-count.
fixture wrapper '[]' '[{"user":{"login":"claude[bot]"},"body":"Off by one."}]' \
  '[{"user":{"login":"claude[bot]"},"body":"","state":"COMMENTED"}]' "$OTHER"
expect "the empty review wrapper is not double-counted" wrapper 0 "1 inline comment(s), 0 review(s)"

fixture formal '[]' '[]' \
  "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$SUMMARY\",\"state\":\"COMMENTED\"}]" "$OTHER"
expect "a formal review carrying the heading counts" formal 0 "1 review(s)"

fixture mixed \
  "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$TRACKING\"},{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$SUMMARY\"}]" \
  '[]' '[]' "$OTHER"
expect "a genuine review still counts alongside chatter" mixed 0 "1 summary comment(s)"

# The inconclusive branch, and the fact that real evidence outranks it.
fixture wfedit '[]' '[]' '[]' "$WF"
expect "a workflow-editing PR is inconclusive, not red" wfedit 0 "INCONCLUSIVE"

fixture wfedit_reviewed "[{\"user\":{\"login\":\"claude[bot]\"},\"body\":\"$SUMMARY\"}]" '[]' '[]' "$WF"
expect "an existing review outranks the inconclusive branch" wfedit_reviewed 0 "Review confirmed"

# Unverifiable is unproven: never assume a PR was reviewed.
fixture apifail '[]' '[]' '[]' "$OTHER"
expect "an unreachable comments API fails closed" apifail 1 "unverifiable review is an unproven one" issue-comments.json
expect "an unreachable files API fails closed" apifail 1 "Cannot tell whether this PR edits" files.json

expect "a non-numeric PR is rejected" apifail 1 "PR must be a number" "" abc

# The transcript diagnostic. An abandoned run and a clean one are both reported as success by the
# action, so the run's own final words are the only thing that tells them apart — quoting them is
# what makes a red check self-explaining instead of a mystery.
expect "a failing run quotes the transcript" tagmode 1 "What the review run itself reported:" "" 1 "$ABANDONED_LOG"
expect "the quoted transcript shows the abandonment" tagmode 1 "Waiting for results before proceeding" "" 1 "$ABANDONED_LOG"
expect "the quoted transcript shows the turn count" tagmode 1 "turns=3" "" 1 "$ABANDONED_LOG"

# The diagnostic is advisory: it must never change the verdict or crash the guard.
expect "a malformed transcript does not break the guard" tagmode 1 "posted no review" "" 1 "$MALFORMED_LOG"
expect "a missing transcript does not break the guard" tagmode 1 "posted no review" "" 1 "$TMP/does-not-exist.json"
expect "a transcript is not consulted on a passing run" clean 0 "Review confirmed" "" 1 "$ABANDONED_LOG"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
