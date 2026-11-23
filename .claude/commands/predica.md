---
description: Turn a sermon recording into a review-ready bilingual website post. Runs the local /predica pipeline — transcribe (whisper.cpp) → ★ correct transcript → write a bilingual sermon.json → two branded PDFs → featured image → admin ingest DRAFT ("Para revisar", production by default or staging with --test) → WhatsApp share text → ★ human review. Draft-only and send-only: nothing is ever auto-published or auto-sent. Two human gates.
argument-hint: "[<audio-path>] [--test] [--dry-run] [--overwrite] [--interpreted] [--interpreter \"<Full Name>\"]"
---

# /predica — sermon → bilingual admin draft + PDFs + WhatsApp (local, on-demand)

Orchestrates the `predica-*` subagents and local PDF/featured-image scripts to turn one Sunday
recording into a review-ready, bilingual sermon draft (audio player + downloadable branded PDF per
language + featured image) in the Ministry Admin Panel plus a ready-to-paste WhatsApp message. You
(the main thread) run this step by step; spawn subagents only at the points marked **(subagent: …)**.
The **★ HUMAN GATE ★** steps stay in this conversation — never delegate or auto-skip them.

## Hard rules (all steps)

- **Draft-only.** Nothing is ever published. `predica-publisher` authenticates only with the
  draft-only `service:predica-ingest` service token (zero publish permission, zero DB URI, zero Blob
  key). A human reviews both locales and clicks **Publish** in the admin sermon editor at Gate 2.
- **Send-only-by-human.** The WhatsApp message is composed, never sent.
- **Human gates are mandatory.** Gate 1 (human corrects the transcript), Gate 0 (when the sermon
  already exists in admin), and Gate 2 (human reviews the draft + publishes in admin) all stop and
  wait in this conversation.
- **Target rule (`01-decisions.md`):** a normal run (no `--test`) creates a **draft in production**
  (`https://ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_PROD`); `--test` targets **staging**
  (`https://staging.ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_STAGING`). Real sermons never
  go to staging.
- **Secret hygiene.** Never print `PREDICA_INGEST_TOKEN_*` or any secret — reference variable names
  only. Per-sermon working files live under `tasks/predicas/<sermonDate>_<slug>/` (gitignored); temp
  files use `600` perms.
- **`--dry-run`** stops after the PDFs + featured image (step 4) — **no admin ingest calls, no
  WhatsApp finalize**. It prints every action it would take.
- **`--interpreted`** / **`--interpreter "<Full Name>"`** mark a **live-interpreted** sermon. The
  transcript is then the interpreter's speech, so **step 2.5 (voice coach) is refused** — an
  interpreted transcript is a valid source for **no** voice profile, not the preacher's and not the
  interpreter's (ICR-147).

## 0. Pre-flight

1. Read `.claude/config.json` → pin `config.predica` (audioInbox, artifactsDir, ingest, locales,
   whatsappLocale, siteBaseUrl, scriptureVersion, whisper, audio, pdf, featured, payloadBuilder,
   ingestClient, agents, voices, voiceCoach, gates). Resolve `MAIN_REPO_ROOT`
   (`git rev-parse --show-toplevel`).
