# Predica featured-image generator

How the `/predica` pipeline auto-generates a branded **featured image** (a 1200×630 title card) for each sermon and
attaches it to the admin **draft** sermon. This is the sermon's `featuredImageId` — which is also its Open Graph /
social-share card.

> TL;DR: an AI-generated atmospheric **background** (Google Gemini) + a crisp branded **text overlay** (logo + title +
> date + scripture/preacher), rendered to PNG with Playwright. No API key → an on-brand **typographic fallback** card.
> The image is a **draft default** a human reviews/replaces in the Admin Sermon Editor at Gate 2.

## Why this exists

Sermons are agent-generated drafts. Generating a tasteful, on-brand card per sermon gives every prédica a real
hero/social image with zero manual design work, while keeping a human in the loop to replace it with a photograph at
Gate 2.

## The two layers

1. **AI background (optional).** Google Gemini (`gemini-2.5-flash-image`) is called over plain REST with a composed
   non-figurative atmospheric brief. The raw image is cached as `featured.bg.png`.
2. **Branded overlay.** The logo (light variant), eyebrow (`PRÉDICA · <fecha>`), title in Playfair Display (2-line
   clamp, auto size-down), terracotta rule, and `scripture · preacher` meta line are rendered via Playwright
   `page.screenshot` at 1200×630.

If `GEMINI_API_KEY` is absent, the API errors, or `--no-ai` is passed, layer 1 is skipped and the overlay renders on
an **on-brand gradient** (slate → blue). The script always exits 0 with a `featured.png`.

The card uses the **es-AR** title only: `featuredImageId` is a single non-localized media reference shared across both
locales.

## Prompt guardrails (church-appropriate)

Baked into `composeImageBrief()` (and asserted by tests):

- **No text** — words, letters, numbers, or typography of any kind (text comes from the overlay).
- **No depiction** of God, Jesus, the Holy Spirit, angels, saints, or any human faces/figures.
- **No crosses/religious icons** as a focal subject, no kitsch, no logos, no watermarks.
- **Non-figurative / environmental only**; keep the lower-left third calm for the overlaid title.

## Files

| File                                                 | Role                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/predica/featuredCard.ts`         | Pure, Vitest-tested helpers (`composeImageBrief`, `buildFeaturedCardHtml`, `deriveScripture`, `titleFontSize`) |
| `.claude/scripts/predica/build-predica-featured.mjs` | Runtime generator + Gemini REST call + Playwright screenshot + graceful fallback                               |
| `.claude/config.json` → `predica.featured`           | Script path, provider/model, `apiKeyEnv`, dimensions                                                           |

## CLI

```text
node .claude/scripts/predica/build-predica-featured.mjs <sermon.json> [options]

  --out <dir>       Output dir (default: directory of the input JSON)
  --prompt "<txt>"  Override the auto-derived image brief
  --no-ai           Skip the AI background; render the typographic fallback
  --regenerate      Re-roll the AI image, ignoring any cached featured.bg.png
  --provider <name> Image provider (only "gemini" is supported)
  --model <name>    Gemini model (default: gemini-2.5-flash-image)
```

`GEMINI_API_KEY` is read from env or `.env.local` (name only, never printed).

## Pipeline wiring (`ICR-204`)

- **Generated** in `/predica` step 4, right after the PDFs (local render; included in `--dry-run`).
- **Uploaded + linked** by `predica-publisher` (step 5) via `predica-ingest-client.mjs upload-media`
  (`--content-type image/png --width 1200 --height 630 --alt-es "..." --alt-en "..."`) using the direct-to-Blob client
  upload flow (capped at 15 MB, verified server-side via `head()` + PNG magic bytes, deduplicated by SHA-256).
- **Policy:** `config.predica.assetUploadPolicy.uploadedViaIngest` includes `featuredImage`.
- **Gate 0 & Gate 2 safety:** On a re-run, if a human already replaced `featuredImage` in Admin
  (`featuredImage.isHumanReplaced === true`), Gate 0 warns and defaults to `--keep-featured` so the photo is preserved.

## Requirements

Same Chromium dependency as the PDF generator: `@playwright/test` is pinned as a root `devDependency` (`ICR-145`).
Provision the browser from the repo root with `pnpm exec playwright install chromium`.
