# `/predica` — command usage & cases

> **Status:** current after `ICR-204` (admin ingest endpoint). This is the operator-facing manual for the
> `/predica` local sermon pipeline: how to invoke it, every flag it accepts, target environments, token setup,
> and the sermon shapes it handles.
>
> Sibling docs: `predica-pdf-mirrors-post.md`, `predica-featured-image.md`, `predica-bibleverse-reuse.md`,
> `predica-rerun-idempotency.md`, `predica-voice-profiles.md`. Command definition: `.claude/commands/predica.md`;
> subagents: `.claude/agents/predica-*.md`.

## What it is (in one breath)

`/predica` turns a Sunday recording into a **review-ready bilingual sermon draft** in the Ministry Admin Panel —
text in both locales (`es-AR` + `en-US`), audio player, two downloadable branded PDFs, and a generated featured
image — marked with the **"Para revisar"** chip, plus a ready-to-paste WhatsApp share message.

It is **draft-only and send-only**: the local machine holds **no database URI and no Blob storage key**, only a
narrow service token (`PREDICA_INGEST_TOKEN_*`) with zero publish permissions. Two **human gates** are mandatory:

1. **Gate 1** — you correct the raw transcript in place before anything downstream runs.
2. **Gate 2** — you open the draft in the Admin Sermon Editor, review both locales + media, click **Publish**, and
   paste the WhatsApp text yourself.

Re-running on the same audio is safe and idempotent: it reuses your corrected transcript by SHA-256, reuses
identical media files by SHA-256, and **Gate 0** (`GET /api/predica/sermons/lookup`) updates the existing draft in
place with optimistic revision locking (see `predica-rerun-idempotency.md`).

## Command signature — complete option surface

```text
/predica [<audio-path>] [--test] [--dry-run] [--overwrite] [--interpreted] [--interpreter "<Full Name>"]
```

| Token                         | Meaning                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<audio-path>`                | Optional. Omit it → picks the **newest** audio file in `config.predica.audioInbox`. Quote paths with spaces/accents.                                                                                                                     |
| `--test`                      | Targets **staging** admin (`https://staging.ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_STAGING`). Omit for **production** (`https://ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_PROD`). Real sermons never go to staging. |
| `--dry-run`                   | Runs transcribe → write → **PDFs + featured image**, then **stops**. Zero admin ingest calls, zero WhatsApp finalize.                                                                                                                    |
| `--overwrite`                 | Explicitly confirms overwriting a draft edited by a person (or with a stale revision) after Gate 0 / `409 conflict`. Never set automatically.                                                                                            |
| `--interpreted`               | Marks a **live-interpreted** sermon (transcript is the interpreter's speech). Human-declared — never inferred from audio.                                                                                                                |
| `--interpreter "<Full Name>"` | Same as `--interpreted` **plus** names the interpreter (implies `--interpreted`).                                                                                                                                                        |

## Targets, credentials & rotation

- **Production (default, no `--test`):** `https://ministerio.idcredentor.org` · reads `PREDICA_INGEST_TOKEN_PROD`
  from env or `.env.local` (or `--token-file <0600-file>`). If absent, the CLI stops with exit `2` and sends zero
  requests. At cutover (`ICR-206`), `PREDICA_INGEST_TOKEN_PROD` is placed in `0600` local env files on both
  operator workstations (`xantium` and `steelhaven`).
- **Staging (`--test`):** `https://staging.ministerio.idcredentor.org` · reads `PREDICA_INGEST_TOKEN_STAGING` from
  env or `.env.local` (or `--token-file <0600-file>`).
- **Cross-environment isolation:** Production and staging hold distinct 32-byte random `PREDICA_INGEST_TOKEN`
  secrets on `idc-redentor-admin`, and the CLI sends `X-Predica-Target` checked against `VERCEL_TARGET_ENV`. Sending
  a staging token to production (or vice versa) is rejected (`401`/`403`).
- **Rotation interval:** Rotate `PREDICA_INGEST_TOKEN` every **90–180 days** (or immediately if a workstation is
  lost/compromised): update `PREDICA_INGEST_TOKEN` in Vercel `idc-redentor-admin` for the target environment and
  update the `0600` local env file — zero code deploy required.

---

## Case 1 — single Spanish sermon (default; no flags)

```text
/predica "/path/to/… - Prédica - Jonathan.m4a"
```

- **Both PDFs** (`predica.es-AR.pdf` and `predica.en-US.pdf`) are rendered locally and uploaded directly to Vercel
  Blob alongside `audio.mp3` (8 MB multipart streaming) and `featured.png`.
- **`audioLanguages`** defaults to `["es-AR"]` so the English page shows the Spanish-audio notice automatically and
  the Spanish page shows none.
- **Byline:** `preacher` is matched case-insensitively against `website*.authors` (reused if found, created as a
  draft author if new).

## Case 2 — live-interpreted sermon

```text
/predica "<audio>" --interpreter "Doug Wagner"   # naming implies --interpreted
/predica "<audio>" --interpreted                  # prompts once for the interpreter's name
```

1. Records `interpreted: true` + `interpreter: { name }` in `sermon.json`.
2. **Skips the voice coach** (code-enforced fail-closed by `.claude/scripts/predica/check-voice-learn.mjs`).
3. The **writer** applies the scripture-quotation-only correction license and omits prose provenance blockquotes.
4. The **WhatsApp** message includes `🗣️ Interpretación al español: <name>`.
5. The **payload builder** emits `audioLanguages: ["es-AR", "en-US"]` and `interpreter` (never `additionalPreachers`).
6. The **admin ingest endpoint** resolves or creates the interpreter's author document and links `interpreterId`.

## Case 3 — multi-preacher post (N separate audios) — **PLANNED (`ICR-165`)**

The data model (`additionalPreachers`, TipTap `embeddedMedia` nodes, `build-predica-segment-pdf.mjs`) supports
multi-preacher posts, but there is no committed `--additional` flag yet. Tracked in `ICR-165`.

---

## Quick-reference matrix

| Scenario                   | Invocation                                  | Target                              | Manual step                                                |
| -------------------------- | ------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| **Sunday sermon** (Case 1) | `/predica "<audio>"`                        | Production draft (`"Para revisar"`) | Gate 1 transcript → Gate 2 publish in Admin                |
| **Test / QA run**          | `/predica "<audio>" --test`                 | Staging draft (`"Para revisar"`)    | Gate 1 transcript → review in staging Admin                |
| **Interpreted** (Case 2)   | `/predica "<audio>" --interpreter "<Name>"` | Production draft                    | Same as Case 1 (`audioLanguages` + `interpreter` auto-set) |
| **Local dry run**          | add `--dry-run` to any of the above         | None (local only)                   | Stops after PDFs + featured image; zero network writes     |

## Related

- Command: `.claude/commands/predica.md` · Agents: `.claude/agents/predica-{transcriber,voice-coach,writer,publisher,whatsapp}.md`
- Builder & CLI: `.claude/scripts/predica/build-sermon-payload.mjs` · `.claude/scripts/predica/predica-ingest-client.mjs`
- Admin endpoints: `apps/admin/src/app/api/predica/{health,sermons,sermons/lookup,media/prepare,media/upload,media/confirm}/route.ts`
- Smoke check: `pnpm predica:smoke` (`.claude/scripts/predica/__smoke__.mjs`)
