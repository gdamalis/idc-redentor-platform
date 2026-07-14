# ICR-147 — Interpreted-Sermon Voice-Profile Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make it structurally impossible for `/predica` to write a voice profile from an interpreted
sermon's transcript — for the preacher **or** the interpreter — enforced by executed code, not agent prose.

**Architecture:** A canonical typed helper (`voiceProfile.ts`, Vitest-tested) defines the guard. A hand-
mirrored `.mjs` twin (`check-voice-learn.mjs`) is what the `/predica` orchestrator actually **runs** at step
2.5 — the same Bash-mid-pipeline pattern it already uses at step 3 for the entry builder. A **parity test**
pushes one case table through both impls so the mirror cannot silently drift. `sermon.json` carries the
provenance so a regenerate without the flag still refuses.

**Tech stack:** TypeScript (strict), Node ESM `.mjs` (no build step), Vitest, pnpm + Turborepo.

**Spec:** `tasks/specs/ICR-147-guard-interpreted-voice-profile.md` — read it first.

## Global Constraints

- **Worktree:** `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-147`, branch
  `fix/ICR-147-guard-interpreted-voice-profile`. All commands run from the worktree root.
- **Baseline:** 508 tests / 49 files green. Every task must leave the suite green; the count only grows.
- **Package manager: `pnpm`.** Type-check script is **hyphenated**: `pnpm type-check`.
- **Repo conventions:** functional style, **no classes**; failures modelled as **return values**
  (discriminated unions), never thrown `Error` subclasses for control flow; `interface` over `type` for
  object shapes; **no enums** (const maps); prefer `??` over `||`; **named exports**.
- **Commits:** Conventional Commits, header ≤ 100 chars, body lines ≤ 100 chars (commitlint **will** reject
  a long body line — it has bitten this repo before). Type is **`fix`** (Jira issue type = Bug), scope
  `ICR-147`.
- **Privacy:** `tasks/predicas/**` is gitignored and stays that way. **Never** commit a voice profile or a
  transcript; **never** paste transcript content into a commit message, PR, or Jira comment.
- **The committed fixture `.claude/scripts/predica/__fixtures__/sample-sermon.json` is INVALID for
  `validateSermonForEntry` today** (exits 2 — it is a PDF fixture). **No step may assert "exit 0 on the
  committed fixture."** Build valid documents inline instead.
- **Out of scope, do not touch:** Contentful `audioLanguages`/`interpreter` fields (ICR-149), recovering the
  original English (ICR-150), `additionalPreachers` semantics, `public/locales/*.json`.

---

## File structure

| File                                                       | Responsibility                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/utils/predica/voiceProfile.ts`               | **Canonical** guard: `slugifyPersonName`, `resolveInterpreted`, `canLearnVoiceFrom` |
| `apps/web/src/utils/predica/voiceProfile.test.ts`          | Unit proof of the guard (**AC 2**)                                                  |
| `apps/web/src/utils/predica/voiceProfile.parity.test.ts`   | Binds the twin to the canon (spawns the `.mjs`)                                     |
| `apps/web/src/utils/predica/sermonEntry.validator.test.ts` | Spawns the entry builder; proves the validator accepts/rejects/back-compats         |
| `.claude/scripts/predica/check-voice-learn.mjs`            | The twin the orchestrator **executes** at step 2.5                                  |
| `apps/web/src/utils/predica/sermonEntry.ts`                | `SermonDocument` gains `interpreted` + `interpreter`                                |
| `.claude/scripts/predica/build-sermon-entry.mjs`           | `validateSermonForEntry()` accepts + cross-validates them                           |
| `.claude/commands/predica.md`                              | Flags (§0.2), the guard gate (§2.5), writer provenance (§3)                         |
| `.claude/agents/predica-{writer,voice-coach,whatsapp}.md`  | Provenance, backstop refusal, interpreter credit                                    |
| `docs/architecture/predica-voice-profiles.md`              | The exclusion + why no detector                                                     |

---

## Task 1 — The canonical guard (CP1)

**Files:**

- Create: `apps/web/src/utils/predica/voiceProfile.ts`
- Test: `apps/web/src/utils/predica/voiceProfile.test.ts`

**Interfaces:**

- Consumes: nothing (leaf module).
- Produces: `slugifyPersonName(name: string): string`, `resolveInterpreted(input: { flag?: boolean; sermon?: { interpreted?: boolean } | null }): boolean`, `canLearnVoiceFrom(run: VoiceLearnRun): VoiceLearnDecision`, plus the `VoiceLearnRun` / `VoiceLearnDecision` types. Task 2 mirrors these **exactly** (same names, same semantics). Task 4's orchestrator prose depends on the CLI built on them.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/predica/voiceProfile.test.ts`:

