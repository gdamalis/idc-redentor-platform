---
description: Turn a sermon recording into a review-ready bilingual website post. Runs the local /predica pipeline — transcribe (whisper.cpp) → ★ correct transcript → write a bilingual sermon.json → two branded PDFs (Card C) → a Contentful DRAFT in production → a WhatsApp share text → ★ human review. Draft-only and send-only: nothing is ever auto-published or auto-sent. Two human gates.
argument-hint: "[<audio-path>] [--dry-run] [--interpreted] [--interpreter \"<Full Name>\"]"
---

# /predica — sermon → bilingual Contentful draft + PDFs + WhatsApp (local, on-demand)

Orchestrates four `predica-*` subagents and Card C's PDF script to turn one Sunday recording into a
review-ready, bilingual website post (audio player + downloadable branded PDF per language) plus a
ready-to-paste WhatsApp message. You (the main thread) run this step by step; spawn subagents only at the
points marked **(subagent: …)**. The two **★ HUMAN GATE ★** steps stay in this conversation — never delegate
or auto-skip them. See `tasks/specs/sermon-pipeline.md` §7–§9.

## Hard rules (all steps)

- **Draft-only.** Nothing is ever published. The `predica-publisher`'s allowlist omits every `publish_*`,
  and it writes only a **DRAFT** to `production`. A human reviews and Publishes at Gate 2.
- **Send-only-by-human.** The WhatsApp message is composed, never sent.
- **Two gates are mandatory.** Gate 1 (human corrects the transcript) and Gate 2 (human reviews the draft +
  publishes) both stop and wait in this conversation.
- **Never write the `master` alias.** All Contentful writes target the `production` env as a DRAFT (server
  backstop: `PROTECTED_ENVIRONMENTS=master,production`).
- **Secret hygiene.** Never print the CMA token, Mongo URI, or any secret — reference variable names only.
  Per-sermon working files live under `tasks/predicas/<sermonDate>_<slug>/` (gitignored); temp files use `600` perms.
- **`--dry-run`** stops after the PDFs (step 4) — **no Contentful writes, no WhatsApp finalize**. It prints
  every action it would take.
- **`--interpreted`** / **`--interpreter "<Full Name>"`** mark a **live-interpreted** sermon. The transcript
  is then the interpreter's speech, so **step 2.5 (voice coach) is refused** — an interpreted transcript is a
  valid source for **no** voice profile, not the preacher's and not the interpreter's (ICR-147).

## 0. Pre-flight

1. Read `.claude/config.json` → pin `config.predica` (audioInbox, artifactsDir, contentfulSpaceId,
   contentfulEnv, defaultContentfulLocale, locales, whatsappLocale, siteBaseUrl, scriptureVersion, whisper,
   audio, pdf, featured, entryBuilder, agents, voices, voiceCoach, gates). Resolve `MAIN_REPO_ROOT` (`git rev-parse --show-toplevel`).
