# @idcr/web

## 1.27.3

### Patch Changes

- 182bfd5: Trace `playwright-core`'s `browsers.json` into the sermon-PDF cron function so production renders
  instead of retrying forever, guard it in CI, and resolve the MongoDB database name from
  `MONGODB_URI` with a fail-closed allowlist instead of a hardcoded literal.

## 1.27.2

### Patch Changes

- Updated dependencies [6b3bfad]
  - @idcr/ui@0.0.1