2. Parse `$ARGUMENTS`:
   - `$1` (optional, non-flag) = audio path. If omitted, pick the **newest** file in
     `config.predica.audioInbox` (`ls -t` filtered to audio extensions). Quote the path (church
     folders have spaces + accents).
   - `--test` → boolean. When `true`, pass `--test` to `predica-ingest-client.mjs` (staging admin);
     otherwise default to production admin.
   - `--dry-run` → boolean.
   - `--overwrite` → boolean (only passed on explicit human confirmation to overwrite a human-edited
     or stale draft).
   - `--interpreted` → boolean. **Human-declared**: the preacher spoke one language while an
     interpreter rendered it live into another, so `transcript.txt` is the **interpreter's** speech,
     not the preacher's. **Never infer this from the audio.**
   - `--interpreter "<Full Name>"` → string. **Implies `--interpreted`**. If `--interpreted` is
     given without a name, ask the human for the interpreter's name once. The interpreter is **not**
     a preacher: never add them to `additionalPreachers` — they are linked via `interpreterId` only.
   - Resolve `sermonDate`: parse a leading `YYYYMMDD` in the filename → `YYYY-MM-DD`; else use the
     file's mtime date and note the assumption.
   - Resolve `preacher`: parse the filename (e.g. `… - Prédica - Jonathan.m4a` → `Jonathan …`); if
     only a first name, leave it for the writer/publisher to match against an existing author.
   - Resolve `preacherSlug` from `preacher` with the transliterate→lowercase→dash-collapse rule. Set
     `voiceProfilePath = <artifactsDir>/_voices/<preacherSlug>.md` and
     `mkdir -p <artifactsDir>/_voices` (gitignored).
3. **Tooling check** (Bash): `ffmpeg`, `ffprobe`, `config.predica.whisper.bin` + `.model` all exist;
   and Chromium for the PDF (`pnpm exec playwright install chromium` if `build-predica-pdf.mjs`
   later errors with a missing browser). Stop with a precise message if a hard dependency is missing.
4. **Admin ingest pre-flight check** (skip on `--dry-run`). Run:

   ```bash
   node <config.predica.ingestClient> health $( [ "$testMode" = true ] && echo --test )
   ```

   - Confirm exit 0 and print the resolved target (`production` or `staging`).
   - If the target token (`PREDICA_INGEST_TOKEN_PROD` or `PREDICA_INGEST_TOKEN_STAGING`) is missing,
     the client stops with exit 2 and makes zero writes — surface its message and stop.
   - If `trialMode === true`, print the pre-cutover warning prominently: drafts written while admin
     is in trial mode may be overwritten by the final cutover import (real sermons preached during
     the freeze are published after cutover).

5. **Transcript reuse vs. fresh dir.** Compute `audioSha256 = shasum -a 256 "<audioPath>"` (leading
   hex digest). Scan prior runs under `<artifactsDir>/*/` that have `links.json` or `source.*`
   (**skip `_`-prefixed dirs such as `_voices/`**). Compare `audioSha256` to each run's
   `links.json.sourceSha256` (else `shasum -a 256` its `source.*`):
   - **Match + non-empty `transcript.txt`** → set `slugDir` to that dir, `reuseTranscript = true`,
     `audioMp3 = <slugDir>/audio.mp3` (transcode from `source.*` if missing), and resolve
     `durationSeconds` from `sermon.json` (else `ffprobe`). Skip step 1 and Gate 1 — tell the user
     you are reusing their corrected transcript.
   - **No match** → `reuseTranscript = false`. Create `<artifactsDir>/<sermonDate>_<provisional-slug>/`
     and run steps 1–2 normally.

## 1. Transcribe — (subagent: `config.predica.agents.transcriber`) — _skip when `reuseTranscript`_

If `reuseTranscript`, skip. Otherwise dispatch `predica-transcriber` with `audioPath`, `slugDir`,
and `config.predica.{whisper,audio}`. Keep `sourceSha256` for `links.json`.

## 2. ★ HUMAN GATE 1 — correct the transcript ★ — _skip when `reuseTranscript`_

If `reuseTranscript`, skip. Otherwise print the absolute path to `transcript.txt` and ask the user
**explicitly**:

> "Transcript ready at `<…>/transcript.txt` (`<mm:ss>`). Please review and correct it in place —
> names, scripture references, and any theology — then tell me to continue. I'll wait."

**Wait for the user to confirm.** Do not proceed until they do.

## 2.5 Learn the preacher's voice — (subagent: `config.predica.agents.voiceCoach`)

Run the guard first (Bash):

```bash
node .claude/scripts/predica/check-voice-learn.mjs \
  --preacher "<preacher>" \
  $( [ "$interpreted" = true ] && echo --interpreted ) \
  --sermon "<slugDir>/sermon.json"     # only if it already exists
```