2. Parse `$ARGUMENTS`:
   - `$1` (optional) = audio path. If omitted, pick the **newest** file in `config.predica.audioInbox`
     (`ls -t` filtered to audio extensions). Quote the path (church folders have spaces + accents).
   - `--dry-run` → boolean.
   - `--interpreted` → boolean. **Human-declared**: the preacher spoke one language while an interpreter
     rendered it live into another, so `transcript.txt` is the **interpreter's** speech, not the preacher's.
     **Never infer this from the audio** — a whisper language-ID sweep of a known interpreted sermon reported
     Spanish at p≈0.999 in 43/43 windows and missed the preacher's English entirely. Do not build a detector.
   - `--interpreter "<Full Name>"` → string. **Implies `--interpreted`** (the implication only ever runs
     toward _more_ guarding, never less). If `--interpreted` is given without a name, the guard still fires —
     ask the human for the interpreter's name once, because `sermon.json` and the WhatsApp credit need it.
     The interpreter is **not** a preacher: never add them to `additionalPreachers` and never put them in the
     byline. They ARE credited via the sermon's dedicated `interpreter` field — an `author` entry the
     publisher resolves or creates (ICR-149) — which drives the on-page interpreter credit.
   - Resolve `sermonDate`: parse a leading `YYYYMMDD` in the filename → `YYYY-MM-DD`; else use the file's
     mtime date and note the assumption.
   - Resolve `preacher`: parse the filename (e.g. `… - Prédica - Jonathan.m4a` → `Jonathan …`); if only a
     first name, leave it for the writer/publisher to match against an existing `author` and note it.
   - Resolve `preacherSlug` from `preacher` with the **same** transliterate→lowercase→dash-collapse rule the
     writer uses for the title slug (`Jonathan Hanegan` → `jonathan-hanegan`). Set
     `voiceProfilePath = <artifactsDir>/_voices/<preacherSlug>.md` and `mkdir -p <artifactsDir>/_voices`
     (gitignored). If `preacher` is first-name-only, note that this slug may differ from a later full-name
     run (the human can rename/merge the profile file — it's low volume).
3. **Tooling check** (Bash): `ffmpeg`, `ffprobe`, `config.predica.whisper.bin` + `.model` all exist; and
   Chromium for the PDF (`pnpm exec playwright install chromium` if `renderPdfs` later errors with a missing
   browser). Stop with a precise message if a hard dependency is missing.
4. **Contentful env check** (skip on `--dry-run`). `mcp__contentful__list_environments(spaceId)` and confirm
   `config.predica.contentfulEnv` (`production`) exists and is accessible.
5. **Transcript reuse vs. fresh dir.** Compute `audioSha256 = shasum -a 256 "<audioPath>"` (leading hex digest).
   Scan prior runs — for each `<artifactsDir>/*/` **that is an actual sermon run** (it has a `links.json`
   or a `source.*`). **Skip `_`-prefixed dirs such as `_voices/` and any dir with no run artifacts** — they
   are not recordings and have nothing to hash (the voice profiles live in `_voices/`). For each remaining
   run dir, compare `audioSha256` to that dir's `links.json.sourceSha256` (else `shasum -a 256` its `source.*`).
   - **Match + a non-empty `transcript.txt`** → this exact recording was already transcribed (and corrected).
     Set `slugDir` to that dir, `reuseTranscript = true`, `audioMp3 = <slugDir>/audio.mp3` (transcode it from
     `source.*` with ffmpeg if missing), and resolve `durationSeconds` from that dir's `sermon.json` (else
     `ffprobe`). You will **skip step 1 (transcribe) and Gate 1** — tell the user you are reusing their
     corrected transcript, only regenerating the downstream content (title, summaries, scripture, PDFs,
     featured image, draft).
   - **No match** (a new recording, or a _different_ file for the same Sunday → treat as fresh) →
     `reuseTranscript = false`. Derive a provisional slug from the filename (transliterate, lowercase,
     dash-collapse) and `mkdir -p <artifactsDir>/<sermonDate>_<provisional-slug>/` (temp dir, date-prefixed
     with the `sermonDate` resolved in step 2; the writer's title-derived slug is canonical — reconcile the
     dir name in step 3). Run steps 1–2 normally.

## 1. Transcribe — (subagent: `config.predica.agents.transcriber`) — _skip when `reuseTranscript`_

If `reuseTranscript` (pre-flight step 5), **skip this step entirely** — the corrected transcript already
exists in `slugDir`. Otherwise dispatch `predica-transcriber` with `audioPath`, `slugDir`, and
`config.predica.{whisper,audio}`. It returns `{ durationSeconds, transcriptTxt, audioMp3, archive,
sourceSha256, … }`. Surface the transcript path and duration; keep `sourceSha256` to record in `links.json`.

## 2. ★ HUMAN GATE 1 — correct the transcript ★ — _skip when `reuseTranscript`_

If `reuseTranscript`, **skip this gate** — the human already corrected this transcript on the prior run (the
recording is byte-identical). Otherwise print the absolute path to `transcript.txt` and ask the user
**explicitly**:

> "Transcript ready at `<…>/transcript.txt` (`<mm:ss>`). Please review and correct it in place — names,
> scripture references, and any theology — then tell me to continue. I'll wait."