```ts
/**
 * Unit tests for the voice-learn guard. An INTERPRETED sermon's transcript is the
 * interpreter's speech, not the preacher's — so it is a valid source for NOBODY's
 * voice profile. These tests are the enforceable proof of that rule (ICR-147).
 */
import { describe, it, expect } from "vitest";
import {
  canLearnVoiceFrom,
  resolveInterpreted,
  slugifyPersonName,
} from "@src/utils/predica/voiceProfile";

describe("slugifyPersonName", () => {
  it("transliterates, lowercases and dash-collapses a full name", () => {
    expect(slugifyPersonName("Jonathan Hanegan")).toBe("jonathan-hanegan");
  });

  it("strips accents (the profile filename must be ASCII-stable)", () => {
    expect(slugifyPersonName("Jonathan Hanegán")).toBe("jonathan-hanegan");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugifyPersonName("  Doug   W. Wagner  ")).toBe("doug-w-wagner");
  });

  it("returns an empty string for a name with no usable characters", () => {
    expect(slugifyPersonName("   ")).toBe("");
  });
});

describe("resolveInterpreted", () => {
  it("is true from the CLI flag alone", () => {
    expect(resolveInterpreted({ flag: true, sermon: null })).toBe(true);
  });

  it("is true from a persisted sermon.json alone — a FORGOTTEN FLAG on a regenerate cannot re-open the hole", () => {
    expect(
      resolveInterpreted({ flag: undefined, sermon: { interpreted: true } }),
    ).toBe(true);
  });

  it("is false when neither the flag nor the sermon says so (the normal path)", () => {
    expect(resolveInterpreted({ flag: undefined, sermon: null })).toBe(false);
    expect(
      resolveInterpreted({ flag: false, sermon: { interpreted: false } }),
    ).toBe(false);
  });

  it("treats a legacy sermon.json with no interpreted field as NOT interpreted (back-compat)", () => {
    expect(resolveInterpreted({ sermon: {} })).toBe(false);
  });
});

describe("canLearnVoiceFrom", () => {
  it("REFUSES an interpreted run under the PREACHER's name", () => {
    expect(
      canLearnVoiceFrom({ interpreted: true, preacher: "Doug Wagner" }),
    ).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });

  it("REFUSES an interpreted run under the INTERPRETER's own name — a valid source for NOBODY", () => {
    expect(
      canLearnVoiceFrom({ interpreted: true, preacher: "Jonathan Hanegan" }),
    ).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });

  it("allows a normal (non-interpreted) run and returns the profile slug", () => {
    expect(
      canLearnVoiceFrom({ interpreted: false, preacher: "Jonathan Hanegan" }),
    ).toEqual({
      ok: true,
      preacherSlug: "jonathan-hanegan",
    });
  });

  it("refuses when the preacher is missing — fail closed, never name a profile file from nothing", () => {
    expect(canLearnVoiceFrom({ interpreted: false, preacher: "   " })).toEqual({
      ok: false,
      reason: "missing-preacher",
    });
  });

  it("reports `interpreted` (not `missing-preacher`) when BOTH are wrong — interpretation is the stronger refusal", () => {
    expect(canLearnVoiceFrom({ interpreted: true, preacher: "" })).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });
});
```

- [ ] **Step 2: Run the test — verify it FAILS**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-147
pnpm --filter @idcr/web exec vitest run src/utils/predica/voiceProfile.test.ts
```

Expected: FAIL — `Failed to resolve import "@src/utils/predica/voiceProfile"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/utils/predica/voiceProfile.ts`:

```ts
/**
 * The voice-learn guard (ICR-147).
 *
 * An INTERPRETED sermon (a preacher speaking one language while an interpreter renders
 * it live into another) produces a transcript of the INTERPRETER's speech. Whisper locks
 * onto whoever is louder, and that is the interpreter. Such a transcript is therefore a
 * valid source for NOBODY's voice profile:
 *   - not the PREACHER's — the words are not theirs;
 *   - not the INTERPRETER's — they are rendering someone else's content, not preaching.
 *
 * `predica-voice-coach` is a pure-prose agent and cannot enforce that. This module can,
 * and the orchestrator executes it (via the .mjs twin) before dispatching the coach.
 *
 * Interpretation is HUMAN-DECLARED (`--interpreted`), never inferred from audio: a whisper
 * language-ID sweep of a known interpreted sermon reported Spanish at p≈0.999 in 43/43
 * windows and missed the preacher's English entirely. Do not build a detector.
 *
 * CANONICAL IMPL. Its executable twin is .claude/scripts/predica/check-voice-learn.mjs —
 * keep the two in sync; voiceProfile.parity.test.ts fails if they drift.
 *
 * See docs/architecture/predica-voice-profiles.md.
 */

/** One `/predica` run, as far as the voice-learn decision is concerned. */
export interface VoiceLearnRun {
  /** True when the audio is a live interpretation (human-declared, never detected). */
  interpreted: boolean;
  /** The preacher's full name, e.g. "Doug Wagner". */
  preacher: string;
}

/** Whether the voice coach may learn from this run — and if not, why not. */
export type VoiceLearnDecision =
  | { ok: true; preacherSlug: string }
  | { ok: false; reason: "interpreted" | "missing-preacher" };

/**
 * Transliterate → lowercase → dash-collapse. The profile filename must be ASCII-stable
 * ("Jonathan Hanegán" → "jonathan-hanegan"), so accents are stripped rather than encoded.
 */
