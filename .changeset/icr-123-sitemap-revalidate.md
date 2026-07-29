---
"@idcr/web": patch
---

Refresh `sitemap.xml` hourly instead of only on deploy. `sitemap.ts` uses no
Request-time API, so Next.js cached it at build time — unlike every page, which
is forced dynamic by `shouldUseDraftMode()`. Content published after a deploy
never reached the sitemap: verified in production on 2026-07-29, where the live
sitemap was still the 2026-07-17 build and omitted two sermons published on
2026-07-19. Adding `export const revalidate = 3600` opts the route out of
build-time-only caching without depending on the Contentful publish webhook.
