# `/predica` — command usage & cases

> **Status:** current as of `main`, 2026-07-19 (after ICR-146 + ICR-147). This is the operator-facing
> manual for the `/predica` local sermon pipeline: how to invoke it, every flag it accepts, and the
> distinct real-world sermon shapes it handles (plus one that is planned, not yet built).
>
> For the internal mechanics see the sibling docs: `predica-pdf-mirrors-post.md`,
> `predica-featured-image.md`, `predica-bibleverse-reuse.md`, `predica-rerun-idempotency.md`,
> `predica-voice-profiles.md`, and the full spec `tasks/specs/sermon-pipeline.md`. The command itself is
> defined in `.claude/commands/predica.md`; its five subagents in `.claude/agents/predica-*.md`.

## What it is (in one breath)

`/predica` turns a Sunday recording into a **review-ready bilingual website post** — an audio player + a
downloadable branded PDF summary per language (es-AR / en-US) — a Contentful **DRAFT**, and a ready-to-paste
WhatsApp share message. It is **draft-only and send-only**: no agent ever publishes or sends. Two **human
gates** are mandatory and stay in the conversation:

1. **Gate 1** — you correct the raw transcript in place before anything downstream runs.
2. **Gate 2** — you review the draft in Contentful and Publish (and paste the WhatsApp text) yourself.

Re-running on the same audio is safe and idempotent: it reuses your corrected transcript by SHA-256, and a
pre-publish **Gate 0** detects an existing Contentful entry and updates it in place instead of duplicating
(see `predica-rerun-idempotency.md`).

## Command signature — the complete option surface

```
/predica [<audio-path>] [--dry-run] [--interpreted] [--interpreter "<Full Name>"]
```

These are **all** the flags that exist today (`.claude/commands/predica.md:3`, parsed in step 0.2). There is
**no multi-preacher / multi-audio flag yet** — that is Case 3 below (planned, ICR-165).