export function slugifyPersonName(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The EFFECTIVE interpreted-ness of a run: the CLI flag OR the persisted sermon.json.
 *
 * The OR is the whole point. On a regenerate the human may forget `--interpreted`; the
 * sermon.json written by the first run still says so, and a forgotten flag must never be
 * able to re-open the hole.
 */
export function resolveInterpreted(input: {
  flag?: boolean;
  sermon?: { interpreted?: boolean } | null;
}): boolean {
  return input.flag === true || input.sermon?.interpreted === true;
}

/**
 * THE GUARD. Refuses whenever the run is interpreted — for ANY `preacher` value.
 *
 * That universality is deliberate: it makes "a valid source for nobody's profile" true by
 * construction. There is no name a caller can pass that yields a write on an interpreted run.
 */
export function canLearnVoiceFrom(run: VoiceLearnRun): VoiceLearnDecision {
  if (run.interpreted) return { ok: false, reason: "interpreted" };

  const preacherSlug = slugifyPersonName(run.preacher);
  if (!preacherSlug) return { ok: false, reason: "missing-preacher" };

  return { ok: true, preacherSlug };
}
```

- [ ] **Step 4: Run the test — verify it PASSES**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/voiceProfile.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Full stack green**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: type-check + lint clean; test count **508 → 521** (49 → 50 files).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/predica/voiceProfile.ts apps/web/src/utils/predica/voiceProfile.test.ts
git commit -m "fix(ICR-147): add the typed voice-learn guard for interpreted sermons"
```

---

## Task 2 — The executable twin + the parity binding (CP2)

**Files:**

- Create: `.claude/scripts/predica/check-voice-learn.mjs`
- Test: `apps/web/src/utils/predica/voiceProfile.parity.test.ts`

**Interfaces:**

- Consumes: Task 1's three functions (mirrored, not imported — `apps/web` is the Vercel Root Directory and cannot import out of itself).
- Produces: the **CLI contract** Task 4's orchestrator prose depends on:
  `node .claude/scripts/predica/check-voice-learn.mjs --preacher "<Full Name>" [--interpreted] [--interpreter "<Name>"] [--sermon <sermon.json>]`
  → JSON decision on stdout; **exit 0** = may learn · **exit 3** = refused · **exit 2** = usage/IO error.

- [ ] **Step 1: Write the failing parity test**

Create `apps/web/src/utils/predica/voiceProfile.parity.test.ts`:

```ts
/**
 * PARITY TEST (ICR-147).
 *
 * apps/web is the Vercel Root Directory, so app code cannot import out of itself into
 * .claude/. The guard therefore exists twice: the canonical TypeScript (voiceProfile.ts)
 * and the .mjs twin the /predica orchestrator actually executes. A hand-mirrored validator
 * that silently drifts from its canon is the SAME class of invisible-compounding bug this
 * ticket exists to kill — so the mirror is bound here rather than by a comment.
 *
 * Every case runs through BOTH impls; the twin's JSON + exit code must agree with the TS
 * verdict on every row. Break the twin and this goes red.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  canLearnVoiceFrom,
  type VoiceLearnDecision,
} from "@src/utils/predica/voiceProfile";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/web/src/utils/predica -> repo root is five levels up.
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const TWIN = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/check-voice-learn.mjs",
);

/** Run the twin exactly as the orchestrator does. */
function runTwin(args: string[]): {
  decision: VoiceLearnDecision;
  status: number;
} {
  const res = spawnSync("node", [TWIN, ...args], { encoding: "utf8" });
  if (res.error) throw res.error;
  return {
    decision: JSON.parse(res.stdout) as VoiceLearnDecision,
    status: res.status ?? -1,
  };
}

/** The single case table both impls must agree on. */
const CASES: Array<{
  name: string;
  interpreted: boolean;
  preacher: string;
  args: string[];
}> = [
  {
    name: "interpreted, under the preacher's name",
    interpreted: true,
    preacher: "Doug Wagner",
    args: ["--preacher", "Doug Wagner", "--interpreted"],
  },
  {
    name: "interpreted, under the interpreter's own name",
    interpreted: true,
    preacher: "Jonathan Hanegan",
    args: ["--preacher", "Jonathan Hanegan", "--interpreted"],
  },
  {
    name: "normal run",
    interpreted: false,
    preacher: "Jonathan Hanegan",
    args: ["--preacher", "Jonathan Hanegan"],
  },
  {
    name: "accented name",
    interpreted: false,
    preacher: "Jonathan Hanegán",
    args: ["--preacher", "Jonathan Hanegán"],
  },
  {
    name: "missing preacher",
    interpreted: false,
    preacher: "   ",
    args: ["--preacher", "   "],
  },
];

describe("check-voice-learn.mjs is in parity with voiceProfile.ts", () => {
  it.each(CASES)("$name", ({ interpreted, preacher, args }) => {
    const expected = canLearnVoiceFrom({ interpreted, preacher });
    const { decision, status } = runTwin(args);

    expect(decision).toEqual(expected);
    expect(status).toBe(expected.ok ? 0 : 3);
  });
});

describe("check-voice-learn.mjs CLI contract", () => {
  it("--interpreter implies --interpreted (the implication only ever runs toward MORE guarding)", () => {
    const { decision, status } = runTwin([
      "--preacher",
      "Doug Wagner",
      "--interpreter",
      "Jonathan Hanegan",
    ]);
    expect(decision).toEqual({ ok: false, reason: "interpreted" });
    expect(status).toBe(3);
  });

  it("refuses a REGENERATE that forgot the flag, reading interpreted from the persisted sermon.json", () => {
    const sermon = path.join(
      REPO_ROOT,
      "apps/web/src/utils/predica/__fixtures__/interpreted-sermon.json",
    );
    const { decision, status } = runTwin([
      "--preacher",
      "Doug Wagner",
      "--sermon",
      sermon,
    ]);
    expect(decision).toEqual({ ok: false, reason: "interpreted" });
    expect(status).toBe(3);
  });

  it("allows a regenerate of a NON-interpreted sermon.json (no regression to the normal path)", () => {
    const sermon = path.join(
      REPO_ROOT,
      "apps/web/src/utils/predica/__fixtures__/plain-sermon.json",
    );
    const { decision, status } = runTwin([
      "--preacher",
      "Jonathan Hanegan",
      "--sermon",
      sermon,
    ]);
    expect(decision).toEqual({ ok: true, preacherSlug: "jonathan-hanegan" });
    expect(status).toBe(0);
  });

  it("exits 2 on an unreadable --sermon path (a usage error, distinct from a refusal)", () => {
    const res = spawnSync(
      "node",
      [TWIN, "--preacher", "X", "--sermon", "/nope/missing.json"],
      {
        encoding: "utf8",
      },
    );
    expect(res.status).toBe(2);
  });
});
```

- [ ] **Step 2: Create the two tiny fixtures the CLI test reads**

Create `apps/web/src/utils/predica/__fixtures__/interpreted-sermon.json`:

```json
{
  "slug": "example-interpreted-sermon",
  "sermonDate": "2026-07-12",
  "preacher": "Doug Wagner",
  "interpreted": true,
  "interpreter": { "name": "Jonathan Hanegan" }
}
```

Create `apps/web/src/utils/predica/__fixtures__/plain-sermon.json`:

```json
{
  "slug": "example-plain-sermon",
  "sermonDate": "2026-07-05",
  "preacher": "Jonathan Hanegan"
}
```

> These are **guard** fixtures (only the fields `resolveInterpreted` reads), deliberately **not** full
> sermon documents. They are not the entry-builder's fixture and must not be used as one.

- [ ] **Step 3: Run the parity test — verify it FAILS**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/voiceProfile.parity.test.ts
```

Expected: FAIL — every case errors because `.claude/scripts/predica/check-voice-learn.mjs` does not exist
(`Cannot find module …check-voice-learn.mjs`, non-zero status, unparseable stdout).

- [ ] **Step 4: Write the twin**

Create `.claude/scripts/predica/check-voice-learn.mjs`:

```js
#!/usr/bin/env node
/**
 * check-voice-learn.mjs — the voice-learn guard the /predica orchestrator EXECUTES at
 * step 2.5, before dispatching predica-voice-coach (ICR-147).
 *
 * An INTERPRETED sermon's transcript is the INTERPRETER's speech, not the preacher's, so
 * it is a valid source for NOBODY's voice profile — not the preacher's, not the
 * interpreter's. predica-voice-coach is a pure-prose agent and cannot enforce that; this
 * script can, because it is run and its exit code is obeyed.
 *
 * Interpretation is HUMAN-DECLARED (--interpreted), never inferred from audio.
 * Do not build a detector: see docs/architecture/predica-voice-profiles.md.
 *
 * MUST MIRROR the canonical, Vitest-tested TypeScript at
 * apps/web/src/utils/predica/voiceProfile.ts. The parity test
 * apps/web/src/utils/predica/voiceProfile.parity.test.ts runs one case table through BOTH
 * impls and FAILS if they drift. Duplicated (not imported) because apps/web is the Vercel
 * Root Directory and cannot import out of itself — mirrors build-sermon-entry.mjs.
 *
 * Usage:
 *   node .claude/scripts/predica/check-voice-learn.mjs --preacher "<Full Name>" \
 *        [--interpreted] [--interpreter "<Full Name>"] [--sermon <path/to/sermon.json>]
 *
 * Exit codes:
 *   0 — may learn      (stdout: {"ok":true,"preacherSlug":"…"})
 *   3 — REFUSED        (stdout: {"ok":false,"reason":"interpreted"|"missing-preacher"})
 *   2 — usage/IO error (stderr: the message)
 */
import { readFileSync } from "node:fs";

const USAGE =
  'usage: check-voice-learn.mjs --preacher "<Full Name>" [--interpreted] ' +
  '[--interpreter "<Full Name>"] [--sermon <sermon.json>]';

function die(code, msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

// ── Mirrored from voiceProfile.ts ────────────────────────────────────────────

export function slugifyPersonName(name) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveInterpreted(input) {
  return input.flag === true || input.sermon?.interpreted === true;
}

export function canLearnVoiceFrom(run) {
  if (run.interpreted) return { ok: false, reason: "interpreted" };

  const preacherSlug = slugifyPersonName(run.preacher);
  if (!preacherSlug) return { ok: false, reason: "missing-preacher" };

  return { ok: true, preacherSlug };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  let preacher = "";
  let flag = false;
  let sermonPath = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--interpreted") {
      flag = true;
    } else if (arg === "--interpreter") {
      // The interpreter's NAME is irrelevant to the decision — an interpreted run is
      // refused for every name. Naming one still IMPLIES the run is interpreted, and the
      // implication only ever runs toward MORE guarding, never less.
      flag = true;
      i++;
    } else if (arg === "--preacher") {
      preacher = argv[++i] ?? "";
    } else if (arg === "--sermon") {
      sermonPath = argv[++i] ?? null;
    } else {
      die(2, `unknown argument: ${arg}\n${USAGE}`);
    }
  }

  let sermon = null;
  if (sermonPath) {
    try {
      sermon = JSON.parse(readFileSync(sermonPath, "utf8"));
    } catch (e) {
      die(2, `error: cannot read ${sermonPath}: ${e?.message ?? e}`);
    }
  }

  const interpreted = resolveInterpreted({ flag, sermon });
  const decision = canLearnVoiceFrom({ interpreted, preacher });

  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exit(decision.ok ? 0 : 3);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main();
}
```

- [ ] **Step 5: Run the parity test — verify it PASSES**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/voiceProfile.parity.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 6: PROVE the parity test can actually fail (a test that cannot fail is not a guard)**

Temporarily break the twin — in `check-voice-learn.mjs`, change `canLearnVoiceFrom`'s first line to
`if (false) return { ok: false, reason: "interpreted" };` — then:

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/voiceProfile.parity.test.ts
```

