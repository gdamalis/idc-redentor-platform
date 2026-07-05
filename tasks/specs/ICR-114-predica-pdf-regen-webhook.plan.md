# ICR-114 — Implementation Plan · Sermon PDF regen webhook (Part B)

> Story · `feat` · QA depth **heavy** · Jira https://divinelab.atlassian.net/browse/ICR-114
> Design spec: `tasks/specs/predica-pdf-regen-webhook.md` (architecture, data model, edge cases).
> This plan is the `/work` design-gate output; branch `feat/ICR-114-predica-pdf-regen-webhook`.

## Locked decisions

- **CMA write-back** = `contentful-management` SDK (plain client), moved devDeps→**dependencies**; wrapped in a thin service enforcing: env `production` only (refuse `master`/`master-*`), **never publish**, guard-referenced before delete.
- **Render** = **self-contained**: bundle the 2 fonts (Playfair Display + Outfit) + logo in-repo, inline as data-URIs, no outbound network at render (`@sparticuz/chromium` + `playwright-core`).
- **Cron** = native Vercel Cron every minute (Team ⇒ Pro). Quiet window **90s**, env `PDF_REGEN_QUIET_WINDOW_SECONDS`.
- **Scope v1** = single `pdfSummary`, both locales. Segment PDFs out of scope.
- **No content-model change** ⇒ model-change/staging-env gate N/A.
- **Collection** = `pdf_jobs` (snake_case, DB `website`).

## Blockers → handled

- **M1** rich-text→`ContentBlock[]`: no inverse converter exists → new util (CP3).
- **M2/M5** getter is single-locale + numeric scripture → dual-fetch both locales + merge (CP5).
- **M3** `serviceLabel` not a content-type field → PDF uses default label (both current+regenerated default, so they match).
- **M6** logo/fonts won't port to serverless → self-contained inlining (CP5).

## Checkpoints

### CP1 — env + deps + build config · `chore(ICR-114): add serverless PDF regen deps and env plumbing`

- `apps/web/package.json`: `contentful-management` devDeps→dependencies; add `@sparticuz/chromium` (Chromium major matching `playwright-core@1.61.0` — confirm at CP5) + `playwright-core@1.61.0` (direct, pinned).
- `apps/web/src/types/environment.d.ts` + `apps/web/.env.example`: `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`, `PREDICA_REGEN_SECRET`, `CRON_SECRET`, `PDF_REGEN_QUIET_WINDOW_SECONDS?`.
- `turbo.json` `build.env`: add the runtime vars.
- `apps/web/next.config.ts`: `serverExternalPackages: ["@sparticuz/chromium","playwright-core"]`.
- **Verify:** `pnpm install`, `pnpm type-check`, `pnpm lint`, `pnpm build`.

### CP2 — pdf_jobs model + service · `feat(ICR-114): add pdf_jobs mongo queue for sermon pdf regen`

- `apps/web/src/service/predica/pdfJobs.ts` (+ `.test.ts`). `PdfJob` interface; unique `entryId` index via memoized `indexEnsured`; `markDirty`, `selectRenderable(now, quietWindow)` (idle>window AND hash-changed AND not rendering), `claimJob` (lock + stale reclaim), `completeJob`, `failJob`. Guard `if(!client)` (ICR-111). Model on `broadcast/broadcastLog.ts`.
- **Verify:** unit tests (selection, stale-lock, transitions) + typecheck/lint.

### CP3 — contentHash + richtext converter · `feat(ICR-114): add rich-text→ContentBlock converter and sermon content hash`

- `apps/web/src/utils/predica/regenContent.ts` (+ `.test.ts`). `richTextToContentBlocks(doc): ContentBlock[]` (inverse of `blocksToRichTextDocument`, sermonEntry.ts:202). `computeSermonContentHash(bilingual fields)` (sha256, stable serialization).
- **Verify:** hash stability + converter node-coverage tests.

### CP4 — webhook route · `feat(ICR-114): add regenerate-pdf webhook that marks sermon drafts dirty`

- `apps/web/src/app/api/predica/regenerate-pdf/route.ts` (+ `.test.ts`). POST; Zod body; `x-predica-regen-key` 401; sermon-type gate 200; compute contentHash from a preview fetch by `sys.id`; `markDirty`; 202. No render.
- **Verify:** unit tests (401 / 200 non-sermon / 202 upsert).

### CP5 — serverless render util (Chromium spike) · `feat(ICR-114): render sermon pdf server-side with self-contained chromium`

- `apps/web/src/service/predica/renderSermonPdf.ts` + bundled fonts/logo. Dual-fetch draft (both locales) → map to `SermonLocaleData`/`SermonCommon` (converter, bilingual scripture merge numbers→strings, inlined logo) → `buildPdfHtml` per locale (+`version` footer) → `@sparticuz/chromium`+`playwright-core` (exact `page.pdf` options). Inline fonts+logo, drop Google-Fonts `<link>` for serverless.
- **Verify:** local spike renders a byte-plausible branded PDF from a fixture with no network.

### CP6 — CMA write-back service · `feat(ICR-114): swap sermon pdfSummary in place via contentful management`

- `apps/web/src/service/predica/contentfulWriteBack.ts`. Plain CM client, env `production`, refuse `master`. `uploadPdfAsset` (draft, no publish, title "… · vN"); `swapPdfSummary(entryId, locale, assetId)` GET-version→update only `fields.pdfSummary[locale]` (no publish); `deleteSupersededAsset` guard-referenced then unpublish-then-delete. Order: swap first, delete old after.
- **Verify:** unit-test master-refusal + no-publish guards (mock client).

### CP7 — cron route + vercel.json · `feat(ICR-114): add debounced cron that regenerates edited sermon pdfs`

- `apps/web/src/app/api/predica/regenerate-pdf/cron/route.ts`. GET; `Authorization: Bearer ${CRON_SECRET}` 401; `export const maxDuration = 60`. Select renderable → claim → render (CP5) → writeback (CP6) → complete/fail (version+1). Entry-gone → drop job. JSON summary.
- `apps/web/vercel.json`: `crons:[{path:"/api/predica/regenerate-pdf/cron",schedule:"* * * * *"}]` + `functions` maxDuration/memory.
- **Verify:** selection/lock integration test; `pnpm build` with cron+segment config.

## Docs (at /work step 13.5, `docs(ICR-114): …`)

Update `docs/architecture/predica-pdf-mirrors-post.md` (regen loop) + `docs/architecture/contentful-data-layer.md` (2nd webhook); reconcile `tasks/specs/predica-pdf-regen-webhook.md` open-questions → resolved.

## Deferred production actions → runbook Jira ticket (standing rule #1)

Post-merge human-only: set Vercel env `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`/`PREDICA_REGEN_SECRET`/`CRON_SECRET` (+ `AWS_LAMBDA_JS_RUNTIME` in dashboard); configure Contentful draft-save/auto_save webhook → `/api/predica/regenerate-pdf`; confirm Vercel Cron enabled. Create a linked ICR runbook ticket at PR/triage.

## Security (heavy)

CMA token: Vercel secret, cron-path-only import, never logged, server-only, master-refusal + no-publish. Webhook: shared-secret 401, sermon gate, Zod, 202-fast/no-render. Cron: Bearer CRON_SECRET. Mongo: bounded doc-per-entry, unique index. Downstream: verifier + security-reviewer + acceptance-judge.