| Token                         | Meaning                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<audio-path>`                | Optional. Omit it → picks the **newest** audio file in `config.predica.audioInbox`. Quote it (church folders have spaces + accents).                      |
| `--dry-run`                   | Runs transcribe → write → **PDFs + featured image**, then **stops**. No Contentful writes, no WhatsApp finalize. Prints what it _would_ do.               |
| `--interpreted`               | Marks a **live-interpreted** sermon (the transcript is the interpreter's speech). Human-declared — **never** inferred from audio.                         |
| `--interpreter "<Full Name>"` | Same as `--interpreted` **plus** names the interpreter (implies `--interpreted`). If `--interpreted` is given alone, the pipeline asks for the name once. |

---

## Case 1 — single Spanish sermon (the default; no flags)

```
/predica "/path/to/… - Prédica - Jonathan.m4a"
```

This is the ordinary weekly flow and it produces exactly the desired bilingual behavior **with no flags**:

- **Both PDFs** — `predica.es-AR.pdf` **and** `predica.en-US.pdf` — are always generated (Card C, command
  step 4.1). The PDF mirrors the post body (`predica-pdf-mirrors-post.md`).
- **The English post announces the Spanish audio; the Spanish post does not.** This is automatic. A normal
  sermon leaves the Contentful `audioLanguages` field **absent**, which the reader normalizes to `["es-AR"]`.
  The display rule (`apps/web/src/utils/sermon/audioLanguage.ts`) then announces the audio's language **only
  when it differs from the page being read**:
  - on `/es-AR/predicas/<slug>` → audio is Spanish, page is Spanish → **no notice**;
  - on `/en-US/predicas/<slug>` → audio is Spanish, page is English → renders _"This sermon's audio is in
    Spanish."_
- **Byline** — the single `preacher`, parsed from the filename and matched to a Contentful `author`.

**Key point:** the "audio is in Spanish on the English page" behavior needs no flag and no field — it is the
default. For a bilingual/interpreted recording (Case 2), `/predica` sets `audioLanguages` **automatically** —
derived from the `--interpreted` flag — you never set it by hand (as of ICR-149).

---

## Case 2 — live-interpreted sermon

Use when the preacher spoke one language and an interpreter rendered it **live** into another, so the
recording is bilingual and the transcript is the **interpreter's** words.

```
/predica "<audio>" --interpreter "Doug Wagner"   # naming implies --interpreted
/predica "<audio>" --interpreted                  # will ask you for the interpreter's name once
```

- Interpretation is **human-declared, never detected**: a whisper language sweep of a known interpreted
  sermon reported Spanish at p≈0.999 in 43/43 windows and missed the preacher's English entirely — so there is
  deliberately **no** audio detector. You must pass the flag.
- The interpreter is **not a preacher** — never added to `additionalPreachers`, never in the byline. (They
  ARE linked as an `author` **entry** via the sermon's dedicated `interpreter` field — that is a credit, not a
  byline authorship; see item 6 below.)

**What the flag does today** (1–5 verified on `main`; 6–8 as of ICR-149):

1. Records `interpreted: true` + `interpreter: { name }` in `sermon.json`.
2. **Skips the voice coach** (pipeline step 2.5). An interpreted transcript is a valid source for **no** voice
   profile — not the preacher's, not the interpreter's. This is **code-enforced and fail-closed**
   (`.claude/scripts/predica/check-voice-learn.mjs`): a regenerate that _forgets_ the flag still refuses,
   because the guard also reads `interpreted` from the persisted `sermon.json`. See `predica-voice-profiles.md`.
3. The **writer** treats the transcript's surface phrasing as the interpreter's (not the preacher's voice) and
   applies a **scripture-quotation-only** correction license (`.claude/agents/predica-writer.md` §"Interpreted
   sermons").
4. The **WhatsApp** message gains a credit line: `🗣️ Interpretación al español: <name>`
   (`.claude/agents/predica-whatsapp.md`).
5. The entry builder **validates** the two fields (`interpreted` must be boolean; `interpreted:true` requires a
   named interpreter).
6. The **publisher** links the interpreter to an `author` entry — reusing an existing author by name, or
   creating one from `interpreter.email` when present, else the fixed **`info@idcredentor.org`** (the church
   general address; a placeholder the human corrects at Gate 2). It links the sermon's dedicated
   **`interpreter`** field (an `author` Link), **never** `additionalPreachers`
   (`.claude/agents/predica-publisher.md`).
7. The **entry builder** derives and writes `audioLanguages: ["es-AR", "en-US"]` onto the Contentful draft for
   an interpreted sermon — both `sermonEntry.ts` and its `.mjs` twin, kept in sync by
   `sermonEntry.parity.test.ts`. So ICR-146's on-page **bilingual-audio badge** and **interpreter-credit
   block** now auto-populate from an interpreted `/predica` run — no hand-editing in Contentful.
8. The **writer** no longer emits any "interpreted live" provenance blockquote in the body — that fact lives
   in the `audioLanguages` + `interpreter` fields from items 6–7, not in prose.

---

## Case 3 — multi-preacher post (an assembly of N separate audios) — **PLANNED, not yet built (ICR-165)**

The real shape: **several people each preach a full, separate message** on the same Sunday, recorded as **N
independent audio files**, published together as **one post**. It is **not** one audio with multiple speakers —
it is **"Case 1 × N, combined into a single post"**: a byline of all preachers, a per-segment audio player + a
per-segment PDF (both locales), a deduped union of scripture references, one featured image, one WhatsApp
message.

**Today there is no command for this.** The data model supports it — `sermon.json` carries an optional
top-level **`additionalPreachers`** array (`{ name, email? }[]`); the publisher resolves each to an `author`
(creating missing ones) and the byline renders `[preacher, ...additionalPreachers]`. But the **standard
single-audio `/predica` run never sets it**, and there is **no `--additional` flag**. The only time this has
shipped, it was assembled by a **local, one-off glue script that was never committed** — it lived under the
gitignored artifacts tree (`tasks/predicas/` → `.gitignore:74`) as
`…/2026-06-28_consuelo-venezuela/assemble-multi-sermon.mjs` for the 4-preacher "Consuelo en medio del dolor"
post, interleaving per-segment `embeddedAsset` audio + PDF blocks into one `content[]`. **That script is not in
the repo — no operator should assume they have it**; it survives only as a private reference for the ICR-165
build. The building blocks that _are_ committed are `.claude/scripts/predica/build-predica-segment-pdf.mjs`
(per-segment PDFs) and `build-sermon-entry.mjs`'s `additionalPreachers` + `embeddedAsset` support — ICR-165 is
the orchestration glue that ties them together.

**Planned standardization (recommended design in ICR-165):** a **repeatable additional-audio flag** —

```
/predica "<audio-1>" \
  --additional "<audio-2>" \
  --additional "<audio-3>" \
  --additional "<audio-4>"