**Wait for the user to confirm.** Do not proceed until they do. (Never auto-skip — the transcript is the
source of truth for everything downstream.)

## 2.5 Learn the preacher's voice — (subagent: `config.predica.agents.voiceCoach`)

**FIRST — run the guard (Bash). It decides whether the coach runs at all:**

```bash
node .claude/scripts/predica/check-voice-learn.mjs \
  --preacher "<preacher>" \
  $( [ "$interpreted" = true ] && echo --interpreted ) \
  --sermon "<slugDir>/sermon.json"     # only if it already exists (a regenerate)
```

- **exit 0** → proceed and dispatch the coach exactly as described below (the normal path, unchanged).
- **exit 3** → **SKIP the coach.** Print plainly why, e.g.:
  > Step 2.5 **SKIPPED** — interpreted sermon (`<interpreter>` interpreted for `<preacher>`). An interpreted
  > transcript is a valid source for **no** voice profile — not the preacher's, not the interpreter's.
  > `tasks/predicas/_voices/` is untouched.
- **any other outcome** (script missing, crash, unparseable output) → **SKIP the coach — FAIL CLOSED.**
  Skipping costs a profile append the next run redoes; a wrong append is **append-only and permanent**. Print
  the error and continue to step 3.

The guard reads `interpreted` from **both** the flag **and** the persisted `sermon.json`, so a **regenerate
that forgets `--interpreted` still refuses** — a forgotten flag cannot silently re-open the hole. The guard is
CODE (`apps/web/src/utils/predica/voiceProfile.ts` + its `.mjs` twin), unit-tested and parity-bound, because
`predica-voice-coach` is a pure-prose agent that cannot enforce this itself.

