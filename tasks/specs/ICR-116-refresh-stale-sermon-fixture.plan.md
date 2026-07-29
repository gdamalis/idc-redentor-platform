# ICR-116 — Refresh the predica `sample-sermon.json` fixture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the committed `/predica` fixture satisfy **both** sermon validators, and widen the existing CI smoke gate so it can never silently drift from the publisher contract again.

**Architecture:** Three files, no product surface. First widen `__smoke__.mjs` with a third, hermetic case that runs the Contentful-entry validator against the committed fixture — this lands **deliberately red**. Then bring the fixture up to the current schema, which turns it green. Then document the widened gate. The fixture's `content[]` blocks and its live `scriptureRefs` array are preserved byte-for-byte so the PDF and featured-image outputs do not change.

**Tech Stack:** Node 22 ESM (`.mjs`, no build step), plain JSON fixture, pnpm + Turborepo workspace, GitHub Actions (`predica-scripts` job).

**Spec:** `tasks/specs/ICR-116-refresh-stale-sermon-fixture.md` — read §0 and §1.2 before starting.

## Global Constraints

- **Worktree:** all work happens in `/Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-116` on branch `chore/ICR-116-refresh-stale-sermon-fixture`. Never commit to `main`.
- **`scriptureRefs` is LIVE — never remove it.** It is read by `build-predica-featured.mjs:82` (`pickPrimaryScripture`, called at `:342`) to build the featured card's scripture meta line. Only `lead`, `keyQuotes`, `scriptureHeadline`, and `closing` are dead.
- **`content[]` must not change.** Not reordered, not reformatted, not re-indented. It is the PDF's entire body.
- **Scripture text is copied verbatim** from strings already committed in this repo. Never compose, translate, or paraphrase a Bible verse to fill a field.
- **`seoTitle` ≤ 60 characters** in both locales (`build-sermon-entry.mjs:260-261`).
- **Never use `--no-verify`.** The husky pre-commit hook runs `lint-staged`; let it.
- **Conventional Commits**, header ≤ 100 chars, scoped `(ICR-116)`.
- **Fixture path** (referred to below as `$FIXTURE`): `.claude/scripts/predica/__fixtures__/sample-sermon.json`
- Run all commands from the **worktree root** unless stated otherwise.

---

## File Structure

| File                                                      | Responsibility                                                                                                    | Task |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---- |
| `.claude/scripts/predica/__smoke__.mjs`                   | The CI gate. Owns _which_ scripts run against the fixture and _what_ counts as proof each one really ran.         | 1    |
| `.claude/scripts/predica/__fixtures__/sample-sermon.json` | The single committed sermon fixture. Must be simultaneously a valid PDF input and a valid Contentful-entry input. | 2    |
| `docs/architecture/contributing.md`                       | Explains the `predica-scripts` CI job to contributors.                                                            | 3    |

---

### Task 1: Widen the smoke harness (lands RED)

**Files:**

- Modify: `.claude/scripts/predica/__smoke__.mjs:1-15` (header comment), `:28-39` (`CASES`), `:55-92` (the loop)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: a `CASES` entry shape that Task 2 depends on being already wired —
  `{ script: string, args: string[], usesOutDir: boolean, outputs: string[], stdoutIncludes?: string }`.
  Cases with `usesOutDir: false` are invoked as `node <script> <FIXTURE> ...args` with **no** `--out` flag.

- [ ] **Step 1: Confirm the current baseline is green**

