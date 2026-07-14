# ICR-154 — Correct the Product Brain: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `docs/product/` (plus the two startup docs that echo it) back into agreement with the
product as it actually exists today, so the `product-manager` agent's hard scope filter stops
rejecting work the team has already accepted.

**Architecture:** Docs-only. No runtime, type, test, env, or Contentful-model surface. The change is
driven **test-first by grep**: a throwaway assertion script encodes every acceptance criterion as a
_banned string must be absent_ / _required string must be present_ check. It is run **before any
edit** and must **FAIL** — that failing output is the reproduction of the documentation defect.

**Tech Stack:** Markdown. Bash + `grep -F` for the assertion gate. `prettier` for format checking.

---

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section.

1. **Commit type is `docs`.** Ground truth from `.releaserc.json` `releaseRules`:
   `feat`→minor · `fix`/`perf`/**`docs`**→**patch** · `chore`→**false**. A **`docs(ICR-154):` PR title
   WILL cut a patch release** on squash-merge. That is correct and intended. **Never** pick a commit
   type to dodge a version bump — pick the one that is true.
2. **Every commit message:** `docs(ICR-154): <subject>`, header ≤ 100 chars.
3. **Never `--no-verify`.** The husky `lint-staged` hook runs prettier on staged files; let it.
4. **Repo-wide `pnpm format:check` already fails on ~163 pre-existing files.** That is **not yours**.
   The gate is `pnpm exec prettier --check <the touched files>` only. Do **not** reformat unrelated
   files. To prove the delta is zero, use a **read-only** comparison (`git show origin/main:<path>`).
   **NEVER** `git checkout origin/main -- .` — it stages stray files when `main` advances mid-run.
5. **Positive assertions are presence (≥ 1), never exact counts.** A corrected phrase legitimately
   lands in more than one place. Only **banned-string** checks are exact-zero.
6. **The assertion script lives OUTSIDE the repo** (`$CLAUDE_JOB_DIR/tmp/`), so it can never be
   staged and cannot collide with a concurrent job's `/tmp`.
7. **Do not touch `.claude/config.json`.** Its stale `/api/contact` mapping is deliberately deferred
   to triage (spec R14).
8. **Do not add tests.** There is no runtime surface; a Vitest test here could not meaningfully fail.

---

## File Structure

| File                                          | Task | Responsibility of the change                        |
| --------------------------------------------- | ---- | --------------------------------------------------- |
| `$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh`       | 1    | The gate. Throwaway, uncommitted, outside the repo. |
| `docs/product/scope-and-boundaries.md`        | 1    | The scope filter itself — the highest-harm file.    |
| `docs/product/content-types.md`               | 2    | The content-type catalog: add Sermon + BibleVerse.  |
| `docs/product/overview.md`                    | 3    | Surfaces table + newsletter provider.               |
| `docs/product/README.md`                      | 3    | `apps/admin` tense + what "Last reviewed" means.    |
| `docs/product/ai-era-strategy.md`             | 3    | Structured-data inventory.                          |
| `docs/product/editorial-and-content-rules.md` | 3    | **Date only.** No content edit.                     |
| `CLAUDE.md`                                   | 4    | One sentence (line 7).                              |
| `AGENTS.md`                                   | 4    | One sentence (line 17).                             |

**All paths are relative to the worktree root:**
`/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154`

---

## Task 1: The assertion gate (RED) + the scope filter

**Files:**

- Create: `$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh` (uncommitted, outside the repo)
- Modify: `docs/product/scope-and-boundaries.md` (lines 6, 36, 38, 49, 52, 66, 74)

**Interfaces:**

- Produces: `icr-154-assert.sh <worktree-root>` — exit 0 = all checks pass, exit 1 = one or more
  failed, exit 2 = BLOCKED (a file was missing/empty, so every absence check would be a false pass).
  Tasks 2–4 re-run this exact script and drive its remaining failures to zero.

- [ ] **Step 1: Write the assertion script**

Create `$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh` with **exactly** this content:

```bash
#!/usr/bin/env bash
# ICR-154 — acceptance gate. Encodes every AC as a grep assertion.
# NOT -e: we want every check to run so the RED output shows the FULL defect, not just the first.
set -uo pipefail

ROOT="${1:?usage: icr-154-assert.sh <worktree-root>}"
FAILS=0
CHECKS=0

# --- Vacuity guard -----------------------------------------------------------------
# A negative assertion over a missing/empty file is a FALSE PASS (ICR-144 lesson:
# "a check that PASSES when the input is absent is worse than no check").
# Prove we can read every file BEFORE asserting anything about their contents.
FILES=(
  "docs/product/scope-and-boundaries.md"
  "docs/product/content-types.md"
  "docs/product/overview.md"
  "docs/product/README.md"
  "docs/product/ai-era-strategy.md"
  "docs/product/editorial-and-content-rules.md"
  "CLAUDE.md"
  "AGENTS.md"
)
for f in "${FILES[@]}"; do
  if [ ! -s "$ROOT/$f" ]; then
    echo "BLOCKED: '$f' is missing or empty — every assertion below would be a false pass."
    exit 2
  fi
done
echo "vacuity guard: all ${#FILES[@]} files present and non-empty ✓"
echo

banned() {   # banned <file> <fixed-string> <label>   — exact-zero
  local f="$1" s="$2" label="$3"; CHECKS=$((CHECKS + 1))
  if grep -Fq -- "$s" "$ROOT/$f"; then
    echo "FAIL [banned]   $f :: $label"
    echo "               still present: $s"
    FAILS=$((FAILS + 1))
  else
    echo "ok   [banned]   $f :: $label"
  fi
}

required() { # required <file> <fixed-string> <label>  — presence >= 1, NEVER an exact count
  local f="$1" s="$2" label="$3"; CHECKS=$((CHECKS + 1))
  if grep -Fq -- "$s" "$ROOT/$f"; then
    echo "ok   [required] $f :: $label"
  else
    echo "FAIL [required] $f :: $label"
    echo "               missing: $s"
    FAILS=$((FAILS + 1))
  fi
}

echo "--- D4: Mailchimp must not name the newsletter provider anywhere in docs/product/"
# NOTE: glob against "$ROOT", never a bare relative path — a bare `docs/product/*.md` would resolve
# against the CURRENT directory and could silently assert about the WRONG checkout.
for abs in "$ROOT"/docs/product/*.md; do
  banned "docs/product/$(basename "$abs")" 'Mailchimp' 'no Mailchimp in the product brain'
done
required "docs/product/scope-and-boundaries.md" 'Resend'   'D4 names Resend'
required "docs/product/overview.md"             'Resend'   'D4 names Resend'

echo
echo "--- D1/D2/D7: the sermon archive is IN scope, not OUT and not DEFERRED"
banned   "docs/product/scope-and-boundaries.md" 'sermon archive app'          'D1 OUT bullet gone'
banned   "docs/product/scope-and-boundaries.md" 'Sermon / teaching archive'   'D2 DEFERRED line gone'
banned   "docs/product/scope-and-boundaries.md" 'Embed YouTube/Vimeo on a page' 'D7 reframe cell gone'
required "docs/product/scope-and-boundaries.md" 'Sermon archive (`/predicas`)' 'D1 IN bullet exists'
required "docs/product/scope-and-boundaries.md" 'self-hosted audio'           'D1 self-hosted audio is IN'
required "docs/product/scope-and-boundaries.md" 'ceiling'                     'D1 the ceiling rule'
required "docs/product/scope-and-boundaries.md" 'no live streaming'           'D1 platform still OUT'
required "docs/product/scope-and-boundaries.md" 'self-hosted video is not'    'D1 video stays OUT'
required "docs/product/scope-and-boundaries.md" '/predica'                    'D1 names the pipeline'

echo
echo "--- D5/D6: likes are slug-keyed and serve blog posts AND sermons"
banned   "docs/product/scope-and-boundaries.md" 'the only interactive/stateful reader feature' 'D5 scope:36'
banned   "docs/product/scope-and-boundaries.md" 'The blog "like" is the only write path'       'D6 scope:49'
banned   "docs/product/content-types.md"        'the only interactive reader feature'          'D5 ct:79'
banned   "docs/product/content-types.md"        'is the only stateful reader feature'          'D5 ct:87'
banned   "CLAUDE.md"                            'anonymous blog "like"'                        'D5 twin'
banned   "AGENTS.md"                            'anonymous blog "like"'                        'D6 twin'
required "docs/product/scope-and-boundaries.md" 'blog posts and sermons' 'D5/D6 corrected claim'
required "docs/product/content-types.md"        'blog posts and sermons' 'D5/D6 corrected claim'
required "CLAUDE.md"                            'blog posts and sermons' 'D5/D6 twin corrected'
required "AGENTS.md"                            'blog posts and sermons' 'D6 twin corrected'
required "docs/product/scope-and-boundaries.md" '/api/likes'             'D5/D6 names the generic route'

echo
echo "--- D3: the sermon + BibleVerse content types are documented"
required "docs/product/content-types.md" 'getSermons.ts'          'D3 the getter'
required "docs/product/content-types.md" 'BibleVerse'             'D3 the standalone type'
required "docs/product/content-types.md" 'bibleVersion'           'D3 a real BibleVerse field'
required "docs/product/content-types.md" 'scriptureReferencesCollection' 'D3 a real sermon field'
required "docs/product/content-types.md" 'durationSeconds'        'D3 a real sermon field'
required "docs/product/content-types.md" '/predicas'             'D3 the route'
required "docs/product/content-types.md" 'SermonAudioPlayer'      'D3 the self-hosted player'
required "docs/product/content-types.md" 'additionalPreachersCollection' 'D3 the Author reuse'
# EDGE CASE 2 — the rich-text `bibleVerse` FIELD on Credo/ValueItem (§2) is a DIFFERENT thing from
# the standalone `BibleVerse` TYPE (§9). The new section must NOT overwrite or erase §2.
required "docs/product/content-types.md" '`bibleVerse` (rich text)' 'EDGE-2: the §2 field SURVIVES'

echo
echo "--- D8/D9: the surfaces table"
banned   "docs/product/overview.md" '/api/contact'   'D8 phantom route gone'
required "docs/product/overview.md" 'Server Action'  'D8 contact is a Server Action'
required "docs/product/overview.md" '/predicas'      'D9 the sermons row exists'

echo
echo "--- D10: apps/admin is not described as existing"
banned   "docs/product/README.md" 'this repo is now a monorepo with two products' 'D10 present tense gone'
required "docs/product/README.md" 'has not been created yet'                      'D10 future tense'

echo
echo "--- D11: sermons appear in the structured-data inventory"
required "docs/product/ai-era-strategy.md" '**Sermons**'      'D11 inventory bullet'
required "docs/product/ai-era-strategy.md" 'durationSeconds'  'D11 real fields'

echo
echo "--- D12: Last reviewed dates + what the date attests to"
for f in \
  "docs/product/scope-and-boundaries.md" \
  "docs/product/content-types.md" \
  "docs/product/overview.md" \
  "docs/product/README.md" \
  "docs/product/ai-era-strategy.md" \
  "docs/product/editorial-and-content-rules.md"; do
  required "$f" '2026-07-14' 'D12 Last reviewed bumped'
  banned   "$f" '2026-06-21' 'D12 stale June date gone'
done
required "docs/product/README.md" 'What "Last reviewed" means' 'D12 the date is not a revalidation'

echo
echo "=============================================="
if [ "$FAILS" -eq 0 ]; then
  echo "GREEN — $CHECKS checks, 0 failures"
  exit 0
else
  echo "RED — $CHECKS checks, $FAILS FAILURES"
  exit 1
fi
```

- [ ] **Step 2: Run the gate and verify it FAILS (the RED phase — MANDATORY)**

```bash
chmod +x "$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh"
"$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh" /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
```

**Expected:** exit **1**, `RED — <N> checks, <M> FAILURES`, with the vacuity guard printing
`all 8 files present and non-empty ✓` first.

**Capture this output verbatim** — it is the reproduction of the documentation defect and goes in the
PR body as the evidence the ticket delivered value.

**STOP CONDITIONS — do not proceed, report instead:**

- If it exits **2** (BLOCKED): a file is missing/empty. The worktree is wrong. Stop.
- If it exits **0** (GREEN) on the first run: the drift is **not there** and the premise is wrong.
  **Do not "fix" the script to make it fail.** Stop and report.

- [ ] **Step 3: Rewrite `docs/product/scope-and-boundaries.md`**

Six edits. Apply them exactly.

**(3a) Line 6 — the date:**

```markdown
> **Last reviewed:** 2026-07-14
```

**(3b) Line 36 — the Blog bullet (D5). Replace:**

```markdown
- **Blog** — articles with rich text, featured image, author, category, and published date; a lightweight, anonymous **"like"** (the only interactive/stateful reader feature). Related-posts surfacing.
```

**with:**

```markdown
- **Blog** — articles with rich text, featured image, author, category, and published date; a lightweight, anonymous **"like"** (slug-keyed via `/api/likes` — the same like also serves sermons). Related-posts surfacing.
```

**(3c) Immediately AFTER the Blog bullet, insert the new IN-scope bullet (D1):**

```markdown
- **Sermon archive (`/predicas`)** — sermons as Contentful content (title, thesis, main points, scripture references, rich-text body, a downloadable **PDF summary**, and a single **self-hosted audio** recording played inline on the sermon's own page), plus the **`/predica` pipeline** that produces them. Carries the same anonymous **"like"** as blog posts.
```

**(3d) Line 38 — the newsletter (D4). Replace:**

```markdown
- **Newsletter signup** — email capture to **Mailchimp**.
```

**with:**

```markdown
- **Newsletter signup** — email capture to **Resend** (per-locale audiences: `/api/subscribe` → `subscribe.service.ts` → `resendAudience.ts`).
```

**(3e) Line 49 — the UGC bullet (D6). Replace ONLY the middle clause.** The bullet's real point (no
_open content_ surface exists) is TRUE and must survive. Replace:

```markdown
- **Public user-generated content** — no public comments, reviews, ratings, forums, prayer-wall posting, or public event submission. The blog "like" is the only write path open to anonymous visitors, and it stores no PII beyond an anonymous visitor id. The contact form and newsletter signup are constrained, server-validated forms — not open content surfaces.
```

**with:**

```markdown
- **Public user-generated content** — no public comments, reviews, ratings, forums, prayer-wall posting, or public event submission. The anonymous **"like"** — slug-keyed via `/api/likes`, serving **blog posts and sermons** alike — is the only write path open to anonymous visitors, and it stores no PII beyond an anonymous visitor id. The contact form and newsletter signup are constrained, server-validated forms — not open content surfaces.
```

**(3f) Line 52 — the OUT bullet (D1). Replace:**

```markdown
- **Streaming / media-hosting platform, sermon archive app, podcast backend.** Embeds of third-party media (YouTube, Vimeo, etc.) are fine; building a media platform is not.
```

**with:**

```markdown
- **Streaming / media-hosting platform, podcast backend, media app.** No transcoding service, no channels / subscriptions / RSS or podcast feeds, no video hosting, no live streaming. A sermon's single **self-hosted audio** asset, played inline on its own page, is the **ceiling** — see the sermon-archive entry under IN scope. Third-party video **embeds** (YouTube, Vimeo, etc.) on a page remain fine; **self-hosted video is not**.
```

**(3g) Line 66 — the reframe table row (D7). Replace:**

```markdown
| Sermon streaming platform | Embed YouTube/Vimeo on a page |
```

**with:**

```markdown
| Sermon streaming platform / podcast feed | Sermon archive: Contentful `sermon` entries with one self-hosted audio asset + a PDF summary on the sermon's own page (shipped — `/predicas`). Feeds, channels, transcoding, and live streaming stay out; a third-party video embed on a page is fine. |
```

**(3h) Line 74 — DELETE the DEFERRED line entirely (D2):**

```markdown
- **Sermon / teaching archive** as Contentful content (text + embedded media), if leadership wants it.
```

- [ ] **Step 4: Re-run the gate — the scope-and-boundaries block must go green**

```bash
"$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh" /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
```

**Expected:** still exit 1 overall (Tasks 2–4 are not done), but **every**
`scope-and-boundaries.md` line now reads `ok`, and `Resend` / `blog posts and sermons` / `ceiling` /
`self-hosted video is not` are all `ok [required]`.

If any `scope-and-boundaries.md` check still FAILs, fix the doc — **not the script**.

- [ ] **Step 5: Format check + commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
pnpm exec prettier --check docs/product/scope-and-boundaries.md
git add docs/product/scope-and-boundaries.md
git commit -m "docs(ICR-154): correct the scope filter — sermon archive is IN, not OUT/DEFERRED"
```

**Expected:** prettier reports the file uses the correct style. If it rewrites the table row, accept
the rewrite (the husky `lint-staged` hook may reformat the markdown table's column padding — that is
fine and expected; **never** `--no-verify`).

---

## Task 2: Document the `sermon` and `BibleVerse` content types

**Files:**

- Modify: `docs/product/content-types.md` (lines 6, 79, 82, 87; new §8 + §9 after line 112; table at 118–126)

**Interfaces:**

- Consumes: the assertion script from Task 1.
- Produces: nothing downstream depends on this task's text.

**All field names below are REAL — taken from `apps/web/lib/contentful/getSermons.ts`. Do not invent
fields.** If you find the getter disagrees with this plan, **the getter wins** — report the discrepancy.

- [ ] **Step 1: Line 6 — the date**

```markdown
> **Last reviewed:** 2026-07-14
```

- [ ] **Step 2: Line 79 — the Blog section's subtitle (D5). Replace:**

```markdown
The one content-rich, frequently-updated type, with the only interactive reader feature (anonymous likes).
```

**with:**

```markdown
The one content-rich, frequently-updated type, carrying the anonymous **like** (shared with sermons via the slug-keyed `/api/likes`).
```

- [ ] **Step 3: Line 82 — note the `Author` reuse (D3).** In the Blog "Key fields" bullet, the text
      `author` (→ **Author**: `name`, `avatar`, `email`) appears. Append this sentence to the end of that
      same bullet (after the `_(Full shape: `src/types/BlogPost.ts`.)_` marker):

```markdown
_(**Author** is also reused by the `Sermon` type for `preacher` and `additionalPreachersCollection` — see §8.)_
```

- [ ] **Step 4: Line 87 — the "Rendered by" line (D5). Replace:**

```markdown
- **Rendered by:** `/blog` (list) and `/blog/[slug]` (detail). The anonymous **like** is the only stateful reader feature — it is the one thing in this whole content set that writes to MongoDB (`likes` collection via `/api/likes`), not Contentful.
```

**with:**

```markdown
- **Rendered by:** `/blog` (list) and `/blog/[slug]` (detail). The anonymous **like** is the only _kind_ of stateful reader feature — and it is **not blog-only**: `/api/likes` is a generic, **slug-keyed** endpoint, so **blog posts and sermons** share it (see §8). It is the one thing in this whole content set that writes to MongoDB (`likes` collection), not Contentful.
```

- [ ] **Step 5: Insert §8 and §9 after §7 (Seo), immediately BEFORE the `---` that precedes `## Quick reference`**

```markdown
## 8. Sermon — the prédicas archive

The sermon archive at `/predicas`: each sermon is a full Contentful entry with a rich-text body, a
downloadable PDF summary, structured scripture references, and a **self-hosted audio recording**
played inline on its own page. Entries are produced by the local **`/predica` pipeline**
(recording → transcript → bilingual entry → branded PDFs → a Contentful _draft_), which never
auto-publishes — a human reviews and publishes every sermon.

- **Purpose:** publish the church's teaching as durable, readable, listenable content — findable by
  people and by AI assistants — without building a media platform. (One audio asset on its own page
  is the deliberate **ceiling**; see [scope-and-boundaries.md](./scope-and-boundaries.md).)
- **Key fields:** `title`, `slug`, `sermonDate`, `thesis`, `mainPoints`, `excerpt`,
  `durationSeconds`, `content` (rich text), `featuredImage`,
  `audio { url, title, contentType, fileName, size }` (the **self-hosted** recording — a Contentful
  asset, **not** a YouTube/Vimeo embed), `pdfSummary` (the downloadable summary asset),
  `preacher` (→ **Author**), `additionalPreachersCollection` (→ **Author**[]),
  `scriptureReferencesCollection` (→ **BibleVerse**[], see §9), SEO fields (`seoTitle`,
  `seoDescription`, `keywords`), `relatedSermonsCollection`, and `sys`.
- **Getters (`lib/contentful/getSermons.ts`):**
  - `getSermon(slug, locale, isDraftMode)` — a single sermon by slug.
  - `getSermonById(id, locale, isDraftMode)` — by entry id (used by the `/predica` pipeline).
  - `getLatestSermons(locale, …)` — the most recent sermons, for surfacing.
  - `getAllSermons(locale, …)` / `fetchAllSermonItems(…)` — the paginated archive listing.
  - `getAllSermonSlugs(locale)` — for `generateStaticParams` / sitemap.
- **Rendered by:** `/predicas` (archive list — `SermonSection`, `SermonCard`) and `/predicas/[slug]`
  (detail — `SermonDetails`, composing `SermonHeader`, **`SermonAudioPlayer`** (a native `<audio>`
  element against the Contentful `audio.url`), `SermonContent`, `PdfDownloadButton`,
  `ScriptureReferences`, and `RelatedSermons`).
- **Reader interaction:** the sermon detail page renders the **same** `PostActions` component the
  blog uses, with `likeKey` = `` `predicas/${slug}` `` — so sermons carry the anonymous
  **like** through the same slug-keyed `/api/likes` route. Likes are **not** blog-only.
- **Structured-data note:** the richest un-exploited JSON-LD target on the site. Sermons carry a
  date, an author, a body, a duration, and an audio asset — the raw material for
  `AudioObject` / `Article` markup. See [ai-era-strategy.md](./ai-era-strategy.md).
- **Editorial note:** sermon content is **preaching — leadership-owned**. The `/predica` pipeline
  writes a **draft** only; a human reviews both locales and publishes. Agents must not alter
  doctrinal meaning. See [editorial-and-content-rules.md](./editorial-and-content-rules.md).

## 9. BibleVerse — structured scripture references

A standalone content type for a scripture citation, reused across sermons (and deduped by the
`/predica` pipeline, which upserts by a derived version-scoped key — see
`docs/architecture/predica-bibleverse-reuse.md`).

> **⚠️ Do not confuse this with the `bibleVerse` _field_ in §2.** `Credo` and `ValueItem` each carry
> a free-text **rich-text `bibleVerse` field** — prose on a card. **`BibleVerse` (this section) is a
> different thing: a structured _content type_** with real coordinates (`book`, `chapter`,
> `fromVerse`, `toVerse`), the verse text, and the translation used. Only the sermon type links to it.

- **Purpose:** cite scripture with machine-readable coordinates, so a verse can be rendered
  consistently, reused across sermons, and (later) marked up for structured data.
- **Key fields:** `book`, `chapter`, `fromVerse`, `toVerse`, `verseContent` (the verse text), and
  `bibleVersion` (the translation — e.g. NVI for es-AR, NIV for en-US).
- **Getter:** no standalone getter — it is queried **inline** by `lib/contentful/getSermons.ts`, via
  `scriptureReferencesCollection` on the sermon
  (`... on BibleVerse { book chapter fromVerse toVerse verseContent bibleVersion }`).
- **Rendered by:** the `ScriptureReferences` component on the sermon detail page.
- **Structured-data note:** the cleanest path to citation markup, since the coordinates are already
  structured rather than buried in prose.
```

- [ ] **Step 6: Add two rows to the Quick reference table (after the Blog post row)**

```markdown
| **Sermon** (→ Author, BibleVerse) | `getSermons.ts` | `slug` | `/predicas`, `/predicas/[slug]` |
| **BibleVerse** (scripture reference) | `getSermons.ts` (inline) | (linked) | sermon detail (`ScriptureReferences`) |
```

- [ ] **Step 7: Re-run the gate — the `content-types.md` block must go green**

```bash
"$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh" /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
```

**Expected:** every `content-types.md` check reads `ok` — **including**
`EDGE-2: the §2 field SURVIVES` (`` `bibleVerse` (rich text) `` must still be present in §2). If that
one FAILs, you deleted or rewrote §2 — restore it. Overall exit is still 1 (Tasks 3–4 pending).

- [ ] **Step 8: Format check + commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
pnpm exec prettier --check docs/product/content-types.md
git add docs/product/content-types.md
git commit -m "docs(ICR-154): document the sermon and BibleVerse content types"
```

---

## Task 3: The surfaces table, the admin tense, and the sermon SEO gap

**Files:**

- Modify: `docs/product/overview.md` (lines 4, 69, 70; new row after 68)
- Modify: `docs/product/README.md` (lines 7, 29, 31)
- Modify: `docs/product/ai-era-strategy.md` (lines 6, 18–29)
- Modify: `docs/product/editorial-and-content-rules.md` (line 6 — **date only, no content edit**)

- [ ] **Step 1: `overview.md` line 4 — the date**

```markdown
> **Last reviewed:** 2026-07-14
```

- [ ] **Step 2: `overview.md` — add the Sermons row to the audience-surfaces table, immediately after the Blog row (line 68)**

```markdown
| **Sermons (Prédicas)** | `/predicas`, `/predicas/[slug]` | Sermon archive: thesis, main points, scripture, rich-text body, downloadable PDF summary, and an inline self-hosted audio recording; anonymous "like" | `Sermon` → `Author` (preacher), `BibleVerse` |
```

- [ ] **Step 3: `overview.md` line 69 — the newsletter row (D4). Replace the cell** `Email capture to Mailchimp` **with:**

```markdown
| **Newsletter signup** | (component, e.g. footer/CTA) | Email capture to Resend (per-locale audiences) | UI + `/api/subscribe` |
```

- [ ] **Step 4: `overview.md` line 70 — the contact row (D8). Replace the row with:**

```markdown
| **Contact** | (form, e.g. on a page/footer) | Message capture (saved + emailed to the church) | UI + `contactFormAction.ts` (a **Server Action** — there is no `/api` contact route) |
```

- [ ] **Step 5: `README.md` line 7 — `apps/admin` is not on disk (D10). Replace:**

```markdown
> **Two products (as of 2026-07-05):** this repo is now a monorepo with two products — the **public website** (`apps/web`, governed by this `docs/product/` brain) and the separate, authenticated **Ministry Admin Panel** (`apps/admin`, governed by [`tasks/specs/admin-platform-brief.md`](../../tasks/specs/admin-platform-brief.md)). The scope boundaries here (no auth, no RBAC, no PII at scale) govern the **public website**; the admin platform deliberately provides those capabilities privately for the leadership team. See [scope-and-boundaries.md § Two products](./scope-and-boundaries.md).
```

**with:**

```markdown
> **Two products (planned):** this repo is a monorepo that will hold **two products** — the **public website** (`apps/web`, governed by this `docs/product/` brain; the only product that exists on disk today) and the **planned** **Ministry Admin Panel** (`apps/admin`, governed by [`tasks/specs/admin-platform-brief.md`](../../tasks/specs/admin-platform-brief.md), a **DRAFT** brief). The pnpm workspace glob is ready, but **`apps/admin/` has not been created yet**. The scope boundaries here (no auth, no RBAC, no PII at scale) govern the **public website**; the admin platform is deliberately designed to provide those capabilities privately for the leadership team **once it is built**. See [scope-and-boundaries.md § Two products](./scope-and-boundaries.md).
```

- [ ] **Step 6: `README.md` — add the "Last reviewed" meaning note (D12).** Append to the end of the
      `## Keeping these docs alive` section (after line 29, before the `**Last reviewed:**` line):

```markdown
> **What "Last reviewed" means:** the date someone last checked this file's _claims against the running product_ — **not** the date it was last edited. A formatting, link, or typo edit does not earn a bump. If you change a file without re-checking its claims, leave the date alone. _(This distinction is not pedantry: `scope-and-boundaries.md` was bumped to 2026-07-05 during the monorepo edit, and that pass still did not notice that the shipped sermon archive was listed as both OUT of scope and DEFERRED — the drift this very file's ICR-154 pass had to fix.)_
```

- [ ] **Step 7: `README.md` line 31 — the date**

```markdown
**Last reviewed:** 2026-07-14
```

- [ ] **Step 8: `ai-era-strategy.md` line 6 — the date**

```markdown
> **Last reviewed:** 2026-07-14
```

- [ ] **Step 9: `ai-era-strategy.md` — add Sermons to "What we already have to work with" (D11).**
      Insert immediately after the **Articles** bullet (line 26):

```markdown
- **Sermons** — `Sermon` (title, `sermonDate`, thesis, main points, rich-text body, `durationSeconds`, a self-hosted `audio` asset, a `pdfSummary`, `preacher` → `Author`) with **structured** `BibleVerse` scripture references (`book`, `chapter`, `fromVerse`, `toVerse`, `bibleVersion`). _The richest un-exploited target: an `AudioObject` / `Article` with a real duration, author, and date._
```

- [ ] **Step 10: `editorial-and-content-rules.md` line 6 — the date, AND NOTHING ELSE**

```markdown
> **Last reviewed:** 2026-07-14
```

This file carries **no drift item**. It was re-read in this audit and found clean — which, under the
new definition in Step 6, is exactly what the date attests to. **Make no other edit to it.**

- [ ] **Step 11: Re-run the gate**

```bash
"$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh" /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
```

**Expected:** the only remaining FAILs are the four `CLAUDE.md` / `AGENTS.md` checks (Task 4).

- [ ] **Step 12: Format check + commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
pnpm exec prettier --check docs/product/overview.md docs/product/README.md docs/product/ai-era-strategy.md docs/product/editorial-and-content-rules.md
git add docs/product/overview.md docs/product/README.md docs/product/ai-era-strategy.md docs/product/editorial-and-content-rules.md
git commit -m "docs(ICR-154): fix the surfaces table, the admin tense, and the sermon SEO gap"
```

---

## Task 4: The twin startup docs + full GREEN

**Files:**

- Modify: `CLAUDE.md` (line 7)
- Modify: `AGENTS.md` (line 17)

**Why these two are in scope** (they are outside the ticket's stated file list, and the maintainer
approved adding them at the design gate): `CLAUDE.md` and `AGENTS.md` are read at the start of
**every** agent session. Leaving them asserting "the only stateful reader feature is an anonymous
**blog** like" while `docs/product/` now says "blog posts **and sermons**" would upgrade a
single-file staleness into two startup docs **actively contradicting** the product brain — the exact
ICR-144 failure mode. **Call this out in the PR body.**

- [ ] **Step 1: `CLAUDE.md` line 7 (D5 twin). Replace:**

```markdown
The **public website** (`apps/web`) is a **content-managed informational site**, not an app: it has **no authentication, no RBAC, no payments, and no in-product AI**. Almost all content is rendered from **Contentful** via hand-written GraphQL in React Server Components. The only stateful reader feature is an anonymous blog "like".
```

**with:**

```markdown
The **public website** (`apps/web`) is a **content-managed informational site**, not an app: it has **no authentication, no RBAC, no payments, and no in-product AI**. Almost all content is rendered from **Contentful** via hand-written GraphQL in React Server Components. The only stateful reader feature is an anonymous **"like"** — slug-keyed via `/api/likes`, and shared by **blog posts and sermons**.
```

- [ ] **Step 2: `AGENTS.md` line 17 (D6 twin). Replace:**

```markdown
**The public website (`apps/web`) has no authentication, no RBAC, no payments/e-commerce, and no AI/LLM features.** Do not add any of them to `apps/web` without an explicit product decision — see `docs/product/scope-and-boundaries.md`. The only write path open to a visitor is the anonymous blog "like" and the contact form; both are deliberately minimal.
```

**with:**

```markdown
**The public website (`apps/web`) has no authentication, no RBAC, no payments/e-commerce, and no AI/LLM features.** Do not add any of them to `apps/web` without an explicit product decision — see `docs/product/scope-and-boundaries.md`. The only write path open to a visitor is the anonymous **"like"** (slug-keyed via `/api/likes` — **blog posts and sermons**) and the contact form; both are deliberately minimal.
```

- [ ] **Step 3: Run the gate — it must now be FULLY GREEN**

```bash
"$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh" /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
```

**Expected:** exit **0**, `GREEN — <N> checks, 0 failures`.
**Capture this output verbatim for the PR body** (paired with the Task 1 RED output, it is the
before/after evidence).

If any check still FAILs: **fix the doc, never the script.** The script encodes the acceptance
criteria; weakening it to force green would defeat the entire ticket.

- [ ] **Step 4: Prove the repo-wide `format:check` delta is ZERO (do not "fix" 163 unrelated files)**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
pnpm exec prettier --check docs/product/*.md CLAUDE.md AGENTS.md
```

**Expected:** all 8 touched files pass. The repo-wide `pnpm format:check` failure (~163 files) is
**pre-existing and not yours** — do not touch those files. **NEVER** run
`git checkout origin/main -- .` to compare (ICR-109: it stages stray files when `main` advances
mid-run).

- [ ] **Step 5: Run the full verification stack**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-154
pnpm type-check && pnpm lint && pnpm test
```

**Expected:** all green. A docs-only change cannot affect these — **any failure means something
unintended was touched.** Investigate; do not hand-wave it.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs(ICR-154): correct the likes claim in CLAUDE.md and AGENTS.md"
```

- [ ] **Step 7: The ICR-146 filter test (AC-2) — a reading test, not a grep**

Re-read the corrected `docs/product/scope-and-boundaries.md` §§ IN scope / OUT of scope / DEFERRED.
Apply it **literally, as written** to **ICR-146** ("bilingual sermon audio").

**Expected result: IN scope** — admitted by the new **Sermon archive (`/predicas`)** IN bullet (which
explicitly names a self-hosted audio recording as part of the sermon), with **no** OUT bullet
reachable (the OUT bullet now bans only a _platform_: transcoding, feeds, video, live streaming) and
**no** DEFERRED entry (deleted).

Write the reasoning into the PR body. If the corrected filter does **not** clearly admit ICR-146,
the wording failed its purpose — **stop and report**, do not paper over it.

---

## Self-Review

**Spec coverage** — every requirement maps to a task:

| Req                       | Task                 | Req                        | Task                                     |
| ------------------------- | -------------------- | -------------------------- | ---------------------------------------- |
| R1 (D1 boundary)          | 1 (3c, 3f)           | R8 (D8 phantom route)      | 3 (4)                                    |
| R2 (D2 deferred)          | 1 (3h)               | R9 (D9 predicas row)       | 3 (2)                                    |
| R3 (ICR-146 admits)       | 4 (7)                | R10 (D10 admin tense)      | 3 (5)                                    |
| R4 (D7 reframe)           | 1 (3g)               | R11 (D11 SEO inventory)    | 3 (9)                                    |
| R5 (D4 Resend)            | 1 (3d), 3 (3)        | R12 (D12 dates + meaning)  | 1, 2, 3                                  |
| R6 (D5/D6 likes ×4)       | 1 (3b, 3e), 2 (2, 4) | R13 (twins)                | 4 (1, 2)                                 |
| R7 (D3 sermon+BibleVerse) | 2 (5, 6)             | R14 (config.json → triage) | _(not implemented — deferred by design)_ |

**Placeholder scan:** none. Every edit shows the verbatim before-text and after-text. The assertion
script is given in full, not described.

**Consistency check (the trap this plan had to avoid):** the banned strings and the replacement prose
were derived **from each other**, so no ban can fire on a correct fix. Specifically:

- `banned 'is the only stateful reader feature'` is scoped to `content-types.md`, whose replacement
  says "the only _kind_ of stateful reader feature" — the ban does **not** match it.
- `CLAUDE.md`'s replacement **retains** "The only stateful reader feature is an anonymous…" (which is
  TRUE — the like _is_ the only one; only "blog" was false), so the twin ban targets the actually-false
  substring `anonymous blog "like"` instead. That same string is the false bit in `AGENTS.md`, so one
  ban covers both twins.
- `banned '/api/contact'` is scoped to `overview.md` only — `.claude/config.json` also contains it
  (R14, deferred) and must not trip the gate.
