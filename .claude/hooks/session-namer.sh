#!/bin/sh
# SessionStart + UserPromptSubmit hook — name the session after the active ticket.
#
# Derives the ticket from the git branch (or worktree dir) and sets the session title via the
# `sessionTitle` hook-output field, which has "the same effect as /rename". The model itself
# cannot rename a session (/rename is a user-only CLI command with no programmatic path), so
# the hook does it deterministically.
#
# Title = ICR-N-<first ~4 kebab words of the branch slug>, e.g. branch
# feat/ICR-45-redesign-creed-section -> title ICR-45-redesign-creed-section. The IDCR- prefix
# is also recognized for in-flight branches/worktrees.
#
# Idempotent: stays silent once the live name already carries the ticket, so it never churns
# and preserves a manual /rename (a human-chosen ICR-45-better-words is left alone).
#
# SessionStart only acts on source "startup"/"resume" (sessionTitle is ignored on
# clear/compact). Always exits 0 and never errors, so it can't block a prompt or session start.

input="$(cat)"

# Parse cwd, session_id, session_name, event name and source in one shell-safe python pass.
eval "$(printf '%s' "$input" | python3 -c '
import sys, json, shlex
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
def emit(k, v):
    print("%s=%s" % (k, shlex.quote(v or "")))
emit("HK_CWD", d.get("cwd", ""))
emit("HK_SID", d.get("session_id", ""))
emit("HK_NAME", d.get("session_name") or "")
emit("HK_EVENT", d.get("hook_event_name") or "")
emit("HK_SOURCE", d.get("source") or "")
' 2>/dev/null)"

cwd="$HK_CWD"
sid="$HK_SID"
name="$HK_NAME"
event="$HK_EVENT"
source="$HK_SOURCE"

# SessionStart: sessionTitle only applies on startup/resume — ignore clear/compact.
if [ "$event" = "SessionStart" ]; then
  case "$source" in
    startup | resume) ;;
    *) exit 0 ;;
  esac
fi

# Fallback: resolve the current display name from the session registry by sessionId
# (the payload's session_name is optional and may be absent).
if [ -z "$name" ] && [ -n "$sid" ]; then
  f="$(grep -l "\"sessionId\":\"$sid\"" "$HOME"/.claude/sessions/*.json 2>/dev/null | head -1)"
  [ -n "$f" ] && name="$(python3 -c 'import sys,json;print(json.load(open(sys.argv[1])).get("name") or "")' "$f" 2>/dev/null)"
fi

# Ticket ID — prefer the checked-out branch (feat/ICR-45-...), fall back to the worktree dir.
# Recognize the canonical ICR- prefix and the IDCR- alias (longer prefix first in the alternation).
branch="$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null)"
ticket="$(printf '%s' "$branch" | grep -oE '(IDCR|ICR)-[0-9]+' | head -1)"
[ -z "$ticket" ] && ticket="$(printf '%s' "$cwd" | grep -oE '(IDCR|ICR)-[0-9]+' | head -1)"

[ -z "$ticket" ] && exit 0   # no ticket context (e.g. on main) — nothing to name

# Already named for this ticket → leave it (no churn; preserves a manual /rename).
case "$name" in
  "$ticket" | "$ticket"-* | "$ticket"_*) exit 0 ;;
esac

# Title = ticket + first ~4 kebab words of the branch slug.
slug="$(printf '%s' "$branch" | sed -E "s#^[a-z]+/##; s/^${ticket}-?//; s/(([^-]+-){0,3}[^-]+).*/\1/")"
title="$ticket"
[ -n "$slug" ] && title="$ticket-$slug"

# Emit sessionTitle (same effect as /rename), echoing back the actual event name. The field is
# written both top-level and nested under hookSpecificOutput for robustness across CLI versions.
python3 -c '
import json, sys
event, title = sys.argv[1:3]
print(json.dumps({
    "sessionTitle": title,
    "hookSpecificOutput": {"hookEventName": event or "UserPromptSubmit", "sessionTitle": title},
}))
' "$event" "$title" 2>/dev/null

exit 0
