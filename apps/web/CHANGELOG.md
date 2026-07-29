# @idcr/web

## 1.27.4

### Patch Changes

- 58aa567: Refresh `sitemap.xml` hourly instead of only on deploy. `sitemap.ts` uses no
  Request-time API, so Next.js cached it at build time — unlike every page, which
  is forced dynamic by `shouldUseDraftMode()`. Content published after a deploy
  never reached the sitemap: verified in production on 2026-07-29, where the live
  sitemap was still the 2026-07-17 build and omitted two sermons published on
  2026-07-19. Adding `export const revalidate = 3600` opts the route out of
  build-time-only caching without depending on the Contentful publish webhook.

## 1.27.3

### Patch Changes

- 182bfd5: Trace `playwright-core`'s `browsers.json` into the sermon-PDF cron function so production renders
  instead of retrying forever, guard it in CI, and resolve the MongoDB database name from
  `MONGODB_URI` with a fail-closed allowlist instead of a hardcoded literal.

## 1.27.2

### Patch Changes

- Updated dependencies [6b3bfad]
  - @idcr/ui@0.0.1
