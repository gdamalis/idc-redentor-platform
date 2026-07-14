# ICR-154 — Correct the product brain: shipped sermons still marked out-of-scope

> **Jira:** [ICR-154](https://divinelab.atlassian.net/browse/ICR-154) · Task · Priority Medium · Component: Website
> **Branch:** `docs/ICR-154-correct-product-brain-scope`
> **Commit type:** `docs` — the honest type for a docs-only change.
> **QA depth:** light · **QA type:** chore (no runtime surface to drive; no preview deployment needed)
> **Status:** approved at the design gate (2026-07-14)

---

## Release impact (read before titling the PR)

Ground truth, from `.releaserc.json` `releaseRules`:

```json
{ "type": "feat",  "release": "minor" },
{ "type": "fix",   "release": "patch" },
{ "type": "perf",  "release": "patch" },
{ "type": "docs",  "release": "patch" },
{ "type": "chore", "release": false }
```

So a **`docs(ICR-154):` PR title WILL cut a patch release** on squash-merge. That is correct and
intended (`docs/architecture/contributing.md` § Releases: "a `docs:` or `perf:` commit on main
**will** produce a release. Be deliberate with commit types."). `chore` is the only explicit
no-release type. **Do not** pick a commit type to dodge a version bump — pick the one that is true.

---

## 1. Dependencies Check

Everything this ticket asserts must already exist. Verified by the explorer at branch HEAD (`ea8d799`):

| Must exist                                                                             | Verified                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/product/{scope-and-boundaries,content-types,overview,README,ai-era-strategy}.md` | ✅ all 5 present                               |
| Shipped sermon archive: route `apps/web/src/app/[locale]/predicas`                     | ✅                                             |
| `apps/web/lib/contentful/getSermons.ts` (the `sermon` + `BibleVerse` GraphQL shape)    | ✅                                             |
| `apps/web/src/components/features/sermon-details/SermonDetails.tsx`                    | ✅ (likes evidence, L69-76)                    |
| `SermonAudioPlayer.tsx` — native `<audio>` against a Contentful asset `audio.url`      | ✅ self-hosted, not an embed                   |
| `apps/web/src/app/api/likes/route.ts` — generic, slug-keyed                            | ✅                                             |
| `apps/web/src/app/api/contact`                                                         | ❌ **does not exist** (this is the D8 defect)  |
| `apps/admin/` on disk                                                                  | ❌ **does not exist** (this is the D10 defect) |

**No blocking dependency.** No code, type, test, env, or Contentful-model surface is touched.

---

## 2. Requirements

All 12 drift items (D1–D12) were **independently re-verified** against the files at branch HEAD —
line numbers and quoted text all matched the ticket. (This is worth stating: per the ICR-108 /
ICR-111 lessons, a well-written ticket is not a verified one. This one holds up.)

### R1 — D1: the OUT list forbids what already shipped **(HIGH — changes decisions)**

`docs/product/scope-and-boundaries.md:52` currently reads, verbatim:

> - **Streaming / media-hosting platform, sermon archive app, podcast backend.** Embeds of third-party media (YouTube, Vimeo, etc.) are fine; building a media platform is not.

A full sermon archive shipped, serving a **self-hosted Contentful audio asset** — which the
"embeds are fine" carve-out does not cover. Replace with the **ceiling rule** (maintainer-approved
at the design gate):

**New IN-scope bullet** — insert into the `## IN scope` list, immediately after the **Blog** bullet
(line 36), so it sits with the other content surfaces:

```markdown
- **Sermon archive (`/predicas`)** — sermons as Contentful content (title, thesis, main points, scripture references, rich-text body, a downloadable **PDF summary**, and a single **self-hosted audio recording** played inline on the sermon's own page), plus the **`/predica` pipeline** that produces them. Carries the same anonymous **"like"** as blog posts.
```

**Replacement OUT bullet** (replaces line 52 entirely):

```markdown
- **Streaming / media-hosting platform, podcast backend, media app.** No transcoding service, no channels / subscriptions / RSS or podcast feeds, no video hosting, no live streaming. A sermon's single **self-hosted audio** asset, played inline on its own page, is the **ceiling** — see the sermon-archive entry under IN scope. Third-party video **embeds** (YouTube, Vimeo, etc.) on a page remain fine; **self-hosted video is not**.
```

**The boundary being drawn** (approved): self-hosted **audio** is IN (it shipped); self-hosted
**video** is OUT (an order of magnitude larger, and the first step toward the media platform this
boundary exists to prevent); third-party video **embeds** stay fine, as they always were.

### R2 — D2: the same thing is ALSO listed as DEFERRED **(HIGH)**

`scope-and-boundaries.md:74`:

> - **Sermon / teaching archive** as Contentful content (text + embedded media), if leadership wants it.

**Delete this line.** It shipped (5 Contentful `sermon` entries; type created 2026-06-24). A thing
cannot be simultaneously OUT, DEFERRED, and live.

### R3 — D1+D2 acceptance: the filter must ADMIT ICR-146

ICR-146 is bilingual sermon audio — already accepted by the team. Applying the **corrected** filter
literally must yield **IN scope**. Deleting the OUT line alone is **not sufficient** (it would leave
the sermon archive merely unmentioned, i.e. undefined rather than admitted); the positive IN-scope
bullet from R1 is what makes it unambiguous.

### R4 — D7: the reframe table row is now wrong **(MEDIUM)**

`scope-and-boundaries.md:66` — row `| Sermon streaming platform | Embed YouTube/Vimeo on a page |`.
Replace the reframe cell so it matches the shipped reality and the new ceiling:

```markdown
| Sermon streaming platform / podcast feed | Sermon archive: Contentful `sermon` entries with one self-hosted audio asset + PDF summary on the sermon's own page (shipped, `/predicas`). Feeds, channels, transcoding, and live streaming stay out; a third-party video embed on a page is fine. |
```

### R5 — D4: the newsletter provider is wrong **(HIGH)**

Two places name Mailchimp; the newsletter moved to **Resend** (per-locale audiences):

- `scope-and-boundaries.md:38` — `- **Newsletter signup** — email capture to **Mailchimp**.`
  → `- **Newsletter signup** — email capture to **Resend** (per-locale audiences: `/api/subscribe`→`subscribe.service.ts`→`resendAudience.ts`).`
- `overview.md:69` — table cell `Email capture to Mailchimp`
  → `Email capture to Resend (per-locale audiences)`

**After this change, the string `Mailchimp` must not appear anywhere in `docs/product/`.**
(Out of scope: removing the dead `MAILCHIMP_*` env vars — that is **ICR-110**.)

### R6 — D5 + D6: "the blog like is the ONLY stateful reader feature / write path" is false **(MEDIUM)**

`/api/likes` is a **generic, slug-keyed** endpoint, not blog-specific. `SermonDetails.tsx:69-76`
renders the same `PostActions` with ``likeKey={`predicas/${sermon.slug}`}`` — so sermons carry the
anonymous like too. Four occurrences, all must be corrected to name **blog posts and sermons**:

| File:line                    | Current                                                                                | Correction                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope-and-boundaries.md:36` | "a lightweight, anonymous **\"like\"** (the only interactive/stateful reader feature)" | "a lightweight, anonymous **\"like\"** (slug-keyed via `/api/likes` — the same like also serves sermons)"                                          |
| `scope-and-boundaries.md:49` | "The blog \"like\" is the only write path open to anonymous visitors"                  | "The anonymous **\"like\"** — slug-keyed via `/api/likes`, serving **blog posts and sermons** — is the only write path open to anonymous visitors" |
| `content-types.md:79`        | "with the only interactive reader feature (anonymous likes)"                           | "with the anonymous **like** (shared with sermons via the slug-keyed `/api/likes`)"                                                                |
| `content-types.md:87`        | "The anonymous **like** is the only stateful reader feature"                           | "The anonymous **like** is the only _kind_ of stateful reader feature — slug-keyed via `/api/likes`, and shared by **blog posts and sermons**"     |

**Preserve the surviving true parts** of each sentence: the UGC boundary (D6's line is inside the
"no public user-generated content" bullet, and its point — that likes/contact/newsletter are the
_only_ constrained write surfaces, and no _open content_ surface exists — remains correct); and the
"writes to MongoDB, not Contentful" fact in `content-types.md:87`.

### R7 — D3: the content-type catalog is missing two real types **(HIGH-ish)**

`content-types.md` claims to define "the real Contentful content types behind the site" but has **no**
`sermon` section and **no** standalone `BibleVerse` section. Add both, following the existing
per-type template (Purpose / Key fields / Getter / Rendered by / Structured-data note), as **§8** and
**§9** (after `## 7. Seo`, before the `---` + `## Quick reference`).

**Real field names — from `apps/web/lib/contentful/getSermons.ts` (do not invent):**

- `sermon`: `title`, `slug`, `sermonDate`, `thesis`, `mainPoints`, `excerpt`, `durationSeconds`,
  `content` (rich text), `featuredImage`, `audio { url, title, contentType, fileName, size }`,
  `pdfSummary { … }`, `preacher` (→ **Author**), `additionalPreachersCollection` (→ Author[]),
  `scriptureReferencesCollection` (→ **BibleVerse**[]), `seoTitle`, `seoDescription`, `keywords`,
  `relatedSermonsCollection`, `sys`.
- `BibleVerse`: `book`, `chapter`, `fromVerse`, `toVerse`, `verseContent`, `bibleVersion`.
- Getters (`lib/contentful/getSermons.ts`): `getSermon`, `getSermonById`, `getLatestSermons`,
  `getAllSermons`, `getAllSermonSlugs`, paginated `fetchAllSermonItems`.
- Rendered by: `/predicas` (list) and `/predicas/[slug]` (detail) — components `SermonSection`,
  `SermonCard`, `SermonHeader`, `SermonAudioPlayer` (self-hosted `<audio>`), `SermonContent`,
  `PdfDownloadButton`, `ScriptureReferences`, `RelatedSermons`, `SermonDetails`.

**⚠️ Do not overwrite §2.** `content-types.md` §2 (ContentCollection) documents a **rich-text
`bibleVerse` _field_** on `Credo` / `ValueItem`. That is a _different thing_ from the standalone
**`BibleVerse` content type** queried by `getSermons.ts`. The new §9 must **explicitly distinguish
the two** (one is a free-text rich-text field on a card; the other is a structured entry with
`book`/`chapter`/`fromVerse`/`toVerse`/`bibleVersion`, reused across sermons and deduped by the
`/predica` pipeline — see `docs/architecture/predica-bibleverse-reuse.md`).

**Also (D3, minor):** `content-types.md:82` documents **Author** for the blog only. Note that
`Author` is now **reused** for sermon `preacher` / `additionalPreachersCollection`.

**Quick-reference table (lines 118–126)** — add two rows:

```markdown
| **Sermon** (→ Author, BibleVerse) | `getSermons.ts` | `slug` | `/predicas`, `/predicas/[slug]` |
| **BibleVerse** (scripture reference) | `getSermons.ts` (nested) | (linked) | sermon detail (ScriptureReferences) |
```

### R8 — D8: `overview.md:70` references a route that does not exist **(MEDIUM)**

The audience-surfaces table lists the contact surface's content as `UI + /api/contact`. **There is no
such route** — `apps/web/src/app/api/` holds only `draft/`, `likes/`, `subscribe/`, `predica/`,
`revalidate/`. Contact is a **Server Action**
(`apps/web/src/components/features/contact-form/contactFormAction.ts`).

→ change the cell to: `UI + \`contactFormAction.ts\` (Server Action)`

### R9 — D9: `overview.md` surfaces table is missing `/predicas` **(MEDIUM)**

Add a row to the table (lines 62–71), after the **Blog** row:

```markdown
| **Sermons (Prédicas)** | `/predicas`, `/predicas/[slug]` | Sermon archive: thesis, main points, scripture, rich-text body, PDF summary, inline audio; anonymous "like" | `Sermon` → `Author` (preacher), `BibleVerse` |
```

### R10 — D10: `README.md:7` describes `apps/admin` in the present tense **(LOW)**

`README.md:7` says "this repo is now a monorepo with two products — the public website (`apps/web`…)
and the separate, authenticated **Ministry Admin Panel** (`apps/admin`…)". `apps/admin` **does not
exist on disk** (`ls apps/` → `web` only). Reword to future/planned, while keeping the (true) facts
that the workspace glob is ready and `tasks/specs/admin-platform-brief.md` exists as a DRAFT brief.

### R11 — D11: Sermon absent from the structured-data inventory **(LOW)**

`ai-era-strategy.md:18-29` ("What we already have to work with") lists Beliefs, Service times,
Location, Identity, Articles, Per-page metadata — but not Sermon. Add a bullet:

```markdown
- **Sermons** — `Sermon` (title, `sermonDate`, thesis, main points, rich-text body, `durationSeconds`, a self-hosted `audio` asset, a `pdfSummary`, `preacher` → `Author`, and structured `BibleVerse` scripture references).
```

This is not a false claim being fixed — it is an **unexploited discoverability gap** in the very doc
meant to rank such ideas. Do **not** build the JSON-LD here (explicitly out of scope; file separately
if wanted).

### R12 — D12: stale "Last reviewed" dates **(LOW)**

`content-types.md:6`, `overview.md:4`, `editorial-and-content-rules.md:6`, `ai-era-strategy.md:6` all
say `2026-06-21`. Bump **every touched file** to `2026-07-14`.

> **`editorial-and-content-rules.md` is date-only.** It carries no drift item — the ONLY change to it
> is its `Last reviewed` date. (Touching it at all is defensible: it is one of the five product-brain
> files and its date is stale. But make no content edit to it.)

**Also (the process signal that makes D12 worth more than a date bump):**
`scope-and-boundaries.md` and `README.md` **were** bumped to `2026-07-05` for the monorepo edit — and
that pass **still did not catch D1 or D2**. A date bump is demonstrably **not** a content
revalidation. Add a one-line clarification of what "Last reviewed" attests to, in `README.md`
§ "Keeping these docs alive":

```markdown
> **What "Last reviewed" means:** the date someone last checked this file's _claims against the running product_ — not the date it was last edited. A formatting or link edit does not earn a bump. If you change a file without re-checking its claims, leave the date alone.
```

### R13 — twin startup docs (APPROVED SCOPE ADDITION — outside the ticket's stated file list)

The **same** false claim as D5/D6 lives in the two docs every agent session reads first. Fixing only
`docs/product/` would upgrade a single-file staleness into two startup docs **actively contradicting**
the product brain — the exact ICR-144 failure. **Approved by the maintainer at the design gate.**

| File:line      | Current (verbatim)                                                                                                          | Correction                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:7`  | "The only stateful reader feature is an anonymous blog \"like\"."                                                           | "The only stateful reader feature is an anonymous **\"like\"** — slug-keyed via `/api/likes`, and shared by **blog posts and sermons**."                                              |
| `AGENTS.md:17` | "The only write path open to a visitor is the anonymous blog \"like\" and the contact form; both are deliberately minimal." | "The only write path open to a visitor is the anonymous **\"like\"** (slug-keyed via `/api/likes` — **blog posts and sermons**) and the contact form; both are deliberately minimal." |

**Call this scope addition out explicitly in the PR body** — a reviewer comparing the PR against the
ticket's "Scope" section will otherwise see two unexplained files.

### R14 — NOT in scope, goes to triage

`.claude/config.json:365` — `playwrightProjectMap` still maps `apps/web/src/app/api/contact`, a path
that does not exist (the same D8 drift, in harness config rather than docs). **Do not fix here.**
Append to `tasks/todo.md` as a stray observation for the step-15 triage → its own Jira issue.
Rationale: `config.json` is harness config sitting in a known prettier-churn backlog, and dragging it
into a docs PR buys a heavier, riskier diff for no gain.

---

## 3. Data Model Changes

**None.** No Contentful content-type or field is created, updated, or deleted; no entry is remapped.
The `sermon` / `BibleVerse` types already exist and are only being **documented**. No MongoDB schema
or index change. **The Contentful model-change gate does not apply to this ticket.**

## 4. API Changes

**None.** No route handler, Server Action, or Zod schema is added or modified. No request/response
contract changes.

## 5. New / Modified Files

**New files: none.**

| Modified file                                 | Requirements            | Nature of change                                                                                                                                                          |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/product/scope-and-boundaries.md`        | R1, R2, R4, R5, R6, R12 | The scope filter itself — highest harm. New IN bullet; rewritten OUT bullet; DEFERRED line deleted; reframe row rewritten; Mailchimp→Resend; likes claim corrected; date. |
| `docs/product/content-types.md`               | R6, R7, R12             | New §8 Sermon + §9 BibleVerse; 2 quick-ref rows; Author-reuse note; likes claim ×2; date.                                                                                 |
| `docs/product/overview.md`                    | R5, R8, R9, R12         | Mailchimp→Resend; `/api/contact`→Server Action; new `/predicas` row; date.                                                                                                |
| `docs/product/README.md`                      | R10, R12                | `apps/admin` → future tense; "Last reviewed" meaning note; date.                                                                                                          |
| `docs/product/ai-era-strategy.md`             | R11, R12                | Sermon added to the structured-data inventory; date.                                                                                                                      |
| `docs/product/editorial-and-content-rules.md` | R12                     | **Date only** — no content edit.                                                                                                                                          |
| `CLAUDE.md`                                   | R13                     | One sentence (line 7).                                                                                                                                                    |
| `AGENTS.md`                                   | R13                     | One sentence (line 17).                                                                                                                                                   |
| `tasks/specs/ICR-154-*.md`, `*.plan.md`       | —                       | The spec + plan ride the PR.                                                                                                                                              |

**8 content files touched.** No file under any `config.qa.autoMerge.sensitivePaths` glob.

## 6. Component Hierarchy

**N/A — docs-only.** No UI is added or changed. (The sermon components are _described_ in the new
`content-types.md` §8, not modified.)

## 7. Edge Cases

1. **"Embeds only" is now a regression.** Any wording implying sermon media is a third-party _embed_
   contradicts the shipped self-hosted `SermonAudioPlayer`. → the assertion script **bans** the
   phrase pattern; R1's OUT bullet keeps the embed carve-out for **video** only, explicitly.
2. **The `bibleVerse` FIELD vs the `BibleVerse` TYPE.** §2 documents a rich-text _field_ on
   Credo/ValueItem; §9 documents a structured _content type_. Conflating or overwriting either is a
   defect. → §9 must state the distinction in prose; the assertion script requires **both** to survive.
3. **D6's sentence contains a claim that stays TRUE.** The "no public UGC" bullet's real point — no
   open content surface exists — is correct and must survive the edit. Only the _blog-only_ scoping of
   the like is false. → don't delete the bullet; surgically correct the clause. Positive assertion
   guards the surviving prose.
4. **Repo-wide `pnpm format:check` already fails (~163 files), pre-existing.** The AC is
   "`format:check` passes **on the touched files**". → gate on `prettier --check <the 8 files>`, and
   prove the repo-wide delta vs the base ref is **0** rather than "fixing" 163 unrelated files
   (ICR-109 lesson). **Do not** use `git checkout origin/main -- .` to compare (ICR-109: it staged a
   stray file when main advanced mid-run); use a read-only `git show origin/main:<path>`.
5. **Positive grep assertions must be presence (≥1), not exact counts.** A corrected phrase
   legitimately lands in more than one place (e.g. "Resend" appears in both
   `scope-and-boundaries.md` and `overview.md`), so `expected 1, got 2` would fail a _correct_ fix.
   Only the **banned-string** checks are exact-zero (ICR-109).
6. **A grep that ERRORS prints nothing, which reads exactly like a clean pass** (ICR-103/ICR-144).
   → the assertion script must **prove it observed the file** (non-empty read) before asserting any
   absence, and must `set -euo pipefail`. A negative assertion over an empty/missing input is a
   false pass.
7. **`main` may advance mid-run** (concurrent tickets: ICR-145, ICR-110, ICR-113 are in flight). None
   touch `docs/product/`, but `CLAUDE.md` / `AGENTS.md` are hot files. → if the PR goes
   `CONFLICTING`, merge `origin/main` in, re-run the assertion script, re-verify (ICR-47/ICR-111).

## 8. i18n

**N/A.** No user-facing string changes; no `public/locales/{es-AR,en-US}.json` edit. `docs/` is
English-only internal documentation. The `i18n-messages` sensitive-area gate does **not** apply.

## 9. Testing Strategy

**No unit tests are added.** This ticket has **no runtime surface** — adding a Vitest test here would
be a test that cannot meaningfully fail (repo rule: don't write tests that can't break).

**The test is the assertion script** (TDD-by-grep, the ICR-109 pattern):

`$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh` (throwaway; **NOT committed**, and deliberately **outside the
repo** — so it cannot be accidentally staged, and it cannot collide with a concurrent job's `/tmp`)
encodes every AC as a check. It takes the worktree root as `$1` and greps against it:

- **Banned strings (exact-zero, across `docs/product/`):**
  - `Mailchimp` (R5)
  - `sermon archive app` (R1)
  - `Sermon / teaching archive` (R2)
  - `only stateful reader feature` / `only interactive reader feature` /
    `only interactive/stateful reader feature` (R6) — also across `CLAUDE.md` (R13)
  - `The blog "like" is the only write path` (R6)
  - `/api/contact` in `docs/product/overview.md` (R8)
- **Required strings (presence ≥1):**
  - `docs/product/scope-and-boundaries.md`: a sermon-archive IN bullet; `self-hosted`; `ceiling`;
    `Resend`; `no live streaming`; `blog posts and sermons` (or equivalent, asserted by pattern)
  - `docs/product/content-types.md`: `getSermons.ts`; `BibleVerse`; `bibleVersion`; `/predicas`;
    a Sermon quick-ref row; **and** the surviving §2 rich-text `bibleVerse` field mention (edge case 2)
  - `docs/product/overview.md`: `/predicas` row; `Server Action`; `Resend`
  - `docs/product/README.md`: `apps/admin` in a planned/future construction; the "Last reviewed"
    meaning note
  - `docs/product/ai-era-strategy.md`: a `Sermon` inventory bullet
  - `CLAUDE.md` + `AGENTS.md`: the corrected likes sentence
  - all 6 `docs/product/*.md` + touched roots: `Last reviewed: 2026-07-14` where the file carries one
- **Vacuity guard (edge case 6):** every file is read and asserted **non-empty** before any absence
  check; `set -euo pipefail`.

**RED first (mandatory).** Run the script **before** any doc edit and capture the failing output —
that output _is_ the reproduction of the documentation defect, and it goes in the PR body as the
evidence the ticket delivered value. **If it passes on the first run, STOP and report** — that would
mean the drift is not there and the premise is wrong (it is not; the explorer confirmed all 12).

**The ICR-146 filter test (AC-2)** is not automatable by grep. It is a **human/agent reading test**:
after R1+R2, re-read `scope-and-boundaries.md` § IN/OUT/DEFERRED and apply it literally to ICR-146
("bilingual sermon audio"). Expected: **IN scope**, admitted by the sermon-archive IN bullet, with no
OUT bullet reachable. Record the reasoning in the PR body.

**Verification stack (light depth):** `pnpm type-check` + `pnpm lint` + `pnpm test`. All three must
stay green — they are unaffected by a docs-only change, so any failure is a signal something
unintended was touched. Plus `pnpm exec prettier --check` on the 8 touched files.

**No Playwright.** `config.playwrightProjectMap` maps no `docs/**` path; `qaType: chore` runs local
checks only, no browser, no deployed target.

## 10. Implementation Checkpoints

### CP1 — assertion script (RED) + `scope-and-boundaries.md`

- **Files:** `$CLAUDE_JOB_DIR/tmp/icr-154-assert.sh` (uncommitted, outside the repo),
  `docs/product/scope-and-boundaries.md`
- **Reqs:** R1, R2, R4, R5, R6 (2 of 4 sites), R12
- **Steps:** write the script → **run it, watch it FAIL**, capture output verbatim → fix the file →
  re-run: the `scope-and-boundaries.md` assertions go green, the others still fail (expected).
- **Verify:** `prettier --check docs/product/scope-and-boundaries.md`; `pnpm test` still green.
- **Commit:** `docs(ICR-154): correct the scope filter — sermon archive is IN, not OUT/DEFERRED`

### CP2 — `content-types.md`

- **Files:** `docs/product/content-types.md`
- **Reqs:** R6 (the other 2 sites), R7, R12
- **Steps:** add §8 Sermon + §9 BibleVerse from the **real** `getSermons.ts` field names; distinguish
  the `bibleVerse` field from the `BibleVerse` type (edge case 2); add 2 quick-ref rows; note the
  `Author` reuse; correct the 2 likes claims; bump the date.
- **Verify:** assertion script's `content-types.md` block green; `prettier --check`.
- **Commit:** `docs(ICR-154): document the sermon and BibleVerse content types`

### CP3 — `overview.md` + `README.md` + `ai-era-strategy.md` + `editorial-and-content-rules.md`

- **Reqs:** R5, R8, R9, R10, R11, R12
- **Steps:** Mailchimp→Resend; `/api/contact`→Server Action; new `/predicas` surfaces row;
  `apps/admin` → future tense; the "Last reviewed" meaning note; Sermon in the structured-data
  inventory; dates on all four.
- **Verify:** those blocks green; `prettier --check`.
- **Commit:** `docs(ICR-154): fix the surfaces table, the admin tense, and the sermon SEO gap`

### CP4 — twin startup docs

- **Files:** `CLAUDE.md`, `AGENTS.md`
- **Reqs:** R13
- **Steps:** correct the one stale sentence in each (exact text in R13).
- **Verify:** **the assertion script now passes end-to-end (full GREEN)** — capture the output for
  the PR body. `prettier --check` on all 8 touched files. Full stack:
  `pnpm type-check && pnpm lint && pnpm test`. Prove the repo-wide `format:check` delta vs
  `origin/main` is **0**.
- **Commit:** `docs(ICR-154): correct the likes claim in CLAUDE.md and AGENTS.md`

_(4 checkpoints — under the 8-checkpoint split guard.)_

## 11. Open Questions

1. **`editorial-and-content-rules.md` gets a date bump with no content change.** Slightly odd on its
   face, but correct: it _was_ re-read as part of this audit and found clean, which is exactly what
   the new "Last reviewed" definition attests to. Flagged so a reviewer doesn't read it as a stray edit.
2. **The `/predicas` route is Spanish-only in its path** (`/es-AR/predicas` and `/en-US/predicas` —
   the segment is not localized to `/sermons`). Documented as-is; whether the en-US route _should_ be
   `/sermons` is a separate product question, **not** opened here.
3. **The corrected boundary now admits self-hosted audio but not video.** If leadership later wants a
   sermon _video_, that is a deliberate product decision requiring a new pass at this boundary — which
   is precisely the intent of writing the ceiling down.

---

## Sensitive areas

**None.** Docs-only; `docs/`, `CLAUDE.md`, and `AGENTS.md` match no `config.qa.autoMerge.sensitivePaths`
glob. No code, no env/secrets, no CSP/headers, no email service, no PII/spam surface, no Mongo, no
i18n message file. The ticket's one flagged risk is **product judgment** (D1 redraws a boundary),
which was resolved at the design gate — not a security surface.
