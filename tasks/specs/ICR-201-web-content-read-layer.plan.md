# ICR-201 — Implementation Plan

Spec: `tasks/specs/ICR-201-web-content-read-layer.md` (mirroring approved `evidence/ICR-201/spec.md`).
Commit type `feat`. Verify after each checkpoint (`type-check`, `lint`, `test`), and full workspace verify (`pnpm type-check && pnpm lint && pnpm test && pnpm build`) at Checkpoint 6.

## Checkpoints

1. **Shared contracts in `@idcr/content`** (`packages/content/src/rich-text/view.ts`, `packages/content/src/preview/{link,index,link.test}.ts`, `packages/content/package.json`, `packages/content/src/index.ts`).
2. **Read-layer core** (`apps/web/lib/content/{types,db,locale,media,cache}.ts`, `__tests__/{test-helpers,cache}.test.ts`).
3. **Fixed-entry & global readers** (`getSeo`, `getSection` + 3 aliases, `getNavigationMenu`, `getFooter`, `getSingleEmailForm`, `getContactForm`, `getEventBanner`, `getContentCollection`, `mapContentCollection` + unit tests).
4. **Editorial readers + parity & dormancy** (`getBlogPostPages`, `getChurchInfoTopic`, `getSermons`, `index.ts` + unit tests + `parity.test.ts` + `dormancy.test.ts`).
5. **Preview routes & draft headers** (`GET /api/preview`, `POST /api/preview/exit`, `src/lib/draft-headers.ts`, `src/proxy.ts`, `environment.d.ts`, `.env.example` + unit tests incl. static-before-topic exit & `VERCEL_TARGET_ENV`).
6. **Dormant `PreviewBanner` + i18n + full verify** (`src/components/shared/preview-banner/*`, `public/locales/{es-AR,en-US}.json`, `messages.test.ts` + full workspace build/test/lint/type-check).
