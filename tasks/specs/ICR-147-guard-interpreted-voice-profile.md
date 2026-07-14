# ICR-147 — Guard `/predica` against voice-profile poisoning on interpreted sermons

**Type:** Bug (`fix`) · **QA depth:** standard · **QA type:** chore (harness/CLI/pipeline; no UI, no API route)
**Jira:** https://divinelab.atlassian.net/browse/ICR-147
**Branch:** `fix/ICR-147-guard-interpreted-voice-profile`

## Problem

On 2026-07-12 Doug Wagner preached in English while Jonathan Hanegan interpreted live into Spanish.
Whisper locked onto the interpreter's louder voice, so `transcript.txt` is **Jonathan's Spanish
rendering of Doug's English words** — not Doug's diction (it says _"Yo agarré un machete"_ where
John 18:10 has a **sword**).

`predica-voice-coach` (step 2.5) learns a preacher's style **from the corrected transcript** and
appends it to `tasks/predicas/_voices/<preacherSlug>.md`; `predica-writer` reads that profile on every
later sermon. On an interpreted sermon the coach would therefore write **the interpreter's rhetoric into
the preacher's profile** — and Zone B is append-only, so it compounds permanently and invisibly.

It must equally never be filed under the **interpreter's** profile: the interpreter is rendering someone
else's content, not preaching their own. **An interpreted transcript is a valid source for _nobody's_
voice profile.**

The 2026-07-12 run did **not** poison anything (step 2.5 was hand-skipped; `doug-wagner.md` does not
exist — re-verified in this worktree). **This ticket is prevention, not remediation. Do not seed
`doug-wagner.md` from that transcript.**

### Auto-detection is off the table — do not build a detector

A whisper language-ID sweep over the whole 21:32 recording in 30-second windows reported Spanish at
**p ≈ 0.999 in 43/43 windows** and missed Doug's English entirely, because the interpreter dominates the
mic. The pipeline **must not infer** "is this interpreted?" from audio. It is **human-declared**.

### Why a prose guard is not enough