Expected: **FAIL** on the interpreted cases (the twin returns `ok:true` / exit 0 where the canon says
refuse). **Now restore the line** and re-run — PASS again. Do not commit the broken version.

- [ ] **Step 7: Exercise the CLI by hand (the contract the orchestrator relies on)**

```bash
node .claude/scripts/predica/check-voice-learn.mjs --preacher "Jonathan Hanegan"; echo "exit=$?"
node .claude/scripts/predica/check-voice-learn.mjs --preacher "Doug Wagner" --interpreted; echo "exit=$?"
```

Expected, exactly:

```
{"ok":true,"preacherSlug":"jonathan-hanegan"}
exit=0
{"ok":false,"reason":"interpreted"}
exit=3
```

- [ ] **Step 8: Full stack green, then commit**

```bash
pnpm type-check && pnpm lint && pnpm test
git add .claude/scripts/predica/check-voice-learn.mjs \
        apps/web/src/utils/predica/voiceProfile.parity.test.ts \
        apps/web/src/utils/predica/__fixtures__/interpreted-sermon.json \
        apps/web/src/utils/predica/__fixtures__/plain-sermon.json
git commit -m "fix(ICR-147): add the check-voice-learn CLI twin and a parity test"
```

---

## Task 3 — `sermon.json` provenance, both validators in lockstep (CP3)