- **exit 0** → dispatch `predica-voice-coach` (non-blocking; runs on reuse and `--dry-run`).
- **exit 3** → **SKIP the coach** (interpreted sermon — `tasks/predicas/_voices/` untouched).
- **any other outcome** → **SKIP the coach — FAIL CLOSED**, print the error, continue to step 3.

## 3. Write the bilingual sermon — (subagent: `config.predica.agents.writer`)

Dispatch `predica-writer` with `slugDir`, corrected `transcript.txt`, `sermonDate`, `preacher`,
`interpreted`, `interpreter`, `durationSeconds`, `config.predica.scriptureVersion`, serviceLabel
defaults, and `voiceProfilePath` (only if the file exists). It writes `sermon.json` and returns the
**canonical** `slug`.

Then **validate + reconcile** (Bash):

- `node <config.predica.payloadBuilder> <slugDir>/sermon.json` — must exit 0. On errors, show them
  and re-dispatch the writer (max 2 attempts) before stopping.
- Reconcile the artifacts dir name to **`<sermonDate>_<canonicalSlug>`** (`mv` if needed). The date
  prefix is only for local folder sorting — `sermon.json.slug` stays bare.
- Show a one-glance sanity line: title (es/en), `content[]` block count + approx word count, and
  scripture refs.

## 3.5 ★ HUMAN GATE 0 — already in Admin? (regenerate-in-place) ★

Now that the **canonical slug** exists, look up whether this sermon already exists in the target
admin panel — **before** uploading files or writing anything. Skip entirely on `--dry-run`.

```bash
node <config.predica.ingestClient> lookup \
  $( [ "$testMode" = true ] && echo --test ) \
  --slug "<finalSlug>" \
  --sermon-date "<sermonDate>"
```

1. **No `exactMatch` and no `sameDateMatches`** → set `mode = "create"`, `replaceFeatured = true`,
   `overwrite = false`; proceed to step 4.
2. **`slugDateConflict === true`** (`exactMatch` has the same slug on a **different** `sermonDate`)
   → **stop and ask the human**: confirm whether this is a different sermon (pick a distinct slug in
   `sermon.json`) or an intentional update to that sermon. Never overwrite silently.
3. **`exactMatch` (or `sameDateMatches`) found** → **stop and ask the human** (stays in this
   conversation — never delegated, never auto-skipped):

   > "This sermon already exists in Admin (`<editUrl>`, status **<draft|changed|published>**, revision
   > `<revision>`, last edited by `<updatedByLabel>` at `<updatedAt>`).
   > Regenerating will **update that draft in place** (same id/URL) and attach new audio + PDFs.
   > If it was already published, the live page keeps showing the published copy until you Publish
   > again in Admin.
   > [If `isHumanEdited === true`: **WARNING: a person edited this draft since predica created it.**
   >
   > > Proceeding will overwrite their draft edits (`--overwrite`).]
   > > Proceed? And the **featured image**: regenerate it, or keep the one currently on the entry?"
   - **Proceed** → `mode = "update"`, `docId = <chosen id>`, `expectedRevision = <revision>`.
     Set `overwrite = true` **only** if `isHumanEdited === true` and the human explicitly confirmed
     overwriting their edits (or `--overwrite` was explicitly given).
     Set `replaceFeatured` from the human's answer — if `featuredImage.isHumanReplaced === true`,
     say so explicitly and **default to keeping it** (`replaceFeatured = false`).
   - **Decline** → **stop**; make zero writes. Leave local artifacts in `slugDir`.

## 4. Generate the branded PDFs + featured image

1. **PDFs:** `node <config.predica.pdf.script> <slugDir>/sermon.json` → `predica.es-AR.pdf` +
   `predica.en-US.pdf` in `slugDir`. Confirm both exist with non-zero size.
2. **Featured image:** `node <config.predica.featured.script> <slugDir>/sermon.json` → `featured.png`
   (1200×630) in `slugDir`. Degrades gracefully to an on-brand typographic card if `GEMINI_API_KEY`
   is absent or the AI call fails. Confirm `featured.png` exists with non-zero size.