`predica-voice-coach` is a **pure-prose agent** (`tools: Read, Write, Edit` — no Bash, no backing script).
Telling it "refuse interpreted runs" in markdown is unenforceable and untestable; AC 2 ("a Vitest test
proves…") is literally unsatisfiable against the code as it stands. This spec's core move is to **create a
code seam** so the guard is executed, not merely requested.

## Dependencies check

| Needs                                              | State                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator can run Bash/`node` mid-pipeline      | ✅ already does — `predica.md` §3 runs `node <entryBuilder> sermon.json`, §0.3 the tooling check, §0.5 `shasum`                                                                                                                                           |
| A TS↔`.mjs` mirror convention to follow            | ✅ `sermonEntry.ts` ↔ `build-sermon-entry.mjs` (TS canonical + tested; `.mjs` executed)                                                                                                                                                                   |
| An existing slugify/transliterate impl to reuse    | ❌ **none in the repo** (grepped `slugify`/`NFD`/combining-marks across `apps/web`, `.claude/scripts`, `packages` — zero hits). The rule is prose-only in `predica.md`, `predica-writer.md`, and the voice-profiles doc. `slugifyPersonName` is new code. |
| Contentful `audioLanguages` / `interpreter` fields | ❌ do not exist — **out of scope** (ICR-149)                                                                                                                                                                                                              |
| Zod                                                | ❌ not used in this pipeline — validators are hand-rolled and mirrored by hand                                                                                                                                                                            |

**Structural constraint:** `apps/web` is the Vercel **Root Directory**. App code importing out of
`apps/web` into `.claude/` would break the production build, so a TS↔`.mjs` duplication for anything the
orchestrator must execute is **forced**, not stylistic. We therefore bind the two halves with a parity
test rather than pretend the duplication away.

## Decisions taken at the design gate

1. **Guard seam** — canonical TS + `.mjs` twin + **a parity test** that pushes one case table through
   both and asserts identical verdicts. The house convention today holds `sermonEntry.ts` ↔
   `build-sermon-entry.mjs` together with a `MUST mirror` comment and nothing else; silent divergence in a
   mirrored validator is the same class of invisible-compounding bug this ticket exists to kill, so the
   new mirror gets a real binding.
2. **Writes blocked, reads allowed.** The guard is a **write**-guard. If a preacher already has a profile
   learned from sermons they preached **themselves**, that profile is their authentic voice — reading it
   makes an interpreted sermon sound _more_ like them, not less. The poison is the transcript, not the
   pre-existing profile. (No such profile exists today, so near-term behavior is identical either way;
   this decides the future case.)
3. **Correction license: scripture quotations only.** Where the sermon quotes or directly references a
   verse, the writer uses the canonical **NVI** (es-AR) / **NIV** (en-US) wording — so _machete_ becomes
   _espada_ **because Scripture says so**, never because the model preferred it. The preacher's argument,
   illustrations, and phrasing are **never** rewritten. Doctrine-adjacent license stays narrow and
   auditable.

## Requirements

1. **Flags** (`.claude/commands/predica.md` §0.2, beside `--dry-run`):
   - `--interpreted` → boolean.
   - `--interpreter "<Full Name>"` → string.
   - `--interpreter` **implies** `--interpreted`. The implication only ever runs toward **more** guarding.
   - `--interpreted` without a name: the guard **still fires** (it keys on `interpreted`, not the name);
     the orchestrator asks the human for the interpreter's name once, because `sermon.json` and the
     WhatsApp credit need it. Missing name never weakens the guard.

2. **Typed guard helper** — new `apps/web/src/utils/predica/voiceProfile.ts`:

   ```ts
   export interface VoiceLearnRun {
     interpreted: boolean;
     preacher: string;
   }

   export type VoiceLearnDecision =
     | { ok: true; preacherSlug: string }
     | { ok: false; reason: "interpreted" | "missing-preacher" };

   /** Transliterate → lowercase → dash-collapse. First real impl of the prose rule. */
   export function slugifyPersonName(name: string): string;

   /** Effective interpreted-ness: the flag OR the persisted sermon.json. Fail-closed. */
   export function resolveInterpreted(input: {
     flag?: boolean;
     sermon?: { interpreted?: boolean } | null;
   }): boolean;

   /** The guard. Refuses whenever `interpreted` is true — for ANY `preacher` value. */
   export function canLearnVoiceFrom(run: VoiceLearnRun): VoiceLearnDecision;
   ```

   - `canLearnVoiceFrom` refuses on `interpreted: true` **regardless of whose name is passed**. That is
     what makes "a valid source for _nobody's_ profile" true **by construction**: there is no name a
     caller can supply that yields a write. Covers the preacher and the interpreter with one rule.
   - `resolveInterpreted` is the forgotten-flag acceptance criterion **in code**: on a regenerate it ORs
     the flag with the persisted `sermon.json`, so omitting the flag cannot silently re-open the hole.
   - `missing-preacher`: empty/whitespace name → refuse (it cannot name a profile file). Fail-closed.
   - `slugifyPersonName`: NFD-normalize, strip combining marks, lowercase, non-alphanumerics → `-`,
     collapse runs, trim edges. `"Jonathan Hanegán"` → `jonathan-hanegan`.

3. **Executable twin** — new `.claude/scripts/predica/check-voice-learn.mjs`:

   ```
   node .claude/scripts/predica/check-voice-learn.mjs \
     --preacher "Doug Wagner" [--interpreted] [--sermon <path/to/sermon.json>]
   ```

   - Prints the decision as JSON on stdout.
   - **Exit 0** = may learn · **exit 3** = refuse · **exit 2** = usage error.
   - `--sermon <path>` (the regenerate path) is read and OR-ed in via the mirrored `resolveInterpreted`.
   - Hand-mirrors `voiceProfile.ts` and carries a `MUST mirror` header — **bound by the parity test**.

4. **Orchestrator gate** (`predica.md` §2.5): before dispatching `predica-voice-coach`, run the twin.
   On exit 3, **skip the agent** and print plainly why, e.g.:

   > Step 2.5 **SKIPPED** — interpreted sermon (Jonathan Hanegan interpreted for Doug Wagner). An
   > interpreted transcript is a valid source for **no** voice profile — not the preacher's, not the
   > interpreter's. `tasks/predicas/_voices/` is untouched.

   The step's existing **non-blocking** semantics are unchanged.

5. **Fail-closed on guard failure.** If the twin is missing, crashes, or returns anything unparseable,
   **skip the coach**. Skipping costs a profile append the next run redoes; a wrong append is
   append-only and permanent. The asymmetry decides it. (This is the one place the pipeline prefers
   losing work over risking corruption.)

6. **`sermon.json` provenance** — `interpreted: boolean`, `interpreter: { name: string } | null`.
   Both **optional** for back-compat: absent ⇒ `interpreted: false`, so every existing `sermon.json`
   stays valid. Extend **in lockstep**:
   - `validateSermonForEntry()` (`.claude/scripts/predica/build-sermon-entry.mjs:155`)
   - `SermonDocument` (`apps/web/src/utils/predica/sermonEntry.ts:98`)

   Validator rules (mirroring the existing `additionalPreachers` style):
   - `interpreted`: must be a boolean when present.
   - `interpreter`: must be an object with a non-empty `name` string when present.
   - **When `interpreted === true`, `interpreter.name` is required and non-empty.**

   These fields stay **in `sermon.json` only** — they are **not** written to Contentful (ICR-149 owns the
   `audioLanguages` / `interpreter` content-model fields, which do not exist yet).

7. **Writer provenance** (`.claude/agents/predica-writer.md`): receives `interpreted` + `interpreter`;
   **must** emit both into `sermon.json`; **must not** treat the transcript's surface phrasing as the
   preacher's voice; applies the **scripture-quotation-only** correction license (Decision 3); may still
   read a pre-existing voice profile (Decision 2).

8. **WhatsApp credit** (`.claude/agents/predica-whatsapp.md`): when `interpreted`, credit the interpreter
   from `sermon.json.interpreter.name` — **driven by the structured field**, not improvised prose.
   Hardcoded es-AR (this text is es-AR-only by design). **No `public/locales/*.json` edit** ⇒ the
   `i18n-messages` sensitive area is **not** touched.

9. **Agent backstop** (`.claude/agents/predica-voice-coach.md`): defense in depth — if the run is
   interpreted, return `{ ok: false, reason: "interpreted" }` and write nothing. **The enforceable guard
   is the code**; this is the belt to its braces.

10. **Docs** (`docs/architecture/predica-voice-profiles.md`): the interpreted-sermon exclusion beside
    "The one rule that makes it work" (~line 21); an interpreted transcript is a valid source for **no**
    profile; **why auto-detection is untrustworthy** (43/43 windows, p ≈ 0.999 Spanish, English missed);
    update the Guardrails + Files sections.

## Data model changes

No database, no Contentful model change. One local JSON contract (`sermon.json`) gains two optional
fields, mirrored across the TS interface and the hand-rolled validator:

```ts
export interface SermonDocument {
  // … existing …
  /** True when the audio is a live interpretation — the transcript is the INTERPRETER's speech. */
  interpreted?: boolean;
  /** The live interpreter. NOT a preacher; never added to additionalPreachers. */
  interpreter?: { name: string } | null;
}
```

> The interpreter is **not** a preacher. `additionalPreachers` semantics are untouched (explicitly out of
> scope).

## API changes

None. No route handler, no Server Action, no Zod schema. The only new "interface" is the CLI contract of
`check-voice-learn.mjs` (flags in, JSON + exit code out) specified in Requirement 3.

## New files

| File                                                     | Purpose                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/web/src/utils/predica/voiceProfile.ts`             | Canonical typed guard: `slugifyPersonName`, `resolveInterpreted`, `canLearnVoiceFrom` |
| `apps/web/src/utils/predica/voiceProfile.test.ts`        | Unit proof (**AC 2**)                                                                 |
| `apps/web/src/utils/predica/voiceProfile.parity.test.ts` | Runs one case table through **both** impls; asserts identical verdicts                |
| `.claude/scripts/predica/check-voice-learn.mjs`          | The twin the orchestrator actually executes                                           |

## Modified files

| File                                             | Change                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `.claude/commands/predica.md`                    | §0.2 parse `--interpreted` / `--interpreter`; §2.5 run the guard + skip-with-reason; §3 thread provenance to the writer |
| `.claude/agents/predica-writer.md`               | Accept provenance; emit `interpreted`/`interpreter`; scripture-quotation-only correction license                        |
| `.claude/agents/predica-voice-coach.md`          | Backstop refusal on interpreted runs                                                                                    |
| `.claude/agents/predica-whatsapp.md`             | Interpreter credit driven by the structured field                                                                       |
| `.claude/scripts/predica/build-sermon-entry.mjs` | `validateSermonForEntry()` accepts + cross-validates the two fields                                                     |
| `apps/web/src/utils/predica/sermonEntry.ts`      | `SermonDocument` gains the two fields                                                                                   |
| `docs/architecture/predica-voice-profiles.md`    | Exclusion + no-detector rationale + Guardrails/Files                                                                    |

## Control flow (step 2.5)

```
predica.md §0.2  --interpreted / --interpreter "<name>"   (--interpreter implies --interpreted)
        │
        ▼
predica.md §2.5  node check-voice-learn.mjs --preacher "<p>" [--interpreted] [--sermon sermon.json]
        │                    │
        │                    ├── resolveInterpreted(flag OR persisted sermon.json)   ← forgotten-flag AC
        │                    └── canLearnVoiceFrom({ interpreted, preacher })
        │
        ├── exit 0  { ok:true, preacherSlug }  ──► dispatch predica-voice-coach   (normal path, unchanged)
        ├── exit 3  { ok:false, reason }       ──► SKIP the coach, print why      (_voices/ untouched)
        └── crash / unparseable                ──► SKIP the coach  (FAIL-CLOSED)
```

## Edge cases

1. **Regenerate without the flag** — `sermon.json` persists `interpreted: true`; `resolveInterpreted`
   ORs it in ⇒ still refused. A forgotten flag cannot re-open the hole. _(AC 4)_
2. **Neither flag nor `sermon.json`** — `interpreted: false` ⇒ the coach runs exactly as today. No
   regression to the normal path. _(AC 5)_
3. **`--interpreted` with no `--interpreter`** — guard still refuses; orchestrator asks once for the
   name (needed by `sermon.json` + WhatsApp). The missing name never weakens the guard.
4. **`--interpreter "X"` without `--interpreted`** — treated as interpreted (implication runs toward more
   guarding).
5. **Empty/whitespace preacher** — `{ ok: false, reason: "missing-preacher" }`; no profile write.
6. **Guard script missing/crashing** — fail **closed**: skip the coach (Requirement 5).
7. **Interpreted run, preacher HAS an existing genuine profile** — the writer may still **read** it
   (Decision 2); the coach still may not **write**.
8. **Accented / multi-part names** — `"Jonathan Hanegán"` → `jonathan-hanegan`; verified by unit test.
9. **Legacy `sermon.json` without the fields** — valid; treated as not interpreted (back-compat).
10. **`interpreted: true` but `interpreter` missing in `sermon.json`** — `validateSermonForEntry()`
    **rejects** it, so the entry-builder gate at §3 catches a half-populated document.

## i18n

**None.** No `public/locales/{es-AR,en-US}.json` edit. The WhatsApp interpreter credit is hardcoded es-AR
prose inside the agent (that text is es-AR-only by design), so the `i18n-messages` sensitive area is not
touched.

## Testing strategy

**Unit (`voiceProfile.test.ts`)** — the AC-2 proof:

| Case                                                                              | Expect                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `interpreted: true`, preacher = `"Doug Wagner"`                                   | `{ ok: false, reason: "interpreted" }` — no write for the **preacher**           |
| `interpreted: true`, preacher = `"Jonathan Hanegan"` (the interpreter's own name) | `{ ok: false, reason: "interpreted" }` — no write for the **interpreter** either |
| `interpreted: false`, preacher = `"Jonathan Hanegan"`                             | `{ ok: true, preacherSlug: "jonathan-hanegan" }` — normal path intact            |
| `resolveInterpreted({ flag: undefined, sermon: { interpreted: true } })`          | `true` — regenerate-without-flag                                                 |
| `resolveInterpreted({ flag: true, sermon: null })`                                | `true`                                                                           |
| `resolveInterpreted({ flag: undefined, sermon: null })`                           | `false`                                                                          |
| preacher = `""` / `"   "`                                                         | `{ ok: false, reason: "missing-preacher" }`                                      |
| `slugifyPersonName("Jonathan Hanegán")`                                           | `"jonathan-hanegan"`                                                             |

**Parity (`voiceProfile.parity.test.ts`)** — the same case table executed through `check-voice-learn.mjs`
(spawned via `node`), asserting the twin's JSON + exit code agree with the TS verdict on every row. The
mirror cannot drift without a red test.

**Validator** — `validateSermonForEntry()` accepts a well-formed interpreted document, accepts a legacy
document with neither field, and **rejects** `interpreted: true` with no `interpreter.name`.

> ⚠️ **The committed fixture cannot serve as the valid-document baseline.** Verified in this worktree:
> `node build-sermon-entry.mjs .claude/scripts/predica/__fixtures__/sample-sermon.json` exits **2** with 9
> schema errors _today, before any change_ — it is a **PDF-oriented** fixture (no `internalName`; no
> `excerpt` / `seoTitle` / `seoDescription` / `keywords` in either locale). This is a **pre-existing** gap
> (same family as ICR-145's impossible AC), **not** something ICR-147 introduces or fixes. The validator
> test therefore builds its **own minimal valid sermon document inline** (a fixture factory in the test) and
> mutates it per case. **No plan step may assert "exit 0 on the committed fixture."** Logged as a stray
> observation for triage.

**Manual smoke** — `pnpm test` green (baseline 508 → 508 + new); `node check-voice-learn.mjs` by hand for
exit 0 / exit 3. **No live `/predica` run is required** and none should be performed against real audio as
part of this ticket.

**Playwright:** none. `qaType: chore` — no UI, no API route, no deployed surface. `config.playwrightProjectMap`
maps none of the touched paths.

## Implementation checkpoints

### CP1 — the guard seam (TDD)

**Files:** `apps/web/src/utils/predica/voiceProfile.ts`, `voiceProfile.test.ts`
Write the failing unit table first, then the helper. Verify: `pnpm test` green, `pnpm type-check`, `pnpm lint`.
**Commit:** `fix(ICR-147): add the typed voice-learn guard for interpreted sermons`

### CP2 — the executable twin + parity binding

**Files:** `.claude/scripts/predica/check-voice-learn.mjs`, `apps/web/src/utils/predica/voiceProfile.parity.test.ts`
Mirror the helper; bind it with the parity test (must fail if the twin diverges — prove that by
temporarily breaking the twin, then restore). Verify: `pnpm test` green; `node check-voice-learn.mjs`
exits 0 / 3 by hand.
**Commit:** `fix(ICR-147): add the check-voice-learn CLI twin and a parity test`

### CP3 — sermon.json provenance (both validators, in lockstep)

**Files:** `apps/web/src/utils/predica/sermonEntry.ts`, `.claude/scripts/predica/build-sermon-entry.mjs`
Extend `SermonDocument` + `validateSermonForEntry()`; add validator tests built on an **inline** fixture
factory (the committed fixture is invalid for this validator — see the warning above). Verify: `pnpm test`,
`pnpm type-check`; the validator's error list for a legacy document is **byte-identical** before/after the
change (proves back-compat without leaning on the broken fixture).
**Commit:** `fix(ICR-147): carry interpreted + interpreter through sermon.json and both validators`

### CP4 — orchestrator + agents (the prose layer)

**Files:** `.claude/commands/predica.md`, `.claude/agents/predica-{writer,voice-coach,whatsapp}.md`
Flags at §0.2; the guard + skip-with-reason at §2.5; provenance to the writer at §3; the coach backstop;
the WhatsApp credit. Verify: `pnpm lint`; re-read each file for internal consistency (no automated
coverage exists for prose — this is why the guard is code).
**Commit:** `fix(ICR-147): gate step 2.5 on the guard and thread interpreter provenance`

### CP5 — docs

**Files:** `docs/architecture/predica-voice-profiles.md`
Exclusion, the no-detector rationale, Guardrails + Files.
**Commit:** `docs(ICR-147): record the interpreted-sermon voice-profile exclusion`

## Security / privacy

- **Private data:** voice profiles and transcripts live under the gitignored `tasks/predicas/`. **Never**
  commit a profile; **never** paste transcript content into a PR, a Jira comment, or a doc. The names
  Doug Wagner / Jonathan Hanegan appear here only because the Jira issue already states them publicly.
- **AI prompts (sensitive):** four agent/command markdown files change. The guard is deliberately **not**
  entrusted to them — prose is the backstop, code is the enforcement.
- No secrets, no env vars, no CSP, no Mongo, no email, no PII forms.

## Open questions

- **None blocking.** The three design-gate decisions (guard seam / read-vs-write / correction scope) are
  locked above.
- Deferred by design: the existing `sermonEntry.ts` ↔ `build-sermon-entry.mjs` mirror still has **no**
  parity test (only the new one does). Widening the parity harness to the older pair is a **separate**
  ticket — flagged as a stray observation, not smuggled into this diff.