**Files:**

- Modify: `apps/web/src/utils/predica/sermonEntry.ts` (the `SermonDocument` interface, ~line 98)
- Modify: `.claude/scripts/predica/build-sermon-entry.mjs` (`validateSermonForEntry`, ~line 155)
- Test: `apps/web/src/utils/predica/sermonEntry.validator.test.ts`

**Interfaces:**

- Consumes: nothing from Tasks 1–2 (the two halves are independent seams).
- Produces: the `sermon.json` contract Task 4's writer prose must emit —
  `interpreted?: boolean`, `interpreter?: { name: string } | null`.

- [ ] **Step 1: Write the failing validator test**

Create `apps/web/src/utils/predica/sermonEntry.validator.test.ts`:

```ts
/**
 * Validator tests for the interpreted-sermon provenance fields (ICR-147).
 *
 * validateSermonForEntry() lives ONLY in the .mjs entry builder (there is no Zod and no TS
 * twin of it), so these drive the real script the way the orchestrator does — by spawning it.
 *
 * NOTE: the committed .claude/scripts/predica/__fixtures__/sample-sermon.json is a PDF
 * fixture and does NOT satisfy this validator (verified: exit 2, 9 errors, before any change
 * in this ticket). We therefore build a minimal VALID document inline instead of leaning on it.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const BUILDER = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/build-sermon-entry.mjs",
);

/** A minimal document that satisfies validateSermonForEntry today. */
function makeSermon(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const locale = () => ({
    title: "Título",
    thesis: "Tesis",
    mainPoints: ["Punto uno"],
    excerpt: "Resumen breve",
    seoTitle: "SEO",
    seoDescription: "SEO description",
    keywords: ["fe"],
    content: [{ type: "paragraph", text: "Cuerpo" }],
  });
  return {
    slug: "un-sermon-de-ejemplo",
    sermonDate: "2026-07-12",
    preacher: "Doug Wagner",
    internalName: "2026-07-12 · Un sermón de ejemplo",
    locales: { "es-AR": locale(), "en-US": locale() },
    ...overrides,
  };
}

/** Run the real entry builder against a document; return its exit code + stderr. */
function validate(doc: Record<string, unknown>): {
  status: number;
  stderr: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "icr147-"));
  const file = path.join(dir, "sermon.json");
  writeFileSync(file, JSON.stringify(doc), "utf8");
  const res = spawnSync("node", [BUILDER, file], { encoding: "utf8" });
  return { status: res.status ?? -1, stderr: res.stderr };
}

describe("validateSermonForEntry — interpreted provenance", () => {
  it("accepts a legacy document carrying NEITHER field (back-compat)", () => {
    expect(validate(makeSermon()).status).toBe(0);
  });

  it("accepts a well-formed interpreted document", () => {
    const { status } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan" },
      }),
    );
    expect(status).toBe(0);
  });

  it("accepts an explicit non-interpreted document", () => {
    expect(validate(makeSermon({ interpreted: false })).status).toBe(0);
  });

  it("REJECTS interpreted:true with no interpreter — a half-populated document must not reach Contentful", () => {
    const { status, stderr } = validate(makeSermon({ interpreted: true }));
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS interpreted:true with a blank interpreter name", () => {
    const { status, stderr } = validate(
      makeSermon({ interpreted: true, interpreter: { name: "  " } }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS a non-boolean interpreted", () => {
    const { status, stderr } = validate(makeSermon({ interpreted: "yes" }));
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreted/);
  });
});
```

