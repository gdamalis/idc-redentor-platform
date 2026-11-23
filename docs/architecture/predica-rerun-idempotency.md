# /predica — re-run idempotency (detect → ask → regenerate in place)

How re-running `/predica` on a sermon that was already processed stays **safe and intentional** instead of piling up
duplicates. This is the sermon-draft + transcript + media layer; the **verse** side (one shared `bible_verses` doc per
passage) is documented in [`predica-bibleverse-reuse.md`](./predica-bibleverse-reuse.md).

## Four layers of idempotency

1. **Transcript reuse — pre-flight, by audio hash.** The orchestrator computes `sha256` of the incoming audio and scans
   `tasks/predicas/*/` (comparing `links.json.sourceSha256`, else hashing each `source.*`). On a match with a non-empty
   `transcript.txt`, it **reuses that corrected transcript and skips transcription + Gate 1**. A different recording
   for the same Sunday will not match and runs fresh. `predica-transcriber` also refuses to overwrite an existing
   `transcript.txt`.
2. **Media deduplication — by SHA-256.** Before uploading any file to Vercel Blob, `predica-ingest-client.mjs` computes
   a streaming SHA-256 and calls `POST /api/predica/media/prepare`. If an identical file is already registered in
   `website*.media`, the server returns `{ status: "duplicate", media }` and the file is reused immediately with zero
   re-upload.
3. **Sermon detection — ★ Gate 0, after the writer.** With the canonical slug known, the orchestrator calls
   `GET /api/predica/sermons/lookup?slug=<slug>&sermonDate=<YYYY-MM-DD>` (read-only). It returns:
   - `exactMatch` (status, `revision`, `updatedByLabel`, `updatedAt`, `isHumanEdited`, `featuredImage.isHumanReplaced`,
     and `editUrl`);
   - `sameDateMatches` (any other sermons on that date or historical `<slug>-N` suffixes);
   - `slugDateConflict` (`true` when the exact slug exists on a **different** `sermonDate`).
4. **Optimistic concurrency & human-edit guard.** On `mode: "update"`, the client sends the `docId` and
   `expectedRevision` read at Gate 0. If the revision moved OR a human edited the draft since predica last wrote it
   (`!isServiceIdentity(updatedBy)`), `POST /api/predica/sermons` refuses with **`409 conflict`** (naming who edited it
   and when) unless the caller passes `overwrite: true` (`--overwrite`) after explicit human confirmation.

## Gate 0 — protecting human edits

Regenerating replaces the draft fields `/predica` owns (leaving `published` and non-owned fields like `relatedSermonIds`
untouched):

- If the sermon was **already published**, the live copy stays online unchanged (`status` becomes `"changed"` /
  **"Cambios sin publicar"**) until a person publishes again in Admin.
- If a human replaced the **featured image** (`featuredImage.isHumanReplaced === true`), Gate 0 notes this explicitly
  and defaults to keeping it (`--keep-featured`).
- On decline, nothing is written and local artifacts in `slugDir` stay intact.

## Superseded media — no client-side deletes

`predica-publisher` **never deletes files or verses**. Every draft save recomputes `_refs.mediaIds` over **both**
`draft` and `published` snapshots inside `ICR-195`'s transaction:

- On an unpublished draft, any file replaced by a re-run immediately drops out of `_refs.mediaIds` and appears under
  the **"Sin usar"** filter in `/content/media` (where an admin can safely delete it if desired).
- On a published sermon, files still referenced by `published` stay protected in `_refs.mediaIds` until a human
  publishes the updated draft.

## The manifest — `tasks/predicas/<sermonDate>_<slug>/links.json`

The per-sermon folder is date-prefixed (`YYYY-MM-DD_slug`) for chronological sorting; the public slug/URL stays bare.
`links.json` records `audioMediaId`, `featuredImageId`, `pdfSummaryMediaId`, `sourceSha256`, and (after ingest)
`sermonDocId`, `revision`, and `editUrl`.

## Touch points

- `.claude/commands/predica.md` — pre-flight transcript reuse; **Gate 0** lookup; threads `mode`/`docId`/`expectedRevision`/`overwrite`/`replaceFeatured`.
- `.claude/agents/predica-publisher.md` — media upload + `predica-ingest-client.mjs ingest` (zero delete path).
- `.claude/scripts/predica/predica-ingest-client.mjs` — `health`, `lookup`, `upload-media`, `ingest` (exit `4` on `409 conflict`).
- `apps/admin/src/service/predica/ingest.service.ts` — `lookupSermonsForGate0`, `ingestSermonDraft`, conflict & slug guards.

## Serverless Chromium file tracing (`ICR-143`, `ICR-200`)

Admin's PDF rebuild worker (`/api/content/pdf-worker`) renders PDFs with `@sparticuz/chromium` + `playwright-core`.
Because `playwright-core` loads `browsers.json` via a runtime-computed `require()`, `apps/admin/next.config.ts` pins
`outputFileTracingRoot` and `outputFileTracingIncludes` for `/api/content/pdf-worker`, verified by
`pnpm --filter @idcr/admin verify:trace`. Do not remove either setting.