> **`--dry-run` stops here.** Print the dry-run summary (target environment, transcript,
> `sermon.json`, both PDFs, `featured.png`, slug, and the admin ingest / WhatsApp actions that WOULD
> run) and **end** — zero network writes, no WhatsApp finalize.

## 5. Send the DRAFT to Admin — (subagent: `config.predica.agents.publisher`)

Dispatch `predica-publisher` with `slugDir`, `sermon.json`, `finalSlug`, target flag (`--test` or
production), Gate-0 `mode`, `docId`, `expectedRevision`, `overwrite`, `replaceFeatured`,
`sourceSha256`, `config.predica.ingestClient`, `pdfPaths`, `audioMp3`, and `featuredImage`.

It uploads the files directly to Vercel Blob via `@vercel/blob/client`, calls
`POST /api/predica/sermons` (which resolves authors + Bible verses by natural key, validates TipTap
rich text, computes `contentHash`, writes `draft` only under `service:predica-ingest`, and syncs/queues
`content_pdf_jobs`), and returns `{ ok, mode, updated, docId, finalSlug, revision, status,
needsReview, trialMode, editUrl, mediaIds, bibleVerses, published: false, warnings }`.

If `predica-publisher` reports `{ conflict: true }` (someone edited the draft between Gate 0 and
step 5), stop, show who edited it and when, and re-run only if the human explicitly confirms
overwriting (`--overwrite`).

## 6. Compose the WhatsApp text — (subagent: `config.predica.agents.whatsapp`)

Dispatch `predica-whatsapp` with `slugDir`, `sermon.json`, the publisher's `finalSlug`,
`config.predica.siteBaseUrl`, and `config.predica.whatsappLocale`. It writes `whatsapp.txt` using
the deterministic canonical production URL `${siteBaseUrl}/es-AR/predicas/<finalSlug>` and returns
the message — **never sent**.

## 7. ★ HUMAN GATE 2 — review, publish in Admin, share ★

Print a single summary block and **stop** (no further action):

- **Target:** `production` (`https://ministerio.idcredentor.org`) or `staging (--test)` (`https://staging.ministerio.idcredentor.org`)
- **Transcript:** `<…>/transcript.txt`
- **sermon.json:** `<…>/sermon.json`
- **PDFs:** `<…>/predica.es-AR.pdf`, `<…>/predica.en-US.pdf`
- **Admin draft:** `<editUrl>` — **created as a draft ("Para revisar")** or **updated in place**
  (same id/URL, revision `<N>`). If it was already published, the live page keeps showing the old
  version until you **Publish** again. Audio, both PDFs, and the featured image are attached; any
  superseded files from a re-run appear as **"Sin usar"** in `/content/media`.
- **Featured image:** `<…>/featured.png` — draft default (replace with a real photo in the sermon
  editor if preferred).
- **WhatsApp (es-AR):** `<…>/whatsapp.txt` — canonical URL `<…>` (verify the production domain).

Then tell the user:

> "Done — everything is saved as a **draft ("Para revisar")** in the admin panel. Open `<editUrl>`,
> review both locales, the scripture verses, the audio, both PDFs, and the **featured image**
> (replace it if you'd rather use a photo), and click **Publish**. Then paste the WhatsApp text.
> **No agent publishes or sends.**"

**Never move any Linear issue to Done. Never publish. Never send.**

## Failure handling

If any subagent or script fails, stop at that step, surface the exact error, and leave all artifacts
in `slugDir` untouched so the run can be safely repeated. **Re-running `/predica` on the same audio
is safe and idempotent:** pre-flight reuses the corrected transcript by `sourceSha256`; media
prepare reuses already-uploaded files by SHA-256; Gate 0 detects the existing sermon and updates it
in place with optimistic revision locking; Bible verses reuse existing entries by version-scoped
natural key. Cap auto-retries at **2 attempts** per step, then hand back to the human.
