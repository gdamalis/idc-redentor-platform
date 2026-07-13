# Predica: the PDF mirrors the post (single-source content model)

**TL;DR.** A sermon has **one body** — the localized rich-text `content[]`. The website post and the
downloadable branded PDF are **two views of that same body**. There is no separately-authored PDF summary
anymore. This is what lets a preacher edit the post in Contentful and have the PDF reflect it — automatically,
via the webhook + cron regeneration described in **Part B** below (design spec:
[`tasks/specs/predica-pdf-regen-webhook.md`](../tasks/specs/predica-pdf-regen-webhook.md)).

## Why this changed

Originally the `/predica` writer produced two things from the transcript:

- a **short summary** (`lead`, `thesis`, `mainPoints`, `keyQuotes`, `scriptureHeadline`, `scriptureRefs`,
  `closing`) that the PDF was built from, and
- the **full restructured transcript** as `content[]`, which became the website post.

Two problems followed:

1. The post was **long** (the whole transcript) while the PDF was a separate **short** summary — two
   different texts to keep coherent.
2. `lead`/`keyQuotes`/`scriptureHeadline`/`scriptureRefs`/`closing` were **PDF-only and lived only in the
   local `sermon.json`** — they never reached Contentful. So a preacher editing the post in Contentful (which
   edits `content[]`) could not change the PDF: the PDF read fields that weren't even on the entry.

## The model now

- **`content[]` is the one body.** The writer produces it as a **medium (~800–1200 word) summary in the
  preacher's voice** — a real article, far shorter than the transcript. It opens with a lead paragraph,
  develops 3–5 movements (`h2`/`h3` + `p`), weaves scripture in as `blockquote`s, includes 1–2 verbatim
  pull-quotes, and closes — all inside `content[]`.
- **The PDF renders that same body.** `buildPdfHtml` (canonical: `apps/web/src/utils/predica/helpers.ts`;
  runtime twin: `.claude/scripts/predica/build-predica-pdf.mjs`) renders, in the same order as the website
  page ([`SermonDetails.tsx`](../apps/web/src/components/features/sermon-details/SermonDetails.tsx)):

  ```
  Cover (logo · date · service · title · byline)
  → content[] body  (h2/h3/p/blockquote/ul/ol; embeddedAsset blocks are skipped — print can't play them)
  → Scripture references  (from structured scriptureReferences, per-locale, fixed "NVI"/"NIV" label)
  → Footer signature
  ```

- **`thesis` / `mainPoints` / `excerpt` / SEO are metadata**, not the PDF body. They power the cards, the SEO
  description, and related sermons. They still live on the Contentful entry; the PDF just doesn't use them.
- **Scripture label.** Like the website's `ScriptureReferences`, the PDF shows the **fixed localized version
  label** ("NVI" for es-AR, "NIV" for en-US), not each verse's stored `bibleVersion` code.

## Multi-preacher services

A multi-preacher post (one service, several short messages) keeps its own shape: per-part **segment PDFs**
(`.claude/scripts/predica/build-predica-segment-pdf.mjs`) mirror each part's section, and the post body
interleaves per-segment audio/PDF players via `embeddedAsset` blocks. `buildPdfHtml` skips `embeddedAsset`
blocks, so it stays focused on the readable body. (Whether webhook regeneration covers multi-preacher posts
is an open item in the Part B spec.)

## Part B — automatic regeneration on draft edit (ICR-114)

Editing a sermon's `content[]` in Contentful now regenerates the branded PDF **without a human re-running
`/predica`**:

```
Contentful draft save / auto_save
   │  webhook → POST /api/predica/regenerate-pdf   (header x-predica-regen-key)
   ▼
mark the sermon's job dirty in MongoDB `website.pdf_jobs`  — 202 Accepted, no render here
   │
   ▼  Vercel Cron (~every minute), GET /api/predica/regenerate-pdf/cron, header
   │  Authorization: Bearer <CRON_SECRET>
select jobs idle longer than the quiet window (default 90s; env `PDF_REGEN_QUIET_WINDOW_SECONDS`)
AND whose content actually changed since the last render
   │  claim (lock) → fetch the DRAFT sermon (both locales) → buildPdfHtml → Chromium → PDF
   ▼
swap `pdfSummary[locale]` on the SAME draft entry in place, delete the superseded asset, release the lock
```