Run:

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-116
pnpm predica:smoke; echo "exit=$?"
```

Expected: `exit=0`, and **two** cases reported (`build-predica-pdf.mjs` → 2 PDFs, `build-predica-featured.mjs` → `featured.png`). If this is already failing, stop and report — something unrelated is broken.

- [ ] **Step 2: Replace the `CASES` array**

Replace lines 28-39 of `.claude/scripts/predica/__smoke__.mjs` with:

```js
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
    // Schema gate (ICR-116). The committed fixture must stay valid for the
    // Contentful ENTRY builder, not just the renderers — the two validators are
    // different, and the fixture used to satisfy only the first.
    //
    // Hermetic: invoked with no flags this script is a pure validate-and-summarise
    // dry run (see build-sermon-entry.mjs:18) — no network, no credentials, no
    // writes — so it is safe in CI. If that ever stops being true, this case has to
    // be reconsidered rather than quietly dropped.
    script: "build-sermon-entry.mjs",
    args: [],
    usesOutDir: false,
    outputs: [],
    stdoutIncludes: "sermon.json: VALID",
  },
];
```

- [ ] **Step 3: Make `--out` conditional and add the stdout assertion**

In the loop, change the destructuring and the `spawnSync` argv (currently `:55-61`):

```js
    for (const {
      script,
      args,
      usesOutDir,
      outputs,
      stdoutIncludes,
    } of CASES) {
      const scriptPath = path.join(HERE, script);
      const res = spawnSync(
        process.execPath,
        [
          scriptPath,
          FIXTURE,
          ...args,
          ...(usesOutDir ? ["--out", outDir] : []),
        ],
        { encoding: "utf8" },
      );
```

Then, immediately **after** the existing `if (res.status !== 0) { ... continue; }` block and **before** the `for (const name of outputs)` loop, insert:

```js
      // Assert positively, same discipline as the byte-size check below: a validator
      // that printed nothing is indistinguishable from one that never ran.
      if (stdoutIncludes) {
        if (!res.stdout.includes(stdoutIncludes)) {
          fail(
            `${script}: stdout did not contain ${JSON.stringify(stdoutIncludes)}\n` +
              `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
          );
          continue;
        }
        process.stdout.write(`✓ ${script} → ${stdoutIncludes}\n`);
      }
```

- [ ] **Step 4: Update the header comment**

Replace lines 3-14 (the JSDoc body, keeping `#!/usr/bin/env node` and `/**`) with:

```
 * Regression smoke check for the root-invoked /predica harness scripts (ICR-145, ICR-116).
 *
 * Runs the render scripts (PDF + featured image) and the Contentful-entry schema
 * validator against the committed fixture, asserting each exits 0 AND produces a
 * positive signal — a non-empty output file for the renderers, an explicit stdout
 * marker for the validator.
 *
 * Two things are guarded:
 *   1. Bare-specifier resolution of "@playwright/test" from the repo root (ICR-145):
 *      before that fix these scripts died with ERR_MODULE_NOT_FOUND, because
 *      @playwright/test was installed only into apps/web/node_modules and Node's
 *      resolution walk never reaches it.
 *   2. Fixture/schema drift (ICR-116): the committed fixture must satisfy BOTH
 *      validateSermon (renderers) and validateSermonForEntry (publisher). It
 *      previously satisfied only the first, silently.
 *
 * Hermetic by construction: the featured script runs with --no-ai and the entry
 * builder runs as a dry run, so there is no network call and no API key is required.
 *
 * Usage: pnpm predica:smoke
```

- [ ] **Step 5: Run the gate and verify it now fails for the RIGHT reason**

Run:

```bash
pnpm predica:smoke; echo "exit=$?"
```

Expected: `exit=1`. Output must show the first two cases still passing (`✓ build-predica-pdf.mjs → predica.es-AR.pdf (…)` etc.), then `✗ build-sermon-entry.mjs: exited 2` quoting **9** schema errors beginning `internalName: required string`.

**This red is the point of the task** — it proves the new case actually executes and actually bites. If it exits 0, the case is not wired in; if it fails naming a _different_ script or a spawn error, stop and diagnose before continuing.

- [ ] **Step 6: Verify nothing else regressed**

Run:

```bash
pnpm type-check && pnpm lint
```

Expected: both pass. (`.mjs` harness files are linted by `eslint .`; they are not type-checked.)

- [ ] **Step 7: Commit**

```bash
git add .claude/scripts/predica/__smoke__.mjs
git commit -m "test(ICR-116): gate the predica fixture against the sermon-entry schema"
```

> Note: this commit intentionally leaves `pnpm predica:smoke` red. Task 2 turns it green in the very next commit. Do not push a branch that stops here.

---

### Task 2: Bring the fixture up to the current schema (turns it GREEN)

**Files:**

- Modify: `.claude/scripts/predica/__fixtures__/sample-sermon.json`

**Interfaces:**

- Consumes: the `build-sermon-entry.mjs` case wired up in Task 1.
- Produces: a fixture satisfying `validateSermon` (`build-predica-pdf.mjs:502-573`) **and** `validateSermonForEntry` (`build-sermon-entry.mjs:159-271`), with derived bibleVerse keys `Efesios 2:14 (RVR1960)` and `Efesios 2:19 (RVR1960)`.

- [ ] **Step 1: Snapshot the pre-edit `content[]` for both locales**

Run:

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-116
F=.claude/scripts/predica/__fixtures__/sample-sermon.json
jq -S '.locales["es-AR"].content' "$F" > /tmp/icr116-content-es.json
jq -S '.locales["en-US"].content' "$F" > /tmp/icr116-content-en.json
cp "$F" /tmp/icr116-fixture-backup.json
wc -c /tmp/icr116-content-es.json /tmp/icr116-content-en.json
```

Expected: two non-empty files. These are the guard for the "content must not change" constraint.

- [ ] **Step 2: Add the three top-level fields**

Edit `$FIXTURE` with the Edit tool (**not** `jq` — `jq` rewrites the whole file and reorders keys, making the diff unreviewable).

After the `"preacher"` line, add:

```json
  "internalName": "Prédica · 2026-06-07 · El amor que derriba muros",
  "durationSeconds": 2043,
```

Then, as a new top-level key (place it after `"serviceLabel"`, before `"locales"`), add:

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
  ],
```

Both `verseContent` values are the fixture's own existing `keyQuotes` strings with the surrounding `«»`/`""` and the trailing ` — Efesios 2:14 (RVR1960)` attribution removed. Do not retype them from memory — copy them out of the file you are editing.

- [ ] **Step 3: Add the four new per-locale fields to `es-AR`**

Inside `.locales["es-AR"]`, add:

```json
      "excerpt": "En Efesios 2, Pablo anuncia que Cristo mismo es nuestra paz: su cruz derriba el muro que nos separa de Dios y entre nosotros.",
      "seoTitle": "El amor que derriba muros — Efesios 2",
      "seoDescription": "Cristo es nuestra paz: en Efesios 2 la cruz derriba el muro de separación y forma una nueva humanidad reconciliada.",
      "keywords": ["Efesios 2", "reconciliación", "paz", "unidad", "nueva humanidad"],
```

- [ ] **Step 4: Add the four new per-locale fields to `en-US`**

Inside `.locales["en-US"]`, add:

```json
      "excerpt": "In Ephesians 2, Paul announces that Christ himself is our peace: his cross tears down the wall between us and God, and between us and one another.",
      "seoTitle": "The love that breaks down walls — Ephesians 2",
      "seoDescription": "Christ is our peace: in Ephesians 2 the cross tears down the dividing wall and forms one new, reconciled humanity.",
      "keywords": ["Ephesians 2", "reconciliation", "peace", "unity", "new humanity"],
```

- [ ] **Step 5: Remove the four dead fields from BOTH locales**

Delete these keys and their values from `.locales["es-AR"]` **and** `.locales["en-US"]`:

- `lead`
- `keyQuotes`
- `scriptureHeadline`
- `closing`

**Do NOT delete `scriptureRefs`.** It stays. It is the featured card's scripture meta line.

- [ ] **Step 6: Format, then assert the invariants**

Run:

```bash
pnpm exec prettier --write .claude/scripts/predica/__fixtures__/sample-sermon.json
F=.claude/scripts/predica/__fixtures__/sample-sermon.json

echo "--- valid JSON? ---"
jq empty "$F" && echo OK

echo "--- content[] unchanged? (both must print IDENTICAL) ---"
diff <(jq -S '.locales["es-AR"].content' "$F") /tmp/icr116-content-es.json && echo "es-AR IDENTICAL"
diff <(jq -S '.locales["en-US"].content' "$F") /tmp/icr116-content-en.json && echo "en-US IDENTICAL"

echo "--- scriptureRefs retained? ---"
jq -e '.locales["es-AR"].scriptureRefs and .locales["en-US"].scriptureRefs' "$F" >/dev/null && echo "scriptureRefs OK"

echo "--- dead fields gone? (expect no output) ---"
jq -r '.locales | to_entries[] | .key as $l | .value | keys[] | select(. == "lead" or . == "keyQuotes" or . == "scriptureHeadline" or . == "closing") | "LEFTOVER in \($l): \(.)"' "$F"

echo "--- seoTitle <= 60 chars? ---"
jq -r '.locales | to_entries[] | "\(.key): \(.value.seoTitle | length)c"' "$F"
```

Expected: `OK`; both `IDENTICAL`; `scriptureRefs OK`; **no** `LEFTOVER` lines; both `seoTitle` lengths ≤ 60.

If either `diff` reports a change, `content[]` was disturbed — restore from `/tmp/icr116-fixture-backup.json` and redo the edits without touching `content`.

- [ ] **Step 7: Run the gate — it must now be GREEN**

Run:

```bash
pnpm predica:smoke; echo "exit=$?"
```

Expected: `exit=0`, **three** cases reported, the third printing `✓ build-sermon-entry.mjs → sermon.json: VALID`.

- [ ] **Step 8: Verify the entry builder directly, including the derived verse keys**

Run:

```bash
F=.claude/scripts/predica/__fixtures__/sample-sermon.json
node .claude/scripts/predica/build-sermon-entry.mjs "$F"; echo "exit=$?"
node .claude/scripts/predica/build-sermon-entry.mjs "$F" --bible | jq -r '.[].internalName'
```

Expected: first command `exit=0` printing `sermon.json: VALID ✓` with `scriptureRefs:   2` and both locale summary lines. Second command prints exactly:

```
Efesios 2:14 (RVR1960)
Efesios 2:19 (RVR1960)
```

- [ ] **Step 9: MANDATORY negative check — prove the new gate can fail**

A gate that cannot fail is not a gate. Run:

```bash
F=.claude/scripts/predica/__fixtures__/sample-sermon.json
cp "$F" /tmp/icr116-green.json
jq 'del(.internalName)' /tmp/icr116-green.json > "$F"
pnpm predica:smoke; echo "TAMPERED exit=$?"      # MUST be 1, naming build-sermon-entry.mjs
cp /tmp/icr116-green.json "$F"
pnpm predica:smoke; echo "RESTORED exit=$?"      # MUST be 0
git diff --stat -- "$F"                           # confirm restore is byte-exact vs the edit
```

Expected: `TAMPERED exit=1` with the failure naming `build-sermon-entry.mjs` and `internalName: required string`; `RESTORED exit=0`. **Capture both outputs verbatim — they are the acceptance evidence for the ticket.**

- [ ] **Step 10: Regression stack**

Run:

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all pass. `pnpm test` is unaffected by this file (vitest never globs `.claude/**`) — this confirms no collateral damage.

- [ ] **Step 11: Commit**

```bash
git add .claude/scripts/predica/__fixtures__/sample-sermon.json
git commit -m "chore(ICR-116): refresh the predica sample-sermon fixture to the current schema"
```

---

### Task 3: Document the widened CI gate

**Files:**

- Modify: `docs/architecture/contributing.md` (the `### CI jobs (.github/workflows/pr.yml)` section, ~L44-58)

**Interfaces:**

- Consumes: the behaviour shipped in Tasks 1 and 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the current section**

Read `docs/architecture/contributing.md` lines 44-60. The existing text says `predica-scripts` "runs `pnpm predica:smoke`, which invokes `build-predica-pdf.mjs` and `build-predica-featured.mjs` against the committed fixture … and asserts both exit `0` with non-empty output", followed by the ICR-145 rationale paragraph.

- [ ] **Step 2: Update the description paragraph**

Replace the sentence describing what `predica:smoke` invokes with:

```markdown
`predica-scripts` installs Chromium (`pnpm exec playwright install --with-deps chromium`, run from the
**repo root**) and then runs `pnpm predica:smoke`, which drives three scripts against the committed
fixture (`.claude/scripts/predica/__fixtures__/sample-sermon.json`):

| Script                                   | Asserts                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `build-predica-pdf.mjs`                  | exit `0` + both locale PDFs written, each ≥ 1 KB |
| `build-predica-featured.mjs` (`--no-ai`) | exit `0` + `featured.png` written, ≥ 1 KB        |
| `build-sermon-entry.mjs`                 | exit `0` + prints `sermon.json: VALID`           |

The third case is the **schema gate** (ICR-116). The fixture has to satisfy two different validators —
`validateSermon` for the renderers and `validateSermonForEntry` for the Contentful publisher — and for a
while it satisfied only the first, silently. Because the fixture is the one committed example of the
sermon contract, letting it drift means the next person to copy it inherits an invalid document. The
entry builder is invoked with no flags, which is a pure validate-and-summarise dry run: no network, no
credentials, no writes, so it is safe to run in CI.

Note that `pnpm test` does **not** cover this file — `apps/web/vitest.config.ts` only globs `src`, `lib`,
`config`, and `scripts/**/*.mjs` under `apps/web`, so `.claude/**` is never in Vitest's scope. This job is
the only thing standing between the fixture and schema drift.
```

Keep the existing ICR-145 `@playwright/test` rationale paragraph that follows — it explains why the job exists at all.

- [ ] **Step 3: Verify formatting**

Run:

```bash
pnpm format:check
```

Expected: passes. If it flags the file, run `pnpm exec prettier --write docs/architecture/contributing.md` and re-check.

- [ ] **Step 4: Re-read for accuracy**

Confirm every claim in the new text matches what actually shipped: three scripts, the exact stdout marker `sermon.json: VALID`, the 1 KB floor (`MIN_BYTES = 1024` in `__smoke__.mjs`), and the vitest glob list (check `apps/web/vitest.config.ts` directly). Fix any mismatch — a doc that is confidently wrong is worse than no doc.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/contributing.md
git commit -m "docs(ICR-116): note the widened predica-scripts CI gate"
```

---

## Changeset

Expected: **none required.** This touches no `apps/*` or `packages/*` package; the root package is frozen (`docs/architecture/versioning.md`). Confirm by checking whether CI has a changeset gate — if `.github/workflows/` requires one on every PR, add an empty changeset via `pnpm exec changeset --empty` and commit it as `chore(ICR-116): add empty changeset`. Do not bump `@idcr/web` or `@idcr/admin` for a tooling-only change.

---

## Final Verification (run before handing back)

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-116
pnpm predica:smoke && pnpm type-check && pnpm lint && pnpm test
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: smoke green with 3 cases; type-check, lint, test all pass; exactly 3 commits; diff touches exactly 3 files.

---

## Self-Review

**Spec coverage** — every requirement maps to a step:

| Spec                                            | Covered by                                                   |
| ----------------------------------------------- | ------------------------------------------------------------ |
| R1 (`validateSermon` still passes)              | T2 S7 (smoke case 1)                                         |
| R2 (`validateSermonForEntry` passes)            | T2 S7, S8                                                    |
| R3 (remove 4 dead fields)                       | T2 S5, asserted S6                                           |
| R4 (keep `scriptureRefs`, `serviceLabel`, etc.) | T2 S5 warning, asserted S6                                   |
| R5 (`content[]` unchanged)                      | T2 S1 snapshot → S6 `diff`                                   |
| R6 (smoke runs the entry builder)               | T1 S2, S3                                                    |
| R7 (positive stdout assertion)                  | T1 S3 (`stdoutIncludes`)                                     |
| R8 (hermetic)                                   | T1 S2 comment; verified by T2 S7 running without credentials |
| R9 (docs)                                       | T3                                                           |
| R10 (verbatim scripture)                        | T2 S2 instruction to copy from the file                      |
| R11 (rewrite Jira)                              | Orchestrator, post-implementation — not an implementer task  |
| Spec §11.1 (changeset)                          | Changeset section above                                      |
| Spec §9.2 (negative check)                      | T2 S9                                                        |
| Spec edge case 6 (prettier)                     | T2 S6                                                        |
| Spec edge case 7 (avoid `jq` edits)             | T2 S2 instruction                                            |

**Placeholder scan** — no TBD/TODO; every code step carries literal content; no "similar to Task N".

**Type consistency** — the `CASES` shape defined in T1 S2 (`usesOutDir`, `outputs`, `stdoutIncludes`) is exactly what T1 S3's destructuring consumes. The stdout marker string `"sermon.json: VALID"` in T1 S2 matches the assertion in T2 S7/S8 and the doc table in T3 S2, and is a prefix of the script's real output `sermon.json: VALID ✓` (`build-sermon-entry.mjs:357`).