```

- first positional audio = **segment 1** → primary `preacher`; each `--additional <audio>` appends a segment
  in flag order, its preacher (from that file's name) → an `additionalPreachers` entry;
- each segment runs the normal per-segment pipeline (transcribe → **Gate 1 correct** → write → both PDFs), so
  **N segments ⇒ N transcript-correction gates**;
- an assembly step (generalizing `assemble-multi-sermon.mjs` into a committed, tested module) stitches the
  fragments into one `sermon.json` — interleaved segment headers + per-segment audio/PDF `embeddedAsset`
  blocks + the deduped union of `scriptureReferences` — then one featured image, one WhatsApp message, one
  combined DRAFT.

**Until ICR-165 is built, there is no committed one-command path to a single combined post.** The reproducible
interim from a clean checkout is to **publish each preacher as their own ordinary Case-1 `/predica` post** (each
gets its own audio player + both PDFs + its own draft) — this yields **N separate posts, not one combined
post**. A genuine single combined post currently requires ICR-165's assembly glue, so if the combined format
matters for a given Sunday, treat **ICR-165 as its prerequisite** rather than following a manual workaround.
Implementation is **deferred by design** — low priority, to be picked up when the next genuine multi-preacher
Sunday arrives (see the ticket for the full proposed approach, alternatives, and acceptance criteria).

---

## Quick-reference matrix

| Scenario                              | Invocation                                         | Byline                                       | Audio-language notice                      | Manual step                                                                                                  |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Spanish sermon** (Case 1)           | `/predica "<audio>"`                               | 1 preacher                                   | EN page: "audio in Spanish"; ES page: none | None — fully automatic                                                                                       |
| **Interpreted** (Case 2)              | `/predica "<audio>" --interpreter "<Name>"`        | 1 preacher (interpreter credited separately) | bilingual (both pages)                     | None — `/predica` sets `interpreter` + `audioLanguages` on the draft automatically (ICR-149)                 |
| **Multi-preacher, N audios** (Case 3) | _planned:_ `/predica "<a1>" --additional "<a2>" …` | `[preacher, …additionalPreachers]`           | same as Spanish                            | **No committed path yet** — interim: publish each preacher as a separate Case-1 post. Tracked in **ICR-165** |
| **Preview only**                      | add `--dry-run` to any of the above                | —                                            | —                                          | Stops after PDFs; no Contentful/WhatsApp                                                                     |

## Related

- Command: `.claude/commands/predica.md` · Agents: `.claude/agents/predica-{transcriber,voice-coach,writer,publisher,whatsapp}.md`
- Spec: `tasks/specs/sermon-pipeline.md`
- Render rule: `apps/web/src/utils/sermon/audioLanguage.ts` · Types: `apps/web/src/types/Sermon.ts`
- Entry builder: `.claude/scripts/predica/build-sermon-entry.mjs` ↔ `apps/web/src/utils/predica/sermonEntry.ts`
- Tickets: [ICR-146](https://linear.app/divinelab/issue/ICR-146) (fields + UI, shipped) ·
  [ICR-147](https://linear.app/divinelab/issue/ICR-147) (flags + voice guard, shipped) ·
  [ICR-149](https://linear.app/divinelab/issue/ICR-149) (write interpreter/audio fields, shipped) ·
  [ICR-165](https://linear.app/divinelab/issue/ICR-165) (multi-audio assembly — Backlog)