**If the guard allowed it:** dispatch `predica-voice-coach` with the corrected `transcriptTxt`,
`voiceProfilePath`, `preacher`, `preacherSlug`, `sermonDate`, and the provisional slug. As an expert
speech/rhetoric coach it studies how **this** preacher actually communicates — **from the corrected
transcript only**, never the generated
`sermon.json` (that would create a model-style feedback loop) — and maintains the local, human-curatable
per-preacher voice profile at `voiceProfilePath`: **Zone A** (human-curated canonical guide, seeded once
then never auto-overwritten) + **Zone B** (append-only dated log). The writer reads it at step 3 so the post
articulates the preacher's accumulated voice. It returns `{ ok, voiceProfilePath, action:
"created"|"appended"|"unchanged", sermonsAnalyzed, warnings }`.

- **Runs on reuse too** (`reuseTranscript`): the coach self-skips via its `sermonDate` idempotency check, so
  re-running on the same recording never double-appends.
- **Runs on `--dry-run`** — it's local-only and only improves the writing (no Contentful, no send).
- **NON-BLOCKING — never let it block publishing.** If the coach returns `{ ok:false }` or errors, print a
  one-line warning and **continue** to step 3. Pass `voiceProfilePath` to the writer only if the file now
  exists; otherwise pass it as absent and the writer infers voice from the transcript alone, as before.
- Surface a one-line note (path · `action` · `sermonsAnalyzed`) so the human knows the profile grew and can
  curate Zone A / promote the coach's suggestions whenever they like.

## 3. Write the bilingual sermon — (subagent: `config.predica.agents.writer`)

Dispatch `predica-writer` with `slugDir`, the corrected `transcript.txt`, `sermonDate`, `preacher`,
`interpreted`, `interpreter`, `durationSeconds`, `config.predica.scriptureVersion`, the serviceLabel
defaults, and `voiceProfilePath` (the per-preacher voice profile from step 2.5 — **pass it only if the file
exists**; absent → the writer infers voice from the transcript alone, as before). It writes `sermon.json`
and returns the **canonical** `slug`.

- **Interpreted sermons.** Pass `interpreted` + `interpreter.name`. The writer must record both in
  `sermon.json`, must **not** treat the transcript's surface phrasing as the **preacher's** voice (it is the
  interpreter's), and applies the scripture-quotation-only correction license (see `predica-writer.md`). A
  pre-existing `voiceProfilePath` may still be **read** if it exists — a profile learned from the preacher's
  **own** (non-interpreted) sermons is their authentic voice. The guard blocks **writes**, not reads.

Then **validate + reconcile** (Bash):

- `node <config.predica.entryBuilder> <slugDir>/sermon.json` — must exit 0 (schema valid). On errors, show
  them and re-dispatch the writer to fix (max 2 attempts) before stopping.
- Reconcile the artifacts dir name to **`<sermonDate>_<canonicalSlug>`** (date-prefixed so
  `tasks/predicas/` self-sorts chronologically by name). If `basename(slugDir)` differs from that, `mv` the
  dir to it and update `slugDir`; re-run the PDF/publisher against the canonical paths. The date prefix is
  **only** for local folder organization — `sermon.json.slug` stays the **bare** canonical slug (no date),
  and that bare slug alone drives the Contentful `fields.slug` and the public URL `/es-AR/predicas/<slug>`.
- Show the user a one-glance sanity line: title (es/en), `content[]` block count + approx word count (the
  body is a ~800–1200 word summary that the PDF mirrors), and scripture refs.

## 3.5 ★ HUMAN GATE 0 — already in Contentful? (regenerate-in-place) ★

Now that the **canonical slug** exists, check whether this sermon was already published as a draft/entry —
**before** any Contentful write. Skip entirely on `--dry-run`. Reads only (`environmentId: "production"`):

1. **Look it up.** `mcp__contentful__search_entries({ content_type:"sermon", "fields.slug": finalSlug, limit:5, environmentId:"production" })`. Also catch **slug drift + earlier buggy `-N` duplicates**: search by
   `fields.sermonDate == sermonDate` and list any sermon whose slug is `finalSlug` or matches `^finalSlug-\d+$`.
2. **None found** → set `mode = "create"`, `replaceFeatured = true`; proceed to step 4. (The normal first-run path.)
3. **Found** → `get_entry` each hit to read its status (published iff `sys.publishedVersion` is set) and its
   `featuredImage` asset; build the editUrl(s). Then **stop and ask the human** (this gate stays in the
   conversation — never delegated, never auto-skipped):

   > "This sermon already exists in Contentful (`<editUrl>`, status **<draft|PUBLISHED>**[, plus N duplicates]).
   > Regenerating will **update that entry in place** (same id/URL) and replace its audio + both PDFs. Any edits
   > you made at Gate 2 — corrected text, a replaced featured photo, the publish — **will be overwritten**
   > (if it was published, you'll need to **Publish again** to push the new content live). Proceed?
   > And the **featured image**: regenerate it, or keep the one currently on the entry?"
   - **Proceed** → `mode = "update"`, `entryId = <the chosen entry>`. Set `replaceFeatured` from the answer
     (default regenerate; `false` keeps the entry's current image). If the human flags duplicates for cleanup,
     collect those `-N` entry ids to delete after the update succeeds (via `config.predica.entryDeleter`).
   - **Decline** → **stop**; make no Contentful writes. Leave all local artifacts in `slugDir`.
   - **Featured-image safety:** if the entry's current `featuredImage` is human-replaced (asset filename ≠
     `featured.png`, or the asset is published), state that explicitly in the prompt and **default to keeping
     it** (`replaceFeatured = false`) unless the human says regenerate.

## 4. Generate the branded PDFs + featured image — (Card C + featured-image scripts)

1. **PDFs.** Bash: `node <config.predica.pdf.script> <slugDir>/sermon.json` → `predica.es-AR.pdf` +
   `predica.en-US.pdf` in `slugDir`. If it fails for a missing browser, run
   `pnpm exec playwright install chromium` once and retry. Confirm both PDFs exist with non-zero size.
2. **Featured image.** Bash: `node <config.predica.featured.script> <slugDir>/sermon.json` → `featured.png`
   (1200×630) in `slugDir`. This generates an AI background (Google Gemini) themed to the sermon, with the
   branded title/date overlaid. **It degrades gracefully:** with no `GEMINI_API_KEY` (or on any API failure)
   it renders an on-brand typographic card instead — the script still exits 0 and writes `featured.png`.
   Confirm `featured.png` exists with non-zero size. (The image is a **draft default**; the human approves or
   replaces it at Gate 2.)

> **`--dry-run` stops here.** Print the dry-run summary (transcript, sermon.json, both PDFs, `featured.png`,
> the slug, and the Contentful/WhatsApp actions that WOULD run) and **end** — no Contentful writes, no
> WhatsApp finalize.

## 5. Publish the DRAFT — (subagent: `config.predica.agents.publisher`)

Dispatch `predica-publisher` with `slugDir`, `sermon.json`, the canonical `finalSlug`, the Gate-0
`mode` (`"create"` | `"update"`) and (on update) `entryId` + `replaceFeatured`, the `sourceSha256`,
`config.predica.{contentfulSpaceId,contentfulEnv,entryBuilder,assetUploader,entryCreator,entryDeleter}`, the
two `pdfPaths`, the `audioMp3` path, and the `featured.png` path. It uploads the audio + both PDFs (+ the
featured image unless the human kept theirs), **upserts** both-locale `bibleVerse` refs by their derived
version-scoped key (reused site-wide — same passage → one shared entry), links the preacher, and **creates**
the bilingual **DRAFT** `sermon` entry or **updates
the existing one in place** — returning `{ mode, updated, entryId, editUrl, finalSlug, assetIds, bibleVerseIds,
cleanedUp, published:false }`. On update it also deletes the superseded old assets and any orphaned legacy
verses (never a shared verse). There is **no slug bumping** — Gate 0 already resolved create-vs-update, so the
`finalSlug` is fixed. If Gate 0 flagged `-N` duplicates for cleanup, delete those entries now via
`node <config.predica.entryDeleter> --space <s> --env <e> --entry-id <…>` after confirming the update succeeded.

## 6. Compose the WhatsApp text — (subagent: `config.predica.agents.whatsapp`)

Dispatch `predica-whatsapp` with `slugDir`, `sermon.json`, the publisher's `finalSlug`,
`config.predica.siteBaseUrl`, and `config.predica.whatsappLocale`. It writes `whatsapp.txt` using the
deterministic canonical URL `${siteBaseUrl}/es-AR/predicas/<finalSlug>` and returns the message — **never sent**.

## 7. ★ HUMAN GATE 2 — review, promote, publish, share ★

Print a single summary block and **stop** (no further action):

- **Transcript:** `<…>/transcript.txt`
- **sermon.json:** `<…>/sermon.json`
- **PDFs:** `<…>/predica.es-AR.pdf`, `<…>/predica.en-US.pdf`
- **Contentful (production):** `<editUrl>` — **created as a draft** (first run) **or updated in place**
  (regenerate: same id/URL). If it was **already published**, the live page keeps showing the OLD content
  until you **Publish again**. (Audio + both PDFs + the featured image are attached.) If a regenerate cleaned
  up duplicates or legacy verses, that is listed below.
- **Featured image:** `<…>/featured.png` — generated as a **draft default** (review it; replace in Contentful
  with a real photo if you prefer)
- **WhatsApp (es-AR):** `<…>/whatsapp.txt` — canonical URL `<…>` (verify the production domain)

Then tell the user, verbatim intent:

> "Done — everything is a **draft**. To go live: in Contentful (production) review both locales and the
> **featured image** (replace it if you'd rather use a photo), and **Publish** (the publish webhook
> revalidates the site). Then paste the WhatsApp text. **No agent publishes or sends.**"

**Never transition any Jira issue to Done. Never publish. Never send.**

## Failure handling

If any subagent or script fails, stop at that step, surface the exact error (failing command + stderr / the
agent's `{ ok:false, error }`), and leave all artifacts in `slugDir` for inspection. **Re-running `/predica`
on the same audio is safe and idempotent:** pre-flight matches the recording's `sourceSha256` and reuses the
corrected transcript (skipping transcription + Gate 1); **Gate 0** detects the existing Contentful sermon by
slug and, on your approval, **updates it in place** (same id) rather than creating a `-2` duplicate, replacing
its assets and cleaning up orphaned legacy verses. Cap any auto-retry at **2 attempts** per step, then hand
back to the human.