- **Debounce, not per-keystroke render.** The webhook only ever bumps `dirtyAt`/`contentHash` on the job
  doc — the cron is the only thing that renders. A burst of auto_save webhooks collapses into one render
  once the quiet window has elapsed since the last edit.
- **Draft-only, never publish, never `master`.** Every write (asset upload, `pdfSummary` swap, superseded-asset
  delete) touches DRAFT content on the same entry and stops there — a human still Publishes to go live (Gate 2
  of `/predica` is unchanged). The write-back also **hard-refuses `master`/`master-*`**, defaulting instead to
  the concrete `production` environment — see the read-vs-write environment-default note in
  `docs/architecture/contentful-data-layer.md`.
- **Fail-closed auth (ICR-136).** Both the `x-predica-regen-key` webhook header and the cron's
  `Authorization: Bearer <CRON_SECRET>` are checked via `isAuthorizedSecret()`
  (`apps/web/src/utils/auth/secret.ts`), which refuses (401) when the expected env var is unset or
  empty and otherwise compares in constant time (`crypto.timingSafeEqual`). Before this, the cron
  interpolated `process.env.CRON_SECRET` into a template literal, so an unset var made the expected
  value the literal string `Bearer undefined` — any caller sending that header authenticated. The
  same helper also guards `/api/revalidate` and `/api/draft/enable`; a new secret-guarded route
  should reuse it, not a raw `!==`.
- **Version-stamped.** Each successful render bumps a monotonic `version`, which lands both in the PDF footer
  (a small `· v<N>` appended to the existing signature) and the new asset's title
  (`"<sermon title> — PDF <locale> · v<N>"`) — so a preacher can tell a fresh PDF landed.
- **Still reuses `buildPdfHtml`.** The render (`apps/web/src/service/predica/renderSermonPdf.ts`) calls the
  same `buildPdfHtml` this doc describes above, so the post and the regenerated PDF still can't drift. The
  only differences from the local `/predica` pipeline are render-environment constraints, not content ones:
  a self-contained HTML variant (inlined `@font-face` fonts + the logo as a `data:` URI, replacing the
  Google-Fonts `<link>`) and a serverless-friendly Chromium launch (`@sparticuz/chromium` + `playwright-core`
  on Vercel; `@playwright/test` locally) — because the cron function has no guaranteed outbound network
  access at render time.
- **Quiet window is env-tunable.** `PDF_REGEN_QUIET_WINDOW_SECONDS` (optional; defaults to 90 seconds in
  code) lets the debounce window be adjusted without touching the render logic.

See `tasks/specs/predica-pdf-regen-webhook.md` for the full design spec (now implemented) and
`docs/architecture/likes-and-mongodb.md` for the `pdf_jobs` collection shape.

## Where this lives (keep in sync)

| File                                               | Role                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/utils/predica/helpers.ts`            | Canonical `buildPdfHtml` — renders `content[]` + scripture refs. Vitest-tested.                              |
| `.claude/scripts/predica/build-predica-pdf.mjs`    | Runtime twin (no build step). Must mirror `helpers.ts`.                                                      |
| `apps/web/src/utils/predica/sermonEntry.ts`        | `SermonLocaleContent` (no PDF-only fields) + the entry-field builders.                                       |
| `.claude/agents/predica-writer.md`                 | Writes `content[]` as the medium, voice-faithful summary.                                                    |
| `apps/web/src/components/features/sermon-details/` | The website views the PDF mirrors (`SermonDetails`, `SermonContent`, `ScriptureReferences`, `SermonByline`). |

See also [`docs/predica-rerun-idempotency.md`](./predica-rerun-idempotency.md) (regenerate-in-place) and
[`docs/predica-voice-profiles.md`](./predica-voice-profiles.md) (how the body sounds like the preacher).
