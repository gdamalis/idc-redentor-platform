---
"@idcr/web": patch
---

Trace `playwright-core`'s `browsers.json` into the sermon-PDF cron function so production renders
instead of retrying forever, guard it in CI, and resolve the MongoDB database name from
`MONGODB_URI` with a fail-closed allowlist instead of a hardcoded literal.
