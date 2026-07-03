Keep vigil on the current branch's open pull request using the divinelab:vigil skill.

Each iteration:
1. Address unresolved review comments (superpowers:receiving-code-review; reply to each thread).
2. Fix failing CI checks unless the same failure exists on main (superpowers:systematic-debugging).
3. Resolve merge conflicts with main; run tests before pushing.
4. Push if changed; maintain a single edited status comment on the PR.
5. If approved + green + no unresolved threads: comment "vigil complete: ready to merge" and end the loop.

Never merge or close the PR. After 3 cycles with no progress on the same failure, stop and summarize for Gabriel.