- [ ] **Step 2: Run it — verify the RIGHT tests fail**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/sermonEntry.validator.test.ts
```

Expected: the three **accepts** pass already (unknown fields are ignored today); the three **REJECTS**
**FAIL** (the validator does not know these fields yet, so it exits 0). That is precisely the hole to close.

- [ ] **Step 3: Extend the validator**

In `.claude/scripts/predica/build-sermon-entry.mjs`, inside `validateSermonForEntry()`, insert **directly
after** the closing `}` of the `if (s.additionalPreachers != null) { … }` block and **before** the
`internalName` check:

```js
// ── Interpreted-sermon provenance (ICR-147) ────────────────────────────────
// Optional + back-compatible: absent => not interpreted. When present they must be
// well-formed, and interpreted:true REQUIRES a named interpreter (the WhatsApp credit
// and the voice-learn guard both read it).
if (s.interpreted != null && typeof s.interpreted !== "boolean")
  errs.push("interpreted: must be a boolean when present");
if (s.interpreter != null) {
  if (
    typeof s.interpreter !== "object" ||
    Array.isArray(s.interpreter) ||
    typeof s.interpreter.name !== "string" ||
    !s.interpreter.name.trim()
  )
    errs.push(
      "interpreter: must be an object with a non-empty name when present",
    );
}
if (
  s.interpreted === true &&
  (s.interpreter == null || !s.interpreter?.name?.trim?.())
)
  errs.push(
    "interpreter.name: required non-empty string when interpreted is true",
  );
```

- [ ] **Step 4: Extend the TS interface in lockstep**

In `apps/web/src/utils/predica/sermonEntry.ts`, inside `interface SermonDocument`, add **directly after** the
`additionalPreachers?: …` property:

```ts
  /**
   * True when the audio is a live interpretation — the preacher spoke one language while an
   * interpreter rendered it into another, and the transcript is the INTERPRETER's speech.
   * Human-declared via `/predica --interpreted`; never detected from audio (ICR-147).
   * Gates the voice coach: an interpreted transcript is a valid source for NO voice profile.
   */
  interpreted?: boolean;
  /**
   * The live interpreter. NOT a preacher — never added to {@link SermonDocument.additionalPreachers}
   * and never linked as an `author`. Required when `interpreted` is true. Drives the WhatsApp credit.
   */
  interpreter?: { name: string } | null;
```

- [ ] **Step 5: Run the validator test — verify it PASSES**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/sermonEntry.validator.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Prove back-compat exactly (no lean on the broken fixture)**

The legacy-document case in Step 1 already proves acceptance. Additionally confirm the builder's behavior on
the **committed** fixture is _unchanged by this ticket_ — it failed before and fails identically now, with
the **same 9 errors** and **no new `interpreted`/`interpreter` error**:

```bash
node .claude/scripts/predica/build-sermon-entry.mjs .claude/scripts/predica/__fixtures__/sample-sermon.json 2>&1 | grep -cE "interpreted|interpreter"
```

Expected: `0` (our new rules add no error to a document that simply omits the fields).

- [ ] **Step 7: Full stack green, then commit**

```bash
pnpm type-check && pnpm lint && pnpm test
git add apps/web/src/utils/predica/sermonEntry.ts \
        apps/web/src/utils/predica/sermonEntry.validator.test.ts \
        .claude/scripts/predica/build-sermon-entry.mjs
git commit -m "fix(ICR-147): carry interpreted + interpreter through sermon.json and both validators"
```

---

## Task 4 — Orchestrator gate + agent prose (CP4)

**Files:**

- Modify: `.claude/commands/predica.md` (§0.2 flags · §2.5 the gate · §3 writer provenance)
- Modify: `.claude/agents/predica-voice-coach.md` (backstop refusal)
- Modify: `.claude/agents/predica-writer.md` (provenance + correction license)
- Modify: `.claude/agents/predica-whatsapp.md` (interpreter credit)

**Interfaces:**

- Consumes: Task 2's CLI contract (exit 0/3/2 + JSON stdout) and Task 3's `sermon.json` fields.
- Produces: no code surface. **These files have zero automated coverage — which is exactly why the guard is
  code and this is only its backstop.** Re-read each edited section for internal consistency.

- [ ] **Step 1: Add the flags to `.claude/commands/predica.md` §0.2**

In the bulleted list under "2. Parse `$ARGUMENTS`", **after** the `- `--dry-run` → boolean.` line, insert:

```markdown
- `--interpreted` → boolean. **Human-declared**: the preacher spoke one language while an interpreter
  rendered it live into another, so `transcript.txt` is the **interpreter's** speech, not the preacher's.
  **Never infer this from the audio** — a whisper language-ID sweep of a known interpreted sermon reported
  Spanish at p≈0.999 in 43/43 windows and missed the preacher's English entirely. Do not build a detector.
- `--interpreter "<Full Name>"` → string. **Implies `--interpreted`** (the implication only ever runs
  toward _more_ guarding, never less). If `--interpreted` is given without a name, the guard still fires —
  ask the human for the interpreter's name once, because `sermon.json` and the WhatsApp credit need it.
  The interpreter is **not** a preacher: never add them to `additionalPreachers`, never link them as an
  `author`.
```

Also update the flags summary near the top of the file (the block containing the `--dry-run` description,
~line 25) by appending:

```markdown
- **`--interpreted`** / **`--interpreter "<Full Name>"`** mark a **live-interpreted** sermon. The transcript
  is then the interpreter's speech, so **step 2.5 (voice coach) is refused** — an interpreted transcript is a
  valid source for **no** voice profile, not the preacher's and not the interpreter's (ICR-147).
