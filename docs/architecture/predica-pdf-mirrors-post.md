# Predica: the PDF mirrors the post (single-source content model)

**TL;DR.** A sermon has **one body** — the localized rich-text `content` (TipTap v3 JSON in MongoDB `website*.sermons`).
The website post and the downloadable branded PDF are **two views of that same body**. Editing the sermon in the
Ministry Admin Panel automatically queues a PDF rebuild (`content_pdf_jobs` → `/api/content/pdf-worker`).

## Why this changed

Originally the `/predica` writer produced a short PDF-only summary separately from the website post body, so editing
the sermon in the CMS could never update the PDF. Unifying both onto `content` guarantees the website article and
printed handout never diverge.

## The model now

- **`content` is the one body.** The writer produces ~800–1200 words in the preacher's voice (`h2`/`h3`, `p`,
  `blockquote`, `ul`/`ol`) inside `sermon.json`. `build-sermon-payload.mjs` converts those blocks to TipTap v3 JSON
  matching `@idcr/content`'s `RICH_TEXT_SCHEMAS.sermon`.
- **The PDF renders that same body.** Local `/predica` runs render `predica.es-AR.pdf` and `predica.en-US.pdf` via
  `.claude/scripts/predica/build-predica-pdf.mjs`; admin edits regenerate them via
  `apps/admin/src/service/content/sermons/{pdf-html,render-sermon-pdf,pdf-worker.service}.ts`:

  ```text
  Cover (logo · date · service · title · byline)
  → content body  (h2/h3/p/blockquote/ul/ol; embeddedMedia nodes are skipped — print can't play them)
  → Scripture references  (from resolved bible_verses docs, per-locale)
  → Footer signature (· v<N> on worker rebuilds)
  ```

- **`thesis` / `mainPoints` / `excerpt` / SEO are metadata**, not the PDF body. They power cards, SEO, and related
  sermons.

## Automatic regeneration on admin edit (`ICR-200` + `ICR-204`)

```text
Admin sermon editor save (or /api/predica/sermons ingest without pre-built PDFs / --queue-pdf-rebuild)
   │  computes canonical TipTap SHA-256 contentHash (sermon-hash.service.ts)
   ▼
if hash changed (or manual Regenerar): markSermonPdfDirty(sermonId, contentHash) in `website*.content_pdf_jobs`
   │
   ▼  GET /api/content/pdf-worker  (Authorization: Bearer <CRON_SECRET>, scheduled in ICR-205)
claim job (atomic lock) → load draft + authors + verses → buildPdfHtml → Chromium → upload via createServerMedia
   ▼
sermonService.updatePdfMedia (hash-guarded, carries through to published if hashes match) → delete orphaned PDFs
```

- **No 90s debounce needed:** Admin form saves and `/predica` ingests are discrete writes (unlike legacy per-keystroke
  autosave). Multiple rapid saves still collapse cleanly via the unique `{ sermonId: 1 }` index on `content_pdf_jobs`.
- **Pre-built `/predica` PDFs stay in sync:** When `/predica` uploads both PDFs during ingest, `POST /api/predica/sermons`
  computes `draft.contentHash` using `ICR-200`'s exact `computeSermonHashForSnapshot` algorithm and aligns any existing
  `content_pdf_jobs` record (`"PDF al día"` in `SermonPdfStatusCard`). Any later edit in the admin editor immediately
  detects the hash change and queues a rebuild.
- **Publishing is never blocked** while a PDF rebuilds; when the worker finishes a matching hash, `updatePdfMedia`
  updates both `draft` and `published` without flipping status back to `"Cambios sin publicar"`.
- **Fail-closed auth:** `/api/content/pdf-worker` checks `Authorization: Bearer <CRON_SECRET>` in constant time via
  `apps/admin/src/lib/http/secret.ts` (`isAuthorizedSecret`).

## Where this lives

| File                                                             | Role                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/admin/src/service/content/sermons/tiptap-regen-content.ts` | Canonical TipTap → blocks & SHA-256 `contentHash`                    |
| `apps/admin/src/service/content/sermons/pdf-jobs.service.ts`     | `content_pdf_jobs` queue + `deriveSermonPdfUiState`                  |
| `apps/admin/src/service/content/sermons/pdf-worker.service.ts`   | Serverless Chromium render + `createServerMedia` + hash-guarded swap |
| `.claude/scripts/predica/build-predica-pdf.mjs`                  | Local `/predica` PDF renderer                                        |
| `.claude/scripts/predica/build-sermon-payload.mjs`               | Converts `sermon.json` blocks to TipTap v3 JSON                      |
| `.claude/agents/predica-writer.md`                               | Writes `content[]` as the medium, voice-faithful summary             |

See also [`predica-rerun-idempotency.md`](./predica-rerun-idempotency.md) and
[`predica-voice-profiles.md`](./predica-voice-profiles.md).
