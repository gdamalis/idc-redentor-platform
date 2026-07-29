# ICR-116 — Refresh the predica `sample-sermon.json` fixture (and gate it)

**Issue:** [ICR-116](https://divinelab.atlassian.net/browse/ICR-116) · Task (`chore`) · Priority Low ·
Component Infra · Epic [ICR-119](https://divinelab.atlassian.net/browse/ICR-119)
**Branch:** `chore/ICR-116-refresh-stale-sermon-fixture` · **QA depth:** light · **QA type:** chore
**Sensitive areas:** none of the repo's six.

---

## 0. Premise correction (read this first)

The issue was written 2026-07-05 against PR #75. Re-verified against `main@64a2ba2` on 2026-07-29,
**four of its load-bearing claims are false**. The scope below is the corrected one.

| Issue claim                                | Verified reality                                              | Evidence                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "not referenced by any test or script"     | **False.** CI-gated on every PR.                              | `__smoke__.mjs:23` → root `package.json` `predica:smoke` → `.github/workflows/pr.yml:47,85` job `predica-scripts` |
| "**Delete** it (recommended)"              | **Unsafe.** Would turn every subsequent PR red.               | same as above; documented in `docs/architecture/contributing.md:44-58`                                            |
| "has **no** `content[]`"                   | **False.** Present, 12 blocks per locale, all 6 block types.  | ICR-145, commit `87193c9`                                                                                         |
| "`validateSermon` would reject it"         | **False.** Passes.                                            | `pnpm predica:smoke` → exit 0, both PDFs + `featured.png` rendered                                                |
| AC "`pnpm test` passes"                    | **Vacuous.** Vitest never sees this file.                     | `apps/web/vitest.config.ts` globs only `src\|lib\|config\|scripts/**/*.mjs` under `apps/web`                      |
| "carries the removed PDF-only fields"      | **Partly true.** 5 named, but only **4** are dead — see §1.2. | grep of both builders                                                                                             |
| "no `scriptureReferences`"                 | **True.** Absent (optional in both validators).               | `build-sermon-entry.mjs:224`                                                                                      |
| "`validateSermonForEntry` would reject it" | **True.** Exit 2, 9 errors.                                   | live run, see §1.1                                                                                                |

**Net:** the fixture is a _valid PDF fixture_ carrying dead weight, which _fails the entry validator_.
The work is to make it satisfy **both** validators and to gate that so it cannot drift again.

---

## 1. Dependencies Check

Everything required already exists on `main`. Nothing blocks this ticket.

### 1.1 The two validators (the contract this fixture must satisfy)

| Validator                | File                                                     | Verdict today                |
| ------------------------ | -------------------------------------------------------- | ---------------------------- |
| `validateSermon`         | `.claude/scripts/predica/build-predica-pdf.mjs:502-573`  | **passes**                   |
| `validateSermonForEntry` | `.claude/scripts/predica/build-sermon-entry.mjs:159-271` | **fails** — exit 2, 9 errors |

The 9 errors, verbatim from `node .claude/scripts/predica/build-sermon-entry.mjs .claude/scripts/predica/__fixtures__/sample-sermon.json`:

```
internalName: required string
locales.es-AR.excerpt: required non-empty string
locales.es-AR.seoTitle: required non-empty string
locales.es-AR.seoDescription: required non-empty string
locales.es-AR.keywords: required non-empty array
locales.en-US.excerpt: required non-empty string
locales.en-US.seoTitle: required non-empty string
locales.en-US.seoDescription: required non-empty string
locales.en-US.keywords: required non-empty array
```

`validateSermonForEntry` is a strict superset of `validateSermon`, **except** that `validateSermon`
additionally requires `content[]` to be **non-empty** (the entry validator accepts any array). Neither
rejects unknown keys.

### 1.2 Which "removed PDF-only fields" are actually dead

The issue names five. Verified by grep across `.claude/scripts/predica/*.mjs` and
`apps/web/src/utils/predica/`:

| Field               | Readers                                                                                                                                                                                | Verdict         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `lead`              | none                                                                                                                                                                                   | dead — remove   |
| `keyQuotes`         | none                                                                                                                                                                                   | dead — remove   |
| `scriptureHeadline` | none                                                                                                                                                                                   | dead — remove   |
| `closing`           | none                                                                                                                                                                                   | dead — remove   |
| **`scriptureRefs`** | `build-predica-featured.mjs:82` (`pickPrimaryScripture`, called at `:342`); canonical twin `apps/web/src/utils/predica/featuredCard.ts:54-64`; covered by `featuredCard.test.ts:23-40` | **LIVE — keep** |

> **`scriptureRefs` must not be removed.** It supplies the featured card's scripture meta line and
> feeds `composeImageBrief`. Removing it would silently blank that line, and the smoke check's
> ≥1024-byte floor could not detect the regression — precisely the silent drift this ticket exists to
> stop.

### 1.3 Hermeticity of the new smoke case

`node build-sermon-entry.mjs <sermon.json>` with **no** other flags is documented at
`build-sermon-entry.mjs:18` as "validate + summary (dry-run)". Confirmed by reading `main()`
(`:308-371`): it reads the JSON, validates, prints a summary to stdout, and returns. No network, no
env vars, no writes. Safe for CI.

---

## 2. Requirements

1. **R1** — `sample-sermon.json` MUST satisfy `validateSermon` (unchanged behaviour: exit 0, both
   PDFs render).
2. **R2** — `sample-sermon.json` MUST satisfy `validateSermonForEntry` (exit 0, prints
   `sermon.json: VALID ✓`).
3. **R3** — The four verified-dead fields (`lead`, `keyQuotes`, `scriptureHeadline`, `closing`) MUST be
   removed from both locales.
4. **R4** — `scriptureRefs` MUST be retained in both locales (R1.2). `serviceLabel`, `title`, `thesis`,
   `mainPoints`, and `content[]` MUST be retained unchanged.
5. **R5** — `content[]` MUST NOT be modified.

   > **Corrected 2026-07-29, during implementation.** R5 originally continued: _"The rendered PDFs must
   > remain equivalent; the only PDF input that changes is the removal of fields the PDF builder never
   > reads."_ **That was wrong.** `build-predica-pdf.mjs:240` calls
   > `renderScriptureReferences(common.scriptureReferences, locale)`, so the new top-level
   > `scriptureReferences` array **is** rendered — as a "Referencias bíblicas" / "Scripture references"
   > section. Both PDFs consequently grew (138154→163097 and 140783→165716 bytes). This is an
   > **improvement, not a regression**: the fixture now exercises `renderScriptureReferences`, a render
   > path the CI gate previously never reached. The `content[]`-is-untouched half of R5 stands and is
   > asserted by the `diff` in §9.1.

6. **R6** — `__smoke__.mjs` MUST additionally run `build-sermon-entry.mjs` against the fixture and fail
   the run if it does not exit 0.
7. **R7** — The new smoke case MUST assert a positive signal (`sermon.json: VALID`) on stdout, not
   merely exit 0. A check that passes when nothing ran is worse than no check — this mirrors the
   existing comment at `__smoke__.mjs:75-76`.
8. **R8** — The new case MUST be hermetic: no network, no credentials, no `--out` directory.
9. **R9** — `docs/architecture/contributing.md` MUST describe the widened `predica-scripts` gate.
10. **R10** — Scripture text placed in the fixture MUST be copied verbatim from text already committed
    in this repo. Do not compose or paraphrase Bible verses to fill a field.
11. **R11** — The Jira description MUST be rewritten in place so it reads as currently true
    (human decision, 2026-07-29).

---

## 3. Data Model Changes

No database, no Contentful model change. This is a JSON test fixture.

### 3.1 Target shape of `sample-sermon.json`

The TypeScript shape the fixture must conform to (from `validateSermonForEntry` +
`buildBibleVerseFields`):

```ts
interface ScriptureReference {
  chapter: string; // required
  fromVerse: string; // required
  toVerse?: string; // optional; changes the derived internalName
  "es-AR": { book: string; verseContent: string; bibleVersion: string };
  "en-US": { book: string; verseContent: string; bibleVersion: string };
}

interface SermonLocaleData {
  title: string; // required, non-empty
  thesis: string; // required, non-empty
  excerpt: string; // NEW — required, non-empty
  seoTitle: string; // NEW — required, non-empty, <= 60 chars
  seoDescription: string; // NEW — required, non-empty
  keywords: string[]; // NEW — required, non-empty
  mainPoints: string[]; // required, non-empty
  content: ContentBlock[]; // required; non-empty for validateSermon
  scriptureRefs: string[]; // KEPT — live, feeds the featured card
}

interface SermonFixture {
  slug: string; // kebab-case
  sermonDate: string; // YYYY-MM-DD
  preacher: string;
  internalName: string; // NEW — required by validateSermonForEntry
  durationSeconds?: number; // NEW — optional
  serviceLabel: Record<Locale, string>; // KEPT — PDF eyebrow
  scriptureReferences?: ScriptureReference[]; // NEW — optional but validated when present
  locales: Record<"es-AR" | "en-US", SermonLocaleData>;
}
```

### 3.2 Exact values to add

**Top level.** `internalName` follows the writer's own convention at `.claude/agents/predica-writer.md:121`
(`"Prédica · <sermonDate> · <es-AR title>"`):

```json
"internalName": "Prédica · 2026-06-07 · El amor que derriba muros",
"durationSeconds": 2043
```

**`scriptureReferences`** — two entries. Both `verseContent` strings are **copied verbatim** from the
fixture's own existing `keyQuotes` arrays (R10), with the trailing `— Efesios 2:14 (RVR1960)`
attribution and the surrounding quotation marks stripped:

```json
"scriptureReferences": [
  {
    "chapter": "2",
    "fromVerse": "14",
    "es-AR": {
      "book": "Efesios",
      "verseContent": "Porque él es nuestra paz, que de ambos pueblos hizo uno, derribando la pared intermedia de separación.",
      "bibleVersion": "RVR1960"
    },
    "en-US": {
      "book": "Ephesians",
      "verseContent": "For he himself is our peace, who has made the two groups one and has destroyed the barrier, the dividing wall of hostility.",
      "bibleVersion": "NIV"
    }
  },
  {
    "chapter": "2",
    "fromVerse": "19",
    "es-AR": {
      "book": "Efesios",
      "verseContent": "Ya no sois extranjeros ni advenedizos, sino conciudadanos de los santos, y miembros de la familia de Dios.",
      "bibleVersion": "RVR1960"
    },
    "en-US": {
      "book": "Ephesians",
      "verseContent": "Consequently, you are no longer foreigners and strangers, but fellow citizens with God's people and also members of his household.",
      "bibleVersion": "NIV"
    }
  }
]
```

Derived dedup keys (`buildBibleVerseInternalName`, `build-sermon-entry.mjs:98-101`):
`"Efesios 2:14 (RVR1960)"` and `"Efesios 2:19 (RVR1960)"`.

**Per-locale additions.** `seoTitle` lengths are given because the ≤60 limit is validated:

| Field            | `es-AR`                                                                                                                         | `en-US`                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seoTitle`       | `El amor que derriba muros — Efesios 2` (37c)                                                                                   | `The love that breaks down walls — Ephesians 2` (44c)                                                                                                |
| `excerpt`        | `En Efesios 2, Pablo anuncia que Cristo mismo es nuestra paz: su cruz derriba el muro que nos separa de Dios y entre nosotros.` | `In Ephesians 2, Paul announces that Christ himself is our peace: his cross tears down the wall between us and God, and between us and one another.` |
| `seoDescription` | `Cristo es nuestra paz: en Efesios 2 la cruz derriba el muro de separación y forma una nueva humanidad reconciliada.`           | `Christ is our peace: in Ephesians 2 the cross tears down the dividing wall and forms one new, reconciled humanity.`                                 |
| `keywords`       | `["Efesios 2", "reconciliación", "paz", "unidad", "nueva humanidad"]`                                                           | `["Ephesians 2", "reconciliation", "peace", "unity", "new humanity"]`                                                                                |

The implementer MUST assert both `seoTitle` values are ≤60 characters rather than trusting the counts
above.

---

## 4. API Changes

None. No route handler, no Server Action, no Zod schema, no public surface.

The only interface that changes is the internal shape of `CASES` inside `__smoke__.mjs`:

```js
/**
 * usesOutDir  — pass `--out <tmpdir>` and assert file outputs (renderers).
 * outputs     — filenames that must exist and be >= MIN_BYTES.
 * stdoutIncludes — substring the script must print (validators, which write to stdout).
 */
const CASES = [
  {
    script: "build-predica-pdf.mjs",
    args: [],
    usesOutDir: true,
    outputs: ["predica.es-AR.pdf", "predica.en-US.pdf"],
  },
  {
    script: "build-predica-featured.mjs",
    args: ["--no-ai"],
    usesOutDir: true,
    outputs: ["featured.png"],
  },
  {
    script: "build-sermon-entry.mjs",
    args: [],
    usesOutDir: false,
    outputs: [],
    stdoutIncludes: "sermon.json: VALID",
  },
];
```

The existing loop hardcodes `[scriptPath, FIXTURE, ...args, "--out", outDir]`; `--out` becomes
conditional on `usesOutDir`.

---

## 5. New / Modified Files

### Modified

| File                                                      | Change                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/scripts/predica/__fixtures__/sample-sermon.json` | Add `internalName`, `durationSeconds`, `scriptureReferences[]`; add `excerpt`/`seoTitle`/`seoDescription`/`keywords[]` per locale; remove `lead`/`keyQuotes`/`scriptureHeadline`/`closing` per locale; keep `scriptureRefs`, `serviceLabel`, `content[]` untouched |
| `.claude/scripts/predica/__smoke__.mjs`                   | Per-case `usesOutDir` + optional `stdoutIncludes`; add the `build-sermon-entry.mjs` case; update the header comment                                                                                                                                                |
| `docs/architecture/contributing.md` (§ CI jobs, ~L44-58)  | Describe the widened `predica-scripts` gate — it now also validates the fixture against the Contentful-entry schema                                                                                                                                                |

### New

None.

### Deleted

None. **`sample-sermon.json` is NOT deleted** — see §0.

---

## 6. Component Hierarchy

Not applicable — no UI in this ticket.

---

## 7. Edge Cases

1. **The new smoke case silently never runs.** A case whose script path is wrong would `spawnSync`-fail
   and be caught (`res.error`), but a case accidentally dropped from `CASES` would not. Mitigated by
   the mandatory negative check in §9.2 and by `stdoutIncludes` (R7).
2. **`seoTitle` grows past 60 chars.** Validator error `locales.<loc>.seoTitle: must be <= 60 chars`.
   Caught by the new smoke case. Values chosen well under the limit.
3. **Removing `scriptureRefs` by accident** while removing the other four. Would blank the featured
   card's meta line and pass the byte-floor check. Guarded by R4 and by an explicit post-edit assertion
   that `scriptureRefs` still exists in both locales.
4. **`content[]` accidentally reformatted.** Would change PDF bytes. Guarded by R5 — the diff for the
   `content` key must be empty; verify with `jq` equality against `git show HEAD:<path>`.
5. **`build-sermon-entry.mjs` gains a network dependency later.** Would make CI flaky. Out of scope,
   but the header comment on the new case records the hermeticity assumption so a future change has to
   confront it.
6. **Prettier reformats the fixture on commit.** Root `lint-staged` globs `*.{json,md,css,yaml,yml}`,
   so the staged JSON is auto-formatted. Run `pnpm exec prettier --write` on the fixture before
   committing so the committed bytes match what the hook would produce (ICR-155 lesson).
7. **`jq` reorders keys.** If the implementer edits via `jq`, key order changes and the diff becomes
   unreadable. Prefer a direct textual edit (Edit tool) to keep the diff minimal and reviewable.
8. **A dry-run summary line dereferences a missing field.** `main()` at `:367` reads
   `ld.seoTitle.length` unguarded — but validation runs first and rejects a missing `seoTitle`, so this
   is unreachable. No action.

---

## 8. i18n

No user-facing strings; `public/locales/*.json` is untouched.

The fixture itself is bilingual and both locales (`es-AR`, `en-US`) must carry every new field —
enforced by `validateSermonForEntry`, which loops `PREDICA_LOCALES` and reports per-locale errors.
Spanish is the source locale, matching the repo default.

---

## 9. Testing Strategy

### 9.1 Positive

| Check                        | Command                                                                                                               | Expected                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Both validators via the gate | `pnpm predica:smoke`                                                                                                  | exit 0; **3** cases reported                                                    |
| Entry validator directly     | `node .claude/scripts/predica/build-sermon-entry.mjs .claude/scripts/predica/__fixtures__/sample-sermon.json`         | exit 0; `sermon.json: VALID ✓`; `scriptureRefs: 2`                              |
| bibleVerse derivation        | `node .claude/scripts/predica/build-sermon-entry.mjs <fixture> --bible`                                               | 2 entries; `internalName` = `Efesios 2:14 (RVR1960)` / `Efesios 2:19 (RVR1960)` |
| `content[]` untouched        | `diff <(git show HEAD:<fixture> \| jq -S '.locales["es-AR"].content') <(jq -S '.locales["es-AR"].content' <fixture>)` | empty (both locales)                                                            |
| `scriptureRefs` retained     | `jq -e '.locales["es-AR"].scriptureRefs and .locales["en-US"].scriptureRefs' <fixture>`                               | exit 0                                                                          |
| Regression stack             | `pnpm type-check && pnpm lint && pnpm test`                                                                           | all pass (unaffected)                                                           |

### 9.2 Negative — MANDATORY

A new gate that cannot fail is not a gate. Prove the third case actually bites:

```bash
cp <fixture> /tmp/icr116-backup.json
jq 'del(.internalName)' /tmp/icr116-backup.json > <fixture>
pnpm predica:smoke        # MUST exit 1 and name build-sermon-entry.mjs
cp /tmp/icr116-backup.json <fixture>
pnpm predica:smoke        # MUST exit 0 again
```

Record both outputs as evidence. Do not skip this — per the ICR-155 lesson, guard checks that exit
non-zero for the _wrong reason_ look identical to guard checks that work.

### 9.3 Not applicable

- **Vitest**: `pnpm test` never globs `.claude/**` (§0). No unit test is added there; the smoke script
  _is_ the test harness for this file, and it is already CI-wired.
- **Playwright / browser QA**: no rendered surface. `qaType` is `chore`.

---

## 10. Implementation Checkpoints

### Checkpoint 1 — Widen the smoke harness (RED first)

- **Files:** `.claude/scripts/predica/__smoke__.mjs`
- **Do:** Add `usesOutDir` + `stdoutIncludes` per case; make `--out` conditional; add the
  `build-sermon-entry.mjs` case; update the header comment to say the gate now covers both the render
  path and the entry schema.
- **Verify:** `pnpm predica:smoke` MUST now **fail** (exit 1) naming `build-sermon-entry.mjs` with the
  9 schema errors. This is the intended RED — the harness is correct and the fixture is not yet fixed.
- **Commit:** `test(ICR-116): gate the predica fixture against the sermon-entry schema`

### Checkpoint 2 — Bring the fixture up to the current schema (GREEN)

- **Files:** `.claude/scripts/predica/__fixtures__/sample-sermon.json`
- **Do:** Apply §3.2 exactly — add the top-level and per-locale fields, remove the four dead fields,
  keep `scriptureRefs`. Textual edit, not `jq` (edge case 7). Run
  `pnpm exec prettier --write` on the file (edge case 6).
- **Verify:** all of §9.1, then the full §9.2 negative check. Confirm `content[]` diff is empty for
  both locales.
- **Commit:** `chore(ICR-116): refresh the predica sample-sermon fixture to the current schema`

### Checkpoint 3 — Documentation

- **Files:** `docs/architecture/contributing.md`
- **Do:** Update the `predica-scripts` paragraph: the job now runs three scripts, and the third
  guards the fixture against `validateSermonForEntry` so the committed fixture cannot drift away from
  the publisher contract. Keep the existing ICR-145 rationale intact.
- **Verify:** `pnpm format:check`; re-read the section for accuracy against the shipped code.
- **Commit:** `docs(ICR-116): note the widened predica-scripts CI gate`

> Three checkpoints, well under the 8-checkpoint split threshold.

---

## 11. Open Questions

1. **Changeset?** Expected **no** — this touches no `apps/*` or `packages/*` package, and root is
   frozen (`docs/architecture/versioning.md`). The implementer must confirm against
   `docs/architecture/contributing.md` and CI; if a changeset is required for any PR, add an empty one.
2. **`toVerse` stays uncovered.** Both `scriptureReferences` entries are single-verse, so the
   `toVerse` branch of `buildBibleVerseInternalName` (`:99`) is not exercised by the fixture.
   Deliberate: covering it honestly would need verbatim multi-verse text that is not already committed
   in this repo, and fabricating scripture to win branch coverage is not acceptable (R10). The branch
   _is_ covered by the TypeScript twin's unit tests. Flagged rather than silently skipped.
3. **`internalName` convention is by example, not by spec.** Taken from
   `.claude/agents/predica-writer.md:121`. If a canonical rule is ever written down, the fixture should
   follow it.
4. **The PDF ignores `bibleVersion` and hardcodes a per-locale label — surfaced by this ticket, not
   caused by it.** `renderScriptureReferences` (`build-predica-pdf.mjs:197`) builds its reference line
   from `L.bibleVersion`, a fixed label in `LABELS[locale]` (`NVI` for `es-AR`, `NIV` for `en-US`), and
   never reads the per-reference `bibleVersion`. The JSDoc at `:183-184` states this is deliberate
   ("Uses the FIXED localized version label") and mirrors the website's `ScriptureReferences`.

   The consequence is now visible for the first time, because until this ticket the fixture had no
   `scriptureReferences` and the function returned `""`. For the same verse, this repo now emits two
   contradicting claims: the derived Contentful dedup key says **`Efesios 2:14 (RVR1960)`**
   (`buildBibleVerseInternalName` reads the real data), while the PDF prints **`Efesios 2:14 (NVI)`**.
   RVR1960 and NVI are different translations, so one of them is misattributing the text.

   The fixture deliberately keeps `RVR1960`, because that is genuinely the translation of the
   `verseContent` strings it carries (they were copied verbatim from the fixture's own `keyQuotes`,
   which were explicitly attributed to RVR1960). Relabelling the data to `NVI` to match the renderer
   would make the fixture _look_ consistent by making it _false_ — and no NVI text is committed in this
   repo to swap in honestly (R10).

   **Deliberately out of scope here** — the fix is a product decision, not a fixture decision: either
   the renderer should read `bibleVersion`, or the house standard really is NVI/NIV and the data model
   should stop carrying a per-verse version. Either answer changes the PDF _and_ the public website
   component. Raised for triage as its own issue.