```

- [ ] **Step 2: Gate §2.5 on the guard**

In `.claude/commands/predica.md`, replace the **first line** of §2.5 (`Dispatch `predica-voice-coach`with the
corrected`transcriptTxt`, …`) so the section opens with the gate, keeping the existing description below it:

````markdown
**FIRST — run the guard (Bash). It decides whether the coach runs at all:**

```bash
node .claude/scripts/predica/check-voice-learn.mjs \
  --preacher "<preacher>" \
  $( [ "$interpreted" = true ] && echo --interpreted ) \
  --sermon "<slugDir>/sermon.json"     # only if it already exists (a regenerate)
```
````

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

**If the guard allowed it:** dispatch `predica-voice-coach` with the corrected `transcriptTxt`, …

````

(Keep the rest of §2.5 — the coach's description, the reuse/dry-run notes, the NON-BLOCKING rule — as is.)

- [ ] **Step 3: Thread provenance to the writer in §3**

In `.claude/commands/predica.md` §3, extend the dispatch sentence's argument list by adding
`interpreted` + `interpreter` after `preacher`, and append this bullet under the step:

```markdown
- **Interpreted sermons.** Pass `interpreted` + `interpreter.name`. The writer must record both in
  `sermon.json`, must **not** treat the transcript's surface phrasing as the **preacher's** voice (it is the
  interpreter's), and applies the scripture-quotation-only correction license (see `predica-writer.md`). A
  pre-existing `voiceProfilePath` may still be **read** if it exists — a profile learned from the preacher's
  **own** (non-interpreted) sermons is their authentic voice. The guard blocks **writes**, not reads.
````

- [ ] **Step 4: Add the backstop to `.claude/agents/predica-voice-coach.md`**

In the "## The one rule that makes this work" section, append:

````markdown
### The second rule: NEVER learn from an interpreted sermon

If the orchestrator tells you the run is **interpreted** (`interpreted: true` — a preacher speaking one
language while an interpreter renders it live into another), **write nothing** and return:

```json
{ "ok": false, "reason": "interpreted" }
```
````

The transcript is then the **interpreter's** speech, not the preacher's. It is a valid source for **nobody's**
voice profile:

- **not the preacher's** — the words, cadence and metaphors are not theirs;
- **not the interpreter's** — they are rendering someone else's content, not preaching their own.

Zone B is **append-only**, so a wrong append is permanent and compounds into every future sermon by that
preacher. This is a backstop: the enforceable guard is code (`check-voice-learn.mjs`), which the orchestrator
runs before dispatching you. If you are ever dispatched anyway on an interpreted run, refuse.

````

- [ ] **Step 5: Add provenance + the correction license to `.claude/agents/predica-writer.md`**

In the inputs list, add:

```markdown
- `interpreted` — boolean. True when the sermon was **live-interpreted**: the transcript is the
  **interpreter's** speech, not the preacher's.
- `interpreter` — the interpreter's full name (present when `interpreted`). **Not a preacher.**
````

Then add a rule section:

```markdown
## Interpreted sermons (ICR-147)

When `interpreted` is true, the transcript is the **interpreter's** live rendering of the preacher's words.

1. **Record it.** `sermon.json` MUST carry `"interpreted": true` and `"interpreter": { "name": "<Full Name>" }`.
   Never add the interpreter to `additionalPreachers` — they are not a preacher.
2. **Do not mistake the interpreter's voice for the preacher's.** The surface phrasing, cadence and idioms in
   the transcript are the interpreter's. Editorial rule #1 ("preserve the preacher's voice") still applies to
   the preacher's _substance_ — their argument, structure and emphases — not to this wording. If no voice
   profile exists for the preacher, take the profile-less path **deliberately**: do not infer their voice from
   this transcript, because that inference would be the interpreter's voice.
3. **Correction license — scripture quotations ONLY.** Where the sermon quotes or directly references a verse,
   use the canonical **NVI** (es-AR) / **NIV** (en-US) wording for that verse. Example: the interpreter said
   _"Yo agarré un machete"_ for John 18:10, where Scripture says a **sword** — render it as _espada_, because
   **Scripture says so**. You may **NOT** rewrite the preacher's argument, illustrations, asides or phrasing
   just because the interpreter rendered them loosely. When in doubt, stay faithful to the sermon.
4. A non-interpreted sermon is unaffected — behave exactly as before.
```

- [ ] **Step 6: Add the interpreter credit to `.claude/agents/predica-whatsapp.md`**

Add to its inputs/rules (es-AR, the only locale this agent writes):

```markdown
## Interpreter credit (ICR-147)

Read `interpreted` + `interpreter.name` from `sermon.json` — **the structured fields drive this line; never
improvise it from the transcript or the prose.** When `interpreted` is true, credit the interpreter in the
es-AR message, e.g.:

> 🗣️ Interpretación al español: _<interpreter.name>_

When `interpreted` is false or absent, emit **no** such line (unchanged behavior). The interpreter is never
presented as the preacher.
```

- [ ] **Step 7: Verify + commit**

```bash
pnpm lint && pnpm test
```

Expected: green (no code changed — this guards against an accidental edit outside the markdown).
Re-read each edited section once for internal consistency (there is no automated coverage for prose).

```bash
git add .claude/commands/predica.md .claude/agents/predica-voice-coach.md \
        .claude/agents/predica-writer.md .claude/agents/predica-whatsapp.md
git commit -m "fix(ICR-147): gate step 2.5 on the guard and thread interpreter provenance"
```

---

## Task 5 — Docs (CP5)

**Files:**

- Modify: `docs/architecture/predica-voice-profiles.md`

**Interfaces:** Consumes Tasks 1–4 (documents the shipped behavior). Produces nothing downstream.

- [ ] **Step 1: Add the exclusion right after "The one rule that makes it work (and not collapse)"**

Insert this section immediately after that section's closing paragraph (~line 30):

```markdown
## The second rule: an interpreted sermon teaches NOBODY's voice

When a preacher speaks one language and an **interpreter renders it live** into another, Whisper locks onto
whoever is louder — and that is the interpreter. `transcript.txt` is then the **interpreter's** speech.

Such a transcript is a valid source for **nobody's** voice profile:

- **Not the preacher's** — the words are not theirs. Learning from it would write the interpreter's rhetoric
  into the preacher's profile, and Zone B is **append-only**, so every later sermon by that preacher would be
  written in a voice learned from the wrong person. Silent, and it compounds.
- **Not the interpreter's** — they are rendering someone else's content, not preaching their own.

So `/predica` **refuses to learn** from an interpreted run. The refusal is **code, not prose**:
`apps/web/src/utils/predica/voiceProfile.ts` (`canLearnVoiceFrom`) refuses whenever the run is interpreted —
**for any name passed to it** — and the orchestrator executes its `.mjs` twin
(`.claude/scripts/predica/check-voice-learn.mjs`) at step 2.5 before dispatching the coach. The two impls are
bound by a parity test. `predica-voice-coach`'s own refusal is only a backstop; a pure-prose agent cannot
enforce a guarantee.

The guard blocks **writes**, not **reads**: if the preacher already has a profile learned from sermons they
preached _themselves_, the writer may still read it — that profile **is** their authentic voice.

### Why it is HUMAN-DECLARED, and why you must not build a detector

Interpretation is declared by the human: `/predica --interpreted --interpreter "<Full Name>"`. It is **not**
inferred from the audio, and **must not be**.

A whisper language-ID sweep over a known interpreted sermon (2026-07-12, 21:32, English preacher + live
Spanish interpreter), in 30-second windows across the **entire** recording, reported **Spanish at p ≈ 0.999 in
43 of 43 windows** and missed the preacher's English **entirely** — because the interpreter dominates the mic.
Exactly one English fragment ever surfaced in the transcript. A detector built on this signal would report
"not interpreted" with total confidence on the very case it exists to catch, and the guard would be worse than
useless: it would be _trusted_.

A forgotten `--interpreted` on a **regenerate** cannot re-open the hole either — `resolveInterpreted()` ORs the
flag with the `interpreted` field persisted in `sermon.json`. And if the guard script is missing or crashes,
the pipeline **fails closed** and skips the coach: a skipped append is redone next run, a wrong append is
forever.
```

- [ ] **Step 2: Update the Guardrails section**

Add to the guardrails list:

```markdown
- **Interpreted sermons are never learned from** — not for the preacher, not for the interpreter. Enforced in
  code (`canLearnVoiceFrom`), executed by the orchestrator at step 2.5, and backstopped in the agent's prose.
  Human-declared (`--interpreted`); never detected from audio.
```

- [ ] **Step 3: Update the Files section**

Add:

```markdown
| `apps/web/src/utils/predica/voiceProfile.ts` | The voice-learn guard (canonical, typed, unit-tested) |
| `.claude/scripts/predica/check-voice-learn.mjs` | The twin the orchestrator executes at step 2.5 (exit 0 = learn, 3 = refuse) |
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm test
git add docs/architecture/predica-voice-profiles.md
git commit -m "docs(ICR-147): record the interpreted-sermon voice-profile exclusion"
```

---

## Final verification

- [ ] `pnpm type-check` — clean
- [ ] `pnpm lint` — clean
- [ ] `pnpm test` — green; **508 → ~528** tests (13 unit + 9 parity + 6 validator), 49 → 52 files
- [ ] `pnpm build` — succeeds (standard QA depth)
- [ ] `git diff --stat origin/main...HEAD` — touches **only** the files in the table above; **no**
      `tasks/predicas/**`, **no** `public/locales/**`, **no** voice profile or transcript content anywhere in
      the diff or the commit messages.
- [ ] By hand: `node .claude/scripts/predica/check-voice-learn.mjs --preacher "Doug Wagner" --interpreted`
      → `{"ok":false,"reason":"interpreted"}`, exit 3.

## Acceptance-criteria trace

| AC                                                                                   | Where it is proven                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Interpreted run completes with no hand-steering; states step 2.5 was skipped and why | Task 4 Step 2 (the gate + the printed reason)                                        |
| Vitest proves no voice-profile write for **either** party                            | Task 1 Step 1 (two REFUSES cases) + Task 2 (parity)                                  |
| `_voices/` unchanged after an interpreted run                                        | Task 4 Step 2 — the coach is never dispatched, and it is the only writer of that dir |
| Regenerate **without** the flag still refuses                                        | Task 1 (`resolveInterpreted`) + Task 2 Step 1 (the `--sermon` CLI case)              |
| Non-interpreted run unchanged                                                        | Task 1 (`ok:true` case) + Task 2 (normal-path parity + plain-sermon regenerate)      |
| `sermon.json` carries both; both validators accept and stay in sync                  | Task 3 (validator tests + the TS interface)                                          |
| `whatsapp.txt` credits the interpreter from the structured field                     | Task 4 Step 6                                                                        |
| Docs state the exclusion + why no detector                                           | Task 5                                                                               |
